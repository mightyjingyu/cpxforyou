'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { signInWithGoogle, signOutGoogle, subscribeAuthState } from '@/lib/firebase/auth';
import {
  flushDraftMemoToCloud,
  syncSessionWithAuthScope,
  useSessionStore,
} from '@/store/sessionStore';

type AuthContextValue = {
  user: User | null;
  authLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const flushCloudSessionSyncQueue = useSessionStore((s) => s.flushCloudSessionSyncQueue);

  useEffect(() => {
    const unsub = subscribeAuthState((nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    void flushCloudSessionSyncQueue();
  }, [user, flushCloudSessionSyncQueue]);

  useEffect(() => {
    if (authLoading) return;
    syncSessionWithAuthScope(user?.uid ?? null);
  }, [authLoading, user?.uid]);

  /** 탭 종료·백그라운드 전환 직전 메모를 Firestore에 남김 (디바운스 미완료 대비) */
  useEffect(() => {
    const flush = () => {
      void flushDraftMemoToCloud();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authLoading,
      loginWithGoogle: async () => {
        await signInWithGoogle();
      },
      logout: async () => {
        await flushDraftMemoToCloud();
        await signOutGoogle();
      },
    }),
    [authLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth는 AuthProvider 내부에서 사용해야 합니다.');
  }
  return ctx;
}
