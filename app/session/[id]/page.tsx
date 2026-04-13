'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useSessionStore } from '@/store/sessionStore';
import Timer from '@/components/session/Timer';
import PatientVisual from '@/components/session/PatientVisual';
import MemoPanel from '@/components/session/MemoPanel';
import PhysicalExamButton from '@/components/session/PhysicalExamButton';
import InstructionPanel from '@/components/session/InstructionPanel';
import VoiceEngine from '@/components/session/VoiceEngine';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function SessionPage() {
  const router = useRouter();
  const {
    caseSpec,
    sessionStatus,
    sessionId,
    deductTime,
    markPhysicalExamDone,
    addMessage,
    endSession,
    physicalExamDone,
  } = useSessionStore();

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [examResultText, setExamResultText] = useState('');

  useEffect(() => {
    if (!caseSpec || sessionStatus === 'idle') {
      router.replace('/');
    }
  }, [caseSpec, sessionStatus, router]);

  const handleTimeUp = useCallback(() => {
    endSession();
    router.push(`/review/${sessionId}`);
  }, [endSession, router, sessionId]);

  const handlePhysicalExamTranscript = useCallback(async (transcript: string) => {
    if (!caseSpec) return;

    addMessage({
      id: uuidv4(),
      role: 'user',
      content: transcript,
      timestamp: Date.now(),
    });

    if (physicalExamDone) return;
    markPhysicalExamDone();
    deductTime(240); // 4분 차감

    try {
      const examRes = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, caseSpec }),
      });
      const examData = (await examRes.json()) as { findingText?: string; error?: string };
      const findingText = examData.findingText?.trim() || caseSpec.physical_exam_findings;
      const findings = `[진찰소견] ${findingText}`;
      setExamResultText(findings);
      addMessage({
        id: uuidv4(),
        role: 'patient',
        content: findings,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(error);
      const fallback = `[진찰소견] ${caseSpec.physical_exam_findings}`;
      setExamResultText(fallback);
      addMessage({
        id: uuidv4(),
        role: 'patient',
        content: fallback,
        timestamp: Date.now(),
      });
    }
  }, [caseSpec, addMessage, physicalExamDone, markPhysicalExamDone, deductTime]);

  const handleEndSession = useCallback(() => {
    endSession();
    router.push(`/review/${sessionId}`);
  }, [endSession, router, sessionId]);

  if (!caseSpec || sessionStatus === 'idle') {
    return (
      <div className="min-h-screen bg-white relative flex items-center justify-center font-sans">
        <div className="text-center relative z-10 glass p-8 rounded-3xl border border-black">
          <div className="w-8 h-8 border-2 border-black/20 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-bold text-black uppercase tracking-widest">Loading Session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white relative overflow-hidden font-sans selection:bg-black selection:text-white">
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 z-0 pointer-events-none" 
           style={{ 
             backgroundImage: "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)", 
             backgroundSize: "64px 64px" 
           }} 
      />
      
      {/* Soft gradient blobs for the liquid glass effect */}
      <div className="fixed top-[-5%] left-[-5%] w-[40%] h-[40%] rounded-full bg-neutral-200 blur-[100px] opacity-60 pointer-events-none z-0" />
      <div className="fixed bottom-[-5%] right-[-5%] w-[40%] h-[40%] rounded-full bg-neutral-300 blur-[100px] opacity-60 pointer-events-none z-0" />

      {/* 상단 바 */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-black bg-white/70 backdrop-blur-xl relative z-50 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-xs font-black text-black uppercase tracking-widest">CPX Session</span>
          <div className="w-1.5 h-1.5 bg-black rounded-full" />
          <div className="font-mono text-lg font-bold text-black">
            <Timer onTimeUp={handleTimeUp} />
          </div>
        </div>

        <button
          onClick={() => setShowEndConfirm(true)}
          className="px-5 py-2.5 rounded-full border border-black bg-white/50 backdrop-blur-sm text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-all shadow-sm active:scale-95"
        >
          진료 종료
        </button>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative z-10 w-full max-w-7xl mx-auto border-x border-black bg-transparent">
        {/* 좌측: 환자 영역 */}
        <div className="w-1/2 flex flex-col items-center justify-between p-8 border-r border-black relative">
          <div className="absolute inset-0 bg-white/30 backdrop-blur-sm -z-10" />
          
          <div className="flex-1 flex items-center justify-center w-full">
            <PatientVisual caseSpec={caseSpec} voiceState={voiceState} />
          </div>

          <div className="w-full mt-4 flex justify-center">
            <VoiceEngine
              onVoiceStateChange={setVoiceState}
              active={sessionStatus === 'active'}
            />
          </div>
        </div>

        {/* 우측: 메모 + 신체진찰 */}
        <div className="w-1/2 flex flex-col p-8 gap-6 min-h-0 relative">
          <div className="absolute inset-0 bg-white/40 backdrop-blur-md -z-10" />

          <div className="flex-1 min-h-0 rounded-3xl border border-black bg-white/60 backdrop-blur-xl overflow-hidden glass shadow-sm relative">
            <div className="absolute inset-0 border border-white/60 pointer-events-none rounded-3xl" />
            <MemoPanel />
          </div>

          <div className="shrink-0 flex flex-col gap-4">
            <PhysicalExamButton
              onExamTranscript={handlePhysicalExamTranscript}
              active={sessionStatus === 'active'}
            />
            {examResultText && (
              <div className="rounded-2xl border border-black bg-black text-white p-5 shadow-lg animate-in slide-in-from-bottom-2">
                <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">신체진찰 결과</p>
                <p className="text-sm font-medium leading-relaxed">{examResultText}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 하단 지시문 */}
      <div className="border-t border-black bg-white/80 backdrop-blur-xl relative z-20">
        <InstructionPanel
          patientName={caseSpec.patient.name}
          age={caseSpec.patient.age}
          gender={caseSpec.patient.gender}
          vitals={caseSpec.vitals}
        />
      </div>

      {/* 종료 확인 모달 */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 backdrop-blur-2xl rounded-3xl border border-black shadow-[0_20px_60px_rgba(0,0,0,0.1)] w-full max-w-sm p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 border border-white/60 pointer-events-none rounded-3xl" />
            <div className="text-3xl mb-4 relative z-10">⚠️</div>
            <h3 className="font-black text-xl text-black mb-3 relative z-10 tracking-tight">진료를 종료하시겠습니까?</h3>
            <p className="text-sm text-black/60 mb-8 leading-relaxed font-medium relative z-10">
              종료 후 AI가 대화를 분석하고<br />체크리스트를 채점합니다.
            </p>
            <div className="flex flex-col gap-3 relative z-10">
              <button
                onClick={handleEndSession}
                className="w-full py-4 rounded-full bg-black text-white text-sm font-bold uppercase tracking-widest hover:bg-black/90 transition-all active:scale-95 shadow-md"
              >
                종료하기
              </button>
              <button
                onClick={() => setShowEndConfirm(false)}
                className="w-full py-4 rounded-full border border-black bg-white/50 text-black text-sm font-bold uppercase tracking-widest hover:bg-white transition-all active:scale-95"
              >
                진료 계속하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
