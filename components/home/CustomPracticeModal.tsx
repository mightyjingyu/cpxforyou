'use client';

import { useState } from 'react';
import { CLINICAL_CATEGORIES, CLINICAL_PRESENTATIONS } from '@/lib/ai/personaTemplate';
import { Difficulty, Friendliness } from '@/types';

interface Props {
  onClose: () => void;
  onStart: (options: {
    mode: 'full_random' | 'category_random' | 'clinical_pick';
    category?: string;
    clinical_presentation?: string;
    difficulty?: Difficulty;
    friendliness?: Friendliness;
  }) => void;
  loading: boolean;
}

export default function CustomPracticeModal({ onClose, onStart, loading }: Props) {
  const [mode, setMode] = useState<'full_random' | 'category_random' | 'clinical_pick'>('full_random');
  const [category, setCategory] = useState<string>(Object.keys(CLINICAL_CATEGORIES)[0] || '');
  const [presentation, setPresentation] = useState(CLINICAL_PRESENTATIONS[0] || '');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [friendliness, setFriendliness] = useState<Friendliness>('normal');

  const handleStart = () => {
    if (mode === 'full_random') {
      onStart({ mode });
      return;
    }
    if (mode === 'category_random') {
      onStart({ mode, category, difficulty, friendliness });
      return;
    }
    onStart({ mode, clinical_presentation: presentation, difficulty, friendliness });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">연습하기</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-colors text-neutral-400"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* 모드 선택 */}
          <div>
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-widest block mb-3">모드</label>
            <div className="space-y-2">
              {[
                { id: 'full_random', label: '1. 완전 랜덤', desc: '난이도/친절도/임상을 모두 무작위' },
                { id: 'category_random', label: '2. 카테고리 중 랜덤', desc: '카테고리 선택 후 그 안에서 랜덤' },
                { id: 'clinical_pick', label: '3. 임상 선택', desc: '원하는 임상을 직접 선택' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id as typeof mode)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    mode === m.id
                      ? 'border-black bg-black text-white'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <p className="text-sm font-semibold">{m.label}</p>
                  <p className={`text-xs mt-0.5 ${mode === m.id ? 'text-white/70' : 'text-neutral-400'}`}>{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {mode !== 'full_random' && (
            <>
          {/* 난이도 */}
          <div>
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-widest block mb-3">난이도</label>
            <div className="grid grid-cols-3 gap-2">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                    difficulty === d
                      ? 'bg-black text-white'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                  }`}
                >
                  {d === 'easy' ? '쉬움' : d === 'normal' ? '보통' : '어려움'}
                </button>
              ))}
            </div>
          </div>
            </>
          )}

          {mode !== 'full_random' && (
            <div>
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-widest block mb-3">환자 친절도</label>
              <div className="grid grid-cols-3 gap-2">
                {(['cooperative', 'normal', 'uncooperative'] as Friendliness[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFriendliness(f)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                      friendliness === f
                        ? 'bg-black text-white'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                    }`}
                  >
                    {f === 'cooperative' ? '협조적' : f === 'normal' ? '보통' : '비협조적'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'category_random' && (
            <div>
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-widest block mb-3">카테고리</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:border-black transition-colors appearance-none cursor-pointer"
              >
                {Object.keys(CLINICAL_CATEGORIES).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'clinical_pick' && (
            <div>
              <label className="text-xs font-medium text-neutral-400 uppercase tracking-widest block mb-3">임상표현</label>
              <select
                value={presentation}
                onChange={(e) => setPresentation(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:border-black transition-colors appearance-none cursor-pointer"
              >
                {CLINICAL_PRESENTATIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="p-6 pt-0">
          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full py-3.5 bg-black text-white rounded-xl font-medium text-sm hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '케이스 생성 중...' : '연습 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}
