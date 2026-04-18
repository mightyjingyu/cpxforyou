import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CloudSessionRetryItem } from '@/types/firebase';
import {
  CaseSpec,
  Message,
  ScoreResult,
  SessionData,
  SessionPhaseDurations,
  TimerMode,
} from '@/types';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { saveUserSession, listUserSessions } from '@/lib/firebase/userSessions';
import { loadUserSettings, saveUserSettings } from '@/lib/firebase/userSettingsDoc';

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
  cloudSessionSyncQueue: CloudSessionRetryItem[];

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
  flushCloudSessionSyncQueue: () => Promise<void>;
  loadUserDataFromCloud: (uid: string) => Promise<void>;
  syncUserSettingsToCloud: () => Promise<void>;
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
  /** 로그인 uid 전환 시 활성 세션 필드만 비움(아카이브는 loadUserDataFromCloud에서 채움) */
  clearVolatileForAccountSwitch: () => void;
}

const DEFAULT_EXAM_DEDUCTION_SECONDS = 240;
const MIN_EXAM_DEDUCTION_SECONDS = 30;
const MAX_EXAM_DEDUCTION_SECONDS = 600;
/** v2: Firestore 전체 동기화 도입 — 이전 로컬 키와 분리 */
const BASE_PERSIST_KEY = 'cpx-session-storage-v2';

/** AuthProvider에서 동일 uid로 syncSessionWithAuthScope가 반복 호출되지 않게 함 */
let lastSyncedAuthScope: string | null | undefined = undefined;

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
      cloudSessionSyncQueue: [],

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

      setExamTimeDeductionSeconds: (seconds) => {
        set({
          examTimeDeductionSeconds: Math.min(
            MAX_EXAM_DEDUCTION_SECONDS,
            Math.max(MIN_EXAM_DEDUCTION_SECONDS, seconds)
          ),
        });
        void get().syncUserSettingsToCloud();
      },

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

        const runCloudSync = async () => {
          try {
            const auth = getFirebaseAuth();
            const user = auth.currentUser;
            if (!user) return;
            await saveUserSession(user.uid, sessionData);
          } catch (error) {
            console.error('Failed to save session to Firestore:', error);
            try {
              const auth = getFirebaseAuth();
              const user = auth.currentUser;
              if (!user) return;
              set((s) => ({
                cloudSessionSyncQueue: [
                  ...s.cloudSessionSyncQueue.filter((q) => q.sessionId !== sessionData.id),
                  {
                    sessionId: sessionData.id,
                    userId: user.uid,
                    enqueuedAt: Date.now(),
                    session: sessionData,
                  },
                ].slice(-100),
              }));
            } catch {
              // Firebase 미설정 시 로컬 아카이브만 유지
            }
          }
        };
        void runCloudSync();
      },

      flushCloudSessionSyncQueue: async () => {
        const queue = get().cloudSessionSyncQueue;
        if (queue.length === 0) return;
        for (const item of queue) {
          try {
            await saveUserSession(item.userId, item.session);
            set((s) => ({
              cloudSessionSyncQueue: s.cloudSessionSyncQueue.filter((q) => q.sessionId !== item.sessionId),
            }));
          } catch (e) {
            console.error('Failed to flush cloud session queue item:', e);
            break;
          }
        }
      },

      loadUserDataFromCloud: async (uid: string) => {
        try {
          const [sessions, settings] = await Promise.all([listUserSessions(uid), loadUserSettings(uid)]);
          set({
            archivedSessions: sessions,
            memoTemplates: settings.memoTemplates.slice(0, 100),
            examTimeDeductionSeconds: Math.min(
              MAX_EXAM_DEDUCTION_SECONDS,
              Math.max(MIN_EXAM_DEDUCTION_SECONDS, settings.examTimeDeductionSeconds)
            ),
          });
        } catch (e) {
          console.error('loadUserDataFromCloud failed:', e);
        }
      },

      syncUserSettingsToCloud: async () => {
        try {
          const auth = getFirebaseAuth();
          const user = auth.currentUser;
          if (!user) return;
          const s = get();
          await saveUserSettings(user.uid, {
            examTimeDeductionSeconds: s.examTimeDeductionSeconds,
            memoTemplates: s.memoTemplates,
          });
        } catch (e) {
          console.error('syncUserSettingsToCloud failed:', e);
        }
      },

      saveMemoTemplate: ({ name, content, clinicalPresentation }) => {
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
        });
        void get().syncUserSettingsToCloud();
      },

      updateMemoTemplate: (templateId, { name, content, clinicalPresentation }) => {
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
        });
        void get().syncUserSettingsToCloud();
      },

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

      clearVolatileForAccountSwitch: () =>
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
        cloudSessionSyncQueue: state.cloudSessionSyncQueue,
      }),
    }
  )
);

/**
 * Firebase uid(또는 비로그인 guest)가 바뀔 때만 호출.
 * 로그인: Firestore에서 아카이브·설정 로드. 비로그인: 로컬 persist만 재적용.
 * (아카이브를 비운 뒤 덮어쓰지 않아 로그인 시 데이터 유실 방지)
 */
export async function syncSessionWithAuthScope(uid: string | null) {
  if (typeof window === 'undefined') return;
  const scope = uid ?? 'guest';
  if (lastSyncedAuthScope === scope) return;
  lastSyncedAuthScope = scope;
  useSessionStore.getState().clearVolatileForAccountSwitch();
  await useSessionStore.persist.rehydrate();
  if (uid) {
    await useSessionStore.getState().loadUserDataFromCloud(uid);
  }
}
