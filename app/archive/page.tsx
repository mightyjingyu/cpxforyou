'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/sessionStore';
import { SessionData } from '@/types';
import { CLINICAL_CATEGORIES } from '@/lib/ai/personaTemplate';

export default function ArchivePage() {
  const router = useRouter();
  const { archivedSessions, memoTemplates, saveMemoTemplate, updateMemoTemplate } = useSessionStore();
  const [gradeFilter, setGradeFilter] = useState<'ALL' | 'A' | 'B' | 'C' | 'D' | 'F'>('ALL');
  const [clinicalFilter, setClinicalFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [groupMode, setGroupMode] = useState<'date' | 'category'>('date');
  const [memoModal, setMemoModal] = useState<{
    open: boolean;
    mode: 'list' | 'create';
    editingId: string | null;
    clinical: string;
    name: string;
    content: string;
  }>({ open: false, mode: 'list', editingId: null, clinical: '', name: '', content: '' });

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const dateKey = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };
  const getClinicalCategory = (presentation: string) => {
    for (const [category, values] of Object.entries(CLINICAL_CATEGORIES)) {
      if (values.includes(presentation)) return category;
    }
    return '기타';
  };

  const clinicalOptions = useMemo(
    () => ['ALL', ...Array.from(new Set(archivedSessions.map((s) => s.caseSpec.clinical_presentation)))],
    [archivedSessions]
  );
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archivedSessions.filter((s) => {
      const grade = s.scoreResult?.total_grade || 'F';
      const clinicalOk = clinicalFilter === 'ALL' || s.caseSpec.clinical_presentation === clinicalFilter;
      const gradeOk = gradeFilter === 'ALL' || grade === gradeFilter;
      const haystack = [
        s.caseSpec.clinical_presentation,
        s.caseSpec.true_diagnosis,
        s.caseSpec.answer_key?.diagnosis_ranked?.join(' ') || '',
        s.memoContent || '',
        s.scoreResult?.summary_feedback || '',
        (s.scoreResult?.tags || []).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      const searchOk = !q || haystack.includes(q);
      return clinicalOk && gradeOk && searchOk;
    });
  }, [archivedSessions, clinicalFilter, gradeFilter, query]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, SessionData[]>();
    for (const session of filteredSessions) {
      const key = groupMode === 'date' ? dateKey(session.startTime) : getClinicalCategory(session.caseSpec.clinical_presentation);
      const existing = groups.get(key) || [];
      existing.push(session);
      groups.set(key, existing);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => b.startTime - a.startTime);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      if (groupMode === 'date') return b[0].localeCompare(a[0]);
      return a[0].localeCompare(b[0], 'ko');
    });
  }, [filteredSessions, groupMode]);

  const openMemoModal = (clinical: string) => {
    setMemoModal({
      open: true,
      mode: 'list',
      editingId: null,
      clinical,
      name: `${clinical} 템플릿`,
      content: '',
    });
  };

  const submitMemoTemplate = () => {
    if (memoModal.editingId) {
      updateMemoTemplate(memoModal.editingId, {
        name: memoModal.name,
        content: memoModal.content,
        clinicalPresentation: memoModal.clinical,
      });
    } else {
      saveMemoTemplate({
        name: memoModal.name,
        content: memoModal.content,
        clinicalPresentation: memoModal.clinical,
      });
    }
    setMemoModal((s) => ({
      ...s,
      mode: 'list',
      editingId: null,
      name: `${s.clinical} 템플릿`,
      content: '',
    }));
  };

  return (
    <div className="min-h-screen bg-white relative flex flex-col font-sans selection:bg-black selection:text-white">
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 z-0 pointer-events-none" 
           style={{ 
             backgroundImage: "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)", 
             backgroundSize: "64px 64px" 
           }} 
      />
      
      {/* Soft gradient blobs for the liquid glass effect */}
      <div className="fixed top-10 right-[15%] w-96 h-96 rounded-full bg-neutral-200 blur-[100px] opacity-70 pointer-events-none z-0" />
      <div className="fixed bottom-10 left-[15%] w-96 h-96 rounded-full bg-neutral-300 blur-[100px] opacity-60 pointer-events-none z-0" />

      <div className="relative z-10 flex-1 flex flex-col h-full border-x border-black max-w-6xl mx-auto w-full bg-transparent">
        <header className="border-b border-black bg-white/70 backdrop-blur-xl px-8 py-5 sticky top-0 z-50">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => router.push('/')}
              className="text-sm font-bold uppercase tracking-wider text-black/60 hover:text-black transition-colors flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              홈으로
            </button>
            <h1 className="text-sm font-black tracking-widest uppercase">Archive</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-black border border-black rounded-full px-3 py-1 bg-white/50">{filteredSessions.length}/{archivedSessions.length}</span>
              <button
                onClick={() => router.push('/practice')}
                className="px-5 py-2.5 rounded-full bg-black text-white text-sm font-bold uppercase tracking-widest hover:bg-black/90 transition-all"
              >
                연습하기
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 w-full max-w-5xl mx-auto grid grid-cols-12 gap-6 mt-6">
          <aside className="col-span-12 md:col-span-4 lg:col-span-3 glass rounded-3xl border border-black p-6 h-fit relative overflow-hidden">
            <div className="absolute inset-0 border border-white/60 rounded-3xl pointer-events-none"></div>
            
            <div className="relative z-10">
              <p className="text-xs font-black text-black uppercase tracking-widest mb-3">검색</p>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="진단/임상/태그"
                className="w-full rounded-2xl border border-black px-4 py-3 text-sm font-medium outline-none focus:bg-white bg-white/50 backdrop-blur-sm transition-all focus:ring-2 focus:ring-black/5"
              />
              
              <div className="mt-8 mb-3">
                <p className="text-xs font-black text-black uppercase tracking-widest">성적 라벨</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['ALL', 'A', 'B', 'C', 'D', 'F'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGradeFilter(g)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold border transition-all ${
                      gradeFilter === g 
                      ? 'bg-black text-white border-black' 
                      : 'bg-white/50 text-black/60 border-black/20 hover:border-black hover:text-black'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              
              <div className="mt-8 mb-3">
                <p className="text-xs font-black text-black uppercase tracking-widest">임상 표현</p>
              </div>
              <select
                value={clinicalFilter}
                onChange={(e) => setClinicalFilter(e.target.value)}
                className="w-full rounded-2xl border border-black px-4 py-3 text-sm font-medium bg-white/50 backdrop-blur-sm outline-none focus:bg-white transition-all appearance-none text-black"
              >
                {clinicalOptions.map((c) => (
                  <option key={c} value={c}>
                    {c === 'ALL' ? '전체 보기' : c}
                  </option>
                ))}
              </select>
              <button
                onClick={() => openMemoModal(clinicalFilter === 'ALL' ? '전체 보기' : clinicalFilter)}
                className="w-full mt-3 px-4 py-2.5 rounded-xl border border-black text-xs font-bold hover:bg-black hover:text-white transition-colors"
              >
                메모 만들어놓기
              </button>

            </div>
          </aside>

          <main className="col-span-12 md:col-span-8 lg:col-span-9 relative z-10">
          {archivedSessions.length === 0 ? (
            <div className="text-center py-24 glass rounded-3xl border border-black p-10 relative overflow-hidden flex flex-col items-center">
              <div className="absolute inset-0 border border-white/60 rounded-3xl pointer-events-none"></div>
              <div className="w-16 h-16 rounded-full border-2 border-black flex items-center justify-center text-2xl mb-6 bg-white/50 rotate-[-10deg]">
                📂
              </div>
              <h2 className="text-xl font-black text-black mb-2 tracking-tight">아직 기록이 없습니다</h2>
              <p className="text-sm font-medium text-black/50 mb-8 max-w-xs mx-auto leading-relaxed">
                시뮬레이션을 시작하고 첫 번째 실전 연습 기록을 남겨보세요.
              </p>
              <button
                onClick={() => router.push('/practice')}
                className="px-8 py-4 bg-black text-white rounded-full text-sm font-bold hover:bg-black/80 hover:scale-105 active:scale-95 transition-all shadow-xl tracking-wider uppercase"
              >
                연습 시작하기
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setGroupMode('date')}
                  className={`rounded-xl px-3 py-2 text-xs font-bold border transition-all ${
                    groupMode === 'date' ? 'bg-black text-white border-black' : 'bg-white/60 border-black/20 text-black/70'
                  }`}
                >
                  날짜별
                </button>
                <button
                  onClick={() => setGroupMode('category')}
                  className={`rounded-xl px-3 py-2 text-xs font-bold border transition-all ${
                    groupMode === 'category' ? 'bg-black text-white border-black' : 'bg-white/60 border-black/20 text-black/70'
                  }`}
                >
                  카테고리별
                </button>
              </div>
              {groupedSessions.map(([groupTitle, sessions]) => (
                <section key={groupTitle} className="space-y-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-black/60">{groupTitle}</h2>
                  {sessions.map((session) => (
                    <ArchiveCard
                      key={session.id}
                      session={session}
                      onClick={() => router.push(`/archive/${session.id}`)}
                      formatDate={formatDate}
                      formatElapsed={formatElapsed}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
          </main>
        </div>
      </div>
      {memoModal.open && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl border border-black bg-white p-6">
            <h3 className="text-lg font-black mb-1">메모 만들어놓기</h3>
            <p className="text-xs text-black/50 mb-4">{memoModal.clinical}</p>
            {memoModal.mode === 'list' ? (
              <div className="space-y-2 mb-3 max-h-72 overflow-auto">
                {memoTemplates.length === 0 && (
                  <p className="text-xs text-black/50">아직 저장된 메모가 없습니다.</p>
                )}
                {memoTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() =>
                      setMemoModal((s) => ({
                        ...s,
                        mode: 'create',
                        editingId: tpl.id,
                        name: tpl.name,
                        content: tpl.content,
                        clinical: tpl.clinicalPresentation || s.clinical,
                      }))
                    }
                    className="w-full text-left rounded-xl border border-black px-3 py-2 hover:bg-black hover:text-white transition-colors"
                  >
                    <p className="text-xs font-black">{tpl.name}</p>
                    <p className="text-[11px] opacity-70 mt-1 line-clamp-2">{tpl.content}</p>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <input
                  value={memoModal.name}
                  onChange={(e) => setMemoModal((s) => ({ ...s, name: e.target.value }))}
                  placeholder="메모 이름"
                  className="w-full rounded-xl border border-black px-3 py-2 text-sm mb-3"
                />
                <textarea
                  value={memoModal.content}
                  onChange={(e) => setMemoModal((s) => ({ ...s, content: e.target.value }))}
                  placeholder="세션에서 바로 불러올 메모 내용을 입력하세요."
                  className="w-full h-44 rounded-xl border border-black px-3 py-2 text-sm font-mono"
                />
              </>
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() =>
                  setMemoModal({
                    open: false,
                    mode: 'list',
                    editingId: null,
                    clinical: '',
                    name: '',
                    content: '',
                  })
                }
                className="px-4 py-2 rounded-full border border-black text-xs font-bold"
              >
                취소
              </button>
              {memoModal.mode === 'list' ? (
                <button
                  onClick={() =>
                    setMemoModal((s) => ({
                      ...s,
                      mode: 'create',
                      editingId: null,
                      name: `${s.clinical} 템플릿`,
                      content: '',
                    }))
                  }
                  className="px-4 py-2 rounded-full bg-black text-white text-xs font-bold"
                >
                  새 메모 만들기
                </button>
              ) : (
                <>
                  <button
                    onClick={() =>
                      setMemoModal((s) => ({
                        ...s,
                        mode: 'list',
                        editingId: null,
                        name: `${s.clinical} 템플릿`,
                        content: '',
                      }))
                    }
                    className="px-4 py-2 rounded-full border border-black text-xs font-bold"
                  >
                    목록으로
                  </button>
                  <button
                    onClick={submitMemoTemplate}
                    className="px-4 py-2 rounded-full bg-black text-white text-xs font-bold"
                  >
                    {memoModal.editingId ? '수정 저장' : '저장'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchiveCard({
  session,
  onClick,
  formatDate,
  formatElapsed,
}: {
  session: SessionData;
  onClick: () => void;
  formatDate: (ts: number) => string;
  formatElapsed: (s: number) => string;
}) {
  const grade = session.scoreResult?.total_grade || 'F';

  return (
    <div
      className="group relative border border-black rounded-3xl overflow-hidden transition-all duration-300 cursor-pointer bg-white/40 backdrop-blur-md hover:bg-white/80 hover:-translate-y-1 hover:shadow-xl"
      onClick={onClick}
    >
      <div className="absolute inset-0 border border-white/60 pointer-events-none rounded-3xl"></div>
      <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-lg font-black text-black tracking-tight">{session.caseSpec.patient.name}</span>
            <span className="text-sm font-bold text-black/50 tracking-wide border-l border-black/20 pl-2">
              {session.caseSpec.patient.age}세 · {session.caseSpec.patient.gender}
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${
              session.caseSpec.difficulty === 'easy' ? 'bg-white border-black text-black' :
              session.caseSpec.difficulty === 'hard' ? 'bg-black border-black text-white' :
              'bg-black/5 border-black/20 text-black/70'
            }`}>
              {session.caseSpec.difficulty === 'easy' ? '쉬움' : session.caseSpec.difficulty === 'hard' ? '어려움' : '보통'}
            </span>
          </div>
          <p className="text-sm font-semibold text-black/80">{session.caseSpec.clinical_presentation}</p>
          <p className="text-xs font-medium text-black/40 mt-1">{formatDate(session.startTime)}</p>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t border-black/10 sm:border-0">
          <div className="text-xs font-bold text-black/40 uppercase tracking-widest sm:mb-1">Score</div>
          <div className="flex items-baseline gap-2">
            <div className="text-4xl font-black text-black">
              {grade}
            </div>
            <div className="text-xs font-bold text-black/30 font-mono tracking-widest">
              {formatElapsed(session.elapsedSeconds)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
