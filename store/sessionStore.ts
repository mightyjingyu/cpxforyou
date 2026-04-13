import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CaseSpec,
  Message,
  ScoreResult,
  SessionData,
  SessionPhaseDurations,
  TimerMode,
} from '@/types';

const DEFAULT_COUNTDOWN_SECONDS = 720;

interface SessionState {
  caseSpec: CaseSpec | null;
  timerMode: TimerMode;
  /** 카운트다운: 남은 초 */
  timeRemaining: number;
  /** 카운트업: 경과 초 */
  countUpElapsed: number;
  /** 세션 화면에서 [시작] 후 true */
  timerStarted: boolean;
  isTimerRunning: boolean;
  physicalExamDone: boolean;
  conversationHistory: Message[];
  memoContent: string;
  sessionStatus: 'idle' | 'loading' | 'active' | 'ended';
  sessionId: string | null;
  /** 타이머 시작 시각(리포트 시작 기준) */
  sessionStartTime: number | null;
  sessionClockStartedAt: number | null;
  physicalExamStartedAt: number | null;
  physicalExamEndedAt: number | null;
  difficulty: 'easy' | 'normal' | 'hard';
  scoreResult: ScoreResult | null;
  phaseDurations: SessionPhaseDurations | null;
  totalElapsedSeconds: number;

  archivedSessions: SessionData[];

  startSession: (
    caseSpec: CaseSpec,
    sessionId: string,
    difficulty: 'easy' | 'normal' | 'hard',
    timerMode?: TimerMode
  ) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  addMessage: (message: Message) => void;
  deductTime: (seconds: number) => void;
  tick: () => void;
  endSession: () => void;
  setMemo: (content: string) => void;
  markPhysicalExamDone: () => void;
  recordPhysicalExamStarted: () => void;
  setSessionStatus: (status: 'idle' | 'loading' | 'active' | 'ended') => void;
  setScoreResult: (result: ScoreResult) => void;
  archiveCurrentSession: () => void;
  reset: () => void;
}

