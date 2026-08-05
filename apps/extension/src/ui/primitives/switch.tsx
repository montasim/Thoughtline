import { Switch } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function SwitchControl({
  className,
  size = 'default',
  ...props
}: ComponentProps<typeof Switch.Root> & { size?: 'default' | 'mini' }) {
  return (
    <Switch.Root
      className={cn(
        'motion-switch relative shrink-0 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-proof',
        size === 'mini'
          ? 'group h-7 w-8'
          : 'h-6 w-[42px] rounded-full border border-field bg-tint transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      {size === 'mini' ? (
        <>
          <span
            className="switch-mini-track pointer-events-none absolute left-1/2 top-1/2 h-[14px] w-[25px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-field bg-tint transition-colors group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary"
            aria-hidden="true"
          />
          <Switch.Thumb className="absolute left-[5px] top-1/2 size-[10px] -translate-y-1/2 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[11px]" />
        </>
      ) : (
        <Switch.Thumb className="block size-4 translate-x-[3px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[21px]" />
      )}
    </Switch.Root>
  );
}
