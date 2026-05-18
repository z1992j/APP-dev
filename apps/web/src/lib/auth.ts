'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Api, clearAuth, loadAuth, saveAuth, type AuthState } from './api';

export function useAuth(redirectIfMissing = true): AuthState | null {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const a = loadAuth();
    if (a) {
      setAuth(a);
    } else if (redirectIfMissing && pathname !== '/login') {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [redirectIfMissing, pathname, router]);

  return auth;
}

export async function devLogin(handle = 'web-tester'): Promise<AuthState> {
  const res = await Api.wxLogin(`dev-${handle}-${Date.now().toString(36)}`);
  saveAuth(res);
  return res;
}

export function signOut(): void {
  clearAuth();
}
