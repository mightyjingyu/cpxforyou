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
        findingText: `검사 결과: ${caseSpec.physical_exam_findings}`,
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
            [
              '너는 CPX 검사결과 생성기다.',
              '의사의 검사 지시(예: 혈액검사, 흉부X-ray, 소변검사, 심전도, CT, 신체진찰)에 대해 "실제 임상 결과처럼" 구체적인 결과를 한국어로 생성한다.',
              '반드시 케이스의 true_diagnosis와 answer_key를 기준으로 일관되게 작성하고, 추정진단 정답과 모순되면 안 된다.',
              '중요: "특이 소견 없음" 같은 빈 결과를 절대 쓰지 마라.',
              '가능하면 수치(예: WBC, CRP, Hb, AST/ALT, Troponin 등)나 구체 소견을 포함한다.',
              '출력은 1~2문장, 불필요한 설명 없이 결과만.',
              '의사가 요청한 검사 종류와 맞는 포맷으로 답한다.',
            ].join(' '),
        },
        {
          role: 'user',
          content: [
            `의사 발화: ${transcript}`,
            `케이스 true_diagnosis: ${caseSpec.true_diagnosis}`,
            `정답 관리 계획(검사): ${caseSpec.answer_key.management_plan.tests}`,
            `전체 신체진찰 소견: ${caseSpec.physical_exam_findings}`,
            `감별진단: ${caseSpec.differentials.join(', ')}`,
          ].join('\n'),
        },
      ],
    });

    let findingText =
      response.choices[0]?.message?.content?.trim() ||
      `검사 결과: ${caseSpec.physical_exam_findings}`;
    if (/특이\s*소견\s*없/.test(findingText)) {
      const retry = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 160,
        messages: [
          {
            role: 'system',
            content:
              '의사가 요청한 검사에 대해 숫자/구체 소견이 있는 결과만 1~2문장으로 답해라. "특이 소견 없음"은 금지다. true_diagnosis와 일치시켜라.',
          },
          {
            role: 'user',
            content: `의사 발화: ${transcript}\ntrue_diagnosis: ${caseSpec.true_diagnosis}\n검사 정답 키: ${caseSpec.answer_key.management_plan.tests}`,
          },
        ],
      });
      findingText =
        retry.choices[0]?.message?.content?.trim() || `검사 결과: ${caseSpec.physical_exam_findings}`;
    }
    return NextResponse.json({ findingText });
  } catch (error) {
    console.error('Exam API error:', error);
    return NextResponse.json({ error: '신체진찰 결과 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
