'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useSessionStore } from '@/store/sessionStore';
import { CLINICAL_CATEGORIES, CLINICAL_PRESENTATIONS } from '@/lib/ai/personaTemplate';
import { CaseSpec, Difficulty, Friendliness } from '@/types';

type PracticeMode = 'full_random' | 'category_random' | 'clinical_pick';

export default function PracticePage() {
  const router = useRouter();
  const { startSession } = useSessionStore();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<PracticeMode>('full_random');
  const [category, setCategory] = useState<string>(Object.keys(CLINICAL_CATEGORIES)[0] || '');
  const [presentation, setPresentation] = useState<string>(CLINICAL_PRESENTATIONS[0] || '');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [friendliness, setFriendliness] = useState<Friendliness>('normal');

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
      const data = await res.json();
      const caseSpec: CaseSpec = data.caseSpec;
      const sessionId = uuidv4();

      const reg = await fetch('/api/session/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, caseSpec, difficulty: selectedDifficulty }),
      });
      if (!reg.ok) {
        const err = await reg.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || '서버 세션 등록 실패');
      }

      startSession(caseSpec, sessionId, selectedDifficulty);
      router.push(`/session/${sessionId}`);
    } catch (error) {
      console.error('Failed to start session:', error);
      alert('케이스 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const categoryPool = category ? CLINICAL_CATEGORIES[category] || [] : [];

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
          <section className="grid md:grid-cols-3 gap-4">
            {[
              { key: 'full_random', title: '완전 랜덤', desc: '임상 + 난이도 모두 랜덤' },
              { key: 'category_random', title: '카테고리 랜덤', desc: '카테고리 안에서 임상 랜덤' },
              { key: 'clinical_pick', title: '임상 선택', desc: '원하는 임상을 직접 선택' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setMode(item.key as PracticeMode)}
                className={`text-left rounded-3xl border transition-all duration-300 p-6 flex flex-col justify-center
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
        </div>
      </div>
    </main>
  );
}
