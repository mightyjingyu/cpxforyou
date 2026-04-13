'use client';

import { useSessionStore } from '@/store/sessionStore';

export default function MemoPanel() {
  const { memoContent, setMemo } = useSessionStore();

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-black">
        <span className="text-xs font-black text-black uppercase tracking-widest">Memo</span>
        <span className="text-[10px] font-bold text-black/40 uppercase tracking-widest">(진료 중 자유롭게 작성)</span>
      </div>
      <textarea
        value={memoContent}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="증상, 감별진단, 신체진찰 항목, 메모 등 자유롭게 입력..."
        className="flex-1 w-full resize-none bg-transparent text-sm text-black placeholder:text-black/30 outline-none transition-colors leading-loose font-mono selection:bg-black selection:text-white"
        spellCheck={false}
      />
    </div>
  );
}
