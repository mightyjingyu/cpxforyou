import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';

export const runtime = 'nodejs';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function transcribeWithModel(client: OpenAI, file: File, model: 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe') {
  const transcription = await client.audio.transcriptions.create({
    file,
    model,
    language: 'ko',
    response_format: 'text',
  });
  return transcription.trim();
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

    const inputSize = raw.size;
    if (inputSize < 320) {
      // 극단적으로 짧은 오디오는 실패 처리 대신 빈 텍스트로 반환해 재녹음을 유도한다.
      return NextResponse.json({ text: '' });
    }

    const name = raw instanceof File ? raw.name : 'audio.webm';
    const type = raw.type || 'audio/webm';
    const bytes = Buffer.from(await raw.arrayBuffer());
    const file = await toFile(bytes, name, { type });

    const client = getOpenAIClient();
    let text = '';
    try {
      text = await transcribeWithModel(client, file, 'gpt-4o-mini-transcribe');
    } catch (primaryError) {
      console.warn('Primary STT model failed, retrying backup model:', primaryError);
    }
    if (!text) {
      text = await transcribeWithModel(client, file, 'gpt-4o-transcribe');
    }
    return NextResponse.json({ text });
  } catch (error) {
    console.error('STT API error:', error);
    return NextResponse.json({ error: '음성 인식 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
