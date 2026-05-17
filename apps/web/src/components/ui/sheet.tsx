'use client';

import { cn } from '@/lib/utils';
import { ReactNode, useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: 'right' | 'bottom';
  widthClass?: string;
  className?: string;
  children?: ReactNode;
}

export function Sheet({ open, onClose, title, side = 'right', widthClass = 'w-[420px]', className, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sideClasses =
    side === 'right'
      ? `right-0 top-0 h-full ${widthClass}`
      : 'left-0 right-0 bottom-0 max-h-[80vh] w-full rounded-t-2xl';

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className={cn('absolute bg-bg-card shadow-2xl flex flex-col', sideClasses, className)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div className="font-semibold">{title}</div>
            <button onClick={onClose} className="text-ink-500 text-xl leading-none">
              ×
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
