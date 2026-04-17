'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { signInWithGoogle, signOutGoogle, subscribeAuthState } from '@/lib/firebase/auth';
import { useSessionStore } from '@/store/sessionStore';

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
  const flushSessionIndexSyncQueue = useSessionStore((s) => s.flushSessionIndexSyncQueue);

  useEffect(() => {
    const unsub = subscribeAuthState((nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    void flushSessionIndexSyncQueue();
  }, [user, flushSessionIndexSyncQueue]);

  useEffect(() => {
    if (authLoading) return;
    // 계정 전환 시 zustand persist를 현재 uid 스코프로 다시 hydrate한다.
    void useSessionStore.persist.rehydrate();
  }, [authLoading, user?.uid]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authLoading,
      loginWithGoogle: async () => {
        await signInWithGoogle();
      },
      logout: async () => {
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
