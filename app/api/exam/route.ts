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
            '지금은 신체진찰 단계이다. 시험관(의사)의 이번 발화(transcript)에서 **명시적으로 요청한** 진찰·검사·활력 확인에 대해서만 그에 맞는 소견을 한국어로 답한다.',
            '발화에서 요청되지 않은 부위·장기·항목에 대한 소견, 정상 소견 나열, "전체적으로" 같은 요약, 감별·진단 설명, 추가 권유는 절대 출력하지 않는다.',
            '케이스의 "전체 신체진찰 소견"을 한꺼번에 인용하거나 요약하지 않는다. 요청된 항목에 해당하는 부분만 짧게 말한다.',
            '여러 항목을 한 번에 요청했으면, 요청된 항목 각각에 대해 해당 소견만 짧게 말한다(요청 없는 항목은 언급하지 않는다).',
            '활력징후·바이탈·혈압·BP·맥박·HR·호흡수·RR·체온·T 등 수치를 **이번 발화에서** 물었을 때만, 아래 "케이스 고정 활력징후"의 숫자만 그대로 말한다.',
            '이번 발화에 진찰·검사 요청이 없거나 불명확하면, 소견을 꾸며 내지 말고 한 문장으로만 요청을 명확히 해 달라고 한다.',
            '모르겠다·거절 같은 표현은 쓰지 않는다.',
            '출력은 1~3문장 이내, 서론·메타 설명 없이 소견(또는 위의 재요청 한 문장)만.',
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
