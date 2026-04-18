'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { useSessionStore } from '@/store/sessionStore';
import { CLINICAL_CATEGORIES, CLINICAL_PRESENTATIONS } from '@/lib/ai/personaTemplate';
import type { DirectCaseFormPayload, DirectCaseScope } from '@/types/directCase';
import type { CaseSpec, Difficulty, Friendliness, TimerMode } from '@/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { HISTORY_BLOCK_SEMANTICS, HISTORY_KEYS } from '@/lib/ai/historyBlockSemantics';

export default function DirectModePage() {
  const router = useRouter();
  const { user, authLoading } = useAuth();
  const { startSession, saveDirectCase } = useSessionStore();

  const [title, setTitle] = useState('');
  const [systemCategory, setSystemCategory] = useState(Object.keys(CLINICAL_CATEGORIES)[0] || '');
  const [chiefComplaint, setChiefComplaint] = useState(CLINICAL_PRESENTATIONS[0] || '');
  /** 비어 있으면 위 드롭다운 값 사용 */
  const [chiefComplaintCustom, setChiefComplaintCustom] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('32');
  const [patientGender, setPatientGender] = useState<'남' | '여'>('남');
  const [chiefComplaintText, setChiefComplaintText] = useState('');
  const [scope, setScope] = useState<DirectCaseScope>({
    history: true,
    physical: false,
    diagnosisPlan: false,
  });
  const [historyBlocks, setHistoryBlocks] = useState<Record<string, string>>({});
  const [vitals, setVitals] = useState({ bp: '', hr: '', rr: '', temp: '' });
  const [physicalExtra, setPhysicalExtra] = useState('');
  const [dx1, setDx1] = useState('');
  const [dx2, setDx2] = useState('');
  const [dx3, setDx3] = useState('');
  const [specialQuestion, setSpecialQuestion] = useState('');
  const [specialOther, setSpecialOther] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [friendliness, setFriendliness] = useState<Friendliness>('normal');
  const [timerMode, setTimerMode] = useState<TimerMode>('countdown');
  const [interactionMode, setInteractionMode] = useState<'voice' | 'text'>('voice');
  const [loading, setLoading] = useState(false);

  const setHistoryField = useCallback((key: string, value: string) => {
    setHistoryBlocks((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resolvedChiefComplaint = chiefComplaintCustom.trim() || chiefComplaint;

  const buildPayload = useCallback((): DirectCaseFormPayload => {
    const age = Math.max(1, Math.min(120, parseInt(patientAge, 10) || 30));
    const payload: DirectCaseFormPayload = {
      systemCategory,
      chiefComplaint: resolvedChiefComplaint,
      patientName: patientName.trim() || '환자',
      patientAge: age,
      patientGender,
      chiefComplaintText: chiefComplaintText.trim() || resolvedChiefComplaint,
      scope,
      historyBlocks: scope.history ? { ...historyBlocks } : {},
      difficulty,
      friendliness,
      specialQuestion: specialQuestion.trim() || undefined,
      specialOther: specialOther.trim() || undefined,
    };
    if (scope.physical) {
      payload.vitals = {
        bp: vitals.bp.trim(),
        hr: vitals.hr.trim(),
        rr: vitals.rr.trim(),
        temp: vitals.temp.trim(),
      };
      const lines = physicalExtra
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length) payload.physicalExtraLines = lines;
    }
    if (scope.diagnosisPlan && dx1.trim() && dx2.trim() && dx3.trim()) {
      payload.diagnosisRanked = [dx1.trim(), dx2.trim(), dx3.trim()];
    }
    return payload;
  }, [
    systemCategory,
    resolvedChiefComplaint,
    patientName,
    patientAge,
    patientGender,
    chiefComplaintText,
    scope,
    historyBlocks,
    difficulty,
    friendliness,
    specialQuestion,
    specialOther,
    vitals,
    physicalExtra,
    dx1,
    dx2,
    dx3,
  ]);

  const runComplete = useCallback(async (): Promise<CaseSpec> => {
    const res = await fetch('/api/case/direct-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || '케이스 완성 실패');
    }
    const data = (await res.json()) as { caseSpec: CaseSpec };
    return data.caseSpec;
  }, [buildPayload]);

  const handleSaveOnly = async () => {
    setLoading(true);
    try {
      const caseSpec = await runComplete();
      await saveDirectCase({
        title: title.trim() || caseSpec.chief_complaint_display || caseSpec.clinical_presentation,
        systemCategory,
        chiefComplaint: resolvedChiefComplaint,
        caseSpec,
      });
      alert('저장했습니다. Practice에서 직접 모드로 불러올 수 있습니다.');
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndStart = async () => {
    setLoading(true);
    try {
      const caseSpec = await runComplete();
      const sessionId = uuidv4();
      const reg = await fetch('/api/session/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, caseSpec, difficulty, friendliness }),
      });
      if (!reg.ok) {
        const err = await reg.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || '세션 등록 실패');
      }
      startSession(caseSpec, sessionId, difficulty, timerMode);
      router.push(interactionMode === 'voice' ? `/session/${sessionId}` : `/session-message/${sessionId}`);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '시작 실패');
    } finally {
      setLoading(false);
    }
  };

  const systemKeys = useMemo(() => Object.keys(CLINICAL_CATEGORIES), []);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, user, router]);

  if (!authLoading && !user) return null;

  return (
    <main className="min-h-screen bg-white relative flex flex-col font-sans selection:bg-black selection:text-white">
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div className="fixed top-10 right-[15%] w-96 h-96 rounded-full bg-neutral-200 blur-[100px] opacity-70 pointer-events-none z-0" />

      <div className="relative z-10 flex-1 flex flex-col h-full border-x border-black max-w-4xl mx-auto w-full bg-transparent">
        <header className="border-b border-black bg-white/70 backdrop-blur-xl px-6 py-4 sticky top-0 z-50">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => router.push('/practice')}
              className="text-xs font-bold uppercase tracking-wider text-black/60 hover:text-black"
            >
              ← Practice
            </button>
            <h1 className="text-xs font-black tracking-widest uppercase">직접 모드</h1>
            <div className="w-16" />
          </div>
        </header>

        <div className="flex-1 p-6 space-y-8 pb-24 overflow-y-auto">
          <p className="text-sm text-black/70 leading-relaxed">
            체크한 항목만 표에 직접 입력하고, 체크하지 않은 항목은 AI가 같은 맥락으로 채웁니다. 완성 후 저장하거나 바로 시험을 시작할 수 있습니다.
          </p>

          <section className="rounded-2xl border border-black p-5 space-y-4 bg-white/50">
            <h2 className="text-xs font-black uppercase tracking-widest">증례 제목 · 분류</h2>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="저장 시 목록에 표시될 제목"
              className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-black/50 uppercase">계통</label>
                <select
                  value={systemCategory}
                  onChange={(e) => setSystemCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm bg-white"
                >
                  {systemKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-black/50 uppercase">C.C. (임상표현)</label>
                <select
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm bg-white"
                >
                  {CLINICAL_PRESENTATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  value={chiefComplaintCustom}
                  onChange={(e) => setChiefComplaintCustom(e.target.value)}
                  placeholder="C.C. 직접 입력 (입력 시 목록보다 우선)"
                  className="mt-2 w-full rounded-xl border border-black/40 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-black p-5 space-y-4 bg-white/50">
            <h2 className="text-xs font-black uppercase tracking-widest">상황지침</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="이름"
                className="rounded-xl border border-black px-3 py-2 text-sm"
              />
              <input
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
                placeholder="나이"
                className="rounded-xl border border-black px-3 py-2 text-sm"
              />
              <div className="flex gap-4 items-center px-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={patientGender === '남'}
                    onChange={() => setPatientGender('남')}
                  />
                  남
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={patientGender === '여'}
                    onChange={() => setPatientGender('여')}
                  />
                  여
                </label>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-black/50">주호소</label>
              <textarea
                value={chiefComplaintText}
                onChange={(e) => setChiefComplaintText(e.target.value)}
                rows={2}
                placeholder="환자가 내원한 이유 (시작 화면에 표시)"
                className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none resize-y"
              />
            </div>
            <div className="flex flex-wrap gap-4 pt-2 border-t border-black/10">
              <span className="text-[10px] font-bold text-black/50 w-full">지침 (직접 입력할 블록)</span>
              {(
                [
                  ['history', '병력청취'],
                  ['physical', '신체진찰·활력'],
                  ['diagnosisPlan', '추정진단·진단계획'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scope[key]}
                    onChange={(e) => setScope((s) => ({ ...s, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {scope.diagnosisPlan && (
            <section className="rounded-2xl border border-black p-5 space-y-3 bg-white/50">
              <h2 className="text-xs font-black uppercase tracking-widest">예상 진단 1~3순위</h2>
              <div className="grid gap-2">
                <input value={dx1} onChange={(e) => setDx1(e.target.value)} placeholder="1순위" className="rounded-xl border border-black px-3 py-2 text-sm" />
                <input value={dx2} onChange={(e) => setDx2(e.target.value)} placeholder="2순위" className="rounded-xl border border-black px-3 py-2 text-sm" />
                <input value={dx3} onChange={(e) => setDx3(e.target.value)} placeholder="3순위" className="rounded-xl border border-black px-3 py-2 text-sm" />
              </div>
            </section>
          )}

          {scope.history && (
            <section className="rounded-2xl border border-black p-5 space-y-3 bg-white/50">
              <h2 className="text-xs font-black uppercase tracking-widest">병력청취 (OLD COEX 등)</h2>
              <p className="text-xs text-black/50">
                O~Ex는 OLD COEX, C~E는 Character·동반·요인·이전 검진, 이하 약·사·가·외·과·여는 배경 병력입니다. 문진 순서와 무관한 상황 메모이며, 빈 칸은 AI가 맥락에 맞게 보강할 수 있습니다.
              </p>
              <div className="grid gap-3">
                {HISTORY_KEYS.map((key) => {
                  const sem = HISTORY_BLOCK_SEMANTICS[key];
                  return (
                    <div key={key}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                        <span className="text-[10px] font-bold text-black/50">[{key}]</span>
                        <span className="text-[10px] font-mono text-black/35">{sem.en}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/5 text-black/45">
                          {sem.mnemonic}
                        </span>
                      </div>
                      <p className="text-[10px] text-black/40 mt-0.5 leading-snug">{sem.ko}</p>
                      <input
                        value={historyBlocks[key] ?? ''}
                        onChange={(e) => setHistoryField(key, e.target.value)}
                        className="mt-1 w-full rounded-xl border border-black/30 px-3 py-2 text-sm"
                        aria-label={`${key} ${sem.en}`}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {scope.physical && (
            <section className="rounded-2xl border border-black p-5 space-y-3 bg-white/50">
              <h2 className="text-xs font-black uppercase tracking-widest">신체진찰 · 활력</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['bp', '혈압 (예: 120/80)'],
                  ['hr', '맥박'],
                  ['rr', '호흡'],
                  ['temp', '체온'],
                ].map(([k, ph]) => (
                  <div key={k}>
                    <label className="text-[10px] text-black/50">{ph}</label>
                    <input
                      value={vitals[k as keyof typeof vitals]}
                      onChange={(e) => setVitals((v) => ({ ...v, [k]: e.target.value }))}
                      className="mt-0.5 w-full rounded-xl border border-black px-2 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
              <textarea
                value={physicalExtra}
                onChange={(e) => setPhysicalExtra(e.target.value)}
                rows={3}
                placeholder="추가 신체진찰 소견 (줄바꿈으로 구분)"
                className="w-full rounded-xl border border-black px-3 py-2 text-sm resize-y"
              />
            </section>
          )}

          <section className="rounded-2xl border border-black p-5 space-y-3 bg-white/50">
            <h2 className="text-xs font-black uppercase tracking-widest">특이사항</h2>
            <input
              value={specialQuestion}
              onChange={(e) => setSpecialQuestion(e.target.value)}
              placeholder="질문"
              className="w-full rounded-xl border border-black px-3 py-2 text-sm"
            />
            <textarea
              value={specialOther}
              onChange={(e) => setSpecialOther(e.target.value)}
              rows={2}
              placeholder="기타"
              className="w-full rounded-xl border border-black px-3 py-2 text-sm resize-y"
            />
          </section>

          <section className="rounded-2xl border border-black p-5 space-y-4 bg-white/50">
            <h2 className="text-xs font-black uppercase tracking-widest">시험 옵션</h2>
            <div className="grid grid-cols-3 gap-2">
              {(['easy', 'normal', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`rounded-xl py-2 text-xs font-bold border ${
                    difficulty === d ? 'bg-black text-white border-black' : 'border-black/20'
                  }`}
                >
                  {d === 'easy' ? '쉬움' : d === 'normal' ? '보통' : '어려움'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['cooperative', 'normal', 'uncooperative'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFriendliness(f)}
                  className={`rounded-xl py-2 text-xs font-bold border ${
                    friendliness === f ? 'bg-black text-white border-black' : 'border-black/20'
                  }`}
                >
                  {f === 'cooperative' ? '협조' : f === 'normal' ? '보통' : '비협조'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInteractionMode('voice')}
                className={`rounded-xl py-2 text-xs font-bold border ${
                  interactionMode === 'voice' ? 'bg-black text-white' : 'border-black/20'
                }`}
              >
                음성
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode('text')}
                className={`rounded-xl py-2 text-xs font-bold border ${
                  interactionMode === 'text' ? 'bg-black text-white' : 'border-black/20'
                }`}
              >
                메시지
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTimerMode('countdown')}
                className={`rounded-xl py-2 text-xs font-bold border ${
                  timerMode === 'countdown' ? 'bg-black text-white' : 'border-black/20'
                }`}
              >
                카운트다운
              </button>
              <button
                type="button"
                onClick={() => setTimerMode('countup')}
                className={`rounded-xl py-2 text-xs font-bold border ${
                  timerMode === 'countup' ? 'bg-black text-white' : 'border-black/20'
                }`}
              >
                카운트업
              </button>
            </div>
          </section>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleSaveOnly()}
              className="flex-1 py-4 rounded-2xl border border-black text-sm font-bold hover:bg-black/5 disabled:opacity-50"
            >
              {loading ? '처리 중…' : '케이스 완성 후 저장만'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleSaveAndStart()}
              className="flex-1 py-4 rounded-2xl bg-black text-white text-sm font-bold disabled:opacity-50"
            >
              {loading ? '처리 중…' : '완성 후 바로 시험'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
