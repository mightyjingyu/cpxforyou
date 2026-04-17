import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { CaseSpec } from '@/types';

interface Body {
  transcript: string;
  caseSpec: CaseSpec;
}

const VITAL_KEYWORDS = ['바이탈', 'vital', '혈압', 'bp', '맥박', 'pulse', 'hr', '호흡', 'rr', '체온', 'temp'];
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
  return matchAny(q, VITAL_KEYWORDS);
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
      temperature: 0.1,
      max_tokens: 180,
      messages: [
        {
          role: 'system',
          content: [
            '너는 CPX 표준화 환자의 신체진찰 소견 응답기다.',
            '반드시 의사가 요청한 진찰 항목에 대해서만 소견을 제시한다.',
            '모르겠다는 표현이나 거절 문구를 쓰지 말고, 케이스 정보 내에서 가장 타당한 소견을 반환한다.',
            '요청 범위를 벗어나는 불필요한 추가 소견은 금지한다.',
            '출력은 한국어 1~2문장, 불필요한 서론 없이 결과만 작성한다.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            `의사 발화: ${transcript}`,
            `기본 신체진찰 소견: ${caseSpec.physical_exam_findings}`,
            `진단: ${caseSpec.true_diagnosis}`,
            `감별진단: ${caseSpec.differentials.join(', ')}`,
            `활력징후(참고): ${buildVitalsLine(caseSpec)}`,
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
