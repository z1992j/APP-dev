'use client';

import { create } from 'zustand';
import { useEffect } from 'react';

interface Toast {
  id: number;
  msg: string;
  variant: 'success' | 'error' | 'info';
}

interface State {
  toasts: Toast[];
  push: (msg: string, variant?: Toast['variant']) => void;
  pop: (id: number) => void;
}

const useStore = create<State>((set) => ({
  toasts: [],
  push: (msg, variant = 'info') => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, msg, variant }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },
  pop: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(msg: string, variant?: Toast['variant']) {
  useStore.getState().push(msg, variant);
}

export function ToastViewport() {
  const toasts = useStore((s) => s.toasts);
  const pop = useStore((s) => s.pop);
  useEffect(() => {}, [toasts]);
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => pop(t.id)}
          className={
            'rounded-lg px-4 py-2 text-sm text-white shadow-lg cursor-pointer ' +
            (t.variant === 'success'
              ? 'bg-accent-green'
              : t.variant === 'error'
              ? 'bg-accent-red'
              : 'bg-ink-900')
          }
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
