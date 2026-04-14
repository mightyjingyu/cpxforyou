import { NextRequest, NextResponse } from 'next/server';
import { buildNoAttemptScore, scoreSession } from '@/lib/ai/scorer';
import { CaseSpec, Message, ScoreResult } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { conversationHistory, caseSpec } = await req.json() as {
      conversationHistory: Message[];
      caseSpec: CaseSpec;
    };

    const userTurns = conversationHistory.filter((m) => m.role === 'user');
    const meaningfulTurns = userTurns.filter((m) => m.content.trim().length >= 6);
    if (meaningfulTurns.length === 0) {
      return NextResponse.json(buildNoAttemptScore(caseSpec));
    }

    // API 키 없을 때 목업 채점
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      const mockResult: ScoreResult = generateMockScore(conversationHistory, caseSpec);
      return NextResponse.json(mockResult);
    }

    const result = await scoreSession(conversationHistory, caseSpec);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Score API error:', error);
    return NextResponse.json({ error: '채점 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

function generateMockScore(messages: Message[], caseSpec: CaseSpec): ScoreResult {
  const answerKey = caseSpec.answer_key || {
    diagnosis_ranked: [caseSpec.true_diagnosis, caseSpec.differentials?.[0] || '감별진단 A', caseSpec.differentials?.[1] || '감별진단 B'],
    management_plan: {
      tests: '1~3순위 감별을 구분할 수 있는 검사 시행 및 결과 확인 계획',
      treatment: '중증도에 맞는 초기 치료 후 검사 결과에 따라 단계적 치료 조정',
    },
    patient_education: '진단 가능성별 주의사항, 악화 경고증상, 재내원/추적 계획을 교육',
  };
  const allItems = caseSpec.checklist.flatMap((cat) =>
    cat.items.map((item) => ({ item, category: cat.category }))
  );

  const checklist_results = allItems.map((entry, i) => ({
    item: entry.item,
    category: entry.category,
    done: i % 3 !== 2,
    evidence: i % 3 !== 2 ? '대화 중 확인됨' : undefined,
  }));

  const doneCount = checklist_results.filter((r) => r.done).length;
  const totalCount = checklist_results.length;
  const checklistRatio = totalCount > 0 ? doneCount / totalCount : 0;
  const answerRatio = 0;
  const score = Math.round((checklistRatio * 0.9 + answerRatio * 0.1) * 100);

  const tags = [`#${caseSpec.clinical_presentation}`];
  const hasPPIIssue = checklist_results.some((r) => r.category === 'PPI' && !r.done);
  if (hasPPIIssue) tags.push('#PPI부족');
  if (messages.length < 5) tags.push('#질문부족');

  return {
    checklist_results,
    ppi_score: { opening: 2, empathy: 1, summary: 1, closure: 1 },
    critical_omissions: caseSpec.high_risk_omissions?.slice(0, 2).map((issue, i) => ({
      timestamp: `0${i + 3}:00`,
      issue,
      severity: 'high' as const,
    })) || [],
    poor_questions: [],
    final_answer_evaluation: {
      presumptive_diagnosis: {
        expected: `1) ${answerKey.diagnosis_ranked[0]} / 2) ${answerKey.diagnosis_ranked[1]} / 3) ${answerKey.diagnosis_ranked[2]}`,
        student_summary: '언급 없음',
        correct: false,
        reason: '목업 채점: 추정진단 논의 근거를 찾지 못했습니다.',
      },
      management_plan_tests: {
        expected: answerKey.management_plan.tests,
        student_summary: '언급 없음',
        correct: false,
        reason: '목업 채점: 향후 검사 계획 논의 근거를 찾지 못했습니다.',
      },
      management_plan_treatment: {
        expected: answerKey.management_plan.treatment,
        student_summary: '언급 없음',
        correct: false,
        reason: '목업 채점: 향후 치료 계획 논의 근거를 찾지 못했습니다.',
      },
      patient_education: {
        expected: answerKey.patient_education,
        student_summary: '언급 없음',
        correct: false,
        reason: '목업 채점: 환자교육 논의 근거를 찾지 못했습니다.',
      },
      patient_consistency: {
        consistent: true,
        reason: '목업 채점에서는 일관성 위반을 판정하지 않습니다.',
      },
    },
    tags,
    total_score: score,
    total_grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    grade_basis: `최종단계 정답률 ${(answerRatio * 100).toFixed(0)}% (10%) + 체크리스트 일치율 ${(checklistRatio * 100).toFixed(0)}% (90%) 기반 목업 등급 산정`,
    summary_feedback: `전체 ${totalCount}개 항목 중 ${doneCount}개를 수행했습니다. 핵심 병력청취 항목에 더 집중하고, 환자와의 상호작용(PPI)을 강화하세요.`,
  };
}
