import type { HTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block font-body text-xs leading-[1.48] font-semibold text-ink', className)}
      {...props}
    />
  );
}

export function FieldGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-2', className)} {...props} />;
}
