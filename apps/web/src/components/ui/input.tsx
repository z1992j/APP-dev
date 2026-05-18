import { cn } from '@/lib/utils';
import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-lg bg-ink-100/60 px-3 text-sm text-ink-900 placeholder:text-ink-500',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg bg-ink-100/60 p-3 text-sm text-ink-900 placeholder:text-ink-500',
        'focus:outline-none focus:ring-2 focus:ring-brand-500/30 leading-6',
        className,
      )}
      {...rest}
    />
  );
});
