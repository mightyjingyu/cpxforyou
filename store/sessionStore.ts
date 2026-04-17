import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SessionIndexRetryItem } from '@/types/firebase';
import {
  CaseSpec,
  Message,
  ScoreResult,
  SessionData,
  SessionPhaseDurations,
  TimerMode,
} from '@/types';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { buildSessionIndexDoc, upsertSessionIndex } from '@/lib/firebase/sessionIndex';

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
  sessionPhase: 'history' | 'physical' | 'education' | 'completed';
  historyTakingElapsed: number;
  physicalExamElapsed: number;
  educationElapsed: number;
  examTimeDeductionSeconds: number;

  archivedSessions: SessionData[];
  memoTemplates: Array<{
    id: string;
    name: string;
    content: string;
    clinicalPresentation?: string;
    updatedAt: number;
  }>;
  sessionIndexSyncQueue: SessionIndexRetryItem[];

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
  applyExamTimeDeduction: (seconds: number) => void;
  tick: () => void;
  endSession: () => void;
  setMemo: (content: string) => void;
  markPhysicalExamDone: () => void;
  recordPhysicalExamStarted: () => void;
  completeHistoryTaking: () => void;
  completeEducation: () => void;
  setExamTimeDeductionSeconds: (seconds: number) => void;
  setSessionStatus: (status: 'idle' | 'loading' | 'active' | 'ended') => void;
  setScoreResult: (result: ScoreResult) => void;
  archiveCurrentSession: () => void;
  flushSessionIndexSyncQueue: () => Promise<void>;
  saveMemoTemplate: (payload: {
    name: string;
    content: string;
    clinicalPresentation?: string;
  }) => void;
  updateMemoTemplate: (
    templateId: string,
    payload: { name: string; content: string; clinicalPresentation?: string }
  ) => void;
  applyMemoTemplate: (templateId: string) => void;
  reset: () => void;
}

const DEFAULT_EXAM_DEDUCTION_SECONDS = 240;
const MIN_EXAM_DEDUCTION_SECONDS = 30;
const MAX_EXAM_DEDUCTION_SECONDS = 600;
const BASE_PERSIST_KEY = 'cpx-session-storage';

function getPersistScope(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const auth = getFirebaseAuth();
    return auth.currentUser?.uid ?? 'guest';
  } catch {
    return 'guest';
  }
}

function getScopedPersistKey(baseName: string): string {
  return `${baseName}:${getPersistScope()}`;
}

