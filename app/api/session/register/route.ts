import { NextRequest, NextResponse } from 'next/server';
import { registerChatSession } from '@/lib/server/chatSessionStore';
import { CaseSpec } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sessionId?: string;
      caseSpec?: CaseSpec;
      difficulty?: 'easy' | 'normal' | 'hard';
      friendliness?: 'cooperative' | 'normal' | 'uncooperative';
    };

    const { sessionId, caseSpec, difficulty, friendliness = 'normal' } = body;
    if (!sessionId || !caseSpec || !difficulty) {
      return NextResponse.json(
        { error: 'sessionId, caseSpec, difficulty가 필요합니다.' },
        { status: 400 }
      );
    }

    registerChatSession(sessionId, caseSpec, difficulty, friendliness);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('session register error:', e);
    return NextResponse.json({ error: '세션 등록에 실패했습니다.' }, { status: 500 });
  }
}
