import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { CaseSpec } from '@/types';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

interface Body {
  transcript: string;
  caseSpec: CaseSpec;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const transcript = body.transcript?.trim();
    const caseSpec = body.caseSpec;

    if (!transcript || !caseSpec) {
      return NextResponse.json({ error: 'transcript와 caseSpec이 필요합니다.' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return NextResponse.json({
        findingText: caseSpec.physical_exam_findings,
      });
    }

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content:
            '너는 CPX 신체진찰 결과 생성기다. 입력된 "의사의 검사 지시"에 해당하는 결과만, 주어진 케이스 소견 안에서 골라 1문장 한국어로 출력한다. 관련 없는 검사 요청이면 "해당 검사에서 특이 소견은 없습니다."라고 출력한다. 절대 케이스에 없는 정보를 만들지 마라.',
        },
        {
          role: 'user',
          content: `의사 발화: ${transcript}\n전체 신체진찰 소견: ${caseSpec.physical_exam_findings}`,
        },
      ],
    });

    const findingText = response.choices[0]?.message?.content?.trim() || '해당 검사에서 특이 소견은 없습니다.';
    return NextResponse.json({ findingText });
  } catch (error) {
    console.error('Exam API error:', error);
    return NextResponse.json({ error: '신체진찰 결과 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
