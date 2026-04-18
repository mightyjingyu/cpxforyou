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
import { readMemoLocalBackup, writeMemoLocalBackup } from '@/lib/memoLocalBackup';
import { loadUserSettings, saveUserSettings } from '@/lib/firebase/userSettingsDoc';
import type { DirectCasePersisted } from '@/types/directCase';

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
  /** 병력청취 완료 직전 메인 타이머가 돌고 있었는지 — 신체진찰 완료 시 복구용 */
  prePhysicalTimerWasRunning: boolean;

  archivedSessions: SessionData[];
  memoTemplates: Array<{
    id: string;
    name: string;
    content: string;
    clinicalPresentation?: string;
    updatedAt: number;
  }>;
  /** 직접 모드 저장 증례 (Firestore 동기화) */
  directCases: DirectCasePersisted[];
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
  /** includeDraftMemo: 메모 패널에서 온 동기화만 true — false일 때 draftMemoContent 필드를 보내지 않아 빈 상태로 기존 클라우드 메모를 덮어쓰지 않음 */
  syncUserSettingsToCloud: (opts?: { includeDraftMemo?: boolean }) => Promise<void>;
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
  saveDirectCase: (payload: {
    title: string;
    systemCategory: string;
    chiefComplaint: string;
    caseSpec: CaseSpec;
  }) => string;
  removeDirectCase: (id: string) => void;
  reset: () => void;
  /** 로그인 uid 전환 시 활성 세션 필드만 비움(아카이브는 loadUserDataFromCloud에서 채움) */
  clearVolatileForAccountSwitch: () => void;
}

const DEFAULT_EXAM_DEDUCTION_SECONDS = 240;
const MIN_EXAM_DEDUCTION_SECONDS = 30;
const MAX_EXAM_DEDUCTION_SECONDS = 600;
/** v2: Firestore 전체 동기화 도입 — 이전 로컬 키와 분리 */
const BASE_PERSIST_KEY = 'cpx-session-storage-v2';

