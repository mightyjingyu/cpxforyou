import type { SessionData } from '@/types';

export interface SessionIndexDoc {
  sessionId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  clinicalPresentation: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';
  elapsedSeconds: number;
  localVersion: number;
  hasScore: boolean;
  hasMemo: boolean;
  deviceId: string;
  lastSyncedAt: number;
}

export interface SessionIndexRetryItem {
  sessionId: string;
  userId: string;
  enqueuedAt: number;
  payload: SessionIndexDoc;
}

/** 전체 세션 업로드 실패 시 재시도 큐 */
export interface CloudSessionRetryItem {
  sessionId: string;
  userId: string;
  enqueuedAt: number;
  session: SessionData;
}
