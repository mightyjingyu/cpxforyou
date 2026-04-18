/**
 * Zustand persist 스코프가 auth 복원 전/후로 guest ↔ uid 로 바뀌며 메모가 다른 키에 쪼개지는 문제를 피하기 위해
 * uid(또는 guest)별 메모를 단일 JSON으로 localStorage에 동기 저장한다.
 */
const KEY = 'cpx-memo-by-uid-v1';

export function writeMemoLocalBackup(uid: string, content: string): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const raw = localStorage.getItem(KEY);
    const map: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[uid] = content;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore quota / JSON errors
  }
}

export function readMemoLocalBackup(uid: string): string | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const v = map[uid];
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}
