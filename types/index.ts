export interface Vitals {
  bp: string;
  hr: number;
  rr: number;
  temp: number;
}

export interface PatientHistory {
  hpi: string;
  past_medical: string;
  medications: string;
  allergies: string;
  family: string;
  social: {
    smoking: string;
    alcohol: string;
    occupation?: string;
    last_menstrual?: string;
  };
}

export interface SymptomDetails {
  onset: string;
  character: string;
  severity?: string;
  location?: string;
  location_change?: string;
  progression?: string;
  duration: string;
  aggravating: string;
  relieving: string;
  associated: string;
  denied: string;
  radiation?: string;
}

export interface ChecklistCategory {
  category: string;
  items: string[];
}

export interface AmbiguityConstraints {
  must_span_multiple_differentials: boolean;
  min_differentials_in_first_3_turns: number;
  forbid_early_pathognomonic_reveal: boolean;
  forbid_single_diagnosis_lock_in_before_turn: number;
}

export interface AnswerKey {
  diagnosis_ranked: [string, string, string];
  management_plan: {
    tests: string;
    treatment: string;
  };
  patient_education: string;
}

export interface CaseSpec {
  case_id: string;
  clinical_presentation: string;
  difficulty: 'easy' | 'normal' | 'hard';
  true_diagnosis: string;
  differentials: string[];
  opening_line: string;
  ambiguity_constraints: AmbiguityConstraints;
  patient: {
    name: string;
    age: number;
    gender: string;
    occupation: string;
    education?: string;
  };
  vitals: Vitals;
  history: PatientHistory;
  symptom_details: SymptomDetails;
  personality: string;
  patient_concern: string;
  physical_exam_findings: string;
  checklist: ChecklistCategory[];
  answer_key: AnswerKey;
  high_risk_omissions?: string[];
  ai_deception_strategy?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'patient';
  content: string;
  timestamp: number;
  isHighlighted?: boolean;
  highlightType?: 'critical' | 'warning' | 'info';
  feedback?: string;
}

export interface ChecklistResult {
  item: string;
  category: string;
  done: boolean;
  evidence?: string;
}

export interface PPIScore {
  opening: number;
  empathy: number;
  summary: number;
  closure: number;
}

export interface CriticalOmission {
  timestamp: string;
  issue: string;
  severity: 'high' | 'medium' | 'low';
}

export interface PoorQuestion {
  timestamp: string;
  quote: string;
  feedback: string;
}

export interface FinalAnswerEvaluationItem {
  expected: string;
  student_summary: string;
  correct: boolean;
  reason: string;
}

export interface FinalAnswerEvaluation {
  presumptive_diagnosis: FinalAnswerEvaluationItem;
  management_plan_tests: FinalAnswerEvaluationItem;
  management_plan_treatment: FinalAnswerEvaluationItem;
  patient_education: FinalAnswerEvaluationItem;
  patient_consistency: {
    consistent: boolean;
    reason: string;
  };
}

export interface ScoreResult {
  checklist_results: ChecklistResult[];
  ppi_score: PPIScore;
  critical_omissions: CriticalOmission[];
  poor_questions: PoorQuestion[];
  tags: string[];
  total_score: number;
  total_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  grade_basis: string;
  summary_feedback: string;
  final_answer_evaluation: FinalAnswerEvaluation;
}

/** 병력청취 / 신체진찰 / 교육(설명·마무리) 구간 소요 시간(초) */
export interface SessionPhaseDurations {
  historyTakingSeconds: number;
  physicalExamSeconds: number;
  educationSeconds: number;
}

export type TimerMode = 'countdown' | 'countup';

export interface SessionData {
  id: string;
  caseSpec: CaseSpec;
  conversationHistory: Message[];
  memoContent: string;
  startTime: number;
  endTime?: number;
  elapsedSeconds: number;
  scoreResult?: ScoreResult;
  physicalExamDone: boolean;
  timerMode?: TimerMode;
  phaseDurations?: SessionPhaseDurations;
}

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Friendliness = 'cooperative' | 'normal' | 'uncooperative';
