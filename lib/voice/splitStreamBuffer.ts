/** 스트리밍 텍스트에서 문장 경계로 잘라 TTS 단위 조각을 만든다.
 *  - 문장 끝(. ! ? … 한글 마침표 등): 최소 길이 이상이면 분리
 *  - 쉼표/줄바꿈: 더 길게 누적된 뒤에만 분리 (한국어 중간 끊김 감소)
 *  - VoiceEngine의 SPECULATIVE_FLUSH와 함께 쓰인다.
 */
const MIN_COMMA_LEN = 14;
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
