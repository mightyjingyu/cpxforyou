import { CaseSpec } from '@/types';

export const SEED_CASES: Partial<CaseSpec>[] = [
  {
    case_id: 'copd_001',
    clinical_presentation: '호흡곤란',
    true_diagnosis: '만성폐쇄폐질환(COPD) 급성악화',
    differentials: ['기흉', '심부전', '폐렴'],
    opening_line: '숨이 차서 왔어요.',
    patient: { name: '이태근', age: 75, gender: '남', occupation: '농부', education: '중졸' },
    vitals: { bp: '134/85', hr: 92, rr: 26, temp: 37.4 },
    history: {
      hpi: '10년 전부터 기침과 가래가 있었고, 빨리 걷거나 경사진 길을 오를 때 호흡곤란으로 쉬어야 했음. 5일 전 감기 후 호흡곤란 악화. 3일 전부터 100미터만 걸어도 숨참. 누런 찐득한 가래 증가. 야간에 쌕쌕거림.',
      past_medical: '특이 과거력 없음.',
      medications: '없음',
      allergies: '없음',
      family: '아버지: 고혈압, 심부전으로 사망.',
      social: { smoking: '55년간 1일 1갑. 3일 전 금연 시작.', alcohol: '월 1-2회, 소주 반 병', occupation: '농부' },
    },
    personality: '걱정하는 표정, 큰 병이 아닐까 불안함. 진료 중기: 1-2개 단어로 응답.',
    patient_concern: '담배를 많이 피워서 폐암이 아닌지 걱정됨.',
    physical_exam_findings: '청진: 호기 시 양측 폐야에서 wheeze 청진됨. 타진: 양측 과공명음. 촉진: 진동촉감 감소. 심장: 규칙적 심음, 잡음 없음. 하지부종: 없음.',
  },
  {
    case_id: 'appendicitis_001',
    clinical_presentation: '복통',
    true_diagnosis: '급성충수염(Acute Appendicitis)',
    differentials: ['난소낭종 염전', '자궁외임신', '요로감염', '장염'],
    opening_line: '배가 너무 아파요.',
    patient: { name: '강복자', age: 40, gender: '여', occupation: '가정주부', education: '고졸' },
    vitals: { bp: '100/60', hr: 90, rr: 20, temp: 37.4 },
    history: {
      hpi: '3일 전 저녁 통닭을 먹은 후 1시간 뒤부터 명치 끝이 아프기 시작. 오늘 아침부터 배꼽 주위 및 오른쪽 아랫배로 통증 이동. 현재 통증 강도 7/10.',
      past_medical: '평소 건강함.',
      medications: '소화제',
      allergies: '없음',
      family: '특이사항 없음',
      social: { smoking: '비흡연', alcohol: '주 1회, 소주 반 병' },
    },
    personality: '꼼꼼하고 독립적인 성격. 빨리 치료받고 집에 가고 싶어함.',
    patient_concern: '맹장일 것 같아 수술해야 하나 걱정.',
    physical_exam_findings: '우하복부 압통 및 반발통(+). Rovsing sign(+). Psoas sign(+). Obturator sign(-). 장음: 약간 감소.',
  },
  {
    case_id: 'gbs_001',
    clinical_presentation: '근력/감각 이상',
    true_diagnosis: '길랑바레증후군(Guillain-Barré Syndrome)',
    differentials: ['뇌졸중', '다발성경화증', '말초신경병증'],
    opening_line: '힘이 빠져서 왔어요.',
    patient: { name: '황진희', age: 37, gender: '여', occupation: '초등학교 교사', education: '대학원 졸업' },
    vitals: { bp: '125/75', hr: 87, rr: 15, temp: 36.5 },
    history: {
      hpi: '3일 전 손발 저림 시작. 2일 전 걸을 때 중심이 잘 안 잡힘. 1일 전부터 힘도 빠짐. 오늘은 발목을 못 움직이고 젓가락질이 잘 안 됨. 10일 전 장염으로 치료 받음.',
      past_medical: '평소 건강.',
      medications: '없음',
      allergies: '없음',
      family: '아버지: 고혈압, 어머니: 당뇨병',
      social: { smoking: '비흡연', alcohol: '월 1-2회, 맥주 1-2잔', occupation: '교사' },
    },
    personality: '걱정하는 표정과 불안한 마음. 뇌졸중 걱정.',
    patient_concern: '뇌졸중 아닌지 걱정. 이대로 계속 나빠질까봐 걱정.',
    physical_exam_findings: '근력: 손목/발목 이하 감소. 감각: 손목/발목 이하 touch/pain 50% 감소. 심부건반사: 전반적 감소/소실. Romberg(+). 바빈스키: 정상.',
  },
  {
    case_id: 'mi_001',
    clinical_presentation: '가슴 통증',
    true_diagnosis: '급성심근경색(Acute MI)',
    differentials: ['역류성식도염', '기흉', '심근염', '대동맥박리'],
    opening_line: '가슴이 답답하고 아파요.',
    patient: { name: '박용수', age: 58, gender: '남', occupation: '회사원', education: '대졸' },
    vitals: { bp: '145/90', hr: 98, rr: 18, temp: 36.8 },
    history: {
      hpi: '2시간 전 갑자기 가슴 중앙이 답답하고 무거운 느낌으로 시작. 처음에는 소화불량인 줄 알았음. 안정 취해도 안 나아짐.',
      past_medical: '고혈압 5년, 당뇨 3년',
      medications: '아스피린, 혈압약, 당뇨약',
      allergies: '없음',
      family: '아버지: 60대에 심장마비로 사망',
      social: { smoking: '30년간 1일 1갑', alcohol: '주 2-3회 소주 1병' },
    },
    personality: '불안하고 긴장된 표정.',
    patient_concern: '위가 안 좋은 것 아닌지. 아버지가 심장마비로 돌아가셔서 걱정.',
    physical_exam_findings: '심박수 98회, 규칙적 심음. S3 없음. 폐: 맑음. 경정맥: 확장 없음. 하지부종: 없음. 식은땀 관찰.',
    ai_deception_strategy: '처음에는 소화불량 같은 느낌이라고 말함. 어깨나 턱으로 뻗치는 느낌 있냐고 구체적으로 물어야만 왼쪽 어깨가 당기는 것 같다고 답변.',
  },
  {
    case_id: 'headache_001',
    clinical_presentation: '두통',
    true_diagnosis: '지주막하출혈(Subarachnoid Hemorrhage)',
    differentials: ['편두통', '긴장성 두통', '뇌수막염'],
    opening_line: '갑자기 머리가 너무 심하게 아파요.',
    patient: { name: '김미란', age: 45, gender: '여', occupation: '주부', education: '대졸' },
    vitals: { bp: '165/100', hr: 88, rr: 16, temp: 37.0 },
    history: {
      hpi: '3시간 전 갑자기 망치로 맞은 듯한 극심한 두통 발생. 구역질과 한 번 구토. 목이 뻣뻣한 느낌.',
      past_medical: '편두통으로 외래 치료 중',
      medications: '트립탄 계열 약물',
      allergies: '없음',
      family: '없음',
      social: { smoking: '비흡연', alcohol: '거의 안 함' },
    },
    personality: '매우 불안해 보임. 평소 두통과 다르다고 강조.',
    patient_concern: '이렇게 아파본 적이 없어서 무서움.',
    physical_exam_findings: '목 강직(+). 케르니그 징후(+). 의식: 명료하나 통증으로 힘들어함. 동공: 정상 반응.',
    ai_deception_strategy: '처음에 편두통이 또 온 것 같다고 답변. 평소 두통과 같냐고 물어야 훨씬 심하다고 답변. 평생 겪어본 두통 중 가장 심하냐고 물어야 그렇다고 답변.',
  },
];

export function getRandomSeedCase(): Partial<CaseSpec> {
  return SEED_CASES[Math.floor(Math.random() * SEED_CASES.length)];
}

export function getSeedCaseByPresentation(presentation: string): Partial<CaseSpec> | undefined {
  return SEED_CASES.find((c) => c.clinical_presentation === presentation);
}
