import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { SessionData } from '@/types';
import { getFirebaseDb } from './client';
import { stripUndefined } from './firestoreSerialize';

const MAX_ARCHIVED = 50;

function sessionDocRef(userId: string, sessionId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'sessions', sessionId);
}

/**
 * 세션 전체를 Firestore에 저장 (문서당 ~1MB 제한 — 초과 시 콘솔 에러)
 */
export async function saveUserSession(userId: string, session: SessionData): Promise<void> {
  const payload = stripUndefined(JSON.parse(JSON.stringify(session)) as Record<string, unknown>);
  const ref = sessionDocRef(userId, session.id);
  await setDoc(
    ref,
    {
      ...payload,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

function docToSessionData(id: string, data: Record<string, unknown>): SessionData | null {
  try {
    if (!data.caseSpec || !data.conversationHistory) return null;
    return {
      id,
      caseSpec: data.caseSpec as SessionData['caseSpec'],
      conversationHistory: data.conversationHistory as SessionData['conversationHistory'],
      memoContent: String(data.memoContent ?? ''),
      startTime: Number(data.startTime ?? 0),
      endTime: data.endTime !== undefined ? Number(data.endTime) : undefined,
      elapsedSeconds: Number(data.elapsedSeconds ?? 0),
      scoreResult: data.scoreResult as SessionData['scoreResult'],
      physicalExamDone: Boolean(data.physicalExamDone),
      timerMode: data.timerMode as SessionData['timerMode'],
      phaseDurations: data.phaseDurations as SessionData['phaseDurations'],
    };
  } catch {
    return null;
  }
}

/**
 * 사용자 세션 목록 로드 (최근순, 최대 MAX_ARCHIVED) — orderBy 없이 조회해 인덱스 불필요
 */
export async function listUserSessions(userId: string): Promise<SessionData[]> {
  const col = collection(getFirebaseDb(), 'users', userId, 'sessions');
  const snap = await getDocs(col);
  const sessions: SessionData[] = [];
  snap.forEach((d) => {
    const parsed = docToSessionData(d.id, d.data() as Record<string, unknown>);
    if (parsed) sessions.push(parsed);
  });
  sessions.sort(
    (a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime)
  );
  return sessions.slice(0, MAX_ARCHIVED);
}
