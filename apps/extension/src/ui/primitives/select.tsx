import { Select } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export const SelectRoot = Select.Root;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Select.Trigger>) {
  return (
    <Select.Trigger
      className={cn(
        'motion-select-trigger flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-field bg-white px-3 py-2 font-body text-[13px] text-ink hover:border-primary focus:outline-2 focus:outline-focus',
        className,
      )}
      {...props}
    >
      {children}
      <Select.Icon>
        <ChevronDown className="size-4" />
      </Select.Icon>
    </Select.Trigger>
  );
}

export function SelectContent({ children }: { children: ReactNode }) {
  return (
    <Select.Portal>
      <Select.Content
        position="popper"
        sideOffset={4}
        collisionPadding={8}
        className="motion-popover z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-rule bg-surface p-1 shadow-xl"
      >
        <Select.Viewport className="max-h-[inherit] overflow-y-auto">{children}</Select.Viewport>
      </Select.Content>
    </Select.Portal>
  );
}

export function SelectItem({
  className,
  children,
  detail,
  ...props
}: ComponentProps<typeof Select.Item> & { detail?: string }) {
  return (
    <Select.Item
      className={cn(
        'relative flex min-h-9 select-none items-center rounded-md py-2 pl-8 pr-3 font-body text-xs text-ink outline-none data-[highlighted]:bg-tint data-[highlighted]:text-primary',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2">
        <Select.ItemIndicator>
          <Check className="size-4" />
        </Select.ItemIndicator>
      </span>
      <Select.ItemText className={detail ? 'w-full' : undefined}>
        {detail ? (
          <span className="flex w-full items-baseline justify-between gap-6">
            <span>{children}</span>
            <span className="whitespace-nowrap font-utility text-[10px] font-normal text-muted">
              {detail}
            </span>
          </span>
        ) : (
          children
        )}
      </Select.ItemText>
    </Select.Item>
  );
}