/** 탭 단위로만 사용. 새로고침 시에도 동일 uid면 clearVolatile를 호출하지 않아 메모·persist가 유지된다. */
const AUTH_SCOPE_SESSION_KEY = 'cpx-auth-scope';

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
      prePhysicalTimerWasRunning: false,
      archivedSessions: [],
      memoTemplates: [],
      directCases: [],
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
          prePhysicalTimerWasRunning: false,
        }),

      startTimer: () =>
        set((state) => {
          if (state.sessionStatus !== 'active') return state;
          if (state.sessionPhase === 'physical') return state;
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
          prePhysicalTimerWasRunning: false,
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
          if (state.sessionPhase === 'physical') {
            return state;
          }
          const phaseUpdate =
            state.sessionPhase === 'history'
              ? { historyTakingElapsed: state.historyTakingElapsed + 1 }
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

      setMemo: (content) => {
        const uid = getFirebaseAuth().currentUser?.uid ?? 'guest';
        writeMemoLocalBackup(uid, content);
        set({ memoContent: content });
        scheduleDraftMemoSync();
      },

      markPhysicalExamDone: () =>
        set((state) => ({
          physicalExamDone: true,
          physicalExamEndedAt: state.physicalExamEndedAt ?? Date.now(),
          sessionPhase: state.sessionPhase === 'physical' ? 'education' : state.sessionPhase,
          isTimerRunning: state.prePhysicalTimerWasRunning,
          prePhysicalTimerWasRunning: false,
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
            prePhysicalTimerWasRunning: state.isTimerRunning,
            isTimerRunning: false,
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
          set((state) => {
            const fromCloud = settings.draftMemoContent;
            const fromDisk = readMemoLocalBackup(uid);
            let nextMemo = state.memoContent;
            if (fromCloud !== undefined) {
              nextMemo = fromCloud;
            } else if (fromDisk != null && fromDisk.length > 0) {
              nextMemo = fromDisk;
            }
            if ((fromDisk?.length ?? 0) > (nextMemo?.length ?? 0)) {
              nextMemo = fromDisk as string;
            }
            writeMemoLocalBackup(uid, nextMemo);
            return {
              archivedSessions: sessions,
              memoTemplates: settings.memoTemplates.slice(0, 100),
              directCases: (settings.directCases ?? []).slice(0, 200),
              examTimeDeductionSeconds: Math.min(
                MAX_EXAM_DEDUCTION_SECONDS,
                Math.max(MIN_EXAM_DEDUCTION_SECONDS, settings.examTimeDeductionSeconds)
              ),
              memoContent: nextMemo,
            };
          });
        } catch (e) {
          console.error('loadUserDataFromCloud failed:', e);
        }
      },

      syncUserSettingsToCloud: async (opts?: { includeDraftMemo?: boolean }) => {
        try {
          const auth = getFirebaseAuth();
          const user = auth.currentUser;
          if (!user) return;
          const s = get();
          const base = {
            examTimeDeductionSeconds: s.examTimeDeductionSeconds,
            memoTemplates: s.memoTemplates,
            directCases: s.directCases ?? [],
          };
          if (opts?.includeDraftMemo) {
            await saveUserSettings(user.uid, {
              ...base,
              draftMemoContent: s.memoContent,
            });
            writeMemoLocalBackup(user.uid, s.memoContent);
          } else {
            await saveUserSettings(user.uid, base);
          }
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

      applyMemoTemplate: (templateId) => {
        set((state) => {
          const picked = state.memoTemplates.find((t) => t.id === templateId);
          if (!picked) return state;
          const uid = getFirebaseAuth().currentUser?.uid ?? 'guest';
          writeMemoLocalBackup(uid, picked.content);
          return { memoContent: picked.content };
        });
        scheduleDraftMemoSync();
      },

      saveDirectCase: ({ title, systemCategory, chiefComplaint, caseSpec }) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const entry: DirectCasePersisted = {
          id,
          title: title.trim() || '제목 없음',
          systemCategory: systemCategory.trim(),
          chiefComplaint: chiefComplaint.trim(),
          caseSpec,
          updatedAt: now,
        };
        set((state) => ({
          directCases: [entry, ...(state.directCases ?? []).filter((d) => d.id !== id)].slice(0, 200),
        }));
        void get().syncUserSettingsToCloud();
        return id;
      },

      removeDirectCase: (id) => {
        set((state) => ({
          directCases: (state.directCases ?? []).filter((d) => d.id !== id),
        }));
        void get().syncUserSettingsToCloud();
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
          sessionPhase: 'history',
          historyTakingElapsed: 0,
          physicalExamElapsed: 0,
          educationElapsed: 0,
          prePhysicalTimerWasRunning: false,
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
          prePhysicalTimerWasRunning: false,
        }),
    }),
    {
      name: BASE_PERSIST_KEY,
      storage: scopedSessionStorage,
      partialize: (state) => ({
        archivedSessions: state.archivedSessions,
        examTimeDeductionSeconds: state.examTimeDeductionSeconds,
        memoTemplates: state.memoTemplates,
        directCases: state.directCases,
        memoContent: state.memoContent,
        cloudSessionSyncQueue: state.cloudSessionSyncQueue,
      }),
    }
  )
);

let draftMemoSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDraftMemoSync() {
  if (typeof window === 'undefined') return;
  if (draftMemoSyncTimer) clearTimeout(draftMemoSyncTimer);
    draftMemoSyncTimer = setTimeout(() => {
    draftMemoSyncTimer = null;
    void useSessionStore.getState().syncUserSettingsToCloud({ includeDraftMemo: true });
  }, 400);
}

/** 디바운스 대기 없이 즉시 Firestore(로그인 시)·로컬 persist에 반영 */
export async function flushDraftMemoToCloud(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (draftMemoSyncTimer) {
    clearTimeout(draftMemoSyncTimer);
    draftMemoSyncTimer = null;
  }
  await useSessionStore.getState().syncUserSettingsToCloud({ includeDraftMemo: true });
}

/**
 * 계정 전환 시에만 volatile 초기화. 같은 탭에서 새로고침(uid 동일)이면 메모를 지우지 않는다.
 */
export async function syncSessionWithAuthScope(uid: string | null) {
  if (typeof window === 'undefined') return;
  const next = uid ?? 'guest';
  const stored = sessionStorage.getItem(AUTH_SCOPE_SESSION_KEY);

  if (stored === next) {
    if (uid) {
      await useSessionStore.getState().loadUserDataFromCloud(uid);
    }
    return;
  }

  const isAccountSwitch = stored !== null && stored !== next;

  if (isAccountSwitch) {
    await flushDraftMemoToCloud();
    useSessionStore.getState().clearVolatileForAccountSwitch();
    await useSessionStore.persist.rehydrate();
  }

  sessionStorage.setItem(AUTH_SCOPE_SESSION_KEY, next);

  if (uid) {
    await useSessionStore.getState().loadUserDataFromCloud(uid);
  }
}
