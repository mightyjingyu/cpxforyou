import { doc, setDoc } from 'firebase/firestore';
import { SessionData } from '@/types';
import { getFirebaseDb } from './client';
import { SessionIndexDoc } from '@/types/firebase';

export function getLocalDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'cpx-device-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

export function buildSessionIndexDoc(session: SessionData, userId: string): SessionIndexDoc {
  const now = Date.now();
  return {
    sessionId: session.id,
    userId,
    createdAt: session.startTime,
    updatedAt: session.endTime || now,
    clinicalPresentation: session.caseSpec.clinical_presentation,
    grade: session.scoreResult?.total_grade || 'N/A',
    elapsedSeconds: session.elapsedSeconds,
    localVersion: (session.endTime || now),
    hasScore: !!session.scoreResult,
    hasMemo: !!session.memoContent?.trim(),
    deviceId: getLocalDeviceId(),
    lastSyncedAt: now,
  };
}

export async function upsertSessionIndex(userId: string, payload: SessionIndexDoc): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, 'users', userId, 'sessionIndex', payload.sessionId);
  await setDoc(ref, payload, { merge: true });
}
