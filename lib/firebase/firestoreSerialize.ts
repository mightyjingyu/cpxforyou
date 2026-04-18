/** Firestore는 undefined 값을 허용하지 않음 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    const v = out[k as keyof T];
    if (v === undefined) {
      delete out[k as keyof T];
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      (out as Record<string, unknown>)[k] = stripUndefined(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      (out as Record<string, unknown>)[k] = v.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? stripUndefined(item as Record<string, unknown>)
          : item
      );
    }
  }
  return out;
}
