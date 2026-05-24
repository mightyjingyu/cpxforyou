import { NextRequest, NextResponse } from 'next/server';
import { SEED_CASES } from '@/data/seeds/cases';
import { CLINICAL_CATEGORIES } from '@/lib/ai/personaTemplate';
import { CaseSpec } from '@/types';
import { getChecklistByClinicalPresentation } from '@/lib/server/clinicalChecklistStore';
import { PastExam } from '@/types/pastExam';

export const runtime = 'nodejs';

function getClinicalCategory(presentation: string): string {
  for (const [category, values] of Object.entries(CLINICAL_CATEGORIES)) {
    if (values.includes(presentation)) return category;
  }
  return '기타';
}

const PRE_MADE_PAST_EXAMS: PastExam[] = SEED_CASES.map((c) => {
  const presentation = c.clinical_presentation || '복통';
  const category = getClinicalCategory(presentation);
  
  const caseSpec: CaseSpec = {
    case_id: c.case_id || crypto.randomUUID(),
    clinical_presentation: presentation,
    difficulty: c.difficulty || 'normal',
    true_diagnosis: c.true_diagnosis || '미정',
    differentials: c.differentials || ['기타 감별'],
    opening_line: c.opening_line || '어디가 불편하세요?',
    ambiguity_constraints: c.ambiguity_constraints || {
      must_span_multiple_differentials: false,
      min_differentials_in_first_3_turns: 1,
      forbid_early_pathognomonic_reveal: false,
      forbid_single_diagnosis_lock_in_before_turn: 2,
    },
    patient: {
      name: c.patient?.name || '환자',
      age: c.patient?.age || 30,
      gender: c.patient?.gender || '남',
      occupation: c.patient?.occupation || '무직',
      education: c.patient?.education || '대졸',
    },
    vitals: {
      bp: c.vitals?.bp || '120/80',
      hr: c.vitals?.hr || 80,
      rr: c.vitals?.rr || 20,
      temp: c.vitals?.temp || 36.5,
    },
    history: {
      hpi: c.history?.hpi || '',
      past_medical: c.history?.past_medical || '없음',
      medications: c.history?.medications || '없음',
      allergies: c.history?.allergies || '없음',
      family: c.history?.family || '없음',
      social: {
        smoking: c.history?.social?.smoking || '비흡연',
        alcohol: c.history?.social?.alcohol || '음주 안 함',
        occupation: c.history?.social?.occupation || c.patient?.occupation || '무직',
      },
    },
    symptom_details: c.symptom_details || {
      onset: '갑자기 발생',
      character: '둔한 느낌',
      duration: '지속적',
      aggravating: '없음',
      relieving: '없음',
      associated: '없음',
      denied: '없음',
    },
    personality: c.personality || '보통 태도',
    patient_concern: c.patient_concern || '걱정 없음',
    physical_exam_findings: c.physical_exam_findings || '정상 소견',
    checklist: c.checklist || getChecklistByClinicalPresentation(presentation) || [
      { category: '기본 문진', items: ['주증상 확인', '과거력 확인'] }
    ],
    answer_key: c.answer_key || {
      diagnosis_ranked: [
        c.true_diagnosis || '진단 A',
        c.differentials?.[0] || '진단 B',
        c.differentials?.[1] || '진단 C',
      ],
      management_plan: {
        tests: '혈액 검사 및 영상학적 검사',
        treatment: '증상 조절 및 원인 질환 치료',
      },
      patient_education: '질환의 경과 및 주의사항 교육',
    },
    ai_deception_strategy: c.ai_deception_strategy,
    case_source: 'direct_hybrid',
    chief_complaint_display: c.chief_complaint_display || c.opening_line || '불편한 점을 물어보세요.',
  };

  return {
    id: caseSpec.case_id,
    title: `[기출] ${caseSpec.true_diagnosis || caseSpec.clinical_presentation}`,
    systemCategory: category,
    chiefComplaint: presentation,
    caseSpec,
    updatedAt: 1716500000000,
    isPreMade: true,
  };
});

export async function GET(req: NextRequest) {
  return NextResponse.json(PRE_MADE_PAST_EXAMS);
}
