import { CaseSpec } from '@/types';
import { DirectCaseFormPayload } from '@/types/directCase';

export interface PastExam {
  id: string;
  title: string;
  systemCategory: string;
  chiefComplaint: string;
  caseSpec: CaseSpec;
  updatedAt: number;
  formPayload?: DirectCaseFormPayload;
  authorId?: string;
  isPreMade?: boolean;
}
