'use client';

import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/store/sessionStore';

interface Props {
  onTimeUp: () => void;
}

export default function Timer({ onTimeUp }: Props) {
  const {
    timerMode,
    timeRemaining,
    countUpElapsed,
    timerStarted,
    isTimerRunning,
    sessionStatus,
    tick,
    startTimer,
    pauseTimer,
    resetTimer,
  } = useSessionStore();

  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    if (!isTimerRunning || sessionStatus !== 'active' || !timerStarted) return;

    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, sessionStatus, timerStarted, tick]);

  const prevRemainingRef = useRef(timeRemaining);
  useEffect(() => {
    const prev = prevRemainingRef.current;
    prevRemainingRef.current = timeRemaining;
    if (timerMode !== 'countdown') return;
    if (prev > 0 && timeRemaining === 0 && sessionStatus === 'active' && timerStarted) {
      pauseTimer();
      onTimeUpRef.current();
    }
  }, [timeRemaining, sessionStatus, timerStarted, timerMode, pauseTimer]);

  const displaySeconds =
    timerMode === 'countdown' ? timeRemaining : countUpElapsed;
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const isUrgent =
    timerMode === 'countdown' && timeRemaining <= 180 && timerStarted;
  const isWarning =
    timerMode === 'countdown' &&
    timeRemaining <= 300 &&
    timeRemaining > 180 &&
    timerStarted;

  const modeLabel = timerMode === 'countdown' ? '카운트다운' : '카운트업';

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-wider text-black/40 hidden sm:inline">
          {modeLabel}
        </span>
        <div
          className={`font-mono text-base sm:text-lg font-bold tabular-nums tracking-tight ${
            isUrgent
              ? 'text-red-500 timer-urgent'
              : isWarning
                ? 'text-orange-400'
                : 'text-black'
          }`}
        >
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {!timerStarted ? (
          <button
            type="button"
            onClick={startTimer}
            className="px-3 py-1.5 rounded-full bg-black text-white text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-black/90 transition-colors"
          >
            시작
          </button>
        ) : (
          <>
            {isTimerRunning ? (
              <button
                type="button"
                onClick={pauseTimer}
                className="px-3 py-1.5 rounded-full border border-black bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
              >
                정지
              </button>
            ) : (
              <button
                type="button"
                onClick={startTimer}
                className="px-3 py-1.5 rounded-full border border-black bg-white text-black text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
              >
                재개
              </button>
            )}
            <button
              type="button"
              onClick={resetTimer}
              className="px-3 py-1.5 rounded-full border border-black/30 text-black/70 text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:border-black hover:text-black transition-colors"
            >
              리셋
            </button>
          </>
        )}
      </div>
    </div>
  );
}
