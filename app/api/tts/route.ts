import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

type TtsVoice = 'alloy' | 'nova';

function normalizeGender(value?: string): 'male' | 'female' | 'unknown' {
  if (!value) return 'unknown';
  const v = value.trim().toLowerCase();
  if (['남', '남자', '남성', 'male', 'm', 'man', 'boy'].includes(v)) return 'male';
  if (['여', '여자', '여성', 'female', 'f', 'woman', 'girl'].includes(v)) return 'female';
  return 'unknown';
}

function pickVoice(genderRaw?: string): TtsVoice {
  const gender = normalizeGender(genderRaw);
  if (gender === 'female') return 'nova';
  // 환자 성별이 남성(또는 미인식)일 때는 남성 톤으로 고정한다.
  return 'alloy';
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 400 });
    }

    const { text, gender, age } = (await req.json()) as { text?: string; gender?: string; age?: number };
    const input = text?.trim();
    if (!input) {
      return NextResponse.json({ error: 'text가 필요합니다.' }, { status: 400 });
    }

    const voice = pickVoice(gender);

    const client = getOpenAIClient();
    const speech = await client.audio.speech.create({
      model: 'tts-1',
      voice,
      input: input.slice(0, 4096),
      response_format: 'mp3',
      speed: 1.08,
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
