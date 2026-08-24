import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';

import { BrandMark } from '#/components/brand-mark';
import { ProductPreview } from '#/components/product-preview';
import { Reveal } from '#/components/reveal';
import { SiteHeader } from '#/components/site-header';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion';
import { Button } from '#/components/ui/button';
import { HugeIcon } from '#/components/ui/huge-icon';
import { WorkflowLine } from '#/components/workflow-line';

export const Route = createFileRoute('/')({ component: Home });

const releaseUrl = 'https://github.com/montasim/Thoughtline/releases/latest';
const repositoryUrl = 'https://github.com/montasim/Thoughtline';

const workflow = [
  {
    label: 'Choose the context',
    title: 'Paste or right-click.',
    body: 'Paste a post, or select one visible post, comment, or reply. Thoughtline stays inside that boundary.',
    className: 'lg:pt-0',
  },
  {
    label: 'Find your angle',
    title: 'Explore four directions.',
    body: 'Add insight, ask a question, extend the idea, or respectfully challenge it.',
    className: 'lg:pt-20',
  },
  {
    label: 'Make it yours',
    title: 'Edit, copy, publish.',
    body: 'Refine every word in the side panel. Nothing is published until you do it yourself.',
    className: 'lg:pt-2',
  },
];

const faqs = [
  {
    question: 'Does Thoughtline publish for me?',
    answer:
      'No. Thoughtline prepares editable drafts. You choose what to copy, where to paste it, and whether to publish it.',
  },
  {
    question: 'Does it scan my LinkedIn feed?',
    answer:
      'No. It reads only the text you paste or the already-visible post, comment, or reply you explicitly choose from Chrome’s context menu.',
  },
  {
    question: 'What do I need to use it?',
    answer:
      'Chrome 120 or later and your own valid OpenRouter, Gemini, and Groq API keys. Thoughtline uses only curated free OpenRouter models, then eligible Gemini and Groq fallbacks after one explicit zero-cost confirmation. LinkedIn page permission is needed only for right-click workflows.',
  },
  {
    question: 'Can I restore my setup after reinstalling?',
    answer:
      'Yes. Export a configuration JSON from Settings, then import it during onboarding or later in Settings. API keys and other secrets stay out by default; including them is an explicit choice and produces a readable file that must be stored securely.',
  },
  {
    question: 'Is it open source?',
    answer:
      'Yes. Thoughtline is available on GitHub under the MIT License, so you can inspect the code and product boundaries yourself.',
  },
];

