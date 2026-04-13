'use client';

import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/store/sessionStore';

interface Props {
  onTimeUp: () => void;
}

export default function Timer({ onTimeUp }: Props) {
  const { timeRemaining, isTimerRunning, tick, sessionStatus } = useSessionStore();
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    if (!isTimerRunning || sessionStatus !== 'active') return;

    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, sessionStatus, tick]);

  useEffect(() => {
    if (timeRemaining <= 0 && sessionStatus === 'active') {
      onTimeUpRef.current();
    }
  }, [timeRemaining, sessionStatus]);

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const isUrgent = timeRemaining <= 180;
  const isWarning = timeRemaining <= 300 && timeRemaining > 180;

  return (
    <div
      className={`font-mono text-lg font-bold tabular-nums tracking-tight ${
        isUrgent
          ? 'text-red-500 timer-urgent'
          : isWarning
          ? 'text-orange-400'
          : 'text-black'
      }`}
    >
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </div>
  );
}
