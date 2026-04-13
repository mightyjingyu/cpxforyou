import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CaseSpec, Message, ScoreResult, SessionData } from '@/types';

interface SessionState {
  // 현재 세션
  caseSpec: CaseSpec | null;
  timeRemaining: number;
  isTimerRunning: boolean;
  physicalExamDone: boolean;
  conversationHistory: Message[];
  memoContent: string;
  sessionStatus: 'idle' | 'loading' | 'active' | 'ended';
  sessionId: string | null;
  sessionStartTime: number | null;
  difficulty: 'easy' | 'normal' | 'hard';
  scoreResult: ScoreResult | null;

  // 아카이브
  archivedSessions: SessionData[];

  // Actions
  startSession: (caseSpec: CaseSpec, sessionId: string, difficulty: 'easy' | 'normal' | 'hard') => void;
  addMessage: (message: Message) => void;
  deductTime: (seconds: number) => void;
  tick: () => void;
  endSession: () => void;
  setMemo: (content: string) => void;
  markPhysicalExamDone: () => void;
  setSessionStatus: (status: 'idle' | 'loading' | 'active' | 'ended') => void;
  setScoreResult: (result: ScoreResult) => void;
  archiveCurrentSession: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      caseSpec: null,
      timeRemaining: 720,
      isTimerRunning: false,
      physicalExamDone: false,
      conversationHistory: [],
      memoContent: '',
      sessionStatus: 'idle',
      sessionId: null,
      sessionStartTime: null,
      difficulty: 'normal',
      scoreResult: null,
      archivedSessions: [],

      startSession: (caseSpec, sessionId, difficulty) => set({
        caseSpec,
        sessionId,
        difficulty,
        timeRemaining: 720,
        isTimerRunning: true,
        physicalExamDone: false,
        conversationHistory: [],
        memoContent: '',
        sessionStatus: 'active',
        sessionStartTime: Date.now(),
        scoreResult: null,
      }),

      addMessage: (message) => set((state) => ({
        conversationHistory: [...state.conversationHistory, message],
      })),

      deductTime: (seconds) => set((state) => ({
        timeRemaining: Math.max(0, state.timeRemaining - seconds),
      })),

      tick: () => set((state) => {
        if (!state.isTimerRunning || state.timeRemaining <= 0) return state;
        return { timeRemaining: state.timeRemaining - 1 };
      }),

      endSession: () => set({
        isTimerRunning: false,
        sessionStatus: 'ended',
      }),

      setMemo: (content) => set({ memoContent: content }),

      markPhysicalExamDone: () => set({ physicalExamDone: true }),

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
          elapsedSeconds: 720 - state.timeRemaining,
          scoreResult: state.scoreResult || undefined,
          physicalExamDone: state.physicalExamDone,
        };

        set((s) => ({
          archivedSessions: [
            sessionData,
            ...s.archivedSessions.filter((archived) => archived.id !== sessionData.id),
          ].slice(0, 50),
        }));
      },

      reset: () => set({
        caseSpec: null,
        timeRemaining: 720,
        isTimerRunning: false,
        physicalExamDone: false,
        conversationHistory: [],
        memoContent: '',
        sessionStatus: 'idle',
        sessionId: null,
        sessionStartTime: null,
        scoreResult: null,
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