function Home() {
  return (
    <>
      <SiteHeader />
      <main id="top">
        <section className="page-shell grid min-h-[100dvh] items-center gap-12 pb-16 pt-28 lg:grid-cols-[0.88fr_1.12fr] lg:gap-10 lg:pb-20 lg:pt-24">
          <div className="relative z-10 max-w-[620px] lg:pr-4">
            <div className="eyebrow mb-6 flex items-center gap-3">
              <span className="h-px w-8 bg-brand" /> Chrome side-panel extension
            </div>
            <h1 className="font-display text-[clamp(3.3rem,7.2vw,6.7rem)] font-bold leading-[0.9] tracking-[-0.055em] text-foreground">
              Find the thought.
              <span className="block pb-1 font-normal italic leading-[1.1] text-brand">
                Shape the words.
              </span>
            </h1>
            <p className="mt-7 max-w-[520px] text-base leading-7 text-muted-foreground sm:text-lg">
              Understand the conversation, explore four reply directions, and write in your own
              voice while keeping control.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <a href={releaseUrl} target="_blank" rel="noreferrer">
                  Get for Chrome <HugeIcon icon={ArrowUpRight01Icon} />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="#how-it-works">
                  See how it works <HugeIcon icon={ArrowDown01Icon} />
                </a>
              </Button>
            </div>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Chrome 120+ · Free and open source · Manual publishing only
            </p>
          </div>

          <ProductPreview />
        </section>

        <section className="border-y border-brand-strong bg-brand-strong py-5 text-white">
          <div className="page-shell grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-white/20">
            {['No auto-posting', 'No feed scanning', 'No hidden content'].map((boundary, index) => (
              <p
                key={boundary}
                className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] ${index === 0 ? 'sm:pr-6' : index === 1 ? 'sm:px-6' : 'sm:pl-6'}`}
              >
                <HugeIcon icon={Tick02Icon} className="size-3 text-[#9ed0ca]" /> {boundary}
              </p>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="page-shell scroll-mt-20 py-24 sm:py-32">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">One conversation at a time</p>
            <h2 className="mt-4 max-w-[620px] font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
              A clear path from context to your words.
            </h2>
            <p className="mt-6 max-w-[610px] text-base leading-7 text-muted-foreground sm:text-lg">
              Thoughtline starts only when you ask. It reads the visible conversation you selected,
              gives you useful directions, then gets out of the way.
            </p>
          </Reveal>

          <div className="relative mt-20">
            <WorkflowLine />
            <ol className="relative grid gap-12 lg:grid-cols-3 lg:gap-10">
              {workflow.map((step, index) => (
                <li key={step.label} className={step.className}>
                  <div className="mb-8 grid size-11 place-items-center rounded-full border-4 border-background bg-proof font-mono text-xs font-bold text-white shadow-[0_0_0_1px_#397773]">
                    {index + 1}
                  </div>
                  <p className="eyebrow !text-proof">{step.label}</p>
                  <h3 className="mt-3 font-display text-2xl font-bold tracking-[-0.02em]">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-[330px] leading-7 text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-y bg-card">
          <div className="page-shell py-24 sm:py-32">
            <Reveal className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
              <div className="relative mx-auto w-full max-w-[560px]">
                <div className="absolute -inset-4 -rotate-2 rounded-[28px] border border-brand/10 bg-brand-soft/50" />
                <div className="relative grid grid-cols-2 gap-3 overflow-hidden rounded-[24px] border bg-background p-3 shadow-soft">
                  <img
                    src="/screenshots/ideas.png"
                    alt="Thoughtline source-backed idea research view"
                    className="w-full rounded-[14px] border object-cover object-top"
                  />
                  <img
                    src="/screenshots/settings.png"
                    alt="Thoughtline settings for writing language, tone, and profile"
                    className="mt-14 w-full rounded-[14px] border object-cover object-top"
                  />
                </div>
              </div>

              <div>
                <p className="eyebrow">More than replies</p>
                <h2 className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                  Build a writing practice, not a content machine.
                </h2>
                <div className="mt-10 divide-y border-y">
                  <Feature title="Refine rough writing">
                    Paste a draft or reshape a selected post through your confirmed perspective and
                    voice.
                  </Feature>
                  <Feature title="Reply from pasted text">
                    Paste a LinkedIn post and explore the same four editable directions without
                    opening the context menu.
                  </Feature>
                  <Feature title="Keep the AI route visible">
                    Choose curated free models, fall back from OpenRouter to Gemini and Groq, and
                    see which provider and model produced each draft.
                  </Feature>
                  <Feature title="Research source-backed ideas">
                    Find promising ideas across public sources, with a link back to every original
                    item.
                  </Feature>
                  <Feature title="Choose the hashtag finish">
                    Set 0–10 generated hashtags and save custom tags that follow every generated or
                    refined post.
                  </Feature>
                  <Feature title="Carry your setup forward">
                    Export one validated configuration file and restore it during onboarding or in
                    Settings, with secrets included only when you choose.
                  </Feature>
                  <Feature title="Keep useful work close">
                    Search, edit, revise, and export local history without turning your work into
                    telemetry.
                  </Feature>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="page-shell py-24 sm:py-32">
          <Reveal className="grid gap-8 border-t pt-8 lg:grid-cols-[0.65fr_1.35fr] lg:gap-20">
            <p className="eyebrow">Made for your voice</p>
            <div>
              <blockquote className="max-w-[900px] font-display text-[clamp(2.2rem,5vw,4.6rem)] font-bold leading-[1.05] tracking-[-0.04em]">
                “Useful AI should leave you sounding{' '}
                <span className="pb-1 font-normal italic leading-[1.1] text-brand">
                  more like yourself,
                </span>{' '}
                not less.”
              </blockquote>
              <div className="mt-12 grid gap-8 sm:grid-cols-3">
                <VoicePoint title="Your language">
                  English, Bangla, or naturally matched to the source.
                </VoicePoint>
                <VoicePoint title="Your guidance">
                  Tone, topics, audience, examples, and an editable style guide.
                </VoicePoint>
                <VoicePoint title="Your approval">
                  Every draft remains editable and every publish action remains yours.
                </VoicePoint>
              </div>
            </div>
          </Reveal>
        </section>

        <section id="privacy" className="scroll-mt-20 bg-ink-deep text-white">
          <div className="page-shell grid gap-14 py-24 sm:py-32 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
            <Reveal>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8dc6c0]">
                Boundaries are a feature
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                Private by design. Limited on purpose.
              </h2>
              <p className="mt-6 max-w-[500px] text-base leading-7 text-[#bdcad7]">
                Thoughtline is intentionally not a bot. It analyzes only what you explicitly select
                and keeps you in control of every outcome.
              </p>
              <a
                href={`${repositoryUrl}/blob/main/PRIVACY.md`}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center font-semibold underline decoration-[#8dc6c0] decoration-2 underline-offset-8 hover:text-[#dff5f2]"
              >
                Read the privacy policy <HugeIcon icon={ArrowRight01Icon} className="ml-2 size-4" />
              </a>
            </Reveal>

            <Reveal>
              <dl className="divide-y divide-white/15 border-y border-white/15">
                <Boundary term="LinkedIn access">
                  No scrolling, clicking, hidden-content expansion, or background feed scanning.
                </Boundary>
                <Boundary term="Your content">
                  Only the bounded, visible context you choose is prepared for an AI request.
                </Boundary>
                <Boundary term="Your history">
                  Work history stays in Chrome’s local extension storage. Export writing data or a
                  complete setup, import it again, or clear it yourself.
                </Boundary>
                <Boundary term="Publishing">
                  Thoughtline never posts, comments, or messages on your behalf.
                </Boundary>
              </dl>
            </Reveal>
          </div>
        </section>

        <section className="page-shell py-24 sm:py-32">
          <Reveal className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="eyebrow">Install in a few minutes</p>
              <h2 className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
                Ready when your next conversation is.
              </h2>
              <p className="mt-6 max-w-[480px] leading-7 text-muted-foreground">
                Thoughtline is currently distributed as a verified GitHub release for Chrome 120 and
                later.
              </p>
              <Button asChild className="mt-8">
                <a href={releaseUrl} target="_blank" rel="noreferrer">
                  Download latest release <HugeIcon icon={ArrowUpRight01Icon} />
                </a>
              </Button>
            </div>
            <ol className="divide-y border-y">
              <InstallStep number="01" title="Download and extract">
                Get the Chrome ZIP from the latest GitHub release and extract it to a stable folder.
              </InstallStep>
              <InstallStep number="02" title="Load into Chrome">
                Open <code className="font-mono text-sm">chrome://extensions</code>, enable
                Developer mode, and choose Load unpacked.
              </InstallStep>
              <InstallStep number="03" title="Complete private setup">
                Import an existing configuration or follow direct provider guides, review
                permissions, and describe the voice you want to keep.
              </InstallStep>
            </ol>
          </Reveal>
        </section>

        <section className="border-t bg-card">
          <div className="page-shell py-24 sm:py-28">
            <div className="mx-auto max-w-[850px]">
              <Reveal className="text-center">
                <p className="eyebrow">Questions, answered</p>
                <h2 className="mt-4 font-display text-4xl font-bold tracking-[-0.035em] sm:text-5xl">
                  Before you add it to Chrome.
                </h2>
              </Reveal>
              <Accordion type="single" collapsible className="mt-14">
                {faqs.map((faq) => (
                  <AccordionItem key={faq.question} value={faq.question}>
                    <AccordionTrigger>{faq.question}</AccordionTrigger>
                    <AccordionContent>{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        <section className="page-shell py-24 sm:py-32">
          <Reveal className="relative overflow-hidden rounded-[28px] bg-brand-strong px-6 py-16 text-white sm:px-12 sm:py-20 lg:px-20">
            <div className="absolute -right-20 -top-40 size-[420px] rounded-full border border-white/10" />
            <div className="absolute -right-8 -top-20 size-[260px] rounded-full border border-white/10" />
            <div className="relative grid items-end gap-10 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a9d2ce]">
                  Your thought. Your voice. Your call.
                </p>
                <h2 className="mt-5 max-w-[750px] font-display text-4xl font-bold leading-[1] tracking-[-0.04em] sm:text-6xl">
                  Join the conversation without losing yourself in it.
                </h2>
              </div>
              <Button
                asChild
                variant="outline"
                className="border-white bg-white text-brand-strong hover:bg-[#eaf3f2]"
              >
                <a href={releaseUrl} target="_blank" rel="noreferrer">
                  Get for Chrome <HugeIcon icon={ArrowUpRight01Icon} />
                </a>
              </Button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t">
        <div className="page-shell flex flex-col gap-8 py-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <a href="#top" className="flex items-center gap-3">
              <BrandMark className="size-9" />
              <span className="font-display text-xl font-bold">Thoughtline</span>
            </a>
            <p className="mt-3 text-sm text-muted-foreground">Find the thought. Shape the words.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-muted-foreground">
            <FooterLink href={repositoryUrl}>GitHub</FooterLink>
            <FooterLink href={`${repositoryUrl}/blob/main/PRIVACY.md`}>Privacy</FooterLink>
            <FooterLink href={`${repositoryUrl}/blob/main/SECURITY.md`}>Security</FooterLink>
            <FooterLink href={`${repositoryUrl}/blob/main/LICENSE`}>MIT License</FooterLink>
          </div>
        </div>
      </footer>
    </>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-6">
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 leading-7 text-muted-foreground">{children}</p>
    </div>
  );
}

function VoicePoint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-proof pl-5">
      <p className="font-display text-lg font-bold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

function Boundary({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 py-6 sm:grid-cols-[150px_1fr]">
      <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#8dc6c0]">{term}</dt>
      <dd className="leading-7 text-[#dce5ec]">{children}</dd>
    </div>
  );
}

function InstallStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[42px_1fr] gap-4 py-6">
      <span className="font-mono text-xs font-semibold text-proof">{number}</span>
      <div>
        <h3 className="font-display text-xl font-bold">{title}</h3>
        <p className="mt-2 leading-7 text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="hover:text-foreground">
      {children}
    </a>
  );
}
