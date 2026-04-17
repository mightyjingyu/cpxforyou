/** 스트리밍 텍스트에서 문장 경계로 잘라 TTS 단위 조각을 만든다.
 *  - 문장 끝(. ! ? …): 4자 이상이면 즉시 분리 (첫 조각은 너무 짧지 않게)
 *  - 쉼표/줄바꿈: 12자 이상 누적됐을 때 분리 (불필요한 쪼개기 감소)
 *  - 경계 없이 MAX_SPECULATIVE자 초과 시 강제 분리 (무한 버퍼 방지)
 */
const MIN_COMMA_LEN = 12;
const MIN_SENTENCE_LEN = 4;

function isSentenceEnd(c: string): boolean {
  return c === '.' || c === '。' || c === '!' || c === '?' || c === '？' || c === '…';
}

function isComma(c: string): boolean {
  return c === ',' || c === '，';
}

function isSoftBreak(c: string): boolean {
  return c === '\n';
}

export function splitStreamBuffer(text: string): { complete: string[]; rest: string } {
  const complete: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const len = text.slice(start, i + 1).trim().length;
    if (isSentenceEnd(c) && len >= MIN_SENTENCE_LEN) {
      complete.push(text.slice(start, i + 1).trim());
      start = i + 1;
    } else if ((isComma(c) || isSoftBreak(c)) && len >= MIN_COMMA_LEN) {
      complete.push(text.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  return { complete, rest: text.slice(start) };
}
