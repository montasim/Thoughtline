import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'min-h-10 w-full rounded-lg border border-field bg-white px-3 py-2 font-body text-[13px] text-ink placeholder:text-muted hover:border-primary focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-focus disabled:bg-soft disabled:text-muted',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
