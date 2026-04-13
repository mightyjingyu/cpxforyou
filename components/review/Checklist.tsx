'use client';

import { ChecklistResult } from '@/types';

interface Props {
  results: ChecklistResult[];
}

export default function Checklist({ results }: Props) {
  const grouped: Record<string, ChecklistResult[]> = {};
  results.forEach((r) => {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  });

  const doneCount = results.filter((r) => r.done).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-black uppercase tracking-widest">체크리스트</h2>
        <span className="text-xs font-mono text-neutral-500">
          {doneCount}/{results.length}
        </span>
      </div>

      {/* 진행률 바 */}
      <div className="w-full h-1.5 bg-neutral-100 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-black rounded-full transition-all duration-500"
          style={{ width: `${(doneCount / results.length) * 100}%` }}
        />
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-5">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2.5">
            {category}
          </h3>
          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={item.item}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl text-sm ${
                  item.done ? 'bg-white' : 'bg-neutral-50'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                    item.done
                      ? 'bg-black text-white'
                      : 'border-2 border-neutral-300 text-neutral-300'
                  }`}
                >
                  {item.done ? '✓' : '○'}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`${item.done ? 'text-black' : 'text-neutral-400'}`}>
                    {item.item}
                  </span>
                  {item.done && item.evidence && (
                    <p className="text-xs text-neutral-400 mt-0.5 truncate">
                      "{item.evidence}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
