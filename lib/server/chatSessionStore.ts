import { CaseSpec, Message } from '@/types';

/** 서버 전용 CPX 대화 세션 (OpenAI 호출 시 history + caseSpec 조립용) */
export type StoredChatSession = {
  caseSpec: CaseSpec;
  difficulty: 'easy' | 'normal' | 'hard';
  friendliness: 'cooperative' | 'normal' | 'uncooperative';
  conversationHistory: Message[];
  updatedAt: number;
};

const sessions = new Map<string, StoredChatSession>();
const TTL_MS = 24 * 60 * 60 * 1000;

function pruneStale() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > TTL_MS) sessions.delete(id);
  }
}

export function registerChatSession(
  sessionId: string,
  caseSpec: CaseSpec,
  difficulty: 'easy' | 'normal' | 'hard',
  friendliness: 'cooperative' | 'normal' | 'uncooperative' = 'normal'
): void {
  pruneStale();
  sessions.set(sessionId, {
    caseSpec,
    difficulty,
    friendliness,
    conversationHistory: [],
    updatedAt: Date.now(),
  });
}

export function getChatSession(sessionId: string): StoredChatSession | undefined {
  pruneStale();
  const s = sessions.get(sessionId);
  if (!s) return undefined;
  if (Date.now() - s.updatedAt > TTL_MS) {
    sessions.delete(sessionId);
    return undefined;
  }
  return s;
}

export function appendChatTurn(sessionId: string, userText: string, patientText: string): void {
  const s = getChatSession(sessionId);
  if (!s) return;
  const t = Date.now();
  s.conversationHistory.push(
    { id: crypto.randomUUID(), role: 'user', content: userText, timestamp: t },
    { id: crypto.randomUUID(), role: 'patient', content: patientText, timestamp: t + 1 }
  );
  s.updatedAt = Date.now();
}

export function deleteChatSession(sessionId: string): void {
  sessions.delete(sessionId);
}
