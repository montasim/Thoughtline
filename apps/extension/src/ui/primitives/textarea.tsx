import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full resize-y rounded-lg border border-field bg-white px-3 py-2 font-body text-[13px] leading-[1.62] text-ink placeholder:text-muted hover:border-primary focus:border-primary focus:outline-2 focus:outline-offset-0 focus:outline-focus disabled:bg-soft disabled:text-muted',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
