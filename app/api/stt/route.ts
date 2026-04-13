import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';

export const runtime = 'nodejs';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 400 });
    }

    const formData = await req.formData();
    const raw = formData.get('file');
    if (!raw || !(raw instanceof Blob)) {
      return NextResponse.json({ error: 'file 필드가 필요합니다.' }, { status: 400 });
    }

    const buf = Buffer.from(await raw.arrayBuffer());
    if (buf.length < 512) {
      return NextResponse.json({ error: '녹음이 너무 짧습니다.' }, { status: 400 });
    }

    const name = raw instanceof File ? raw.name : 'audio.webm';
    const type = raw.type || 'audio/webm';
    const file = await toFile(buf, name, { type });

    const client = getOpenAIClient();
    const transcription = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ko',
    });

    return NextResponse.json({ text: transcription.text.trim() });
  } catch (error) {
    console.error('STT API error:', error);
    return NextResponse.json({ error: '음성 인식 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
