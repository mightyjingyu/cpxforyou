import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { buildSystemPrompt } from '@/lib/ai/patientEngine';
import { appendChatTurn, getChatSession } from '@/lib/server/chatSessionStore';
import { detectPhysicalExamIntentByLLM } from '@/lib/ai/examIntent';
import { CaseSpec, Message } from '@/types';

export const runtime = 'nodejs';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

type Body =
  | { sessionId: string; message: string }
  | {
      sessionId?: string;
      message: string;
      caseSpec: CaseSpec;
      conversationHistory: Message[];
      difficulty: 'easy' | 'normal' | 'hard';
    };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    let caseSpec: CaseSpec;
    let difficulty: 'easy' | 'normal' | 'hard';
    let conversationHistory: Message[];
    let message: string;
    const sessionId = 'sessionId' in body && body.sessionId ? body.sessionId : null;

    if (sessionId) {
      const s = getChatSession(sessionId);
      if (s) {
        caseSpec = s.caseSpec;
        difficulty = s.difficulty;
        conversationHistory = s.conversationHistory;
        message = body.message;
      } else if ('caseSpec' in body && body.caseSpec) {
        caseSpec = body.caseSpec;
        difficulty = body.difficulty;
        conversationHistory = body.conversationHistory ?? [];
        message = body.message;
      } else {
        return new Response(JSON.stringify({ error: '세션을 찾을 수 없습니다. 세션을 다시 시작해주세요.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if ('caseSpec' in body && body.caseSpec) {
      caseSpec = body.caseSpec;
      difficulty = body.difficulty;
      conversationHistory = body.conversationHistory ?? [];
      message = body.message;
    } else {
      return new Response(JSON.stringify({ error: 'sessionId와 message가 필요합니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'message가 비어 있습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const unfriendlinessByDifficulty: Record<'easy' | 'normal' | 'hard', number> = {
      easy: 2,
      normal: 5,
      hard: 8,
    };
    const systemPrompt = buildSystemPrompt(
      caseSpec.clinical_presentation,
      caseSpec.opening_line || caseSpec.clinical_presentation,
      caseSpec.true_diagnosis,
      difficulty,
      unfriendlinessByDifficulty[difficulty],
      caseSpec.patient.age,
      caseSpec.patient.gender,
      caseSpec.answer_key
    );
    const isPhysicalExam = await detectPhysicalExamIntentByLLM(message);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-20).map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const encoder = new TextEncoder();
    const userTrimmed = message.trim();

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      let mockResponse = '';
      if (isPhysicalExam) {
        mockResponse = `[진찰소견] ${caseSpec.physical_exam_findings}`;
      } else if (conversationHistory.length === 0) {
        mockResponse = caseSpec.opening_line;
      } else {
        const mockReplies = [
          '네, 맞아요. 좀 더 자세히 말씀해 주시겠어요?',
          '그렇게 말씀하시니... 잘 모르겠어요.',
          '며칠 전부터요. 처음에는 별로 안 심했는데.',
          '통증이 있긴 한데, 어떻게 표현해야 할지...',
        ];
        mockResponse = mockReplies[conversationHistory.length % mockReplies.length];
      }
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(mockResponse));
          controller.close();
          if (sessionId) {
            appendChatTurn(sessionId, userTrimmed, mockResponse);
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const client = getOpenAIClient();
    const llmStream = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 300,
      temperature: 0.7,
      stream: true,
    });

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          for await (const chunk of llmStream) {
            const content = chunk.choices[0]?.delta?.content ?? '';
            if (content) {
              fullText += content;
              controller.enqueue(encoder.encode(content));
            }
          }
          if (sessionId && fullText.trim()) {
            appendChatTurn(sessionId, userTrimmed, fullText.trim());
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Chat stream API error:', error);
    return new Response(JSON.stringify({ error: '스트리밍 처리 중 오류가 발생했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
