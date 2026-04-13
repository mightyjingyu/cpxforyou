'use client';

import { useState } from 'react';
import { Message, PoorQuestion, CriticalOmission } from '@/types';

interface Props {
  messages: Message[];
  poorQuestions: PoorQuestion[];
  criticalOmissions: CriticalOmission[];
}

export default function ConversationLog({ messages, poorQuestions, criticalOmissions }: Props) {
  const [activePopup, setActivePopup] = useState<{ text: string; x: number; y: number } | null>(null);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const getHighlightClass = (msg: Message) => {
    const quote = msg.content;
    const isPoor = poorQuestions.some((q) => quote.includes(q.quote?.substring(0, 10) || ''));
    if (isPoor) return 'highlight-critical';
    if (msg.highlightType === 'warning') return 'highlight-warning';
    if (msg.highlightType === 'info') return 'highlight-info';
    return '';
  };

  const getFeedback = (msg: Message) => {
    const poorQ = poorQuestions.find((q) => msg.content.includes(q.quote?.substring(0, 10) || ''));
    return poorQ?.feedback || msg.feedback || null;
  };

  const handleClick = (msg: Message, e: React.MouseEvent) => {
    const feedback = getFeedback(msg);
    if (!feedback) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setActivePopup({ text: feedback, x: rect.left, y: rect.bottom + window.scrollY + 8 });
  };

  return (
    <div className="relative">
      <h2 className="text-sm font-bold text-black uppercase tracking-widest mb-4">대화 로그</h2>

      <div className="space-y-3">
        {messages.map((msg) => {
          const highlightClass = getHighlightClass(msg);
          const hasFeedback = !!getFeedback(msg);

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'patient' ? 'flex-row-reverse' : ''}`}
            >
              {/* 시간 */}
              <span className="text-xs text-neutral-300 font-mono self-start mt-1 shrink-0 w-10 text-right">
                {formatTime(msg.timestamp)}
              </span>

              {/* 역할 아이콘 */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold ${
                msg.role === 'user' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-500'
              }`}>
                {msg.role === 'user' ? '의' : '환'}
              </div>

              {/* 메시지 */}
              <div
                className={`flex-1 text-sm leading-relaxed rounded-xl px-3 py-2 cursor-pointer ${
                  msg.role === 'user'
                    ? 'bg-neutral-50 text-black'
                    : 'bg-white text-neutral-700 border border-neutral-100'
                } ${highlightClass}`}
                onClick={(e) => handleClick(msg, e)}
                title={hasFeedback ? '클릭하여 피드백 보기' : undefined}
              >
                {msg.content}
                {hasFeedback && (
                  <span className="ml-2 text-xs text-red-400">⚠</span>
                )}
                {hasFeedback && (
                  <p className="mt-2 text-xs text-red-500 leading-relaxed">
                    {getFeedback(msg)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 피드백 팝업 */}
      {activePopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setActivePopup(null)} />
          <div
            className="fixed z-50 bg-black text-white text-xs rounded-xl shadow-2xl p-4 max-w-xs"
            style={{ left: Math.min(activePopup.x, window.innerWidth - 280), top: activePopup.y }}
          >
            <p className="leading-relaxed">{activePopup.text}</p>
            <button
              className="mt-2 text-neutral-400 hover:text-white"
              onClick={() => setActivePopup(null)}
            >
              닫기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
