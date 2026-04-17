import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { CaseSpec } from '@/types';

interface Body {
  transcript: string;
  caseSpec: CaseSpec;
}

/** 폐 청진·심장 등 다른 진찰에서 자주 나오는 말(호흡, 맥박 등)이 바이탈로 오인되지 않게 제외한다. */
const ORGAN_EXAM_HINTS = [
  '청진',
  '타진',
  '촉진',
  '시진',
  '폐',
  '심장',
  '복부',
  '배의',
  '경부',
  '갑상',
  '간',
  '비장',
  '신장',
  '골반',
  '항문',
  '직장',
  '근력',
  '감각',
  '반사',
  '신경',
  '호흡음',
  '수포음',
  '마찰음',
  '잡음',
  '좌우',
  '하부',
  '상부',
];

/** 활력징후만 요청한 경우에만 직접 수치 반환. '호흡' 단독은 폐 청진 등과 충돌하므로 제외. */
const STRICT_VITAL_KEYWORDS = [
  '활력징후',
  '활력',
  '바이탈',
  'vital',
  'vitals',
  '혈압',
  'bp',
  '맥박',
  'pulse',
  '체온',
  'temp',
  '호흡수',
  '분당호흡',
  '분당 호흡',
  'respiratory rate',
];

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

function buildVitalsLine(caseSpec: CaseSpec): string {
  return `BP ${caseSpec.vitals.bp}, HR ${caseSpec.vitals.hr}, RR ${caseSpec.vitals.rr}, T ${caseSpec.vitals.temp}°C`;
}

function isVitalRequest(transcript: string): boolean {
  const q = normalize(transcript);
  if (matchAny(q, ORGAN_EXAM_HINTS)) return false;
  return matchAny(q, STRICT_VITAL_KEYWORDS);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const transcript = body.transcript?.trim();
    const caseSpec = body.caseSpec;

    if (!transcript || !caseSpec) {
      return NextResponse.json({ error: 'transcript와 caseSpec이 필요합니다.' }, { status: 400 });
    }

    if (isVitalRequest(transcript)) {
      return NextResponse.json({ findingText: buildVitalsLine(caseSpec) });
    }

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return NextResponse.json({ findingText: caseSpec.physical_exam_findings });
    }

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.15,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: [
            '너는 CPX 표준화 환자의 신체진찰 소견 응답기다.',
            '의사 발화에서 요청한 진찰·검사 항목에만 맞는 소견만 1~2문장으로 말한다.',
            '요청하지 않은 부위·항목에 대한 소견은 절대 추가하지 않는다.',
            'BP·HR·RR·T 같은 활력징후 숫자는 의사가 활력징후·바이탈·혈압·맥박·체온·호흡수 등을 명시적으로 요청한 경우에만 말한다.',
            '그 외 진찰(청진·촉진 등)을 요청했을 때는 활력 수치를 반복하거나 먼저 말하지 말 것.',
            '모르겠다는 표현이나 거절 문구는 쓰지 말고, 아래 케이스 정보에서 요청에 맞는 소견만 고른다.',
            '출력은 한국어, 불필요한 서론 없이 결과만.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            `의사 발화(이것에만 답할 것): ${transcript}`,
            `케이스에 적힌 신체진찰 소견(요청에 해당하는 부분만 사용): ${caseSpec.physical_exam_findings}`,
            `참고 진단: ${caseSpec.true_diagnosis}`,
            `참고 감별: ${caseSpec.differentials.join(', ')}`,
          ].join('\n'),
        },
      ],
    });

    const findingText = response.choices[0]?.message?.content?.trim() || caseSpec.physical_exam_findings;
    return NextResponse.json({ findingText });
  } catch (error) {
    console.error('Exam API error:', error);
    return NextResponse.json({ error: '신체진찰 결과 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
