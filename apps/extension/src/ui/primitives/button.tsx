import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'ui-action inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 font-body text-xs font-[650] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:border-field disabled:bg-tint disabled:text-muted',
  {
    variants: {
      variant: {
        primary: 'border-primary bg-primary text-white hover:bg-primary-strong',
        secondary: 'border-field bg-surface text-primary hover:border-primary',
        ghost: 'border-transparent bg-transparent text-primary hover:bg-tint',
        danger:
          'border-field bg-surface text-muted hover:border-[#d8b8b6] hover:bg-danger-bg hover:text-danger',
      },
      size: {
        default: 'min-h-10',
        compact: 'min-h-[34px] px-2.5 py-1.5',
        icon: 'size-[34px] min-h-[34px] shrink-0 rounded-[7px] p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
