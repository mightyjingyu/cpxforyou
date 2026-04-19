import { NextRequest, NextResponse } from 'next/server';
import { completeDirectCase } from '@/lib/ai/directCaseComplete';
import type { DirectCaseFormPayload } from '@/types/directCase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DirectCaseFormPayload;
    if (!body?.chiefComplaint?.trim() || !body.chiefComplaintText?.trim()) {
      return NextResponse.json({ error: 'chiefComplaint와 chiefComplaintText가 필요합니다.' }, { status: 400 });
    }
    if (!body.patientName?.trim() || !body.patientAge || !body.patientGender) {
      return NextResponse.json({ error: '환자 이름·나이·성별이 필요합니다.' }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않아 Custom Mode 케이스를 완성할 수 없습니다.' },
        { status: 503 }
      );
    }

    const caseSpec = await completeDirectCase(body);
    return NextResponse.json({ caseSpec });
  } catch (e) {
    console.error('direct-complete error:', e);
    const msg = e instanceof Error ? e.message : 'Custom Mode 케이스 생성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
