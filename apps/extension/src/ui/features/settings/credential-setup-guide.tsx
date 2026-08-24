import { LinkSquare01Icon } from '@hugeicons/core-free-icons';
import { HugeIcon } from '../../components/huge-icon';

export function CredentialSetupGuide({
  title,
  steps,
  href,
  actionLabel,
  note,
}: {
  title: string;
  steps: readonly string[];
  href: string;
  actionLabel: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-rule bg-soft p-3 text-[10.5px] leading-relaxed text-muted">
      <div className="flex items-start justify-between gap-3">
        <strong className="text-[11px] text-ink">{title}</strong>
        <a
          className="inline-flex shrink-0 items-center gap-1 font-[650] text-proof underline underline-offset-2"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {actionLabel}
          <HugeIcon icon={LinkSquare01Icon} className="size-3" />
        </a>
      </div>
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        {steps.map((step) => (
          <li key={step} className="pl-0.5">
            {step}
          </li>
        ))}
      </ol>
      {note ? <p className="mt-2 border-t border-rule pt-2">{note}</p> : null}
    </div>
  );
}
