'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSessionStore } from '@/store/sessionStore';
import { Message } from '@/types';
import { splitStreamBuffer } from '@/lib/voice/splitStreamBuffer';
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
type ProcessingStage = 'idle' | 'stt' | 'llm' | 'tts';

interface Props {
  onVoiceStateChange: (state: VoiceState) => void;
  active: boolean;
  sessionPhase?: 'history' | 'physical' | 'education' | 'completed';
  onPhysicalExamIntent?: (transcript: string) => Promise<void> | void;
  realtimeMode?: boolean;
  onRealtimeModeChange?: (enabled: boolean) => void;
}

const MIN_BYTES = 700;
/** 문장 부호 없이 길게 이어질 때만 중간 flush. 너무 크면 첫 음성이 늦어지므로 낮게 유지한다. */
const SPECULATIVE_FLUSH_CHARS = 36;
const SILENCE_RMS_THRESHOLD = 0.02;
const SILENCE_HOLD_MS = 520;
const MIN_REALTIME_RECORD_MS = 650;
const MIN_VOICED_FRAMES = 8;
const MAX_IDLE_RECORD_MS = 12000;
const AUDIO_BITS_PER_SECOND = 24000;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function createRecorder(stream: MediaStream): { recorder: MediaRecorder; mime: string } {
  const mime = pickRecorderMime() || 'audio/webm';
  const options: MediaRecorderOptions = {
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  };
  if (mime) options.mimeType = mime;
  return { recorder: new MediaRecorder(stream, options), mime };
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = 1.08;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('play'));
    };
    void audio.play().catch(reject);
  });
}

function isMeaningfulDoctorInput(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length < 2) return false;
  const fillerOnly = /^(음+|어+|아+|네+|응+|어음+|음어+|흠+|음\.\.\.|어\.\.\.)$/;
  if (fillerOnly.test(normalized)) return false;
  return /[가-힣A-Za-z0-9]/.test(normalized);
}

