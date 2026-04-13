import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { CaseSpec } from '@/types';
import { SEED_CASES } from '@/data/seeds/cases';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function generateCaseSpec(params: {
  clinical_presentation: string;
  difficulty: 'easy' | 'normal' | 'hard';
  learning_goal: string[];
  persona_template_id: string;
}): Promise<CaseSpec> {
  const client = getOpenAIClient();
  const { clinical_presentation, difficulty, learning_goal } = params;

  // 시드 케이스에서 해당 임상표현 찾기 (품질 기준)
  const seedCase = SEED_CASES.find(
    (c) => c.clinical_presentation === clinical_presentation
  );

  const prompt = `당신은 의과대학 CPX(임상수행능력시험) 케이스 설계 전문가입니다.
아래 조건에 맞는 표준화 환자 케이스를 JSON 형식으로 생성하세요.

## 생성 조건
- 임상표현: ${clinical_presentation}
- 난이도: ${difficulty}
- 학습 목표: ${learning_goal.join(', ')}

## 절대 준수 규칙
1. differentials는 반드시 3개 이상
2. opening_line에 단일 진단 확정 표현 금지
3. 초반 3턴은 최소 2개 감별진단이 열려 있도록 모호하게 설계
4. 학생이 구체적 감별 질문 전에 결정적 단서(pathognomonic clue) 노출 금지
5. 쉬움(easy)이어도 즉시 확진 불가
6. 생성되는 케이스의 clinical_presentation, opening_line, true_diagnosis, symptom_details는 반드시 "${clinical_presentation}" 임상표현 축과 임상적으로 일치해야 함

## 참고 케이스 구조 (이 스타일로 생성)
${seedCase ? JSON.stringify(seedCase, null, 2) : '표준 CPX 케이스 형식 준수'}

## 출력 형식 (JSON만 출력, 설명 없음)
{
  "case_id": "uuid",
  "clinical_presentation": "${clinical_presentation}",
  "difficulty": "${difficulty}",
  "true_diagnosis": "진단명",
  "differentials": ["감별1", "감별2", "감별3"],
  "opening_line": "환자 첫 대사 (모호하게)",
  "ambiguity_constraints": {
    "must_span_multiple_differentials": true,
    "min_differentials_in_first_3_turns": 2,
    "forbid_early_pathognomonic_reveal": true,
    "forbid_single_diagnosis_lock_in_before_turn": 4
  },
  "patient": {
    "name": "이름",
    "age": 나이,
    "gender": "남|여",
    "occupation": "직업",
    "education": "학력"
  },
  "vitals": {
    "bp": "수축기/이완기",
    "hr": 맥박수,
    "rr": 호흡수,
    "temp": 체온
  },
  "history": {
    "hpi": "현병력 상세",
    "past_medical": "과거력",
    "medications": "복용약물",
    "allergies": "알레르기",
    "family": "가족력",
    "social": {
      "smoking": "흡연력",
      "alcohol": "음주력",
      "occupation": "직업환경"
    }
  },
  "symptom_details": {
    "onset": "발병 시기",
    "character": "증상 양상",
    "severity": "강도",
    "duration": "지속 여부",
    "aggravating": "악화 요인",
    "relieving": "완화 요인",
    "associated": "동반 증상",
    "denied": "부정되는 증상"
  },
  "personality": "성격 및 감정 상태",
  "patient_concern": "환자 주요 걱정",
  "physical_exam_findings": "신체진찰 소견 상세",
  "ai_deception_strategy": "초기 모호성 유지 전략",
  "checklist": [
    {"category": "PPI", "items": ["인사 및 신분 소개", "개방형 질문", "공감 표현", "중간 요약", "환자 걱정 확인", "추정진단 설명", "향후 계획 설명", "이해도 점검"]},
    {"category": "병력청취", "items": ["주증상 확인", "발병 시기", "증상 양상", "악화/완화 요인", "동반증상", "과거력", "약물력", "가족력", "사회력"]},
    {"category": "신체진찰", "items": ["신체진찰 동의", "해당 계통 진찰"]}
  ],
  "answer_key": {
    "diagnosis_ranked": ["1순위 진단", "2순위 진단", "3순위 진단"],
    "management_plan": {
      "tests": "향후 검사 계획(1/2/3순위 감별을 포괄)",
      "treatment": "향후 치료 계획(1/2/3순위 감별을 포괄)"
    },
    "patient_education": "환자교육(생활관리/경고증상/재내원 기준, 1/2/3순위 감별을 포괄)"
  },
  "high_risk_omissions": ["핵심 누락 위험 항목들"]
}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('케이스 생성 실패');

  const generated = JSON.parse(content) as CaseSpec;
  generated.case_id = uuidv4();
  generated.answer_key = generated.answer_key || {
    diagnosis_ranked: [generated.true_diagnosis, generated.differentials?.[0] || '감별진단 A', generated.differentials?.[1] || '감별진단 B'],
    management_plan: {
      tests: '1~3순위 감별을 구분할 수 있는 검사 시행 및 결과 확인 계획',
      treatment: '중증도에 맞는 초기 치료 후 검사 결과에 따라 단계적 치료 조정',
    },
    patient_education: '진단 가능성별 주의사항, 악화 경고증상, 재내원/추적 계획을 교육',
  };

  return generated;
}
