'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useSessionStore } from '@/store/sessionStore';
import { useAuth } from '@/components/auth/AuthProvider';
import Timer from '@/components/session/Timer';
import PatientVisual from '@/components/session/PatientVisual';
import MemoPanel from '@/components/session/MemoPanel';

export default function SessionMessagePage() {
  const router = useRouter();
  const {
    caseSpec,
    sessionStatus,
    sessionId,
    applyExamTimeDeduction,
    markPhysicalExamDone,
    completeHistoryTaking,
    completeEducation,
    addMessage,
    conversationHistory,
    endSession,
    physicalExamDone,
    timerStarted,
    sessionPhase,
    examTimeDeductionSeconds,
    setExamTimeDeductionSeconds,
    difficulty,
  } = useSessionStore();
  const { user, authLoading } = useAuth();

  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showPhysicalExamGuide, setShowPhysicalExamGuide] = useState(false);
  const [inputText, setInputText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [examResultTexts, setExamResultTexts] = useState<string[]>([]);
  const [streamingReply, setStreamingReply] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const examResultScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/');
      return;
    }
    if (!caseSpec || sessionStatus === 'idle') {
      router.replace('/');
    }
  }, [authLoading, user, caseSpec, sessionStatus, router]);

  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [conversationHistory, streamingReply, processing]);

  useEffect(() => {
    const node = examResultScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [examResultTexts]);

  const handleTimeUp = useCallback(() => {
    endSession();
    router.push(`/review/${sessionId}`);
  }, [endSession, router, sessionId]);

  const handlePhysicalExamTranscript = useCallback(
    async (transcript: string) => {
      if (!caseSpec) return;
      if (physicalExamDone || sessionPhase !== 'physical') return;

      const examRes = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, caseSpec }),
      });
      const examData = (await examRes.json()) as { findingText?: string };
      const findingText = examData.findingText?.trim() || caseSpec.physical_exam_findings;
      const findings = `[진찰소견] ${findingText}`;
      setExamResultTexts((prev) => [...prev, findings]);
      addMessage({
        id: uuidv4(),
        role: 'patient',
        content: findings,
        timestamp: Date.now(),
      });
    },
    [caseSpec, addMessage, physicalExamDone, sessionPhase]
  );

  const sendText = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || !caseSpec || !sessionId) return;
      if (!timerStarted || processing) return;

      setProcessing(true);
      setStreamingReply('');
      setInputText('');

      addMessage({
        id: uuidv4(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      });

      try {
        if (sessionPhase === 'physical' && !physicalExamDone) {
          await handlePhysicalExamTranscript(text);
          return;
        }

        const basePayload = {
          sessionId,
          message: text,
        };
        const fallbackPayload = {
          ...basePayload,
          caseSpec,
          difficulty,
          conversationHistory: conversationHistory.slice(-16),
        };

        let res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(basePayload),
        });
        if (!res.ok) {
          res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackPayload),
          });
        }
        if (!res.ok) throw new Error('응답 생성 실패');
        const reader = res.body?.getReader();
        if (!reader) throw new Error('응답 본문을 읽을 수 없습니다.');
        const decoder = new TextDecoder();
        let responseText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          responseText += chunk;
          setStreamingReply(responseText);
        }
        responseText = responseText.trim();
        if (!responseText) return;
        addMessage({
          id: uuidv4(),
          role: 'patient',
          content: responseText,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error(error);
      } finally {
        setStreamingReply('');
        setProcessing(false);
      }
    },
    [
      caseSpec,
      sessionId,
      timerStarted,
      processing,
      addMessage,
      sessionPhase,
      physicalExamDone,
      handlePhysicalExamTranscript,
      difficulty,
      conversationHistory,
    ]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await sendText(inputText);
    },
    [sendText, inputText]
  );

  const handleHistoryComplete = useCallback(() => {
    completeHistoryTaking();
    setShowPhysicalExamGuide(true);
  }, [completeHistoryTaking]);

  const handlePhysicalComplete = useCallback(() => {
    if (physicalExamDone || sessionPhase !== 'physical') return;
    markPhysicalExamDone();
    applyExamTimeDeduction(examTimeDeductionSeconds);
  }, [physicalExamDone, sessionPhase, markPhysicalExamDone, applyExamTimeDeduction, examTimeDeductionSeconds]);

  const handleEducationComplete = useCallback(() => {
    completeEducation();
  }, [completeEducation]);

  const handleEndSession = useCallback(() => {
    endSession();
    router.push(`/review/${sessionId}`);
  }, [endSession, router, sessionId]);

  const headerStatus = useMemo(() => {
    if (!timerStarted) return '타이머 시작 후 메시지를 입력하세요';
    if (processing) return '환자가 답변 작성 중...';
    if (sessionPhase === 'physical') return '신체진찰 단계: 검사 지시를 입력하세요';
    return '메시지를 입력해 환자와 대화하세요';
  }, [timerStarted, processing, sessionPhase]);

  if ((!authLoading && !user) || !caseSpec || sessionStatus === 'idle') {
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
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-black bg-white/70 backdrop-blur-xl relative z-50 shrink-0">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <span className="text-xs font-black text-black uppercase tracking-widest shrink-0">CPX FOR YOU 0 Message Session</span>
          <div className="w-1.5 h-1.5 bg-black rounded-full shrink-0 hidden sm:block" />
          <Timer onTimeUp={handleTimeUp} />
        </div>

        <button
          onClick={() => setShowEndConfirm(true)}
          className="px-5 py-2.5 rounded-full border border-black bg-white/50 backdrop-blur-sm text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-all shadow-sm active:scale-95"
        >
          진료 종료
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0 relative z-10 w-full max-w-[1500px] mx-auto border-x border-black bg-transparent">
        <div className="w-1/2 flex flex-col p-6 border-r border-black relative min-h-0">
          <div className="absolute inset-0 bg-white/30 backdrop-blur-sm -z-10" />
          <div className="rounded-2xl border border-black bg-white/80 p-4 mb-4">
            <p className="text-[10px] font-black tracking-widest uppercase text-black/50 mb-2">Patient / Vitals</p>
            <p className="text-sm font-black">
              {caseSpec.patient.name} ({caseSpec.patient.age}세 / {caseSpec.patient.gender})
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono font-bold">
              <span>BP {caseSpec.vitals.bp}</span>
              <span>HR {caseSpec.vitals.hr}</span>
              <span>RR {caseSpec.vitals.rr}</span>
              <span>T {caseSpec.vitals.temp}°C</span>
            </div>
          </div>

          <div className="flex items-start justify-center">
            <PatientVisual
              caseSpec={caseSpec}
              voiceState={processing ? 'thinking' : 'idle'}
              timerStarted={timerStarted}
            />
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleHistoryComplete}
                disabled={!timerStarted || sessionPhase !== 'history'}
                className="px-3 py-2 rounded-full border border-black text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black hover:text-white transition-colors"
              >
                병력청취 완료
              </button>
              <button
                onClick={handlePhysicalComplete}
                disabled={!timerStarted || sessionPhase !== 'physical' || physicalExamDone}
                className="px-3 py-2 rounded-full border border-black text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black hover:text-white transition-colors"
              >
                신체진찰 완료
              </button>
              <button
                onClick={handleEducationComplete}
                disabled={!timerStarted || sessionPhase !== 'education'}
                className="px-3 py-2 rounded-full border border-black text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black hover:text-white transition-colors"
              >
                환자교육 완료
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs font-bold">
              <span className="text-black/60">신체진찰 완료 시 차감</span>
              <span className="px-2 py-1 rounded-full border border-black font-mono">
                {Math.floor(examTimeDeductionSeconds / 60)}:{String(examTimeDeductionSeconds % 60).padStart(2, '0')}
              </span>
              <button
                onClick={() => setExamTimeDeductionSeconds(examTimeDeductionSeconds + 30)}
                className="w-7 h-7 rounded-full border border-black hover:bg-black hover:text-white transition-colors"
              >
                ▲
              </button>
              <button
                onClick={() => setExamTimeDeductionSeconds(examTimeDeductionSeconds - 30)}
                className="w-7 h-7 rounded-full border border-black hover:bg-black hover:text-white transition-colors"
              >
                ▼
              </button>
            </div>
          </div>

          <div className="mt-4 flex-1 min-h-0 rounded-3xl border border-black bg-white/60 backdrop-blur-xl overflow-hidden glass shadow-sm relative">
            <MemoPanel />
          </div>
        </div>

        <div className="w-1/2 flex flex-col p-6 gap-5 min-h-0 relative">
          <div className="absolute inset-0 bg-white/40 backdrop-blur-md -z-10" />

          <div className="flex-1 min-h-0 rounded-3xl border border-black bg-white/65 backdrop-blur-xl overflow-hidden glass shadow-sm relative flex flex-col">
            <div className="px-5 py-3 border-b border-black bg-white/60">
              <p className="text-xs font-black tracking-widest uppercase text-black/50">{headerStatus}</p>
            </div>
            <div ref={chatScrollRef} className="flex-1 overflow-auto p-4 space-y-3">
              {conversationHistory.length === 0 && (
                <div className="text-xs text-black/40 font-bold">대화를 시작해보세요.</div>
              )}
              {conversationHistory.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                      m.role === 'user' ? 'bg-black text-white' : 'bg-white border border-black/20 text-black'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {processing && streamingReply.trim().length > 0 && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap bg-white border border-black/20 text-black">
                    {streamingReply}
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="p-4 border-t border-black/20 flex gap-2">
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={timerStarted ? '메시지를 입력하세요...' : '타이머 시작 후 입력 가능합니다'}
                disabled={!timerStarted || processing}
                className="flex-1 rounded-xl border border-black px-3 py-2 text-sm outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!timerStarted || processing || !inputText.trim()}
                className="px-4 py-2 rounded-xl bg-black text-white text-xs font-bold disabled:opacity-40"
              >
                전송
              </button>
            </form>
          </div>

          {sessionPhase === 'physical' && examResultTexts.length > 0 && (
            <div className="rounded-2xl border border-black bg-black text-white p-4 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">신체진찰 결과</p>
              <div ref={examResultScrollRef} className="space-y-2 max-h-40 overflow-auto">
                {examResultTexts.map((txt, idx) => (
                  <p key={`${idx}-${txt.slice(0, 16)}`} className="text-sm font-medium leading-relaxed">
                    {txt}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showEndConfirm && (
        <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 backdrop-blur-2xl rounded-3xl border border-black w-full max-w-sm p-8 text-center relative">
            <h3 className="font-black text-xl text-black mb-3 tracking-tight">진료를 종료하시겠습니까?</h3>
            <p className="text-sm text-black/60 mb-8 leading-relaxed font-medium">
              종료 후 AI가 대화를 분석하고
              <br />
              체크리스트를 채점합니다.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleEndSession}
                className="w-full py-4 rounded-full bg-black text-white text-sm font-bold uppercase tracking-widest hover:bg-black/90 transition-all"
              >
                종료하기
              </button>
              <button
                onClick={() => setShowEndConfirm(false)}
                className="w-full py-4 rounded-full border border-black bg-white/50 text-black text-sm font-bold uppercase tracking-widest hover:bg-white transition-all"
              >
                진료 계속하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showPhysicalExamGuide && (
        <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 backdrop-blur-2xl rounded-3xl border border-black w-full max-w-md p-8 text-center relative">
            <div className="text-3xl mb-4">🩺</div>
            <h3 className="font-black text-xl text-black mb-3 tracking-tight">신체진찰을 시작합니다</h3>
            <p className="text-sm text-black/70 mb-8 leading-relaxed font-medium">
              진행할 진찰을 하나하나 입력하시면
              <br />
              그에 따른 소견을 드립니다.
            </p>
            <button
              onClick={() => setShowPhysicalExamGuide(false)}
              className="w-full py-4 rounded-full bg-black text-white text-sm font-bold uppercase tracking-widest hover:bg-black/90 transition-all"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
