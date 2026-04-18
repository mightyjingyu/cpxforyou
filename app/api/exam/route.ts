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
            '지금은 신체진찰 단계이다. 시험관(의사)의 이번 발화(transcript)에서 요청한 것에만 답한다.',
            '**신체 진찰**(시진·촉진·타진·청진 등)을 요청하면, 아래 케이스 신체진찰 소견과 확정·감별 진단 맥락에 맞게 **그 부위·항목에 해당하는 소견만** 짧게 말한다.',
            '**검사**(혈액검사·혈액·소변·영상·심전도·초음파 등)를 요청하면, 병원에서 그 검사를 시행했다고 가정하고 **케이스 정답키의 검사 계획·진단에 모순 없는 결과**를 한국어로 짧게 말한다. 검사가 신체진찰이 아니라고 거절하거나 “요청 항목이 아닙니다” 같은 메타 멘트는 절대 하지 않는다.',
            '발화에서 요청되지 않은 다른 부위·항목 소견은 덧붙이지 않는다.',
            '활력징후·바이탈·혈압·BP·맥박·HR·호흡수·RR·체온·T 등 수치를 **이번 발화에서** 물었을 때만, 아래 "케이스 고정 활력징후"의 숫자만 그대로 말한다.',
            '모르겠다·거절·재요청 유도 같은 표현은 쓰지 않는다.',
            '출력은 1~3문장 이내, 서론 없이 소견(또는 검사 결과 요약)만.',
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
            `정답키 권장 검사·계획(검사 요청 시 결과 서술에 반드시 참고): ${caseSpec.answer_key.management_plan.tests}`,
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
