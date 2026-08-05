import { ThoughtlineMark } from '../components/brand';
import { Button } from '../primitives/button';
import { Card } from '../primitives/card';

const sections = [
  {
    title: 'Using Thoughtline',
    body: 'Thoughtline is a user-initiated writing assistant. You choose the content to process, review every result, and remain responsible for anything you publish or share.',
  },
  {
    title: 'AI processing',
    body: 'When you request writing, the extension sends the content needed for that request directly to Google Gemini. If the request cannot be completed, it may send the same request once to Groq as an automatic fallback. Those providers apply their own terms and data practices.',
  },
  {
    title: 'LinkedIn and public sources',
    body: 'Thoughtline is not affiliated with LinkedIn. It reads only the visible conversation you explicitly select and does not post, click, scroll, expand content, or act on your behalf. Idea research contacts only the public sources you enable.',
  },
  {
    title: 'Your data and credentials',
    body: 'Settings, profile information, learned preferences, and work history are stored in Chrome extension storage on your device. Provider credentials are encrypted before persistent storage. You can revoke consent and remove stored data from Settings.',
  },
  {
    title: 'Your responsibilities',
    body: 'Use Thoughtline only with content you are permitted to process. Review drafts for accuracy, confidentiality, intellectual-property rights, and compliance with the rules of any service where you use them.',
  },
  {
    title: 'Availability and warranty',
    body: 'Thoughtline may change, stop working, or produce incomplete or incorrect output. The project is provided under its MIT license without warranties. To the extent permitted by law, its contributors are not liable for claims or damages arising from use of the software.',
  },
] as const;

export function TermsApp() {
  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 font-body text-ink sm:px-6 sm:py-10">
      <main className="mx-auto w-full max-w-[760px]">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-rule bg-surface">
              <ThoughtlineMark className="size-7" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[18px] font-[680] leading-tight">Thoughtline</p>
              <p className="mt-1 text-[11px] text-muted">Find the thought. Shape the words.</p>
            </div>
          </div>
          <Button type="button" onClick={() => window.close()}>
            Close
          </Button>
        </header>

        <Card className="p-5 sm:p-8">
          <p className="font-utility text-[10px] font-medium uppercase tracking-[0.12em] text-proof">
            Effective July 23, 2026
          </p>
          <h1 className="mt-3 font-display text-[30px] font-[680] leading-[1.15] tracking-[-0.02em]">
            Terms of Service
          </h1>
          <p className="mt-3 max-w-[62ch] text-[13px] leading-[1.65] text-muted">
            By accepting these terms or using Thoughtline, you agree to the terms below. If you do
            not agree, do not enable AI processing or use the extension.
          </p>

          <div className="mt-7 divide-y divide-rule border-y border-rule">
            {sections.map((section) => (
              <section key={section.title} className="py-5">
                <h2 className="font-display text-[18px] font-[680] tracking-[-0.015em]">
                  {section.title}
                </h2>
                <p className="mt-2 text-[13px] leading-[1.65] text-muted">{section.body}</p>
              </section>
            ))}
          </div>

          <p className="mt-6 text-[11px] leading-relaxed text-muted">
            These terms may be updated when Thoughtline’s behavior or services change. Review the
            effective date before accepting a later version.
          </p>
        </Card>
      </main>
    </div>
  );
}
