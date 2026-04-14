import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 400 });
    }

    const { text, gender } = (await req.json()) as { text?: string; gender?: string };
    const input = text?.trim();
    if (!input) {
      return NextResponse.json({ error: 'text가 필요합니다.' }, { status: 400 });
    }

    const voice = gender === '남' ? 'onyx' : 'nova';

    const client = getOpenAIClient();
    const speech = await client.audio.speech.create({
      model: 'tts-1-hd',
      voice,
      input: input.slice(0, 4096),
      response_format: 'mp3',
      speed: 1.28,
    });

    const buf = Buffer.from(await speech.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json({ error: '음성 합성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
