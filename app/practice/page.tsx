'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useSessionStore } from '@/store/sessionStore';
import { CLINICAL_CATEGORIES, CLINICAL_PRESENTATIONS } from '@/lib/ai/personaTemplate';
import { CaseSpec, Difficulty, Friendliness, TimerMode } from '@/types';
import type { DirectCasePersisted } from '@/types/directCase';
import { useAuth } from '@/components/auth/AuthProvider';

type PracticeMode = 'full_random' | 'category_random' | 'clinical_pick';
type CustomPoolMode = 'full_random' | 'category_random' | 'clinical_pick';

export default function PracticePage() {
  const router = useRouter();
  const { startSession, directCases, removeDirectCase } = useSessionStore();
  const { user, authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<PracticeMode>('full_random');
  const [category, setCategory] = useState<string>(Object.keys(CLINICAL_CATEGORIES)[0] || '');
  const [presentation, setPresentation] = useState<string>(CLINICAL_PRESENTATIONS[0] || '');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [friendliness, setFriendliness] = useState<Friendliness>('normal');
  const [timerMode, setTimerMode] = useState<TimerMode>('countdown');
  const [interactionMode, setInteractionMode] = useState<'voice' | 'text'>('voice');
  const [customMode, setCustomMode] = useState<CustomPoolMode>('full_random');
  const [customCategory, setCustomCategory] = useState<string>(Object.keys(CLINICAL_CATEGORIES)[0] || '');
  const [customPresentation, setCustomPresentation] = useState<string>(CLINICAL_PRESENTATIONS[0] || '');
  const [customDifficulty, setCustomDifficulty] = useState<Difficulty>('normal');
  const [customFriendliness, setCustomFriendliness] = useState<Friendliness>('normal');
  const [customTimerMode, setCustomTimerMode] = useState<TimerMode>('countdown');
  const [customInteractionMode, setCustomInteractionMode] = useState<'voice' | 'text'>('voice');

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/');
    }
  }, [authLoading, user, router]);

  const handleStartSession = async () => {
    setLoading(true);
    try {
      let selectedClinical = presentation;
      let selectedDifficulty: Difficulty = difficulty;

      if (mode === 'full_random') {
        selectedClinical = CLINICAL_PRESENTATIONS[Math.floor(Math.random() * CLINICAL_PRESENTATIONS.length)];
        const ds: Difficulty[] = ['easy', 'normal', 'hard'];
        selectedDifficulty = ds[Math.floor(Math.random() * ds.length)];
      }

      if (mode === 'category_random') {
        const pool = category ? CLINICAL_CATEGORIES[category] || [] : [];
        const source = pool.length > 0 ? pool : CLINICAL_PRESENTATIONS;
        selectedClinical = source[Math.floor(Math.random() * source.length)];
      }

      if (!selectedClinical) {
        selectedClinical = CLINICAL_PRESENTATIONS[Math.floor(Math.random() * CLINICAL_PRESENTATIONS.length)];
      }

      const res = await fetch('/api/case/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinical_presentation: selectedClinical,
          difficulty: selectedDifficulty,
          friendliness,
          learning_goal: ['감별진단 확장', 'PPI 강화'],
          persona_template_id: 'default_v1',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || '케이스 생성 API 호출 실패');
      }
      const data = await res.json();
      const caseSpec: CaseSpec = data.caseSpec;
      const sessionId = uuidv4();

      const reg = await fetch('/api/session/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, caseSpec, difficulty: selectedDifficulty, friendliness }),
      });
      if (!reg.ok) {
        const err = await reg.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || '서버 세션 등록 실패');
      }

      startSession(caseSpec, sessionId, selectedDifficulty, timerMode);
      router.push(interactionMode === 'voice' ? `/session/${sessionId}` : `/session-message/${sessionId}`);
    } catch (error) {
      console.error('Failed to start session:', error);
      alert('케이스 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const categoryPool = category ? CLINICAL_CATEGORIES[category] || [] : [];

  const customPresentationOptions = useMemo(() => {
    const set = new Set<string>(CLINICAL_PRESENTATIONS);
    for (const d of directCases ?? []) {
      if (d.chiefComplaint?.trim()) set.add(d.chiefComplaint.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [directCases]);

  useEffect(() => {
    if (customPresentationOptions.length === 0) return;
    if (!customPresentationOptions.includes(customPresentation)) {
      setCustomPresentation(customPresentationOptions[0]!);
    }
  }, [customPresentationOptions, customPresentation]);

  const customCategoryPool = customCategory ? CLINICAL_CATEGORIES[customCategory] || [] : [];

  const filteredDirectCases = useMemo(() => {
    const all = directCases ?? [];
    if (customMode === 'full_random') return all;
    if (customMode === 'category_random') {
      return all.filter((d) => d.systemCategory === customCategory);
    }
    return all.filter((d) => d.chiefComplaint === customPresentation);
  }, [directCases, customMode, customCategory, customPresentation]);

  const handleStartDirectSaved = async (entry: DirectCasePersisted) => {
    setLoading(true);
    try {
      const caseSpec = entry.caseSpec;
      const sessionId = uuidv4();
      const useFilterModes = customMode === 'category_random' || customMode === 'clinical_pick';
      const resolvedDifficulty = useFilterModes ? customDifficulty : caseSpec.difficulty;
      const resolvedFriendliness = useFilterModes
        ? customFriendliness
        : entry.formPayload?.friendliness ?? 'normal';
      const reg = await fetch('/api/session/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          caseSpec,
          difficulty: resolvedDifficulty,
          friendliness: resolvedFriendliness,
        }),
      });
      if (!reg.ok) {
        const err = await reg.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || '세션 등록 실패');
      }
      startSession(caseSpec, sessionId, resolvedDifficulty, customTimerMode);
      router.push(customInteractionMode === 'voice' ? `/session/${sessionId}` : `/session-message/${sessionId}`);
    } catch (e) {
      console.error(e);
      alert('시작에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomRandomStart = async () => {
    const pool = filteredDirectCases;
    if (pool.length === 0) return;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    await handleStartDirectSaved(picked);
  };

  if (!authLoading && !user) return null;

  return (
    <main className="min-h-screen bg-white relative flex flex-col font-sans selection:bg-black selection:text-white">
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
          <div className="flex items-center justify-between">
            <button onClick={() => router.push('/')} className="text-sm font-bold uppercase tracking-wider text-black/60 hover:text-black transition-colors flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              홈으로
            </button>
            <h1 className="text-sm font-black tracking-widest uppercase">Practice Setup</h1>
            <div className="w-16" />
          </div>
        </header>

        <div className="flex-1 p-6 w-full max-w-4xl mx-auto space-y-8 mt-6">
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-black">Generative Mode</h2>
              <p className="text-xs text-black/55 mt-1 max-w-md">
                AI가 임상 프롬프트로 새 증례를 생성합니다.
              </p>
            </div>
          </div>

          <section className="grid md:grid-cols-3 gap-4">
            {[
              { key: 'full_random', title: '완전 랜덤', desc: '임상 + 난이도 모두 랜덤' },
              { key: 'category_random', title: '카테고리 랜덤', desc: '카테고리 안에서 임상 랜덤' },
              { key: 'clinical_pick', title: '임상 선택', desc: '원하는 임상을 직접 선택' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key as PracticeMode)}
                className={`relative text-left rounded-3xl border transition-all duration-300 p-6 flex flex-col justify-center
                  ${mode === item.key 
                    ? 'border-black bg-black/5 backdrop-blur-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] -translate-y-1' 
                    : 'border-black/20 bg-white/40 hover:bg-white/70 hover:border-black/50 backdrop-blur-md'
                  }`}
              >
                {mode === item.key && (
                  <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-black"></div>
                )}
                <p className="text-xl font-black text-black mb-2 uppercase tracking-tight">{item.title}</p>
                <p className="text-xs font-semibold text-black/60 leading-relaxed">{item.desc}</p>
              </button>
            ))}
          </section>

          <section className="rounded-3xl border border-black glass p-8 space-y-8 relative overflow-hidden">
            <div className="absolute inset-0 border border-white/60 rounded-3xl pointer-events-none"></div>

            {mode === 'category_random' && (
              <div className="relative z-10">
                <label className="text-xs font-black text-black uppercase tracking-widest mb-3 block">카테고리</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-2xl border border-black px-4 py-3.5 text-sm font-medium bg-white/50 backdrop-blur-md outline-none focus:bg-white focus:ring-2 focus:ring-black/5 transition-all text-black appearance-none"
                >
                  {Object.keys(CLINICAL_CATEGORIES).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-xs font-medium text-black/50 mt-3 leading-relaxed">
                  포함 임상: {categoryPool.length > 0 ? categoryPool.join(', ') : '해당 없음'}
                </p>
              </div>
            )}

            {mode === 'clinical_pick' && (
              <div className="relative z-10">
                <label className="text-xs font-black text-black uppercase tracking-widest mb-3 block">임상 선택</label>
                <select
                  value={presentation}
                  onChange={(e) => setPresentation(e.target.value)}
                  className="w-full rounded-2xl border border-black px-4 py-3.5 text-sm font-medium bg-white/50 backdrop-blur-md outline-none focus:bg-white focus:ring-2 focus:ring-black/5 transition-all text-black appearance-none"
                >
                  {CLINICAL_PRESENTATIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            )}

            {mode !== 'full_random' && (
              <div className="space-y-8 relative z-10">
                <div className="pt-6 border-t border-black/10">
                  <label className="text-xs font-black text-black uppercase tracking-widest mb-3 block">난이도</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'easy', label: '쉬움' },
                      { value: 'normal', label: '보통' },
                      { value: 'hard', label: '어려움' },
                    ].map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setDifficulty(d.value as Difficulty)}
                        className={`rounded-2xl py-3 text-sm font-bold border transition-all ${
                          difficulty === d.value 
                          ? 'bg-black text-white border-black shadow-md' 
                          : 'bg-white/50 text-black/70 border-black/20 hover:border-black/50 hover:bg-white/80'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black text-black uppercase tracking-widest mb-3 block">환자 태도</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'cooperative', label: '협조적' },
                      { value: 'normal', label: '보통' },
                      { value: 'uncooperative', label: '비협조적' },
                    ].map((f) => (
                      <button
                        key={f.value}
                        onClick={() => setFriendliness(f.value as Friendliness)}
                        className={`rounded-2xl py-3 text-sm font-bold border transition-all ${
                          friendliness === f.value 
                          ? 'bg-black text-white border-black shadow-md' 
                          : 'bg-white/50 text-black/70 border-black/20 hover:border-black/50 hover:bg-white/80'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="relative z-10 pt-2 border-t border-black/10">
              <label className="text-xs font-black text-black uppercase tracking-widest mb-3 block">진행 방식</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setInteractionMode('voice')}
                  className={`text-left rounded-2xl border p-4 transition-all ${
                    interactionMode === 'voice'
                      ? 'border-black bg-black text-white shadow-md'
                      : 'border-black/20 bg-white/50 hover:border-black/40'
                  }`}
                >
                  <p className="text-sm font-black mb-1">음성 세션</p>
                  <p className={`text-xs font-medium leading-relaxed ${interactionMode === 'voice' ? 'text-white/80' : 'text-black/50'}`}>
                    마이크를 눌러 환자와 음성으로 대화합니다.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setInteractionMode('text')}
                  className={`text-left rounded-2xl border p-4 transition-all ${
                    interactionMode === 'text'
                      ? 'border-black bg-black text-white shadow-md'
                      : 'border-black/20 bg-white/50 hover:border-black/40'
                  }`}
                >
                  <p className="text-sm font-black mb-1">메시지 세션</p>
                  <p className={`text-xs font-medium leading-relaxed ${interactionMode === 'text' ? 'text-white/80' : 'text-black/50'}`}>
                    채팅창에 텍스트를 입력해 환자와 대화합니다.
                  </p>
                </button>
              </div>

              <label className="text-xs font-black text-black uppercase tracking-widest mb-3 block">타이머 방식</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTimerMode('countdown')}
                  className={`text-left rounded-2xl border p-4 transition-all ${
                    timerMode === 'countdown'
                      ? 'border-black bg-black text-white shadow-md'
                      : 'border-black/20 bg-white/50 hover:border-black/40'
                  }`}
                >
                  <p className="text-sm font-black mb-1">카운트다운 (12분)</p>
                  <p className={`text-xs font-medium leading-relaxed ${timerMode === 'countdown' ? 'text-white/80' : 'text-black/50'}`}>
                    12:00부터 줄어들며, 0이 되면 자동 종료됩니다.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTimerMode('countup')}
                  className={`text-left rounded-2xl border p-4 transition-all ${
                    timerMode === 'countup'
                      ? 'border-black bg-black text-white shadow-md'
                      : 'border-black/20 bg-white/50 hover:border-black/40'
                  }`}
                >
                  <p className="text-sm font-black mb-1">카운트업 (무제한)</p>
                  <p className={`text-xs font-medium leading-relaxed ${timerMode === 'countup' ? 'text-white/80' : 'text-black/50'}`}>
                    0:00부터 올라가며, 시간 제한 없이 진행합니다.
                  </p>
                </button>
              </div>
            </div>

            <div className="pt-4 relative z-10">
              <button
                onClick={handleStartSession}
                disabled={loading}
                className="w-full py-5 bg-black text-white rounded-2xl text-sm font-bold uppercase tracking-wider hover:bg-black/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3" />
                    케이스 생성 중...
                  </>
                ) : '이 설정으로 시작'}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-black glass p-6 space-y-5 relative overflow-hidden">
            <div className="absolute inset-0 border border-white/60 rounded-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-black">Custom Mode</h2>
                <p className="text-xs text-black/55 mt-1 max-w-md">
                  표로 만든 증례를 저장해 두고, Generative Mode와 같은 방식으로 랜덤·필터 연습을 할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/practice/direct')}
                className="shrink-0 px-5 py-2.5 rounded-full border border-black bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-black/90"
              >
                새 증례 만들기
              </button>
            </div>

            <div className="relative z-10 grid md:grid-cols-3 gap-3">
              {(
                [
                  { key: 'full_random' as const, title: '완전 랜덤', desc: '저장된 증례 전체에서 랜덤' },
                  { key: 'category_random' as const, title: '카테고리 랜덤', desc: '계통(카테고리)별로 필터 후 랜덤' },
                  { key: 'clinical_pick' as const, title: '임상 선택', desc: 'C.C.(임상표현)별로 필터 후 랜덤' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCustomMode(item.key)}
                  className={`relative text-left rounded-2xl border transition-all duration-300 p-4 flex flex-col justify-center
                    ${
                      customMode === item.key
                        ? 'border-black bg-black/5 backdrop-blur-xl shadow-md'
                        : 'border-black/20 bg-white/40 hover:bg-white/70 hover:border-black/50 backdrop-blur-md'
                    }`}
                >
                  {customMode === item.key && (
                    <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-black" />
                  )}
                  <p className="text-sm font-black text-black mb-1 uppercase tracking-tight">{item.title}</p>
                  <p className="text-[10px] font-semibold text-black/55 leading-relaxed">{item.desc}</p>
                </button>
              ))}
            </div>

            {customMode === 'category_random' && (
              <div className="relative z-10 space-y-2">
                <label className="text-[10px] font-black text-black uppercase tracking-widest">카테고리</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="w-full rounded-2xl border border-black px-3 py-2.5 text-sm bg-white/70"
                >
                  {Object.keys(CLINICAL_CATEGORIES).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-black/45 leading-relaxed">
                  포함 임상: {customCategoryPool.length > 0 ? customCategoryPool.join(', ') : '해당 없음'}
                </p>
              </div>
            )}

            {customMode === 'clinical_pick' && (
              <div className="relative z-10 space-y-2">
                <label className="text-[10px] font-black text-black uppercase tracking-widest">임상 (C.C.)</label>
                <select
                  value={customPresentation}
                  onChange={(e) => setCustomPresentation(e.target.value)}
                  className="w-full rounded-2xl border border-black px-3 py-2.5 text-sm bg-white/70"
                >
                  {customPresentationOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative z-10 space-y-5 pt-2 border-t border-black/10">
              {(customMode === 'category_random' || customMode === 'clinical_pick') && (
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-black text-black uppercase tracking-widest mb-2 block">난이도</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'easy' as const, label: '쉬움' },
                        { value: 'normal' as const, label: '보통' },
                        { value: 'hard' as const, label: '어려움' },
                      ].map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => setCustomDifficulty(d.value)}
                          className={`rounded-2xl py-2.5 text-xs font-bold border transition-all ${
                            customDifficulty === d.value
                              ? 'bg-black text-white border-black shadow-md'
                              : 'bg-white/50 text-black/70 border-black/20 hover:border-black/50'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-black uppercase tracking-widest mb-2 block">환자 태도</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'cooperative' as const, label: '협조적' },
                        { value: 'normal' as const, label: '보통' },
                        { value: 'uncooperative' as const, label: '비협조적' },
                      ].map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setCustomFriendliness(f.value)}
                          className={`rounded-2xl py-2.5 text-xs font-bold border transition-all ${
                            customFriendliness === f.value
                              ? 'bg-black text-white border-black shadow-md'
                              : 'bg-white/50 text-black/70 border-black/20 hover:border-black/50'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-black uppercase tracking-widest mb-2 block">진행 방식</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomInteractionMode('voice')}
                    className={`text-left rounded-2xl border p-3 transition-all ${
                      customInteractionMode === 'voice'
                        ? 'border-black bg-black text-white shadow-md'
                        : 'border-black/20 bg-white/50 hover:border-black/40'
                    }`}
                  >
                    <p className="text-xs font-black mb-0.5">음성 세션</p>
                    <p className={`text-[10px] font-medium leading-relaxed ${customInteractionMode === 'voice' ? 'text-white/80' : 'text-black/50'}`}>
                      마이크로 대화
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomInteractionMode('text')}
                    className={`text-left rounded-2xl border p-3 transition-all ${
                      customInteractionMode === 'text'
                        ? 'border-black bg-black text-white shadow-md'
                        : 'border-black/20 bg-white/50 hover:border-black/40'
                    }`}
                  >
                    <p className="text-xs font-black mb-0.5">메시지 세션</p>
                    <p className={`text-[10px] font-medium leading-relaxed ${customInteractionMode === 'text' ? 'text-white/80' : 'text-black/50'}`}>
                      채팅으로 대화
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-black uppercase tracking-widest mb-2 block">타이머 방식</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomTimerMode('countdown')}
                    className={`text-left rounded-2xl border p-3 transition-all ${
                      customTimerMode === 'countdown'
                        ? 'border-black bg-black text-white shadow-md'
                        : 'border-black/20 bg-white/50 hover:border-black/40'
                    }`}
                  >
                    <p className="text-xs font-black mb-0.5">카운트다운 (12분)</p>
                    <p className={`text-[10px] font-medium ${customTimerMode === 'countdown' ? 'text-white/80' : 'text-black/50'}`}>
                      12분 제한
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomTimerMode('countup')}
                    className={`text-left rounded-2xl border p-3 transition-all ${
                      customTimerMode === 'countup'
                        ? 'border-black bg-black text-white shadow-md'
                        : 'border-black/20 bg-white/50 hover:border-black/40'
                    }`}
                  >
                    <p className="text-xs font-black mb-0.5">카운트업</p>
                    <p className={`text-[10px] font-medium ${customTimerMode === 'countup' ? 'text-white/80' : 'text-black/50'}`}>
                      무제한
                    </p>
                  </button>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex flex-wrap items-center gap-2 text-[10px] text-black/50">
              <span className="font-bold text-black/60">
                해당 목록 {filteredDirectCases.length}개
              </span>
              {customMode === 'full_random' && (directCases ?? []).length === 0 && (
                <span>· 저장된 Custom 증례가 없습니다.</span>
              )}
              {customMode === 'category_random' && filteredDirectCases.length === 0 && (directCases ?? []).length > 0 && (
                <span>· 이 카테고리에 해당하는 증례가 없습니다.</span>
              )}
              {customMode === 'clinical_pick' && filteredDirectCases.length === 0 && (directCases ?? []).length > 0 && (
                <span>· 이 임상 표현과 일치하는 증례가 없습니다.</span>
              )}
            </div>

            <div className="relative z-10 pt-1">
              <button
                type="button"
                disabled={loading || filteredDirectCases.length === 0}
                onClick={() => void handleCustomRandomStart()}
                className="w-full py-4 bg-black text-white rounded-2xl text-xs font-bold uppercase tracking-wider hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    시작 중…
                  </span>
                ) : customMode === 'full_random' ? (
                  '저장된 증례 중 랜덤으로 시작'
                ) : customMode === 'category_random' ? (
                  '이 카테고리에서 랜덤으로 시작'
                ) : (
                  '이 임상에서 랜덤으로 시작'
                )}
              </button>
            </div>

            {(directCases ?? []).length === 0 ? (
              <p className="relative z-10 text-xs text-black/45">
                저장된 Custom 증례가 없습니다. 새 증례 만들기에서 케이스를 완성하세요.
              </p>
            ) : filteredDirectCases.length === 0 ? (
              <p className="relative z-10 text-xs text-black/45">위 조건에 맞는 증례가 없습니다. 카테고리·임상을 바꿔 보세요.</p>
            ) : (
              <ul className="relative z-10 space-y-2 max-h-64 overflow-y-auto pr-1">
                {filteredDirectCases.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/15 bg-white/60 px-4 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/practice/direct?id=${encodeURIComponent(d.id)}`)}
                      className="min-w-0 text-left flex-1 hover:opacity-80 transition-opacity"
                    >
                      <p className="text-sm font-bold text-black truncate">{d.title}</p>
                      <p className="text-[10px] text-black/45 font-medium">
                        {d.systemCategory} · {d.chiefComplaint}
                      </p>
                      <p className="text-[9px] text-black/35 mt-0.5">탭하여 수정 · 저장</p>
                    </button>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleStartDirectSaved(d);
                        }}
                        className="px-4 py-2 rounded-full bg-black text-white text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                      >
                        이 증례로 시작
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void (async () => {
                            if (!confirm('이 증례를 삭제할까요?')) return;
                            const ok = await removeDirectCase(d.id);
                            if (!ok) alert('클라우드에 삭제를 반영하지 못했습니다. 네트워크를 확인해 주세요.');
                          })();
                        }}
                        className="px-3 py-2 rounded-full border border-black/30 text-[10px] font-bold text-black/60 hover:bg-black/5"
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
