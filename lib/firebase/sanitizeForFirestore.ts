/**
 * Firestore는 필드 값으로 `undefined`를 허용하지 않습니다. 중첩 객체도 재귀적으로 제거합니다.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === null) {
    return value;
  }
  if (value === undefined) {
    return value as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}
