import { CaseSpec } from '@/types';

export interface ValidationResult {
  passed: boolean;
  checks: string[];
  failures: string[];
}

const SINGLE_DIAGNOSIS_PATTERNS = [
  /천식\s*같아요/, /심근경색이에요/, /copd예요/, /맹장이에요/, /충수염이에요/,
  /폐렴이에요/, /뇌졸중이에요/, /당뇨예요/, /고혈압이에요/,
];

export function validateCaseSpec(spec: CaseSpec): ValidationResult {
  const checks: string[] = [];
  const failures: string[] = [];

  // 1. differentials >= 2
  if (spec.differentials && spec.differentials.length >= 2) {
    checks.push('differentials >= 2');
  } else {
    failures.push('differentials must have at least 2 entries');
  }

  // 2. opening_line에 단일 진단 확정 표현 금지
  const hasBadPattern = SINGLE_DIAGNOSIS_PATTERNS.some((p) => p.test(spec.opening_line || ''));
  if (!hasBadPattern) {
    checks.push('opening_line에 단일 진단 확정 표현 없음');
  } else {
    failures.push('opening_line contains single-diagnosis confirmation pattern');
  }

  // 3. 필수 필드 존재
  const requiredFields: (keyof CaseSpec)[] = [
    'case_id', 'clinical_presentation', 'difficulty', 'true_diagnosis',
    'differentials', 'opening_line', 'patient', 'vitals', 'history',
    'physical_exam_findings', 'checklist',
  ];
  const missingFields = requiredFields.filter((f) => !spec[f]);
  if (missingFields.length === 0) {
    checks.push('필수 필드 모두 존재');
  } else {
    failures.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // 4. checklist 최소 항목
  const totalChecklistItems = spec.checklist?.reduce((acc, cat) => acc + cat.items.length, 0) ?? 0;
  if (totalChecklistItems >= 5) {
    checks.push('체크리스트 항목 충분 (>=5)');
  } else {
    failures.push('checklist must have at least 5 items');
  }

  // 5. patient 기본 정보
  if (spec.patient?.name && spec.patient?.age && spec.patient?.gender) {
    checks.push('환자 기본 정보 완비');
  } else {
    failures.push('Patient basic info (name/age/gender) is missing');
  }

  return {
    passed: failures.length === 0,
    checks,
    failures,
  };
}
