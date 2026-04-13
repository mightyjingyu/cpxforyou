import OpenAI from 'openai';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function detectPhysicalExamIntentByLLM(message: string): Promise<boolean> {
  const normalized = message.trim();
  if (!normalized) return false;
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    return false;
  }

  try {
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 5,
      messages: [
        {
          role: 'system',
          content:
            '너는 의도 분류기다. 입력 문장이 "환자에게 신체진찰/이학적검사/바이탈 측정 등 검사 수행 의사 표현"이면 YES, 아니면 NO만 출력해라.',
        },
        {
          role: 'user',
          content: normalized,
        },
      ],
    });

    const answer = completion.choices[0]?.message?.content?.trim().toUpperCase() || 'NO';
    return answer.startsWith('YES');
  } catch (error) {
    console.error('Physical exam intent classification failed:', error);
    return false;
  }
}
