'use client';

import { useSessionStore } from '@/store/sessionStore';
import { useCallback, useMemo, useState } from 'react';

/** 한국어 키보드·IME에서 단축키 조합 시 ₩ 등이 입력되는 것 방지 */
function shouldSuppressMemoKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.metaKey || e.ctrlKey || e.altKey) {
    const k = e.key;
    if (k === '₩' || k === '\\' || k === '`' || k === 'IntlRo') {
      return true;
    }
  }
  if (e.key === '₩') {
    return true;
  }
  return false;
}

export default function MemoPanel() {
  const { memoContent, setMemo, memoTemplates, applyMemoTemplate, caseSpec } = useSessionStore();
  const [open, setOpen] = useState(false);
  const templateList = useMemo(
    () =>
      memoTemplates.filter(
        (t) =>
          !t.clinicalPresentation ||
          t.clinicalPresentation === '전체 보기' ||
          t.clinicalPresentation === caseSpec?.clinical_presentation
      ),
    [memoTemplates, caseSpec?.clinical_presentation]
  );

  const handleMemoKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSuppressMemoKey(e)) {
      e.preventDefault();
    }
  }, []);

  return (
    <div className="relative flex flex-col h-full p-6">
      <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-black">
        <div className="flex items-center gap-3">
        <span className="text-xs font-black text-black uppercase tracking-widest">Memo</span>
        <span className="text-[10px] font-bold text-black/40 uppercase tracking-widest">(진료 중 자유롭게 작성)</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 rounded-full border border-black text-[10px] font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
        >
          메모 불러오기
        </button>
      </div>
      <textarea
        value={memoContent}
        onChange={(e) => setMemo(e.target.value)}
        onKeyDown={handleMemoKeyDown}
        placeholder="증상, 감별진단, 신체진찰 항목, 메모 등 자유롭게 입력..."
        className="flex-1 w-full resize-none bg-transparent text-sm text-black placeholder:text-black/30 outline-none transition-colors leading-loose font-mono selection:bg-black selection:text-white"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      {open && (
        <div className="absolute inset-0 z-20 bg-white/90 backdrop-blur-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black tracking-widest uppercase">저장된 메모</p>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1 rounded-full border border-black text-[10px] font-bold"
            >
              닫기
            </button>
          </div>
          <div className="flex-1 overflow-auto space-y-2">
            {templateList.length === 0 && (
              <p className="text-xs text-black/50">저장된 메모가 없습니다.</p>
            )}
            {templateList.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  applyMemoTemplate(t.id);
                  setOpen(false);
                }}
                className="w-full text-left rounded-xl border border-black p-3 hover:bg-black hover:text-white transition-colors"
              >
                <p className="text-xs font-black">{t.name}</p>
                <p className="text-[11px] opacity-70 line-clamp-2 mt-1">{t.content}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