function computePhaseDurations(
  sessionClockStartedAt: number | null,
  physicalExamStartedAt: number | null,
  physicalExamEndedAt: number | null,
  endTime: number
): SessionPhaseDurations {
  let historyTakingSeconds = 0;
  let physicalExamSeconds = 0;
  let educationSeconds = 0;

  if (!sessionClockStartedAt) {
    return { historyTakingSeconds: 0, physicalExamSeconds: 0, educationSeconds: 0 };
  }

  const t0 = sessionClockStartedAt;
  const t1 = physicalExamStartedAt;
  const t2 = physicalExamEndedAt;

  if (t1) {
    historyTakingSeconds = Math.max(0, Math.round((t1 - t0) / 1000));
    if (t2) {
      physicalExamSeconds = Math.max(0, Math.round((t2 - t1) / 1000));
      educationSeconds = Math.max(0, Math.round((endTime - t2) / 1000));
    } else {
      physicalExamSeconds = Math.max(0, Math.round((endTime - t1) / 1000));
    }
  } else {
    historyTakingSeconds = Math.max(0, Math.round((endTime - t0) / 1000));
  }

  return { historyTakingSeconds, physicalExamSeconds, educationSeconds };
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      caseSpec: null,
      timerMode: 'countdown',
      timeRemaining: DEFAULT_COUNTDOWN_SECONDS,
      countUpElapsed: 0,
      timerStarted: false,
      isTimerRunning: false,
      physicalExamDone: false,
      conversationHistory: [],
      memoContent: '',
      sessionStatus: 'idle',
      sessionId: null,
      sessionStartTime: null,
      sessionClockStartedAt: null,
      physicalExamStartedAt: null,
      physicalExamEndedAt: null,
      difficulty: 'normal',
      scoreResult: null,
      phaseDurations: null,
      totalElapsedSeconds: 0,
      archivedSessions: [],

      startSession: (caseSpec, sessionId, difficulty, timerMode = 'countdown') =>
        set({
          caseSpec,
          sessionId,
          difficulty,
          timerMode,
          timeRemaining: DEFAULT_COUNTDOWN_SECONDS,
          countUpElapsed: 0,
          timerStarted: false,
          isTimerRunning: false,
          physicalExamDone: false,
          conversationHistory: [],
          memoContent: '',
          sessionStatus: 'active',
          sessionStartTime: null,
          sessionClockStartedAt: null,
          physicalExamStartedAt: null,
          physicalExamEndedAt: null,
          scoreResult: null,
          phaseDurations: null,
          totalElapsedSeconds: 0,
        }),

      startTimer: () =>
        set((state) => {
          if (state.sessionStatus !== 'active') return state;
          const now = Date.now();
          const first = state.sessionClockStartedAt == null;
          return {
            timerStarted: true,
            isTimerRunning: true,
            ...(first
              ? { sessionClockStartedAt: now, sessionStartTime: now }
              : {}),
          };
        }),

      pauseTimer: () => set({ isTimerRunning: false }),

      resetTimer: () =>
        set({
          timeRemaining: DEFAULT_COUNTDOWN_SECONDS,
          countUpElapsed: 0,
          timerStarted: false,
          isTimerRunning: false,
          sessionClockStartedAt: null,
          sessionStartTime: null,
          physicalExamStartedAt: null,
          physicalExamEndedAt: null,
          physicalExamDone: false,
          phaseDurations: null,
          totalElapsedSeconds: 0,
        }),

      addMessage: (message) =>
        set((state) => ({
          conversationHistory: [...state.conversationHistory, message],
        })),

      deductTime: (seconds) =>
        set((state) => {
          if (state.timerMode !== 'countdown') return state;
          return { timeRemaining: Math.max(0, state.timeRemaining - seconds) };
        }),

      tick: () =>
        set((state) => {
          if (
            !state.isTimerRunning ||
            !state.timerStarted ||
            state.sessionStatus !== 'active'
          ) {
            return state;
          }
          if (state.timerMode === 'countdown') {
            if (state.timeRemaining <= 0) return state;
            return { timeRemaining: state.timeRemaining - 1 };
          }
          return { countUpElapsed: state.countUpElapsed + 1 };
        }),

      endSession: () => {
        const state = get();
        const now = Date.now();
        const phaseDurations = computePhaseDurations(
          state.sessionClockStartedAt,
          state.physicalExamStartedAt,
          state.physicalExamEndedAt,
          now
        );
        const totalElapsed =
          state.timerMode === 'countdown'
            ? state.timerStarted
              ? DEFAULT_COUNTDOWN_SECONDS - state.timeRemaining
              : 0
            : state.countUpElapsed;

        set({
          isTimerRunning: false,
          sessionStatus: 'ended',
          phaseDurations,
          totalElapsedSeconds: totalElapsed,
        });
      },

      setMemo: (content) => set({ memoContent: content }),

      markPhysicalExamDone: () =>
        set({
          physicalExamDone: true,
          physicalExamEndedAt: Date.now(),
        }),

      recordPhysicalExamStarted: () =>
        set((state) => {
          if (state.physicalExamStartedAt != null) return state;
          return { physicalExamStartedAt: Date.now() };
        }),

      setSessionStatus: (status) => set({ sessionStatus: status }),

      setScoreResult: (result) => set({ scoreResult: result }),

      archiveCurrentSession: () => {
        const state = get();
        if (!state.caseSpec || !state.sessionId) return;

        const sessionData: SessionData = {
          id: state.sessionId,
          caseSpec: state.caseSpec,
          conversationHistory: state.conversationHistory,
          memoContent: state.memoContent,
          startTime: state.sessionStartTime || Date.now(),
          endTime: Date.now(),
          elapsedSeconds: state.totalElapsedSeconds,
          scoreResult: state.scoreResult || undefined,
          physicalExamDone: state.physicalExamDone,
          timerMode: state.timerMode,
          phaseDurations: state.phaseDurations || undefined,
        };

        set((s) => ({
          archivedSessions: [
            sessionData,
            ...s.archivedSessions.filter((archived) => archived.id !== sessionData.id),
          ].slice(0, 50),
        }));
      },

      reset: () =>
        set({
          caseSpec: null,
          timerMode: 'countdown',
          timeRemaining: DEFAULT_COUNTDOWN_SECONDS,
          countUpElapsed: 0,
          timerStarted: false,
          isTimerRunning: false,
          physicalExamDone: false,
          conversationHistory: [],
          memoContent: '',
          sessionStatus: 'idle',
          sessionId: null,
          sessionStartTime: null,
          sessionClockStartedAt: null,
          physicalExamStartedAt: null,
          physicalExamEndedAt: null,
          scoreResult: null,
          phaseDurations: null,
          totalElapsedSeconds: 0,
        }),
    }),
    {
      name: 'cpx-session-storage',
      partialize: (state) => ({
        archivedSessions: state.archivedSessions,
      }),
    }
  )
);
