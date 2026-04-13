'use client';

import { useCallback, useRef, useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';

interface Props {
  onExamTranscript: (transcript: string) => void;
  /** 신체진찰 녹음 시작(버튼 누름) 시점 — 병력 vs 신체진찰 구간 분리용 */
  onPhysicalExamPressStart?: () => void;
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

export default function PhysicalExamButton({
  onExamTranscript,
  onPhysicalExamPressStart,
  active,
}: Props) {
  const { physicalExamDone } = useSessionStore();
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('audio/webm');

  const onPointerDown = useCallback(async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!active || physicalExamDone || processing || recording) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setErrorMsg('');
    onPhysicalExamPressStart?.();

    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const mime = pickRecorderMime();
      mimeRef.current = mime || 'audio/webm';
      chunksRef.current = [];
      const recorder = mime
        ? new MediaRecorder(streamRef.current, { mimeType: mime })
        : new MediaRecorder(streamRef.current);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
    } catch (error) {
      console.error(error);
      setErrorMsg('마이크 권한이 필요합니다.');
      setRecording(false);
    }
  }, [active, physicalExamDone, processing, recording, onPhysicalExamPressStart]);

  const onPointerUp = useCallback(async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!recording || processing || !recorderRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setProcessing(true);
    setRecording(false);

    const recorder = recorderRef.current;
    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const full = new Blob(chunksRef.current, { type: mimeRef.current });
        recorderRef.current = null;
        chunksRef.current = [];
        resolve(full.size >= MIN_BYTES ? full : null);
      };
      recorder.stop();
    });

    if (!blob) {
      setErrorMsg('음성이 너무 짧습니다. 다시 말씀해 주세요.');
      setProcessing(false);
      return;
    }

    try {
      const fd = new FormData();
      fd.append('file', blob, 'physical-exam.webm');
      const sttRes = await fetch('/api/stt', { method: 'POST', body: fd });
      const sttData = (await sttRes.json()) as { text?: string; error?: string };
      const transcript = sttData.text?.trim();
      if (!sttRes.ok || !transcript) {
        setErrorMsg(sttData.error || '진찰 음성 인식에 실패했습니다.');
        setProcessing(false);
        return;
      }

      onExamTranscript(transcript);
    } catch (error) {
      console.error(error);
      setErrorMsg('진찰 음성 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  }, [onExamTranscript, processing, recording]);

  return (
    <div className="space-y-4">
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        disabled={physicalExamDone || !active || processing}
        className={`w-full py-5 rounded-3xl text-sm font-black uppercase tracking-widest transition-all duration-300 border shadow-xl flex items-center justify-center ${
          physicalExamDone
            ? 'border-black bg-black/5 text-black/30 cursor-not-allowed shadow-none'
            : recording
            ? 'border-black bg-white text-black animate-pulse shadow-[0_0_30px_rgba(0,0,0,0.1)] scale-[1.02]'
            : processing
            ? 'border-black bg-white/50 text-black/50 cursor-wait'
            : 'border-black bg-black text-white hover:bg-black/90 hover:-translate-y-1 hover:shadow-[0_10px_40px_rgba(0,0,0,0.2)] active:translate-y-0'
        }`}
      >
        {physicalExamDone ? (
          <span className="flex items-center justify-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            신체진찰 완료
          </span>
        ) : recording ? (
          <span className="flex items-center justify-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
            누른 채로 말씀하세요...
          </span>
        ) : processing ? (
          <span className="flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            진찰 판독 중...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-3 relative z-10 w-full px-5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"></path><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"></path><circle cx="20" cy="10" r="2"></circle></svg>
            신체진찰 하기
            <span className="text-[10px] text-current/50 font-bold ml-auto bg-current/10 px-2 py-0.5 rounded-full">-4MIN</span>
          </span>
        )}
      </button>
      {!physicalExamDone && (
        <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest text-center">버튼을 누른 채로 말하고, 떼면 진찰 요청이 전송됩니다.</p>
      )}
      {errorMsg && <p className="text-xs text-red-500 font-bold text-center mt-2">{errorMsg}</p>}
    </div>
  );
}
