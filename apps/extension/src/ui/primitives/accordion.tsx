import { Accordion } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const AccordionRoot = Accordion.Root;

export function AccordionItem({ className, ...props }: ComponentProps<typeof Accordion.Item>) {
  return (
    <Accordion.Item
      className={cn('overflow-hidden rounded-lg border border-rule bg-surface', className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  children,
  className,
  ...props
}: ComponentProps<typeof Accordion.Trigger>) {
  return (
    <Accordion.Header>
      <Accordion.Trigger
        className={cn(
          'motion-disclosure group flex min-h-[46px] w-full items-center justify-between gap-3 px-3 py-2 text-left font-body text-xs font-[650] text-ink focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-focus',
          className,
        )}
        {...props}
      >
        {children}
        <span aria-hidden="true" className="relative size-4 shrink-0 text-muted">
          <span className="absolute left-[3px] top-[7px] h-px w-[10px] rounded-full bg-current" />
          <span className="absolute left-[7.5px] top-[3px] h-[9px] w-px origin-center rounded-full bg-current transition-transform duration-200 ease-out group-data-[state=open]:scale-y-0 motion-reduce:transition-none" />
        </span>
      </Accordion.Trigger>
    </Accordion.Header>
  );
}

export function AccordionContent({
  children,
  className,
  ...props
}: ComponentProps<typeof Accordion.Content>) {
  return (
    <Accordion.Content
      className={cn(
        'motion-accordion-content overflow-hidden border-t border-rule px-3 py-3 font-body text-xs text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </Accordion.Content>
  );
}
