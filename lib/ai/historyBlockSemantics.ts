/**
 * 직접 모드 병력 표 라벨 — 단순 문자가 아니라 CPX 문진 머네모닉(OLDCAF·과약가사여 등)에 대응하는 의미 태그.
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
  /** OLDCAF(현병력) / 과약가사여(배경) / 기타 */
  mnemonic: 'OLDCAF' | '과약가사여' | 'extra';
  en: string;
  ko: string;
  /** CaseSpec에 넣을 때 우선 매핑할 필드(힌트) */
  mergeHint: string;
};

export const HISTORY_BLOCK_SEMANTICS: Record<HistoryBlockKey, HistoryBlockSemantic> = {
  O: {
    mnemonic: 'OLDCAF',
    en: 'Onset',
    ko: '발생 시기·양상(급/만성), 유사 경험, 유발 상황',
    mergeHint: 'symptom_details.onset',
  },
  L: {
    mnemonic: 'OLDCAF',
    en: 'Location',
    ko: '부위, 방사·이동 여부',
    mergeHint: 'symptom_details.location (+ radiation 있으면 symptom_details.radiation)',
  },
  D: {
    mnemonic: 'OLDCAF',
    en: 'Duration',
    ko: '지속·빈도, 간헐/지속, 악화 경향',
    mergeHint: 'symptom_details.duration (+ progression)',
  },
  Co: {
    mnemonic: 'OLDCAF',
    en: 'Character',
    ko: '증상 질·양상(통증이면 NRS 등)',
    mergeHint: 'symptom_details.character (+ severity)',
  },
  Ex: {
    mnemonic: 'OLDCAF',
    en: 'Exacerbating/Relieving',
    ko: '악화·완화 요인',
    mergeHint: 'symptom_details.aggravating, symptom_details.relieving',
  },
  C: {
    mnemonic: 'OLDCAF',
    en: 'Course / context',
    ko: '경과·맥락(시간에 따른 변화 등)',
    mergeHint: 'symptom_details.progression, symptom_details.location_change',
  },
  A: {
    mnemonic: 'OLDCAF',
    en: 'Associated symptoms',
    ko: '동반 증상, 감별에 필요한 부가 증상',
    mergeHint: 'symptom_details.associated',
  },
  F: {
    mnemonic: 'OLDCAF',
    en: 'Factor / severity',
    ko: '추가 요인·중증도(예: 통증 NRS), 활동 제한',
    mergeHint: 'symptom_details.severity, 일부는 aggravating/reliating 보조',
  },
  E: {
    mnemonic: 'OLDCAF',
    en: 'Excluded / denied',
    ko: '부정 소견(없는 증상·부인 항목)',
    mergeHint: 'symptom_details.denied',
  },
  외: {
    mnemonic: 'extra',
    en: 'Surgical / procedural',
    ko: '수술·시술 등(과거력 중 외과적)',
    mergeHint: 'history.past_medical (수술·입원·외상 문맥에 포함)',
  },
  과: {
    mnemonic: '과약가사여',
    en: 'Past medical (과거력)',
    ko: '기왕 질환·입원·검진·만성 질환',
    mergeHint: 'history.past_medical',
  },
  가: {
    mnemonic: '과약가사여',
    en: 'Family history',
    ko: '가족력·유사 증상·유전 질환',
    mergeHint: 'history.family',
  },
  약: {
    mnemonic: '과약가사여',
    en: 'Medications',
    ko: '복용 약물(처방·일반)',
    mergeHint: 'history.medications',
  },
  사: {
    mnemonic: '과약가사여',
    en: 'Social history',
    ko: '흡연·음주·커피·식습관·운동·직업 스트레스 등',
    mergeHint: 'history.social.smoking, history.social.alcohol, history.social.occupation',
  },
  여: {
    mnemonic: '과약가사여',
    en: "Women's history",
    ko: '월경·임신 가능성·폐경, 산부·성기능 관련(해당 시)',
    mergeHint: 'history.social.last_menstrual, 필요 시 hpi에 반영',
  },
  기타: {
    mnemonic: 'extra',
    en: 'Other notes',
    ko: '위 항목에 들어가지 않는 보충 메모',
    mergeHint: 'history.hpi 끝에 자연스럽게 합치거나 patient_concern 보조',
  },
};

/** LLM 프롬프트용: 각 칸이 어떤 임상 의미인지 고정한다 */
export function formatHistoryBlockSemanticsForPrompt(): string {
  const lines = HISTORY_KEYS.map((key) => {
    const s = HISTORY_BLOCK_SEMANTICS[key];
    return `- [${key}] (${s.mnemonic}) ${s.en} — ${s.ko} → ${s.mergeHint}`;
  });
  return `## 병력 표 라벨 의미(고정, 문자 그대로가 아님)\n${lines.join('\n')}\n\n각 historyBlocks 키의 값은 위 의미에 맞춰 symptom_details / history의 해당 필드에 **그대로 녹이고**, 의미가 겹치면 한 필드에 합쳐도 되나 사용자 문장은 바꾸지 마세요.`;
}
