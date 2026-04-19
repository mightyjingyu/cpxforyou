import type { CaseSpec, Difficulty } from '@/types';

/** Custom Mode: 어떤 블록을 사용자가 직접 쓸지 */
export type DirectCaseScope = {
  /** 병력청취 표 (OLD COEX·HPI·배경) */
  history: boolean;
  /** 활력 + 신체진찰 소견 */
  physical: boolean;
  /** 예상진단 1~3순위 + 검사/치료/교육 계획에 해당하는 answer_key 일부 */
  diagnosisPlan: boolean;
};

/**
 * Custom Mode 폼 → /api/case/direct-complete
 * 체크한 섹션만 사용자가 채우고, 체크하지 않은 섹션은 서버에서 LLM으로 보강한다.
 */
export interface DirectCaseFormPayload {
  systemCategory: string;
  /** 임상표현 축 (CLINICAL_PRESENTATIONS 중 하나 권장 또는 근접 문자열) */
  chiefComplaint: string;
  patientName: string;
  patientAge: number;
  patientGender: '남' | '여';
  /** 주호소 한 줄 (시작 화면·opening에 사용) */
  chiefComplaintText: string;
  scope: DirectCaseScope;
  /**
   * 병력 라벨별 자유 서술. 키는 UI 고정 순서이며, 의미는 `lib/ai/historyBlockSemantics.ts`의
   * OLD COEX·Character/Associated/Factor/Exam·약·사·가·외·과·여 정의와 1:1 대응한다.
   */
  historyBlocks: Record<string, string>;
  /** scope.physical 일 때 — 비우면 AI가 채움 */
  vitals?: {
    bp: string;
    hr: string;
    rr: string;
    temp: string;
  };
  /** 추가 신체진찰 소견 줄 */
  physicalExtraLines?: string[];
  /** scope.diagnosisPlan 일 때 1~3순위 */
  diagnosisRanked?: [string, string, string];
  specialQuestion?: string;
  specialOther?: string;
  difficulty: Difficulty;
  friendliness?: 'cooperative' | 'normal' | 'uncooperative';
}

export type DirectCasePersisted = {
  id: string;
  title: string;
  systemCategory: string;
  chiefComplaint: string;
  /** 완성된 CaseSpec (case_source direct_hybrid 포함) */
  caseSpec: CaseSpec;
  updatedAt: number;
  /** 저장 시점 폼 스냅샷 — 있으면 수정 화면에서 동일 폼 복원 */
  formPayload?: DirectCaseFormPayload;
};
