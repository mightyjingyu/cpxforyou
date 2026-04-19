import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './client';
import { stripUndefinedDeep } from './sanitizeForFirestore';
import type { DirectCasePersisted } from '@/types/directCase';

export type MemoTemplatePersisted = {
  id: string;
  name: string;
  content: string;
  clinicalPresentation?: string;
  updatedAt: number;
};

export type UserSettingsDoc = {
  examTimeDeductionSeconds: number;
  memoTemplates: MemoTemplatePersisted[];
  /** Custom Mode로 저장한 완성 케이스 */
  directCases?: DirectCasePersisted[];
  /** 진료 중 메모 패널 초안 — 로그인 시 클라우드에 동기화되어 기기 간 유지 */
  draftMemoContent?: string;
  updatedAt: number;
};

const DEFAULT_EXAM = 240;

function settingsRef(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'settings', 'app');
}

export async function loadUserSettings(userId: string): Promise<UserSettingsDoc> {
  const snap = await getDoc(settingsRef(userId));
  if (!snap.exists()) {
    return {
      examTimeDeductionSeconds: DEFAULT_EXAM,
      memoTemplates: [],
      directCases: [],
      draftMemoContent: undefined,
      updatedAt: Date.now(),
    };
  }
  const d = snap.data() as Partial<UserSettingsDoc>;
  return {
    examTimeDeductionSeconds:
      typeof d.examTimeDeductionSeconds === 'number' ? d.examTimeDeductionSeconds : DEFAULT_EXAM,
    memoTemplates: Array.isArray(d.memoTemplates) ? d.memoTemplates : [],
    directCases: Array.isArray(d.directCases) ? d.directCases.slice(0, 200) : [],
    draftMemoContent: typeof d.draftMemoContent === 'string' ? d.draftMemoContent : undefined,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
  };
}

export async function saveUserSettings(
  userId: string,
  partial: Pick<UserSettingsDoc, 'examTimeDeductionSeconds' | 'memoTemplates' | 'directCases' | 'draftMemoContent'>
): Promise<void> {
  const payload = stripUndefinedDeep({
    ...partial,
    updatedAt: Date.now(),
  });
  await setDoc(settingsRef(userId), payload, { merge: true });
}
