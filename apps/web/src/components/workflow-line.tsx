export function WorkflowLine() {
  return (
    <svg
      className="pointer-events-none absolute left-5 top-5 hidden h-[calc(100%-2.5rem)] w-[calc(100%-2.5rem)] lg:block"
      viewBox="0 0 1000 250"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path
        className="thoughtline-path"
        d="M2 4 C140 4, 220 84, 359 84 S590 12, 716 12"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
