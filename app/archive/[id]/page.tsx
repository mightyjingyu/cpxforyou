'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSessionStore } from '@/store/sessionStore';
import Checklist from '@/components/review/Checklist';
import ConversationLog from '@/components/review/ConversationLog';
import TagSystem from '@/components/review/TagSystem';
import { useAuth } from '@/components/auth/AuthProvider';

export default function ArchiveDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { archivedSessions } = useSessionStore();
  const { user, authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'checklist' | 'log'>('checklist');

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/');
    }
  }, [authLoading, user, router]);

  const session = useMemo(
    () => archivedSessions.find((s) => s.id === params.id),
    [archivedSessions, params.id]
  );

  if (!authLoading && !user) return null;

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-sm text-neutral-400 mb-4">아카이브 데이터를 찾을 수 없습니다.</p>
          <button onClick={() => router.push('/archive')} className="text-sm underline text-black">
            아카이브로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const scoreResult = session.scoreResult;
  const caseSpec = session.caseSpec;
  const ppiTotal = scoreResult
    ? scoreResult.ppi_score.opening +
      scoreResult.ppi_score.empathy +
      scoreResult.ppi_score.summary +
      scoreResult.ppi_score.closure
    : null;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const formatPhase = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.max(0, Math.round(sec % 60));
    return `${m}분 ${s}초`;
  };
  const phases = session.phaseDurations;

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white border-b border-neutral-100 z-30 px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/archive')}
              className="text-xs text-neutral-400 hover:text-black transition-colors mb-1 flex items-center gap-1"
            >
              ← 아카이브
            </button>
            <h1 className="text-base font-bold text-black tracking-tight">진료 분석 리포트</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-400">소요시간</p>
            <p className="text-sm font-mono font-bold text-black">{formatTime(session.elapsedSeconds)}</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
        <div className="bg-neutral-50 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-neutral-400 mb-1">환자</p>
              <p className="text-lg font-bold text-black">
                {caseSpec.patient.name}
                <span className="text-sm font-normal text-neutral-500 ml-2">
                  ({caseSpec.patient.age}세/{caseSpec.patient.gender})
                </span>
              </p>
              <p className="text-sm text-neutral-500 mt-1">{caseSpec.clinical_presentation}</p>
            </div>
            {scoreResult && (
              <div className="text-right">
                <p className="text-xs text-neutral-400 mb-1">최종 등급</p>
                <p
                  className={`text-3xl font-black ${
                    scoreResult.total_grade === 'A' || scoreResult.total_grade === 'B'
                      ? 'text-black'
                      : scoreResult.total_grade === 'C'
                      ? 'text-neutral-600'
                      : 'text-red-500'
                  }`}
                >
                  {scoreResult.total_grade}
                </p>
              </div>
            )}
          </div>
        </div>

        {phases && (
          <div className="border border-neutral-100 rounded-2xl p-5 bg-white">
            <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">
              단계별 소요 시간
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-neutral-100 p-3">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">병력청취</p>
                <p className="text-lg font-bold text-black">{formatPhase(phases.historyTakingSeconds)}</p>
                <p className="text-[10px] text-neutral-400 mt-1">시작 ~ 신체진찰 버튼</p>
              </div>
              <div className="rounded-xl border border-neutral-100 p-3">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">신체진찰</p>
                <p className="text-lg font-bold text-black">{formatPhase(phases.physicalExamSeconds)}</p>
                <p className="text-[10px] text-neutral-400 mt-1">진찰 시작 ~ 진찰 완료</p>
              </div>
              <div className="rounded-xl border border-neutral-100 p-3">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">교육·마무리</p>
                <p className="text-lg font-bold text-black">{formatPhase(phases.educationSeconds)}</p>
                <p className="text-[10px] text-neutral-400 mt-1">진찰 완료 ~ 진료 종료</p>
              </div>
            </div>
          </div>
        )}

        {scoreResult && (
          <>
            <div className="border border-neutral-100 rounded-2xl p-5">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">
                PPI 환자-의사 상호작용
              </h2>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: '개회', value: scoreResult.ppi_score.opening, max: 3 },
                  { label: '공감', value: scoreResult.ppi_score.empathy, max: 3 },
                  { label: '요약', value: scoreResult.ppi_score.summary, max: 2 },
                  { label: '마무리', value: scoreResult.ppi_score.closure, max: 2 },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-50 border-2 border-neutral-200 flex items-center justify-center mx-auto mb-2">
                      <span className="text-sm font-bold text-black">
                        {item.value}/{item.max}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-neutral-100 flex justify-between items-center">
                <span className="text-xs text-neutral-400">PPI 합계</span>
                <span className="text-sm font-bold text-black">{ppiTotal}/10</span>
              </div>
            </div>

            {scoreResult.critical_omissions.length > 0 && (
              <div className="border border-red-100 rounded-2xl p-5 bg-red-50/30">
                <h2 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">치명적 누락 항목</h2>
                <div className="space-y-2">
                  {scoreResult.critical_omissions.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-xs font-mono text-red-300 shrink-0 mt-0.5">{item.timestamp}</span>
                      <p className="text-sm text-red-600">{item.issue}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scoreResult.summary_feedback && (
              <div className="bg-neutral-50 rounded-2xl p-5">
                <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">총평</h2>
                <p className="text-sm text-neutral-700 leading-relaxed">{scoreResult.summary_feedback}</p>
                <p className="text-xs text-neutral-500 mt-3">{scoreResult.grade_basis}</p>
              </div>
            )}

            <div className="border border-neutral-100 rounded-2xl p-5">
              <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">
                최종 단계 평가 (추정진단/향후계획/환자교육)
              </h2>
              <div className="space-y-3">
                {[
                  { key: '추정진단', data: scoreResult.final_answer_evaluation.presumptive_diagnosis },
                  { key: '향후 계획(검사)', data: scoreResult.final_answer_evaluation.management_plan_tests },
                  { key: '향후 계획(치료)', data: scoreResult.final_answer_evaluation.management_plan_treatment },
                  { key: '환자교육', data: scoreResult.final_answer_evaluation.patient_education },
                ].map((item) => (
                  <div key={item.key} className="rounded-xl border border-neutral-100 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-black">{item.key}</p>
                      <span className={`text-xs font-bold ${item.data.correct ? 'text-emerald-600' : 'text-red-500'}`}>
                        {item.data.correct ? '정답' : '오답'}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mb-1">정답</p>
                    <p className="text-sm text-neutral-800 mb-2">{item.data.expected}</p>
                    <p className="text-xs text-neutral-400 mb-1">내 답변 요약</p>
                    <p className="text-sm text-neutral-700 mb-2">{item.data.student_summary}</p>
                    <p className="text-xs text-neutral-500">{item.data.reason}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-neutral-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-neutral-400">환자 답변-정답 일치성</p>
                  <span
                    className={`text-xs font-bold ${
                      scoreResult.final_answer_evaluation.patient_consistency.consistent
                        ? 'text-emerald-600'
                        : 'text-red-500'
                    }`}
                  >
                    {scoreResult.final_answer_evaluation.patient_consistency.consistent ? '일치' : '불일치'}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {scoreResult.final_answer_evaluation.patient_consistency.reason}
                </p>
              </div>
            </div>

            {scoreResult.tags.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">자동 태그</h2>
                <TagSystem tags={scoreResult.tags} />
              </div>
            )}

            <div>
              <div className="flex border border-neutral-200 rounded-xl overflow-hidden mb-4">
                <button
                  onClick={() => setActiveTab('checklist')}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                    activeTab === 'checklist' ? 'bg-black text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'
                  }`}
                >
                  체크리스트
                </button>
                <button
                  onClick={() => setActiveTab('log')}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                    activeTab === 'log' ? 'bg-black text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'
                  }`}
                >
                  대화 로그
                </button>
              </div>

              {activeTab === 'checklist' && <Checklist results={scoreResult.checklist_results} />}
              {activeTab === 'log' && (
                <ConversationLog
                  messages={session.conversationHistory}
                  poorQuestions={scoreResult.poor_questions}
                  criticalOmissions={scoreResult.critical_omissions}
                />
              )}
            </div>
          </>
        )}

        {session.memoContent && (
          <div className="border border-neutral-100 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">진료 메모</h2>
            <pre className="text-sm text-black leading-relaxed font-mono whitespace-pre-wrap">{session.memoContent}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

