'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSessionStore } from '@/store/sessionStore';
import { Message } from '@/types';
import { splitStreamBuffer } from '@/lib/voice/splitStreamBuffer';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Props {
  onVoiceStateChange: (state: VoiceState) => void;
  active: boolean;
}

const MIN_BYTES = 400;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
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
  const hasSubstance = /[가-힣A-Za-z0-9]/.test(normalized);
  return hasSubstance;
}

export default function VoiceEngine({ onVoiceStateChange, active }: Props) {
  const caseSpec = useSessionStore((s) => s.caseSpec);
  const sessionId = useSessionStore((s) => s.sessionId);
  const sessionStatus = useSessionStore((s) => s.sessionStatus);
  const addMessage = useSessionStore((s) => s.addMessage);

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('audio/webm');
  const processingRef = useRef(false);

  const updateVoiceState = useCallback(
    (state: VoiceState) => {
      setVoiceState(state);
      onVoiceStateChange(state);
    },
    [onVoiceStateChange]
  );

  const cleanupMic = useCallback(() => {
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

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: transcript,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = '응답 스트리밍에 실패했습니다.';
        try {
          const j = JSON.parse(errText) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('no body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const ttsTasks: Promise<Blob>[] = [];

      const enqueueTts = (text: string) => {
        const t = text.trim();
        if (!t) return;
        ttsTasks.push(
          fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: t, gender: caseSpec?.patient.gender }),
          }).then(async (r) => {
            if (!r.ok) throw new Error('tts');
            return r.blob();
          })
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
        for (const sentence of complete) {
          enqueueTts(sentence);
        }
      }

      const tail = buffer.trim();
      if (tail) enqueueTts(tail);

      const patientFull = fullText.trim();
      if (!patientFull) {
        throw new Error('빈 응답입니다.');
      }

      if (ttsTasks.length === 0) {
        throw new Error('재생할 음성이 없습니다.');
      }

      let firstAudio = true;
      for (const task of ttsTasks) {
        const blob = await task;
        if (firstAudio) {
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          updateVoiceState('speaking');
          firstAudio = false;
        }
        await playBlob(blob);
      }

      return patientFull;
    },
    [caseSpec?.patient.gender, sessionId, updateVoiceState]
  );

  const processRecording = useCallback(async () => {
    if (processingRef.current) return;
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state !== 'recording') return;

    processingRef.current = true;

    updateVoiceState('thinking');

    try {
      const blob = await stopRecorderToBlob();
      if (!blob || !sessionId) {
        updateVoiceState('idle');
        return;
      }

      const fd = new FormData();
      fd.append('file', blob, 'recording.webm');
      const sttRes = await fetch('/api/stt', { method: 'POST', body: fd });
      const sttData = (await sttRes.json()) as { text?: string; error?: string };
      if (!sttRes.ok || !sttData.text?.trim()) {
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

      const userMsg: Message = {
        id: uuidv4(),
        role: 'user',
        content: transcript,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance('음…');
        u.lang = 'ko-KR';
        u.volume = 0.22;
        u.rate = 1.55;
        window.speechSynthesis.speak(u);
      }

      const patientText = await streamLlmAndPlayTts(transcript);

      const patientMsg: Message = {
        id: uuidv4(),
        role: 'patient',
        content: patientText,
        timestamp: Date.now(),
      };
      addMessage(patientMsg);

      updateVoiceState('idle');
    } catch (e) {
      console.error('Voice pipeline error:', e);
      setErrorMsg(e instanceof Error ? e.message : '음성 처리 중 오류가 발생했습니다.');
      updateVoiceState('idle');
    } finally {
      processingRef.current = false;
    }
  }, [addMessage, sessionId, stopRecorderToBlob, streamLlmAndPlayTts, updateVoiceState]);

  const onPointerDown = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (sessionStatus !== 'active' || !caseSpec) return;
      if (voiceState === 'thinking' || voiceState === 'speaking' || voiceState === 'listening') return;

      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setErrorMsg('');

      try {
        if (!streamRef.current) {
          streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        const stream = streamRef.current;
        const mime = pickRecorderMime();
        mimeRef.current = mime || 'audio/webm';
        chunksRef.current = [];
        const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        mr.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        mr.start(250);
        mediaRecorderRef.current = mr;
        updateVoiceState('listening');
      } catch (err) {
        console.error(err);
        setErrorMsg('마이크 권한이 필요합니다.');
        updateVoiceState('idle');
      }
    },
    [caseSpec, sessionStatus, voiceState, updateVoiceState]
  );

  const onPointerUp = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      if (sessionStatus !== 'active') return;
      if (mediaRecorderRef.current?.state !== 'recording') return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      await processRecording();
    },
    [sessionStatus, processRecording]
  );

  useEffect(() => {
    if (!active) {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      cleanupMic();
      updateVoiceState('idle');
    }
  }, [active, cleanupMic, updateVoiceState]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      cleanupMic();
    };
  }, [cleanupMic]);

  if (!active) return null;

  const busy = voiceState === 'thinking' || voiceState === 'speaking';

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        disabled={sessionStatus !== 'active' || busy}
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
        ) : voiceState === 'listening' ? (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
        ) : (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
        )}
      </button>

      <div className="h-10 flex flex-col items-center justify-start gap-1 w-full relative">
        <p className="text-[10px] font-black text-black/40 uppercase tracking-[0.2em] text-center w-full min-w-[200px]">
          {busy
            ? voiceState === 'thinking'
              ? '환자가 생각 중입니다…'
              : '환자 음성 재생 중…'
            : '누른 채로 말씀하세요'}
        </p>
        {!busy && (
           <p className="text-[9px] font-bold text-black/30 tracking-widest uppercase">버튼을 떼면 전송됩니다</p>
        )}
      </div>

      {errorMsg && <p className="text-xs font-bold text-red-500 text-center">{errorMsg}</p>}
    </div>
  );
}
