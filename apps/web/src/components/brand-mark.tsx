import { cn } from '#/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <img src="/brand/thoughtline-mark.svg" alt="" className={cn('rounded-[10px]', className)} />
  );
}