const scopedSessionStorage = createJSONStorage(() => ({
  getItem: (baseName: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(getScopedPersistKey(baseName));
  },
  setItem: (baseName: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getScopedPersistKey(baseName), value);
  },
  removeItem: (baseName: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(getScopedPersistKey(baseName));
  },
}));

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
      sessionPhase: 'history',
      historyTakingElapsed: 0,
      physicalExamElapsed: 0,
      educationElapsed: 0,
      examTimeDeductionSeconds: DEFAULT_EXAM_DEDUCTION_SECONDS,
      archivedSessions: [],
      memoTemplates: [],
      sessionIndexSyncQueue: [],

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
          sessionPhase: 'history',
          historyTakingElapsed: 0,
          physicalExamElapsed: 0,
          educationElapsed: 0,
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
          sessionPhase: 'history',
          historyTakingElapsed: 0,
          physicalExamElapsed: 0,
          educationElapsed: 0,
        }),

      addMessage: (message) =>
        set((state) => ({
          conversationHistory: [...state.conversationHistory, message],
        })),

      deductTime: (seconds) =>
        set((state) => {
          if (state.timerMode === 'countdown') {
            return { timeRemaining: Math.max(0, state.timeRemaining - seconds) };
          }
          // count-up 모드에서는 차감을 패널티 시간 가산으로 반영한다.
          return { countUpElapsed: state.countUpElapsed + seconds };
        }),

      applyExamTimeDeduction: (seconds) =>
        set((state) => {
          const safeSeconds = Math.max(0, Math.floor(seconds));
          if (safeSeconds === 0) return state;
          if (state.timerMode === 'countdown') {
            return {
              timeRemaining: Math.max(0, state.timeRemaining - safeSeconds),
              physicalExamElapsed: safeSeconds,
            };
          }
          // count-up 모드에서는 패널티 시간 가산 + 설정된 신체진찰 표시시간을 함께 반영한다.
          return {
            countUpElapsed: state.countUpElapsed + safeSeconds,
            physicalExamElapsed: safeSeconds,
          };
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
          const phaseUpdate =
            state.sessionPhase === 'history'
              ? { historyTakingElapsed: state.historyTakingElapsed + 1 }
              : state.sessionPhase === 'physical'
                ? {}
                : state.sessionPhase === 'education'
                  ? { educationElapsed: state.educationElapsed + 1 }
                  : {};

          if (state.timerMode === 'countdown') {
            if (state.timeRemaining <= 0) return state;
            return {
              timeRemaining: state.timeRemaining - 1,
              ...phaseUpdate,
            };
          }
          return {
            countUpElapsed: state.countUpElapsed + 1,
            ...phaseUpdate,
          };
        }),

      endSession: () => {
        const state = get();
        const phaseDurations: SessionPhaseDurations = {
          historyTakingSeconds: state.historyTakingElapsed,
          physicalExamSeconds: state.physicalExamElapsed,
          educationSeconds: state.educationElapsed,
        };
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
        set((state) => ({
          physicalExamDone: true,
          physicalExamEndedAt: state.physicalExamEndedAt ?? Date.now(),
          sessionPhase: state.sessionPhase === 'physical' ? 'education' : state.sessionPhase,
        })),

      recordPhysicalExamStarted: () =>
        set((state) => {
          if (state.physicalExamStartedAt != null) return state;
          return {
            physicalExamStartedAt: Date.now(),
            sessionPhase: 'physical',
          };
        }),

      completeHistoryTaking: () =>
        set((state) => {
          if (state.sessionPhase !== 'history') return state;
          return {
            sessionPhase: 'physical',
            physicalExamStartedAt: state.physicalExamStartedAt ?? Date.now(),
          };
        }),

      completeEducation: () =>
        set((state) => {
          if (state.sessionPhase !== 'education') return state;
          return { sessionPhase: 'completed', isTimerRunning: false };
        }),

      setExamTimeDeductionSeconds: (seconds) =>
        set({
          examTimeDeductionSeconds: Math.min(
            MAX_EXAM_DEDUCTION_SECONDS,
            Math.max(MIN_EXAM_DEDUCTION_SECONDS, seconds)
          ),
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

        // 로컬 저장은 항상 성공시키고, Firebase 메타 업로드는 분리해 실패 시 큐에 적재한다.
        const runMetaSync = async () => {
          try {
            const auth = getFirebaseAuth();
            const user = auth.currentUser;
            if (!user) return;
            const payload = buildSessionIndexDoc(sessionData, user.uid);
            await upsertSessionIndex(user.uid, payload);
          } catch (error) {
            console.error('Failed to sync session index:', error);
            try {
              const auth = getFirebaseAuth();
              const user = auth.currentUser;
              if (!user) return;
              const payload = buildSessionIndexDoc(sessionData, user.uid);
              set((s) => ({
                sessionIndexSyncQueue: [
                  ...s.sessionIndexSyncQueue.filter((q) => q.sessionId !== sessionData.id),
                  {
                    sessionId: sessionData.id,
                    userId: user.uid,
                    enqueuedAt: Date.now(),
                    payload,
                  },
                ].slice(-100),
              }));
            } catch {
              // Firebase 설정 미완료 상태에서도 로컬 아카이브를 유지한다.
            }
          }
        };
        void runMetaSync();
      },

      flushSessionIndexSyncQueue: async () => {
        const queue = get().sessionIndexSyncQueue;
        if (queue.length === 0) return;
        for (const item of queue) {
          try {
            await upsertSessionIndex(item.userId, item.payload);
            set((s) => ({
              sessionIndexSyncQueue: s.sessionIndexSyncQueue.filter((q) => q.sessionId !== item.sessionId),
            }));
          } catch (e) {
            console.error('Failed to flush session index queue item:', e);
            break;
          }
        }
      },

      saveMemoTemplate: ({ name, content, clinicalPresentation }) =>
        set((state) => {
          const trimmedName = name.trim();
          const trimmedContent = content.trim();
          if (!trimmedName || !trimmedContent) return state;
          const normalizedClinical =
            !clinicalPresentation || clinicalPresentation === '전체 보기'
              ? undefined
              : clinicalPresentation;
          const now = Date.now();
          const nextTemplate = {
            id: crypto.randomUUID(),
            name: trimmedName,
            content: trimmedContent,
            clinicalPresentation: normalizedClinical,
            updatedAt: now,
          };
          return {
            memoTemplates: [nextTemplate, ...state.memoTemplates].slice(0, 100),
          };
        }),

      updateMemoTemplate: (templateId, { name, content, clinicalPresentation }) =>
        set((state) => {
          const trimmedName = name.trim();
          const trimmedContent = content.trim();
          if (!trimmedName || !trimmedContent) return state;
          const normalizedClinical =
            !clinicalPresentation || clinicalPresentation === '전체 보기'
              ? undefined
              : clinicalPresentation;
          return {
            memoTemplates: state.memoTemplates.map((tpl) =>
              tpl.id === templateId
                ? {
                    ...tpl,
                    name: trimmedName,
                    content: trimmedContent,
                    clinicalPresentation: normalizedClinical,
                    updatedAt: Date.now(),
                  }
                : tpl
            ),
          };
        }),

      applyMemoTemplate: (templateId) =>
        set((state) => {
          const picked = state.memoTemplates.find((t) => t.id === templateId);
          if (!picked) return state;
          return { memoContent: picked.content };
        }),

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
          sessionPhase: 'history',
          historyTakingElapsed: 0,
          physicalExamElapsed: 0,
          educationElapsed: 0,
        }),
    }),
    {
      name: BASE_PERSIST_KEY,
      storage: scopedSessionStorage,
      partialize: (state) => ({
        archivedSessions: state.archivedSessions,
        examTimeDeductionSeconds: state.examTimeDeductionSeconds,
        memoTemplates: state.memoTemplates,
        sessionIndexSyncQueue: state.sessionIndexSyncQueue,
      }),
    }
  )
);
