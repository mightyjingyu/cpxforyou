import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type { CaseSpec } from '@/types';
import type { DirectCaseFormPayload } from '@/types/directCase';
import { validateCaseSpec } from '@/lib/ai/caseValidator';
import { getChecklistByClinicalPresentation } from '@/lib/server/clinicalChecklistStore';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function parseVitalsNumber(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(String(raw).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function ensureAnswerKey(spec: CaseSpec): CaseSpec {
  const ranked: [string, string, string] = spec.answer_key?.diagnosis_ranked
    ? spec.answer_key.diagnosis_ranked
    : [
        spec.true_diagnosis,
        spec.differentials?.[0] || '감별진단 A',
        spec.differentials?.[1] || '감별진단 B',
      ];
  return {
    ...spec,
    answer_key: {
      diagnosis_ranked: ranked,
      management_plan: spec.answer_key?.management_plan ?? {
        tests: '1~3순위 감별을 구분할 수 있는 검사 시행 및 결과 확인 계획',
        treatment: '중증도에 맞는 초기 치료 후 검사 결과에 따라 단계적 치료 조정',
      },
      patient_education:
        spec.answer_key?.patient_education ??
        '진단 가능성별 주의사항, 악화 경고증상, 재내원/추적 계획을 교육',
    },
  };
}

function ensureChecklistItems(spec: CaseSpec): CaseSpec {
  const total =
    spec.checklist?.reduce((acc, cat) => acc + (cat.items?.length ?? 0), 0) ?? 0;
  if (total >= 5) return spec;
  const merged = getChecklistByClinicalPresentation(spec.clinical_presentation);
  if (merged) {
    const mergedTotal = merged.reduce((acc, cat) => acc + cat.items.length, 0);
    if (mergedTotal >= 5) return { ...spec, checklist: merged };
  }
  const filler: CaseSpec['checklist'] = [
    { category: 'PPI', items: ['인사 및 신분 소개', '개방형 질문', '공감 표현'] },
    { category: '병력청취', items: ['주증상 확인', '과거력', '약물력'] },
  ];
  return { ...spec, checklist: [...(spec.checklist ?? []), ...filler] };
}

function normalizeVitalsFromPayload(
  spec: CaseSpec,
  payload: DirectCaseFormPayload
): CaseSpec {
  const v = payload.vitals;
  if (!v) return spec;
  return {
    ...spec,
    vitals: {
      bp: v.bp?.trim() || spec.vitals.bp,
      hr: parseVitalsNumber(v.hr, spec.vitals.hr),
      rr: parseVitalsNumber(v.rr, spec.vitals.rr),
      temp: parseVitalsNumber(v.temp, spec.vitals.temp),
    },
  };
}

const CASE_SPEC_JSON_GUIDE = `
출력은 반드시 유효한 JSON 하나만 (설명·마크다운 금지). CaseSpec 필드:
case_id(임의 uuid 문자열), clinical_presentation, difficulty, true_diagnosis, differentials(배열 3개 이상),
opening_line, ambiguity_constraints(객체), patient{name,age,gender,occupation,education?},
vitals{bp, hr, rr, temp}, history{hpi, past_medical, medications, allergies, family, social{smoking,alcohol,occupation?,last_menstrual?}},
symptom_details{onset, character, severity?, location?, location_change?, progression?, duration, aggravating, relieving, associated, denied, radiation?},
personality, patient_concern, physical_exam_findings,
checklist[{category, items[]}] — 항목 합계 5개 이상,
answer_key{diagnosis_ranked[3], management_plan{tests,treatment}, patient_education},
high_risk_omissions(배열), ai_deception_strategy(문자열)
`.trim();

export async function completeDirectCase(payload: DirectCaseFormPayload): Promise<CaseSpec> {
  const client = getOpenAIClient();
  const payloadJson = JSON.stringify(payload, null, 2);

  const prompt = `당신은 의과대학 CPX 케이스 설계자입니다. 사용자가 "직접 모드" 표로 일부만 채운 뒤, 나머지는 당신이 임상적으로 일관되게 보강해 완전한 CaseSpec JSON을 만듭니다.

## 절대 규칙
1) scope.history === true 인 경우: historyBlocks에 적힌 내용은 **절대 변경하지 말고** symptom_details·history.hpi 등에 녹여 넣으세요. 라벨(O,L,D,Co,Ex,…)은 문진 질문-답 쌍이 아니라 **상황 설정 메모**입니다. 환자는 의사가 다른 순서로 물어도 같은 사실을 유지합니다.
2) scope.history === false 인 경우: 병력·symptom_details·history 전체를 chief_complaint·나이·성별과 맞게 생성하세요.
3) scope.physical === true 인 경우: 사용자가 준 vitals·physicalExtraLines를 반영하고, 비어 있으면 맥락에 맞게 채우세요.
4) scope.physical === false 인 경우: 활력징후·physical_exam_findings를 케이스에 맞게 생성하세요.
5) scope.diagnosisPlan === true 인 경우: diagnosisRanked를 answer_key.diagnosis_ranked 및 true_diagnosis(1순위)와 감별 목록에 반영하세요.
6) scope.diagnosisPlan === false 인 경우: 추정진단·감별·answer_key를 chief complaint에 맞게 생성하세요.
7) clinical_presentation은 반드시 payload.chiefComplaint와 동일한 문자열이어야 합니다.
8) opening_line은 환자 첫 말로, payload.chiefComplaintText 맥락을 반영하되 진단명을 직접 말하지 마세요.
9) 난이도는 payload.difficulty를 따르세요.
10) checklist 항목 합계 5개 이상.

${CASE_SPEC_JSON_GUIDE}

## 입력 payload
${payloadJson}

specialQuestion·specialOther가 있으면 patient_concern·hpi 맥락에 자연스럽게 반영하세요.

JSON만 출력하세요.`;

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const userContent =
      attempt > 0 && lastError
        ? `${prompt}\n\n[재시도] 검증 실패: ${lastError}\n위 규칙을 지키고 JSON만 다시 출력하세요.`
        : prompt;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: userContent }],
      response_format: { type: 'json_object' },
      max_tokens: 4500,
      temperature: attempt === 0 ? 0.45 : 0.25,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('직접 모드 케이스 보강 실패(빈 응답)');

    let spec: CaseSpec;
    try {
      spec = JSON.parse(content) as CaseSpec;
    } catch {
      lastError = 'JSON 파싱 실패';
      continue;
    }

    spec.case_id = uuidv4();
    spec.clinical_presentation = payload.chiefComplaint.trim();
    spec.difficulty = payload.difficulty;
    spec.case_source = 'direct_hybrid';
    spec.chief_complaint_display = payload.chiefComplaintText.trim();

    spec = normalizeVitalsFromPayload(spec, payload);

    if (payload.physicalExtraLines?.length) {
      const extra = payload.physicalExtraLines.filter(Boolean).join('\n');
      spec.physical_exam_findings = [spec.physical_exam_findings, extra].filter(Boolean).join('\n');
    }

    const clinicalCheck = getChecklistByClinicalPresentation(spec.clinical_presentation);
    if (clinicalCheck) {
      spec = { ...spec, checklist: clinicalCheck };
    } else {
      spec = ensureChecklistItems(spec);
    }

    spec = ensureAnswerKey(spec);

    if (!spec.differentials || spec.differentials.length < 2) {
      spec = {
        ...spec,
        differentials: [
          spec.true_diagnosis,
          ...(spec.differentials ?? []),
          '기타 감별',
        ].filter(Boolean).slice(0, 5),
      };
    }

    const validation = validateCaseSpec(spec);
    if (validation.passed) {
      return spec;
    }
    lastError = validation.failures.join('; ');
  }

  throw new Error(lastError || '직접 모드 케이스 검증 실패');
}
