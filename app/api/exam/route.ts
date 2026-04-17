import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { CaseSpec } from '@/types';

interface Body {
  transcript: string;
  caseSpec: CaseSpec;
}

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildVitalsLine(caseSpec: CaseSpec): string {
  return `BP ${caseSpec.vitals.bp}, HR ${caseSpec.vitals.hr}, RR ${caseSpec.vitals.rr}, T ${caseSpec.vitals.temp}°C`;
}

/** LLM이 다른 숫자를 지어내지 않도록 케이스 고정값을 여러 형식으로 제시 */
function buildVitalsCanonicalBlock(caseSpec: CaseSpec): string {
  const { bp, hr, rr, temp } = caseSpec.vitals;
  return [
    '아래는 이 케이스에 고정된 활력징후다. 활력·수치를 물었을 때는 반드시 이 값만 사용한다(숫자를 바꾸거나 새로 만들지 않는다).',
    `BP ${bp}`,
    `HR ${hr}`,
    `RR ${rr}`,
    `T ${temp}°C`,
    `한 줄 형식: ${buildVitalsLine(caseSpec)}`,
  ].join('\n');
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
      return NextResponse.json({ findingText: caseSpec.physical_exam_findings });
    }

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content: [
            '너는 의사 국가시험 CPX에서 표준화 환자 역할을 한다.',
            '지금은 신체진찰 단계이며, 시험관(의사)이 말로 요청한 진찰·검사에 대해서만 그에 맞는 신체진찰 소견을 한국어로 답한다.',
            '시험관이 요청하지 않은 부위·항목에 대한 소견은 말하지 않는다.',
            '아래에 주어진 케이스의 신체진찰 소견·활력징후·진단 맥락 안에서만 답하고, 요청과 무관한 내용은 덧붙이지 않는다.',
            '시험관이 활력징후·바이탈·혈압·BP·맥박·HR·호흡수·RR·체온·T 등 수치를 물으면, 아래에 주어진 "케이스 고정 활력징후"에 적힌 숫자만 그대로 말한다. 다른 수치를 추측하거나 임의로 만들지 않는다.',
            '모르겠다·거절 같은 표현은 쓰지 않는다.',
            '출력은 1~3문장 이내, 서론 없이 소견만.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            `시험관 발화: ${transcript}`,
            '',
            buildVitalsCanonicalBlock(caseSpec),
            '',
            `케이스 신체진찰 소견(전체): ${caseSpec.physical_exam_findings}`,
            `확정 진단(참고): ${caseSpec.true_diagnosis}`,
            `감별진단(참고): ${caseSpec.differentials.join(', ')}`,
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
