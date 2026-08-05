import { Tooltip } from 'radix-ui';
import type { ReactNode } from 'react';

export function TooltipRoot({ content, children }: { content: string; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="motion-tooltip z-[70] max-w-60 rounded-md bg-ink px-2.5 py-2 font-body text-[10.5px] leading-relaxed text-white shadow-lg"
          >
            {content}
            <Tooltip.Arrow className="fill-ink" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
