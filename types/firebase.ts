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
