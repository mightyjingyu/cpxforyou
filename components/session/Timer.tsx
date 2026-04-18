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
    sessionPhase,
    historyTakingElapsed,
    physicalExamElapsed,
    educationElapsed,
    tick,
    startTimer,
    pauseTimer,
    resetTimer,
  } = useSessionStore();

  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (
      !isTimerRunning ||
      sessionStatus !== 'active' ||
      !timerStarted ||
      sessionPhase === 'physical'
    ) {
      return;
    }

    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, sessionStatus, timerStarted, sessionPhase, tick]);

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
  const format = (secondsValue: number) => {
    const mm = Math.floor(secondsValue / 60);
    const ss = secondsValue % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
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

      <div className="hidden lg:flex items-center gap-3 text-[10px] font-bold tracking-wider uppercase">
        <span className="text-black/40">병력청취 {format(historyTakingElapsed)}</span>
        <span className="text-black/30">|</span>
        <span className="text-black/40">신체진찰 {format(physicalExamElapsed)}</span>
        <span className="text-black/30">|</span>
        <span className="text-black/40">환자교육 {format(educationElapsed)}</span>
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
        ) : sessionPhase === 'physical' ? (
          <>
            <span className="px-3 py-1.5 rounded-full border border-black/30 bg-black/5 text-black/70 text-[10px] sm:text-xs font-bold tracking-wider">
              신체진찰 중 · 메인 타이머 정지
            </span>
            <button
              type="button"
              onClick={resetTimer}
              className="px-3 py-1.5 rounded-full border border-black/30 text-black/70 text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:border-black hover:text-black transition-colors"
            >
              리셋
            </button>
          </>
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
