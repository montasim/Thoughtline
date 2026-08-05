import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

export const DialogRoot = Dialog.Root;
export const DialogTrigger = Dialog.Trigger;

interface DialogContentProps extends ComponentProps<typeof Dialog.Content> {
  title: string;
  description?: string;
  children: ReactNode;
}

export function DialogContent({
  title,
  description,
  children,
  className,
  ...props
}: DialogContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="motion-overlay fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px]" />
      <Dialog.Content
        className={cn(
          'motion-dialog fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-24px)] w-[min(360px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-rule bg-surface shadow-2xl focus:outline-none',
          className,
        )}
        {...props}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-rule bg-surface/95 p-4 backdrop-blur">
          <div>
            <Dialog.Title className="font-display text-[17px] font-bold leading-tight text-ink">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 font-body text-[11px] leading-relaxed text-muted">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          <Dialog.Close asChild>
            <Button size="icon" aria-label="Close dialog">
              <X className="size-4" />
            </Button>
          </Dialog.Close>
        </header>
        <div className="p-4">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export const DialogClose = Dialog.Close;
