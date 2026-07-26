# Thoughtline UI prototypes

Prototype files are immutable visual snapshots. Never edit an approved version in place. Any future UI change creates the next sequential `simplified-ui-vN.html` file and adds a changelog entry here.

`reference.json` is the machine-readable approval pointer used by automated UI tests. When a new prototype is approved, add the immutable HTML file, update this changelog, and move `reference.json` to that version in the same change. Tests fail if a newer version exists without an updated pointer.

## Versions

### Original baseline

`simplified-ui-original.html` preserves the approved prototype produced during the initial UI iteration.

### Version 2

`simplified-ui-v2.html` preserves the original visual system while visualizing decisions from the specification review:

- single explicit AI-processing consent with a separate non-automation safety note;
- provider-neutral Gemini-primary and automatic-Groq-fallback messaging;
- corrected context-menu and passive-extraction copy;
- required writing-profile fields and reviewed profile suggestions;
- Rewrite History filtering and records, revision disclosures, and confirmed deletion;
- Data Archive import/export, confirmed retention and Clear All surfaces;
- profile and credential removal controls;
- reviewed Style Guide and Learned Writing Preferences surfaces;
- an experience-based Idea post editor; and
- a non-persistent Schedule Preview result.

### Version 3

`simplified-ui-v3.html` keeps every Version 2 screen and interaction unchanged while updating the five-item bottom navigation to use the same visual treatment as the English/বাংলা tabs: a pale blue tab rail, white active surface, blue active label, and subtle one-pixel shadow. Touch-target dimensions and responsive behavior remain unchanged.

### Version 4

`simplified-ui-v4.html` keeps the Version 3 pale-blue navigation rail, restores the original solid blue selected tab with white text, and explicitly fixes the navigation to five equal `minmax(0, 1fr)` columns. The rail uses the same left content inset and reserves the scroll track on the right, keeping both edges aligned with the page cards at every supported panel width. Each equal tab control remains centered with a two-pixel inset on both sides.

### Version 5

`simplified-ui-v5.html` keeps the Version 4 side-panel visual system, moves the live onboarding progress (`Step 1 of 4` through `Step 4 of 4`) into the setup header’s right-side status position, and links AI-processing consent to a dedicated Terms of Service page. The redundant `Extension-local` status, duplicate progress label, and separate LinkedIn safety-assurance card are removed.

Version 5 now also documents the approved guarded LinkedIn layout-calibration workflow:

- exact bounded DOM evidence review before an AI request;
- a complete author, primary-text, and boundary confirmation preview;
- local two-example validation before a recipe can be saved;
- a one-item-only result when only one matching example is visible;
- a teal evidence-bracket visual that mirrors the temporary LinkedIn outline; and
- device-local calibrated-layout inspection, removal, and reset controls in Settings.

### Version 6

`simplified-ui-v6.html` preserves every Version 5 screen and interaction while renaming the
extension’s **Generate** tab to **Refine**. The normal Refine view reshapes content pasted by the
user. The same tab also receives the new LinkedIn context-menu action **Refine the post to make your
own**.

The automatic source workflow is not shown during ordinary Refine-tab navigation. It appears only
after the person invokes the Chrome context-menu action on a rendered LinkedIn post. That workflow:

- captures only the exact rendered post inside the confirmed LinkedIn boundary;
- requires a source review before AI processing;
- shows the saved profile, confirmed experience perspective, tone, style guide, and learned
  preferences used as the writing lens;
- creates an editable, source-inspired post with a distinct personal perspective;
- retains the original source link by default and checks for close phrasing or unsupported personal
  claims;
- records source provenance, grounding, edits, feedback, and revisions in History; and
- adds Settings controls for the context-menu action, attribution default, and experience-claim
  confirmation.

Version 6 is the approved Chrome extension contract. `reference.json` points to this immutable
reference and the production extension implements its Refine workflow.

The production extension follows the highest prototype version explicitly approved by the user.

## Platform explorations

### Android Version 1

`android-v1.html` is an interactive Android product prototype. It carries the five extension
workspaces—Reply, Generate, Ideas, History, and Settings—into a 412 × 892 reference device and
adds a first-time setup walkthrough.

The Android prototype replaces Chrome’s LinkedIn context-menu extraction with an explicit Android
Share-sheet handoff and a reviewable shared-source packet. Optional visible discussion context must
be pasted by the user because an Android app cannot read LinkedIn’s private in-app DOM. The
prototype retains manual publishing, editable drafts, provider fallback, source-native research,
local history, writing-profile controls, data archives, reviewable learning, and schedule-preview
surfaces.

The screen-by-screen v5 comparison is recorded in
[`android-v1-parity.md`](android-v1-parity.md).

This exploration does not change `reference.json`, which continues to identify the approved Version
6 Chrome extension UI contract.

## Direct preview links

The prototype supports optional query parameters for visual review without changing product behavior:

- `?scene=settings`
- `?scene=history`
- `?scene=reply&replyState=loading`
- `?scene=ideas&ideaState=experience`
- `?scene=settings&dialog=style-guide-dialog`
- `?scene=calibration&calibrationState=evidence`
- `?scene=calibration&calibrationState=preview`
- `?scene=calibration&calibrationState=success`
- `simplified-ui-v6.html?scene=refine&refineState=manual`
- `simplified-ui-v6.html?scene=refine&refineState=menu`
- `simplified-ui-v6.html?scene=refine&refineState=review`
- `simplified-ui-v6.html?scene=refine&refineState=loading`
- `simplified-ui-v6.html?scene=refine&refineState=success`
- `simplified-ui-v6.html?scene=refine&refineState=setup`
- `simplified-ui-v6.html?scene=refine&refineState=no-post`
- `android-v1.html?screen=reply`
- `android-v1.html?screen=generate`
- `android-v1.html?screen=idea`
- `android-v1.html?screen=history`
- `android-v1.html?screen=settings`
- `android-v1.html?screen=setup`

The prototype's visible screen controls remain the primary way to move through states.
