/**
 * 직접 모드 병력 표 라벨 — OLD COEX + 증상 특성(C/A/F/E) + 약·사·가·외·과·여 (제공된 임상 정의 고정).
 * 케이스 완성 LLM과 UI 힌트에 동일하게 사용한다.
 */
export const HISTORY_KEYS = [
  'O',
  'L',
  'D',
  'Co',
  'Ex',
  'C',
  'A',
  'F',
  'E',
  '외',
  '과',
  '가',
  '약',
  '사',
  '여',
  '기타',
] as const;

export type HistoryBlockKey = (typeof HISTORY_KEYS)[number];

export type HistoryBlockSemantic = {
  /** OLD COEX(1~5) / 현병력 보충(6~9) / 일반 병력(10~15) */
  mnemonic: 'OLD_COEX' | 'HPI_6_9' | 'BACKGROUND' | 'extra';
  en: string;
  ko: string;
  mergeHint: string;
};

export const HISTORY_BLOCK_SEMANTICS: Record<HistoryBlockKey, HistoryBlockSemantic> = {
  O: {
    mnemonic: 'OLD_COEX',
    en: 'Onset',
    ko: '발병 시기',
    mergeHint: 'symptom_details.onset',
  },
  L: {
    mnemonic: 'OLD_COEX',
    en: 'Location',
    ko: '위치',
    mergeHint: 'symptom_details.location (+ symptom_details.radiation)',
  },
  D: {
    mnemonic: 'OLD_COEX',
    en: 'Duration',
    ko: '지속 시간, 빈도',
    mergeHint: 'symptom_details.duration',
  },
  Co: {
    mnemonic: 'OLD_COEX',
    en: 'Course',
    ko: '악화 또는 완화되고 있는가? fluctuation이 있는가?',
    mergeHint: 'symptom_details.progression (+ duration 변동·경과 문맥)',
  },
  Ex: {
    mnemonic: 'OLD_COEX',
    en: 'Experience',
    ko: '유사한 경험이 있는가?',
    mergeHint: 'history.hpi 내 유사 경험·재발 문장, 필요 시 symptom_details.onset과 연결',
  },
  C: {
    mnemonic: 'HPI_6_9',
    en: 'Character',
    ko: '통증 또는 병변의 특징은?',
    mergeHint: 'symptom_details.character (+ symptom_details.severity)',
  },
  A: {
    mnemonic: 'HPI_6_9',
    en: 'Associated symptom',
    ko: '동반되는 증상',
    mergeHint: 'symptom_details.associated',
  },
  F: {
    mnemonic: 'HPI_6_9',
    en: 'Factor',
    ko: '유발, 악화, 완화 요인',
    mergeHint: 'symptom_details.aggravating, symptom_details.relieving',
  },
  E: {
    mnemonic: 'HPI_6_9',
    en: 'Exam',
    ko: '이전 검진결과',
    mergeHint: 'history.past_medical·history.hpi 중 과거 검진·영상·검사 결과 서술',
  },
  약: {
    mnemonic: 'BACKGROUND',
    en: '약물력',
    ko: '약물력',
    mergeHint: 'history.medications',
  },
  사: {
    mnemonic: 'BACKGROUND',
    en: '사회력',
    ko: '직업, 술, 담배',
    mergeHint: 'history.social.smoking, history.social.alcohol, history.social.occupation',
  },
  가: {
    mnemonic: 'BACKGROUND',
    en: '가족력',
    ko: '가족력',
    mergeHint: 'history.family',
  },
  외: {
    mnemonic: 'BACKGROUND',
    en: '외상력',
    ko: '교통사고 등',
    mergeHint: 'history.past_medical·history.hpi 내 외상·사고력',
  },
  과: {
    mnemonic: 'BACKGROUND',
    en: '과거력',
    ko: '다른 지병',
    mergeHint: 'history.past_medical (기왕 질환·입원 등)',
  },
  여: {
    mnemonic: 'BACKGROUND',
    en: '여성력',
    ko: '초경나이, 완경나이, 월경주기, 성관계 등',
    mergeHint: 'history.social.last_menstrual, history.hpi·patient_concern에 해당 시 반영',
  },
  기타: {
    mnemonic: 'extra',
    en: 'Other',
    ko: '위 항목에 넣기 어려운 보충',
    mergeHint: 'history.hpi 끝에 합치거나 patient_concern 보조',
  },
};

/** LLM 프롬프트용: 각 칸이 어떤 임상 의미인지 고정한다 */
export function formatHistoryBlockSemanticsForPrompt(): string {
  const lines = HISTORY_KEYS.map((key) => {
    const s = HISTORY_BLOCK_SEMANTICS[key];
    return `- [${key}] (${s.mnemonic}) ${s.en} — ${s.ko} → ${s.mergeHint}`;
  });
  const header = `## 병력 표 라벨 의미(고정)
1~5: OLD COEX (Onset, Location, Duration, Course, Experience)
6~9: Character, Associated, Factor, Exam(이전 검진)
10~15: 약물력, 사회력, 가족력, 외상력, 과거력(다른 지병), 여성력
`;
  return `${header}\n${lines.join('\n')}\n\n각 historyBlocks 키의 값은 위 의미에 맞춰 symptom_details / history의 해당 필드에 **그대로 녹이고**, 사용자가 쓴 문장은 바꾸지 마세요.`;
}
