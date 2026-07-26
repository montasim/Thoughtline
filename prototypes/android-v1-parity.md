# Android v1 ↔ Chrome v5 functional parity

This matrix treats `simplified-ui-v5.html` as the functional contract and
`android-v1.html` as its Android adaptation.

## Parity matrix

| v5 area | Android v1 parity |
| --- | --- |
| Four-step onboarding | Boundaries, Connections, About you, and Ready are interactive mobile steps. |
| AI consent and Terms | Consent is explicit in onboarding and revocable in Help & support. |
| LinkedIn intake | Android Share target replaces Chrome right-click extraction; the exact incoming source packet is reviewed before use. |
| Provider setup | Gemini primary and one Groq fallback, encrypted-key messaging, key reveal, removal, validation, and connection status are represented. |
| Writing profile import | Own-profile confirmation, Android document picker, editable suggestions, raw-PDF discard messaging, required profile fields, and clear-profile confirmation are represented. |
| Reply states | Ready, setup incomplete, analyzing, no usable source, invalid API key, both providers unavailable, backup-provider recovery, and four-reply success are reachable from More options. |
| Reply result | Bilingual summary, review warning, Insight/Question/Extend/Challenge drafts, editing, positive/negative feedback, regeneration, copy, source link, and reasoning are represented. |
| Generate | Source validation, four rewrite goals, saved-profile note, editable result, positive/negative feedback, regeneration, copy, source editing, and original-content disclosure are represented. |
| Ideas search | Searching state, results, new search, source-native evidence, positive/negative ratings, source links, and post creation are represented. |
| Schedule preview | Enabled state, hourly/daily/weekly/monthly frequency, weekday, day of month, time, email notification, email address, validation outcome, and preview-only disclosure are represented. |
| Sourced post | Bilingual summary, editable post, positive/negative feedback, regeneration, copy, source evidence, and writing direction are represented. |
| Experience fallback | Weak-source fallback, lesson input, search-again and adjust-topics actions, editable experience post, feedback, regeneration, copy, and source/direction disclosure are represented. |
| History tools | Search, Reply/Rewrite/Idea filters, empty state, Clear All, and destructive confirmation are represented. |
| Reply History | Source metadata, bilingual summary, review warning, four saved directions, feedback state, source/reasoning, revisions, copy, restore, and confirmed deletion are represented. |
| Rewrite History | Goal, original content, saved rewrite, feedback state, revisions, copy, restore, and confirmed deletion are represented. |
| Idea History | Original source evidence, caution, source link, bilingual summary, saved post, feedback state, source/direction, revisions, copy, restore, and confirmed deletion are represented. |
| History storage | Retention options and pruning warning plus separate import/export archive reviews are represented. |
| Writing preferences | Separate reply/post lengths, Match source/English/Bangla, emoji, and hashtag controls are represented. |
| Ideas settings | Public-source master switch, topics, all five per-source controls, and Restore defaults are represented. |
| Tone & voice | Six tone choices, custom instructions, writing samples, editable style guide, proposed style review, learned-preference evidence, review/apply, and reset are represented. |
| Privacy and support | AI permission, privacy boundaries, diagnostics, Terms, and project support are represented. |
| Destructive reviews | Clear History, delete item, clear profile, remove key, reset preferences, and stricter-retention confirmations are represented. |

## Platform-specific substitution

Chrome v5 includes layout calibration because a browser extension must recognize LinkedIn DOM
boundaries. A standalone Android app cannot read LinkedIn's private in-app DOM, so copying that
calibration workflow would be non-functional and misleading.

Android v1 provides the equivalent control at its actual boundary:

1. Android passes only content the user explicitly shares.
2. Thoughtline shows the exact incoming text and link as a shared-source packet.
3. The user may add copied visible discussion context.
4. No AI request starts until the packet is reviewed.

The Shared-source capture section in Settings documents and previews this Android-native boundary.
