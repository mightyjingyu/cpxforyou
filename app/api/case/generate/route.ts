import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { generateCaseSpec } from '@/lib/ai/caseGenerator';
import { validateCaseSpec } from '@/lib/ai/caseValidator';
import { SEED_CASES, getRandomSeedCase } from '@/data/seeds/cases';
import { CaseSpec } from '@/types';
import { CLINICAL_PRESENTATIONS, PERSONA_TEMPLATES } from '@/lib/ai/personaTemplate';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomizePatientDemographics(caseSpec: CaseSpec, personaTemplateId: string): CaseSpec {
  const tmpl = PERSONA_TEMPLATES[personaTemplateId as keyof typeof PERSONA_TEMPLATES] || PERSONA_TEMPLATES.default_v1;
  const gender = Math.random() < 0.5 ? '남' : '여';
  const namePool = gender === '남' ? tmpl.name_pool_male : tmpl.name_pool_female;
  const occupationPool = tmpl.occupation_pool;
  const age = randomInt(22, 82);
  const name = namePool[Math.floor(Math.random() * namePool.length)] || caseSpec.patient.name;
  const occupation = occupationPool[Math.floor(Math.random() * occupationPool.length)] || caseSpec.patient.occupation;

  return {
    ...caseSpec,
    patient: {
      ...caseSpec.patient,
      name,
      age,
      gender,
      occupation,
    },
    history: {
      ...caseSpec.history,
      social: {
        ...caseSpec.history.social,
        occupation,
      },
    },
  };
}

function ensureAnswerKey(caseSpec: CaseSpec): CaseSpec {
  const ranked: [string, string, string] = [
    caseSpec.true_diagnosis,
    caseSpec.differentials?.[0] || '감별진단 A',
    caseSpec.differentials?.[1] || '감별진단 B',
  ];
  return {
    ...caseSpec,
    answer_key: caseSpec.answer_key || {
      diagnosis_ranked: ranked,
      management_plan: {
        tests: '1~3순위 감별을 구분할 수 있는 검사 시행 및 결과 확인 계획',
        treatment: '중증도에 맞는 초기 치료 후 검사 결과에 따라 단계적 치료 조정',
      },
      patient_education: '진단 가능성별 주의사항, 악화 경고증상, 재내원/추적 계획을 교육',
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clinical_presentation,
      difficulty = 'normal',
      learning_goal = [],
      persona_template_id = 'default_v1',
      use_seed = false,
    } = body;

    const presentation = clinical_presentation || CLINICAL_PRESENTATIONS[Math.floor(Math.random() * CLINICAL_PRESENTATIONS.length)];

    // 시드 케이스 사용 옵션 (API 키 없어도 동작)
    if (use_seed || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      const seed = SEED_CASES.find((c) => c.clinical_presentation === presentation) || getRandomSeedCase();
      const caseSpec: CaseSpec = {
        ...seed,
        case_id: uuidv4(),
        difficulty,
        clinical_presentation: presentation,
      } as CaseSpec;
      const randomizedCase = ensureAnswerKey(randomizePatientDemographics(caseSpec, persona_template_id));

      const validation = validateCaseSpec(randomizedCase);
      return NextResponse.json({ caseSpec: randomizedCase, validation, source: 'seed' });
    }

    // 동적 생성 (GPT-4o)
    let generated: CaseSpec;
    let validation;
    let attempts = 0;
    const maxAttempts = 3;

    do {
      generated = await generateCaseSpec({ clinical_presentation: presentation, difficulty, learning_goal, persona_template_id });
      generated.clinical_presentation = presentation;
      generated = ensureAnswerKey(randomizePatientDemographics(generated, persona_template_id));
      validation = validateCaseSpec(generated);
      attempts++;
    } while (!validation.passed && attempts < maxAttempts);

    if (!validation.passed) {
      // 검증 실패 시 시드로 폴백
      const seed = SEED_CASES.find((c) => c.clinical_presentation === presentation) || getRandomSeedCase();
      const fallback: CaseSpec = {
        ...seed,
        case_id: uuidv4(),
        difficulty,
        clinical_presentation: presentation,
      } as CaseSpec;
      const randomizedFallback = ensureAnswerKey(randomizePatientDemographics(fallback, persona_template_id));
      const fallbackValidation = validateCaseSpec(randomizedFallback);
      return NextResponse.json({ caseSpec: randomizedFallback, validation: fallbackValidation, source: 'seed_fallback' });
    }

    return NextResponse.json({ caseSpec: generated, validation, source: 'generated' });
  } catch (error) {
    console.error('Case generation error:', error);
    // 에러 시 시드 폴백
    const seed = getRandomSeedCase();
    const fallback: CaseSpec = { ...seed, case_id: uuidv4(), difficulty: 'normal' } as CaseSpec;
    const randomizedFallback = ensureAnswerKey(randomizePatientDemographics(fallback, 'default_v1'));
    return NextResponse.json({ caseSpec: randomizedFallback, validation: { passed: true, checks: ['seed fallback'], failures: [] }, source: 'error_fallback' });
  }
}