export default function VoiceEngine({
  onVoiceStateChange,
  active,
  sessionPhase = 'history',
  onPhysicalExamIntent,
  realtimeMode = false,
  onRealtimeModeChange,
}: Props) {
  const caseSpec = useSessionStore((s) => s.caseSpec);
  const sessionId = useSessionStore((s) => s.sessionId);
  const difficulty = useSessionStore((s) => s.difficulty);
  const conversationHistory = useSessionStore((s) => s.conversationHistory);
  const sessionStatus = useSessionStore((s) => s.sessionStatus);
  const addMessage = useSessionStore((s) => s.addMessage);

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('audio/webm');
  const processingRef = useRef(false);
  const toggleLockRef = useRef(false);
  const realtimeActiveRef = useRef(false);
  const startedAtRef = useRef(0);
  const voiceMonitorRafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const realtimeRestartTimerRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);
  const voicedFramesRef = useRef(0);

  const updateVoiceState = useCallback(
    (state: VoiceState) => {
      setVoiceState(state);
      onVoiceStateChange(state);
    },
    [onVoiceStateChange]
  );

  const cleanupMic = useCallback(() => {
    if (voiceMonitorRafRef.current != null) {
      cancelAnimationFrame(voiceMonitorRafRef.current);
      voiceMonitorRafRef.current = null;
    }
    if (realtimeRestartTimerRef.current != null) {
      window.clearTimeout(realtimeRestartTimerRef.current);
      realtimeRestartTimerRef.current = null;
    }
    try {
      mediaSourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
    } catch {
      /* noop */
    }
    mediaSourceRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopRecorderToBlob = useCallback((): Promise<Blob | null> => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') {
      mediaRecorderRef.current = null;
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        resolve(blob.size >= MIN_BYTES ? blob : null);
      };
      mr.stop();
    });
  }, []);

  const streamLlmAndPlayTts = useCallback(
    async (transcript: string) => {
      if (!sessionId) throw new Error('no session');

      const payload = {
        sessionId,
        message: transcript,
        caseSpec,
        difficulty,
        conversationHistory: conversationHistory.slice(-8),
      };

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('응답 스트리밍에 실패했습니다.');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('no body');

      setProcessingStage('llm');
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const ttsTasks: Promise<void>[] = [];
      const audioQueue: Blob[] = [];
      let notifyAudioReady: (() => void) | null = null;
      let queueDone = false;

      const waitForAudio = () =>
        new Promise<void>((resolve) => {
          notifyAudioReady = resolve;
        });

      const pushAudio = (blob: Blob) => {
        audioQueue.push(blob);
        const ready = notifyAudioReady;
        notifyAudioReady = null;
        ready?.();
      };

      const playbackTask = (async () => {
        let firstAudio = true;
        while (!queueDone || audioQueue.length > 0) {
          if (audioQueue.length === 0) {
            await waitForAudio();
            continue;
          }
          const next = audioQueue.shift();
          if (!next) continue;
          if (firstAudio) {
            setProcessingStage('tts');
            updateVoiceState('speaking');
            firstAudio = false;
          }
          await playBlob(next);
        }
      })();

      const enqueueTts = (text: string) => {
        const t = text.trim();
        if (!t) return;
        ttsTasks.push(
          fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: t,
              gender: caseSpec?.patient.gender,
              age: caseSpec?.patient.age,
            }),
          })
            .then(async (r) => {
              if (!r.ok) throw new Error('tts');
              return r.blob();
            })
            .then(pushAudio)
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        buffer += chunk;
        const { complete, rest } = splitStreamBuffer(buffer);
        buffer = rest;
        for (const sentence of complete) enqueueTts(sentence);
        if (buffer.trim().length >= SPECULATIVE_FLUSH_CHARS) {
          enqueueTts(buffer);
          buffer = '';
        }
      }
      const tail = buffer.trim();
      if (tail) enqueueTts(tail);

      const patientFull = fullText.trim();
      if (!patientFull) throw new Error('빈 응답입니다.');
      if (ttsTasks.length === 0) throw new Error('재생할 음성이 없습니다.');

      await Promise.all(ttsTasks);
      queueDone = true;
      const ready = notifyAudioReady as (() => void) | null;
      notifyAudioReady = null;
      ready?.();
      await playbackTask;

      return patientFull;
    },
    [caseSpec, sessionId, difficulty, conversationHistory, updateVoiceState]
  );

  const processRecording = useCallback(async () => {
    if (processingRef.current) return;
    if (mediaRecorderRef.current?.state !== 'recording') return;
    processingRef.current = true;
    setProcessingStage('stt');
    updateVoiceState('thinking');

    try {
      const blob = await stopRecorderToBlob();
      if (!blob || !sessionId) {
        updateVoiceState('idle');
        return;
      }
      if (realtimeActiveRef.current && !hasSpokenRef.current) {
        updateVoiceState('idle');
        setProcessingStage('idle');
        if (active && sessionStatus === 'active') {
          realtimeRestartTimerRef.current = window.setTimeout(() => {
            const stream = streamRef.current;
            if (!stream || mediaRecorderRef.current?.state === 'recording') return;
            const { recorder: mr, mime } = createRecorder(stream);
            mimeRef.current = mime;
            chunksRef.current = [];
            mr.ondataavailable = (ev) => {
              if (ev.data.size > 0) chunksRef.current.push(ev.data);
            };
            mr.start(250);
            startedAtRef.current = Date.now();
            hasSpokenRef.current = false;
            voicedFramesRef.current = 0;
            mediaRecorderRef.current = mr;
            updateVoiceState('listening');
          }, 220);
        }
        return;
      }

      const fd = new FormData();
      fd.append('file', blob, 'recording.webm');
      const sttRes = await fetch('/api/stt', { method: 'POST', body: fd });
      const sttData = (await sttRes.json()) as { text?: string; error?: string };
      if (!sttRes.ok || !sttData.text?.trim()) {
        if (realtimeActiveRef.current && active && sessionStatus === 'active') {
          // 실시간 모드에서는 짧은/모호한 구간 STT 실패를 사용자 에러로 노출하지 않고 즉시 재청취한다.
          setErrorMsg('');
          updateVoiceState('idle');
          setProcessingStage('idle');
          realtimeRestartTimerRef.current = window.setTimeout(() => {
            const stream = streamRef.current;
            if (!stream || mediaRecorderRef.current?.state === 'recording') return;
            const { recorder: mr, mime } = createRecorder(stream);
            mimeRef.current = mime;
            chunksRef.current = [];
            mr.ondataavailable = (ev) => {
              if (ev.data.size > 0) chunksRef.current.push(ev.data);
            };
            mr.start(250);
            startedAtRef.current = Date.now();
            hasSpokenRef.current = false;
            voicedFramesRef.current = 0;
            mediaRecorderRef.current = mr;
            updateVoiceState('listening');
          }, 180);
          return;
        }
        setErrorMsg(sttData.error || '음성 인식에 실패했습니다.');
        updateVoiceState('idle');
        return;
      }

      const transcript = sttData.text.trim();
      if (!isMeaningfulDoctorInput(transcript)) {
        setErrorMsg('음성이 명확하지 않아 전송하지 않았습니다. 다시 말씀해 주세요.');
        updateVoiceState('idle');
        return;
      }

      addMessage({ id: uuidv4(), role: 'user', content: transcript, timestamp: Date.now() });

      if (sessionPhase === 'physical' && !useSessionStore.getState().physicalExamDone) {
        await onPhysicalExamIntent?.(transcript);
        updateVoiceState('idle');
        setProcessingStage('idle');
        return;
      }

      const patientText = await streamLlmAndPlayTts(transcript);
      addMessage({ id: uuidv4(), role: 'patient', content: patientText, timestamp: Date.now() });
      updateVoiceState('idle');
      setProcessingStage('idle');

      if (realtimeActiveRef.current && active && sessionStatus === 'active') {
        realtimeRestartTimerRef.current = window.setTimeout(() => {
          const stream = streamRef.current;
          if (!stream || mediaRecorderRef.current?.state === 'recording') return;
          const { recorder: mr, mime } = createRecorder(stream);
          mimeRef.current = mime;
          chunksRef.current = [];
          mr.ondataavailable = (ev) => {
            if (ev.data.size > 0) chunksRef.current.push(ev.data);
          };
          mr.start(250);
          startedAtRef.current = Date.now();
          hasSpokenRef.current = false;
          voicedFramesRef.current = 0;
          mediaRecorderRef.current = mr;
          updateVoiceState('listening');
        }, 300);
      }
    } catch (e) {
      console.error('Voice pipeline error:', e);
      setErrorMsg(e instanceof Error ? e.message : '음성 처리 중 오류가 발생했습니다.');
      updateVoiceState('idle');
      setProcessingStage('idle');
    } finally {
      processingRef.current = false;
    }
  }, [
    active,
    sessionId,
    sessionPhase,
    onPhysicalExamIntent,
    addMessage,
    stopRecorderToBlob,
    streamLlmAndPlayTts,
    updateVoiceState,
    sessionStatus,
  ]);

  const startRecording = useCallback(async () => {
    if (sessionStatus !== 'active' || !caseSpec) return;
    if (voiceState === 'thinking' || voiceState === 'speaking' || voiceState === 'listening') return;
    setErrorMsg('');
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const stream = streamRef.current;
      const { recorder: mr, mime } = createRecorder(stream);
      mimeRef.current = mime;
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.start(250);
      startedAtRef.current = Date.now();
      hasSpokenRef.current = false;
      voicedFramesRef.current = 0;
      mediaRecorderRef.current = mr;
      updateVoiceState('listening');
    } catch {
      setErrorMsg('마이크 권한이 필요합니다.');
      updateVoiceState('idle');
    }
  }, [caseSpec, sessionStatus, voiceState, updateVoiceState]);

  const stopRecording = useCallback(async () => {
    if (sessionStatus !== 'active') return;
    if (mediaRecorderRef.current?.state !== 'recording') return;
    await processRecording();
  }, [sessionStatus, processRecording]);

  const setupVoiceActivityMonitor = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    mediaSourceRef.current = source;
    analyserRef.current = analyser;

    const data = new Float32Array(analyser.fftSize);
    let lastVoiceAt = Date.now();
    const loop = () => {
      const a = analyserRef.current;
      if (!a || !realtimeActiveRef.current) return;
      a.getFloatTimeDomainData(data);
      let sq = 0;
      for (let i = 0; i < data.length; i++) sq += data[i] * data[i];
      const rms = Math.sqrt(sq / data.length);
      const now = Date.now();
      if (rms > SILENCE_RMS_THRESHOLD) {
        lastVoiceAt = now;
        voicedFramesRef.current += 1;
        if (voicedFramesRef.current >= MIN_VOICED_FRAMES) {
          hasSpokenRef.current = true;
        }
      } else {
        voicedFramesRef.current = Math.max(0, voicedFramesRef.current - 1);
      }
      const recordingMs = now - startedAtRef.current;
      if (
        mediaRecorderRef.current?.state === 'recording' &&
        !hasSpokenRef.current &&
        recordingMs >= MAX_IDLE_RECORD_MS &&
        !processingRef.current
      ) {
        // 장시간 무음 상태에서는 세그먼트를 재시작해 불필요한 장녹음을 방지한다.
        void stopRecording();
        voiceMonitorRafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (
        mediaRecorderRef.current?.state === 'recording' &&
        hasSpokenRef.current &&
        recordingMs >= MIN_REALTIME_RECORD_MS &&
        !processingRef.current
      ) {
        if (now - lastVoiceAt >= SILENCE_HOLD_MS) {
          void stopRecording();
        }
      }
      voiceMonitorRafRef.current = requestAnimationFrame(loop);
    };
    voiceMonitorRafRef.current = requestAnimationFrame(loop);
  }, [stopRecording]);

  const startRealtimeConversation = useCallback(async () => {
    if (!active || sessionStatus !== 'active' || !caseSpec) return;
    realtimeActiveRef.current = true;
    onRealtimeModeChange?.(true);
    await startRecording();
    setupVoiceActivityMonitor();
  }, [active, sessionStatus, caseSpec, onRealtimeModeChange, startRecording, setupVoiceActivityMonitor]);

  const stopRealtimeConversation = useCallback(async () => {
    realtimeActiveRef.current = false;
    onRealtimeModeChange?.(false);
    if (mediaRecorderRef.current?.state === 'recording') await stopRecording();
    cleanupMic();
    updateVoiceState('idle');
    setProcessingStage('idle');
  }, [cleanupMic, stopRecording, updateVoiceState, onRealtimeModeChange]);

  const toggleRealtimeConversation = useCallback(async () => {
    if (realtimeActiveRef.current) {
      await stopRealtimeConversation();
    } else {
      await startRealtimeConversation();
    }
  }, [startRealtimeConversation, stopRealtimeConversation]);

  const onPointerDown = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (realtimeMode) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      await startRecording();
    },
    [startRecording, realtimeMode]
  );

  const onPointerUp = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (realtimeMode) return;
      if (sessionStatus !== 'active' || mediaRecorderRef.current?.state !== 'recording') return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      await stopRecording();
    },
    [sessionStatus, stopRecording, realtimeMode]
  );

  useEffect(() => {
    /** ₩ / ` / ~ 등: 세션 중에는 메모 포커스와 무관하게 항상 녹음 토글(메모에 문자가 들어가지 않도록 차단 포함) */
    const isToggleKey = (ev: KeyboardEvent) =>
      ev.key === '\\' ||
      ev.key === '₩' ||
      ev.key === '`' ||
      ev.key === '~' ||
      ev.code === 'Backslash' ||
      ev.code === 'IntlRo' ||
      ev.code === 'Backquote';
    const keydownBlocker = (ev: KeyboardEvent) => {
      if (!active || !isToggleKey(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
    };
    const keypressBlocker = (ev: KeyboardEvent) => {
      if (!active || !isToggleKey(ev)) return;
      // 일부 브라우저에서 keypress 단계에 문자가 입력되는 문제를 함께 차단한다.
      ev.preventDefault();
      ev.stopPropagation();
    };
    const keyupToggle = async (ev: KeyboardEvent) => {
      if (!active || !isToggleKey(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (toggleLockRef.current) return;
      toggleLockRef.current = true;
      try {
        if (realtimeMode) {
          await toggleRealtimeConversation();
        } else if (mediaRecorderRef.current?.state === 'recording') {
          await stopRecording();
        } else {
          await startRecording();
        }
      } finally {
        setTimeout(() => {
          toggleLockRef.current = false;
        }, 120);
      }
    };
    window.addEventListener('keydown', keydownBlocker, true);
    window.addEventListener('keypress', keypressBlocker, true);
    window.addEventListener('keyup', keyupToggle, true);
    return () => {
      window.removeEventListener('keydown', keydownBlocker, true);
      window.removeEventListener('keypress', keypressBlocker, true);
      window.removeEventListener('keyup', keyupToggle, true);
    };
  }, [active, startRecording, stopRecording, realtimeMode, toggleRealtimeConversation]);

  useEffect(() => {
    if (!active) {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      cleanupMic();
      updateVoiceState('idle');
      setProcessingStage('idle');
      realtimeActiveRef.current = false;
    }
  }, [active, cleanupMic, updateVoiceState]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      cleanupMic();
    };
  }, [cleanupMic]);

  useEffect(() => {
    if (!active || sessionStatus !== 'active') return;
    if (realtimeMode && !realtimeActiveRef.current) {
      void startRealtimeConversation();
      return;
    }
    if (!realtimeMode && realtimeActiveRef.current) {
      void stopRealtimeConversation();
    }
  }, [active, sessionStatus, realtimeMode, startRealtimeConversation, stopRealtimeConversation]);

  if (!active) return null;
  const busy = voiceState === 'thinking' || voiceState === 'speaking';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          disabled={sessionStatus !== 'active' || busy || realtimeMode}
          className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 text-4xl select-none touch-none shadow-xl ${
            voiceState === 'listening'
              ? 'bg-black border border-black text-white scale-110 shadow-[0_20px_40px_rgba(0,0,0,0.4)] animate-pulse'
              : busy
                ? 'bg-black/5 border border-black/10 cursor-wait opacity-60 text-black/50'
                : 'bg-white border border-black text-black shadow-none hover:bg-black hover:text-white hover:scale-105 hover:shadow-[0_20px_40px_rgba(0,0,0,0.2)] active:scale-95'
          }`}
          aria-label="누르고 말하기 (버튼을 떼면 전송)"
        >
          {busy ? (
            <div className="w-8 h-8 border-4 border-black/20 border-t-current rounded-full animate-spin" />
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
          )}
        </button>
        {realtimeMode ? (
          <button
            type="button"
            onClick={() => {
              if (sessionStatus !== 'active') return;
              onRealtimeModeChange?.(false);
              void stopRealtimeConversation();
            }}
            className="px-4 py-2 rounded-full border border-black bg-black text-white text-xs font-bold tracking-widest transition-colors hover:bg-black/90"
          >
            실시간 OFF
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (sessionStatus !== 'active') return;
              onRealtimeModeChange?.(true);
              void startRealtimeConversation();
            }}
            className="px-4 py-2 rounded-full border border-black bg-white text-black text-xs font-bold tracking-widest transition-colors hover:bg-black hover:text-white"
          >
            실시간 대화하기
          </button>
        )}
      </div>

      <div className="h-10 flex flex-col items-center justify-start gap-1 w-full relative">
        <p className="text-[10px] font-black text-black/40 uppercase tracking-[0.2em] text-center w-full min-w-[200px]">
          {busy
            ? voiceState === 'thinking'
              ? processingStage === 'stt'
                ? '음성 인식 중…'
                : processingStage === 'llm'
                  ? '응답 생성 중…'
                  : '처리 중…'
              : '환자 음성 재생 중…'
            : realtimeMode
              ? '실시간 대화 모드 / 내가 말하면 AI가 자동 응답'
              : '누른 채로 말하기 / ₩ ` ~ 키 토글'}
        </p>
        {!busy && (
          <p className="text-[9px] font-bold text-black/30 tracking-widest uppercase">
            {realtimeMode ? '실시간 OFF 누르면 즉시 일반 마이크 모드로 복귀' : '버튼 떼기 또는 ₩/`/~ 재입력 시 전송'}
          </p>
        )}
      </div>

      {errorMsg && <p className="text-xs font-bold text-red-500 text-center">{errorMsg}</p>}
    </div>
  );
}
