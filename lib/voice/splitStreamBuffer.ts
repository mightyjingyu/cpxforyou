/** 스트리밍 텍스트에서 마침표·쉼표 등 경계로 잘라 TTS 단위 조각을 만든다. */
function isBoundaryChar(c: string): boolean {
  return (
    c === '.' ||
    c === '。' ||
    c === '!' ||
    c === '?' ||
    c === '？' ||
    c === '…' ||
    c === ',' ||
    c === '，'
  );
}

export function splitStreamBuffer(text: string): { complete: string[]; rest: string } {
  const complete: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (isBoundaryChar(text[i])) {
      const piece = text.slice(start, i + 1).trim();
      if (piece.length > 0) complete.push(piece);
      start = i + 1;
    }
  }
  return { complete, rest: text.slice(start) };
}
