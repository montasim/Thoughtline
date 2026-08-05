import { AlertDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="motion-overlay fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px]" />
        <AlertDialog.Content className="motion-dialog fixed left-1/2 top-1/2 z-50 w-[min(350px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-rule bg-surface p-4 shadow-2xl">
          <AlertDialog.Title className="font-display text-[17px] font-bold text-ink">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 font-body text-[12px] leading-relaxed text-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button autoFocus>Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={() => void onConfirm()}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
