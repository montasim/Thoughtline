import { Tabs } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const TabsRoot = Tabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof Tabs.List>) {
  return (
    <Tabs.List
      className={cn('grid gap-1 rounded-lg border border-rule bg-tint p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof Tabs.Trigger>) {
  return (
    <Tabs.Trigger
      className={cn(
        'motion-tab min-h-9 min-w-0 rounded-md px-2 py-1 font-body text-[10.5px] font-[650] text-muted outline-none hover:text-primary focus-visible:outline-2 focus-visible:outline-focus data-[state=active]:bg-surface data-[state=active]:text-primary data-[state=active]:shadow-[0_1px_2px_rgb(32_50_71_/_0.08)]',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = Tabs.Content;
