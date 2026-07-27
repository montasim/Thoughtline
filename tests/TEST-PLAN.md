# Thoughtline test strategy

Thoughtline uses three complementary gates. A passing screenshot alone is not proof that the extension matches the prototype or works for a writer.

## 1. Approved-prototype contract

`prototypes/reference.json` identifies the only approved visual reference. Tests fail when a newer immutable `simplified-ui-vN.html` file exists without moving that pointer.

The prototype contract compares production with the approved HTML for:

- visible copy and control labels;
- shell and onboarding geometry;
- card padding, textarea height, field spacing, helper spacing, and action alignment;
- typography, navigation alignment, responsive width, scroll behavior, and accessibility; and
- stable screenshots for every main tab and important editor state.

Run it with:

```bash
pnpm test:prototype
pnpm test:visual
```

Snapshot updates require a reviewed prototype change. Do not use `--update-snapshots` to make an unexplained production change pass.

## 2. Real-writer journeys

Playwright launches the built Manifest V3 extension and interacts through roles and labels. It does not call React components directly.

| Area       | User behavior covered                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding | Consent boundary, Terms, blocked progression, every setup step, required profile fields, ready state, 320px layout, accessibility |
| Shell      | Five-tab navigation, active state, independent scroll reset, side-panel width                                                     |
| Reply      | Change direction, edit a draft, rate it, persist it, reopen it                                                                    |
| Generate   | Empty-input guidance, enter content, choose a custom goal, persist the unfinished compose state                                   |
| Ideas      | Open a sourced idea, edit and rate its post, return to results, reopen the same saved draft                                       |
| History    | Search, filter, empty results, cancel deletion, confirm deletion, clear-all confirmation                                          |
| Settings   | Change writing language and length, add writing samples, navigate away, reload, verify persistence                                |
| Safety     | Missing setup guidance, provider fallback rules, encrypted credentials, archive validation, passive LinkedIn extraction           |

Run browser journeys with:

```bash
pnpm test:journey
```

## 3. AI response quality

Schema validation only proves that a provider returned the right JSON shape. The deterministic quality rubric additionally checks:

- source grounding and forbidden invented claims;
- preservation of names, quantities, and measurable facts;
- no assistant preamble, hashtags outside the feature policy, or unsupported emoji;
- exactly 5–10 relevant hashtags in every manual and context-menu Refine result;
- response length and requested rewrite direction;
- four distinct Reply directions;
- one specific Question and a visibly qualifying Challenge; and
- readable post structure without pretending the linked article was read.

Curated cases run without network access on every commit:

```bash
pnpm test:ai
```

Live provider evaluation is an explicit release gate because it uses provider quota and can reveal model regressions:

```bash
export THOUGHTLINE_RUN_LIVE_AI_EVALS=1
export THOUGHTLINE_GEMINI_API_KEY=...
export THOUGHTLINE_GROQ_API_KEY=...
pnpm test:ai:live
```

When a live case fails, the assertion prints the generated response and the exact failed rubric checks. Never relax a rubric only to accommodate one model response; review the prompt, reference case, and product requirement first.
