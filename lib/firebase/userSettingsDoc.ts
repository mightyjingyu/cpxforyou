import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './client';

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
      updatedAt: Date.now(),
    };
  }
  const d = snap.data() as Partial<UserSettingsDoc>;
  return {
    examTimeDeductionSeconds:
      typeof d.examTimeDeductionSeconds === 'number' ? d.examTimeDeductionSeconds : DEFAULT_EXAM,
    memoTemplates: Array.isArray(d.memoTemplates) ? d.memoTemplates : [],
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
  };
}

export async function saveUserSettings(
  userId: string,
  partial: Pick<UserSettingsDoc, 'examTimeDeductionSeconds' | 'memoTemplates'>
): Promise<void> {
  await setDoc(
    settingsRef(userId),
    {
      ...partial,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}
