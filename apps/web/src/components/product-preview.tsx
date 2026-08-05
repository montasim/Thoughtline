export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[680px] lg:translate-x-4">
      <div className="absolute -left-8 top-[16%] z-10 hidden w-44 rotate-[-7deg] rounded-xl border bg-card px-4 py-3 shadow-soft xl:block">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-proof">
          You chose this
        </p>
        <p className="mt-2 font-display text-sm font-bold leading-snug">
          Reply to Ayesha&apos;s point about thoughtful leadership
        </p>
      </div>

      <div className="relative ml-auto w-[87%] overflow-hidden rounded-[28px] border bg-[#dce4ec] p-2 shadow-soft sm:w-[80%] sm:p-3">
        <div className="flex h-9 items-center gap-2 rounded-t-[20px] bg-[#c9d4df] px-4">
          <span className="size-2.5 rounded-full bg-[#8799aa]" />
          <span className="size-2.5 rounded-full bg-[#8799aa]/70" />
          <span className="size-2.5 rounded-full bg-[#8799aa]/40" />
          <div className="mx-auto mr-[20%] h-5 w-[48%] rounded-md bg-white/65" />
        </div>
        <div className="relative min-h-[520px] overflow-hidden rounded-b-[20px] bg-[#f7f9fb] sm:min-h-[600px]">
          <div className="absolute inset-y-0 left-0 w-[45%] bg-[linear-gradient(180deg,#e8edf2_0%,#f5f7f9_100%)] p-5 sm:p-8">
            <div className="h-3 w-16 rounded bg-[#aebbc8]/60" />
            <div className="mt-7 h-4 w-[88%] rounded bg-[#8699aa]/30" />
            <div className="mt-3 h-4 w-[72%] rounded bg-[#8699aa]/25" />
            <div className="mt-8 h-24 rounded-xl border border-[#b9c6d2]/50 bg-white/60" />
            <div className="mt-4 h-24 rounded-xl border border-[#b9c6d2]/50 bg-white/60" />
          </div>
          <div className="absolute inset-y-0 right-0 w-[55%] overflow-hidden border-l bg-background">
            <img
              src="/screenshots/reply.png"
              alt="Thoughtline reply workspace showing a selected LinkedIn conversation and editable reply directions"
              className="h-full w-full object-cover object-top"
            />
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 left-0 z-10 w-[52%] rounded-2xl border border-proof/25 bg-proof-soft p-4 shadow-soft sm:-bottom-7 sm:p-5">
        <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-accent-foreground sm:text-[10px]">
          <span className="size-2 rounded-full bg-proof" /> Still your call
        </div>
        <p className="mt-2 font-display text-sm font-bold leading-snug sm:text-base">
          Edit, copy, and publish only when it sounds like you.
        </p>
      </div>
    </div>
  );
}
