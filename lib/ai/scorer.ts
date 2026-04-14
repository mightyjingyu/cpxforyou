import OpenAI from 'openai';
import { CaseSpec, Message, ScoreResult } from '@/types';
import { buildScoringPrompt } from './patientEngine';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function formatConversationLog(messages: Message[]): string {
  return messages
    .map((m) => {
      const role = m.role === 'user' ? '학생' : '환자';
      const time = formatTimestamp(m.timestamp);
      return `[${time}] ${role}: ${m.content}`;
    })
    .join('\n');
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toGrade(value01: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (value01 >= 0.9) return 'A';
  if (value01 >= 0.8) return 'B';
  if (value01 >= 0.7) return 'C';
  if (value01 >= 0.6) return 'D';
  return 'F';
}

function hasMeaningfulAttempt(conversationHistory: Message[]): boolean {
  const userTurns = conversationHistory.filter((m) => m.role === 'user');
  if (userTurns.length === 0) return false;
  const meaningfulTurns = userTurns.filter((m) => m.content.trim().length >= 6);
  return meaningfulTurns.length >= 1;
}

export function buildNoAttemptScore(caseSpec: CaseSpec): ScoreResult {
  const answerKey = caseSpec.answer_key || {
    diagnosis_ranked: [caseSpec.true_diagnosis, caseSpec.differentials?.[0] || '감별진단 A', caseSpec.differentials?.[1] || '감별진단 B'],
    management_plan: {
      tests: '1~3순위 감별을 구분할 수 있는 검사 시행 및 결과 확인 계획',
      treatment: '중증도에 맞는 초기 치료 후 검사 결과에 따라 단계적 치료 조정',
    },
    patient_education: '진단 가능성별 주의사항, 악화 경고증상, 재내원/추적 계획을 교육',
  };

  const checklist_results = caseSpec.checklist.flatMap((cat) =>
    cat.items.map((item) => ({
      item,
      category: cat.category,
      done: false,
      evidence: undefined,
    }))
  );

  return {
    checklist_results,
    ppi_score: { opening: 0, empathy: 0, summary: 0, closure: 0 },
    critical_omissions: [],
    poor_questions: [],
    tags: ['#진료미수행', '#질문부족'],
    total_score: 0,
    total_grade: 'F',
    grade_basis: '의미 있는 병력청취/설명 발화 없이 진료가 종료되어 F 처리됨.',
    summary_feedback: '의미 있는 의사 발화 없이 진료가 종료되었습니다. 최소한 핵심 병력청취, 추정진단, 향후 계획, 환자교육을 반드시 수행하세요.',
    final_answer_evaluation: {
      presumptive_diagnosis: {
        expected: `1) ${answerKey.diagnosis_ranked[0]} / 2) ${answerKey.diagnosis_ranked[1]} / 3) ${answerKey.diagnosis_ranked[2]}`,
        student_summary: '언급 없음',
        correct: false,
        reason: '진단에 대한 발화가 없어 오답 처리되었습니다.',
      },
      management_plan_tests: {
        expected: answerKey.management_plan.tests,
        student_summary: '언급 없음',
        correct: false,
        reason: '검사 계획에 대한 발화가 없어 오답 처리되었습니다.',
      },
      management_plan_treatment: {
        expected: answerKey.management_plan.treatment,
        student_summary: '언급 없음',
        correct: false,
        reason: '치료 계획에 대한 발화가 없어 오답 처리되었습니다.',
      },
      patient_education: {
        expected: answerKey.patient_education,
        student_summary: '언급 없음',
        correct: false,
        reason: '환자교육 발화가 없어 오답 처리되었습니다.',
      },
      patient_consistency: {
        consistent: true,
        reason: '진료 발화가 없어 일치성 평가 대상이 충분하지 않습니다.',
      },
    },
  };
}

export async function scoreSession(
  conversationHistory: Message[],
  caseSpec: CaseSpec
): Promise<ScoreResult> {
  const client = getOpenAIClient();
  if (!hasMeaningfulAttempt(conversationHistory)) {
    return buildNoAttemptScore(caseSpec);
  }

  const answerKey = caseSpec.answer_key || {
    diagnosis_ranked: [caseSpec.true_diagnosis, caseSpec.differentials?.[0] || '감별진단 A', caseSpec.differentials?.[1] || '감별진단 B'],
    management_plan: {
      tests: '1~3순위 감별을 구분할 수 있는 검사 시행 및 결과 확인 계획',
      treatment: '중증도에 맞는 초기 치료 후 검사 결과에 따라 단계적 치료 조정',
    },
    patient_education: '진단 가능성별 주의사항, 악화 경고증상, 재내원/추적 계획을 교육',
  };
  const conversationLog = formatConversationLog(conversationHistory);
  const prompt = buildScoringPrompt(conversationLog, caseSpec.checklist, answerKey);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('채점 실패');
  const parsed = JSON.parse(content) as Partial<ScoreResult>;
  const finalEval = parsed.final_answer_evaluation || {
    presumptive_diagnosis: {
      expected: `1) ${answerKey.diagnosis_ranked[0]} / 2) ${answerKey.diagnosis_ranked[1]} / 3) ${answerKey.diagnosis_ranked[2]}`,
      student_summary: '언급 없음',
      correct: false,
      reason: '채점 결과에 최종 단계 평가가 누락되어 기본값을 사용했습니다.',
    },
    management_plan_tests: {
      expected: answerKey.management_plan.tests,
      student_summary: '언급 없음',
      correct: false,
      reason: '채점 결과에 최종 단계 평가가 누락되어 기본값을 사용했습니다.',
    },
    management_plan_treatment: {
      expected: answerKey.management_plan.treatment,
      student_summary: '언급 없음',
      correct: false,
      reason: '채점 결과에 최종 단계 평가가 누락되어 기본값을 사용했습니다.',
    },
    patient_education: {
      expected: answerKey.patient_education,
      student_summary: '언급 없음',
      correct: false,
      reason: '채점 결과에 최종 단계 평가가 누락되어 기본값을 사용했습니다.',
    },
    patient_consistency: {
      consistent: true,
      reason: '채점 결과에 일치성 평가가 누락되어 기본값을 사용했습니다.',
    },
  };
  const checklist = parsed.checklist_results || [];
  const checklistRatio = checklist.length > 0 ? checklist.filter((c) => c.done).length / checklist.length : 0;
  const answerCorrectCount =
    (finalEval.presumptive_diagnosis.correct ? 1 : 0) +
    (finalEval.management_plan_tests.correct ? 1 : 0) +
    (finalEval.management_plan_treatment.correct ? 1 : 0) +
    (finalEval.patient_education.correct ? 1 : 0);
  const answerRatio = answerCorrectCount / 4;
  const composite = answerRatio * 0.1 + checklistRatio * 0.9;
  const grade = toGrade(composite);
  const normalizedScore = Math.round(composite * 100);
  const gradeBasis = `최종단계 정답률 ${(answerRatio * 100).toFixed(0)}% (가중치 10%) + 체크리스트 일치율 ${(checklistRatio * 100).toFixed(0)}% (가중치 90%).`;

  return {
    checklist_results: checklist,
    ppi_score: parsed.ppi_score || { opening: 0, empathy: 0, summary: 0, closure: 0 },
    critical_omissions: parsed.critical_omissions || [],
    poor_questions: parsed.poor_questions || [],
    tags: parsed.tags || [],
    total_score: normalizedScore,
    total_grade: grade,
    grade_basis: parsed.grade_basis || gradeBasis,
    summary_feedback: parsed.summary_feedback || '',
    final_answer_evaluation: finalEval,
  };
}
