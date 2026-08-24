# Thoughtline

Thoughtline is a user-controlled Chrome extension for understanding LinkedIn conversations and preparing writing that the user reviews, edits, copies, and publishes manually.

## Language

**Thoughtline**:
The product that turns a user-chosen LinkedIn conversation or source into editable reply drafts, rewrites, and original post ideas without publishing on the user's behalf.
_Avoid_: Comment bot, engagement bot, auto-poster

**Post Context**:
The human-visible data already rendered inside one user-selected LinkedIn post’s DOM, including names, text, aggregate engagement metadata, link-preview text, its Visible Discussion, and the Response Target. It excludes unrelated posts, hidden or unloaded content, browser/session data, media bytes, and external page contents.
_Avoid_: Feed data, scraped page, all LinkedIn content

**Untrusted Content Envelope**:
A provider-bound, Zod-validated JSON value containing only allowlisted, normalized, bounded content from a Post Context, Calibration Evidence, Source Evidence, Profile Import, pasted draft, writing sample, or user-supplied lesson, explicitly separated from trusted system instructions. It never contains raw DOM objects or executable HTML, executable content, hidden elements, credentials, or browser/session data.
_Avoid_: User prompt, trusted instruction, raw webpage

**Response Target**:
The post, comment, or reply inside the selected Post Context that the user intends to answer.
_Avoid_: Selected text, scraped element

**Visible Discussion**:
The comments and replies already rendered inside the selected Post Context when extraction occurs. For a post target it includes every visible thread; for a comment or reply target it includes only that visible thread, and it never includes unrelated, collapsed, paginated, hidden, or separately fetched content.
_Avoid_: All comments, complete discussion

**Discussion Item**:
One visible comment or reply within a Visible Discussion. Comment and reply items share one calibratable boundary shape; whether an item is a reply is inferred from its relationship to a visible parent rather than trained as a separate layout kind.
_Avoid_: Comment selector, reply layout, complete thread

**Passive Post Extraction**:
The read-only collection of one Post Context after an explicit right-click action, without scrolling, clicking, expanding content, making LinkedIn requests, modifying the page, or publishing anything.
_Avoid_: Feed scan, background scraping, LinkedIn automation

**Layout Calibration**:
A device-local, user-confirmed description of how Thoughtline can recognize visible LinkedIn post or comment boundaries when its built-in semantic extraction rules no longer match. Persistence requires validation against at least two independent visible examples; one confirmed example may repair only the current extraction. It contains structural signals rather than LinkedIn content, is never uploaded or shared across installations, and never initiates an Analysis Request.
_Avoid_: Model training, provider training, shared selector, saved LinkedIn content

**AI-Assisted Layout Calibration**:
An explicit Foreground AI Job that sends user-approved Calibration Evidence through the configured OpenRouter → Gemini → Groq route to propose a Calibrated Layout Recipe. The proposal remains device-local and cannot persist until it passes the same local multi-example validation and Calibration Preview as deterministic Layout Calibration.
_Avoid_: Model training, automatic calibration, uploaded recipe, AI-approved selector

**Calibration Evidence**:
A transient, strictly bounded text representation of the visible DOM neighborhood around the user-selected calibration target, including candidate ancestors, a small number of comparable visible siblings, and trusted local geometry. It may contain raw values needed for AI-Assisted Layout Calibration but is never persisted and excludes screenshots, the rest of the page, editable or hidden content, executable content, browser/session data, extension state, and credentials.
_Avoid_: Page DOM, HTML dump, feed capture, Post Context

**Calibration Evidence Review**:
The mandatory per-request inspection of the exact Calibration Evidence proposed for the configured OpenRouter → Gemini → Groq route, including its outlined scope, provider path, and size. One explicit confirmation authorizes the selected free OpenRouter model and eligible later-stage fallbacks with identical evidence; nothing is sent before confirmation.
_Avoid_: Onboarding consent, Calibration Preview, automatic provider request

**Calibration Proposal**:
A versioned, strictly validated declarative result returned by an AI provider for local compilation into a candidate Calibrated Layout Recipe. It is untrusted data, contains no executable code or unrestricted selector, and cannot persist or extract content until local validation and Calibration Preview succeed.
_Avoid_: Generated script, AI selector, executable rule, confirmed calibration

**Calibrated Layout Recipe**:
One bounded, user-inspectable and individually removable multi-signal structural rule within Layout Calibration, scoped to a LinkedIn surface and discussion-item kind. Exact generated classes and instance IDs are never deciding signals. At most 32 recipes may coexist per Chrome profile; the oldest quarantined recipe may be evicted for capacity, but an active recipe is never silently removed. A recipe that claims compatibility but conflicts with trusted extraction is quarantined immediately instead of forcing a match.
_Avoid_: Global selector, CSS path, post mapping, learned content

**Quarantined Layout Recipe**:
A Calibrated Layout Recipe disabled after its first actual extraction conflict while remaining locally inspectable and removable. A non-match is not a conflict, and a quarantined recipe cannot be forced back into extraction without renewed calibration and validation.
_Avoid_: Deleted recipe, skipped recipe, manually trusted selector

**Calibration Ambiguity**:
The state in which a proposed or saved Calibrated Layout Recipe cannot uniquely distinguish the intended visible boundary or required fields from competing DOM candidates. It produces no extraction or provider request and requires renewed user calibration.
_Avoid_: Best match, probable extraction, automatic guess

**Calibration Preview**:
The local, temporary presentation of a proposed post or Discussion Item boundary together with its primary text, visible author or explicit neutral author label, containing post, and inferred thread depth. It must exclude unrelated text and actions before the user can confirm Layout Calibration.
_Avoid_: Element outline, selector preview, AI analysis

**Extraction Agreement**:
The state in which Thoughtline's built-in extraction and every applicable Calibrated Layout Recipe identify equivalent visible boundaries and required fields. A disagreement is Calibration Ambiguity rather than permission for either method to override the other.
_Avoid_: Built-in priority, calibration override, highest score

**Cross-Provider Fallback**:
The fixed OpenRouter → Gemini → Groq route for one validated AI request. Each later stage is attempted once after an earlier provider-specific availability, credential, transport, quota, model, or response-schema failure. A model adapter may make one schema-repair request before leaving its stage. A well-formed Calibration Proposal that later fails trusted local DOM validation produces Calibration Ambiguity instead of fallback.
_Avoid_: Paid routing, infinite retry, local-validation override, silent data repair

**Analysis Request**:
One explicit user instruction, initiated from Chrome’s context menu, to turn one validated Post Context into a summary and four editable reply directions.
_Avoid_: Feed scan, background analysis, automatic engagement

**Foreground AI Job**:
One provider-bound task started by the user inside the extension, covering reply analysis, rewriting, idea research, post generation, profile derivation, style analysis, AI-Assisted Layout Calibration, or credential validation. Only one Foreground AI Job may be active across the extension at a time; Scheduled Idea Searches are independent.
_Avoid_: UI action, background schedule, provider request

**AI Processing Consent**:
The user's explicit, revocable permission for Thoughtline to send the minimum content needed for a requested Foreground AI Job to OpenRouter and, when Cross-Provider Fallback applies, Gemini then Groq. AI-Assisted Layout Calibration additionally requires a per-request Calibration Evidence Review.
_Avoid_: API key, LinkedIn permission, scheduling-service account

**Context Overflow**:
A Foreground AI Job whose complete validated inputs, profile, instructions, and output allowance exceed the selected provider model’s accepted context. It is rejected before generation without truncation, summarization, splitting, or Cross-Provider Fallback.
_Avoid_: Partial analysis, automatic summarization

**Rewrite Draft**:
An editable AI rewrite of content manually pasted by the user into Generate, created in the user’s configured voice and never published automatically.
_Avoid_: Reply draft, source post, automatic edit

**Writing Language**:
The language used for generated replies, rewrites, and posts. An explicit English or Bangla choice overrides the default **Match the source**, which follows the Response Target, pasted content, Source Evidence, or supplied lesson and may preserve a natural English-Bangla mix.
_Avoid_: Interface language, summary language, translation mode

**Bilingual Summary**:
The paired English and Bangla summaries generated together for interfaces that provide summary-language tabs, independent of the selected Writing Language.
_Avoid_: Writing language, on-demand translation

**Work History**:
The searchable local collection of saved Reply, Idea, and Rewrite entries governed by the user’s retention setting.
_Avoid_: Browsing history, activity tracking, provider log

**History Source Snapshot**:
The workflow-specific source material retained with a Work History entry: bounded LinkedIn references and excerpts for a Reply, bounded Source Evidence for an Idea, or the full user-pasted original for a Rewrite.
_Avoid_: Raw DOM, complete discussion, external article

**Data Archive**:
A user-created portable snapshot of Thoughtline's local Work History, writing profile, settings, and learned preferences that structurally excludes Provider Credentials, Calibrated Layout Recipes, and transient state.
_Avoid_: Cloud backup, credential export, Diagnostic Bundle

**Provider Credential**:
A user-supplied OpenRouter, Gemini, or Groq API key retained as device-bound encrypted data and made available only to trusted extension contexts for an explicit AI workflow.
_Avoid_: Account password, server credential, plaintext setting

**Provider Readiness**:
The state in which valid OpenRouter, Gemini, and Groq Provider Credentials, curated model choices, and one explicit zero-cost route confirmation are available, allowing zero-cost-first Foreground AI Jobs with Cross-Provider Fallback.
_Avoid_: Paid routing, single-provider mode, partially configured

**Setup Readiness**:
The state in which AI Processing Consent, LinkedIn page permission, Provider Readiness, and the required role, topics, and audience profile fields are complete.
_Avoid_: Provider Readiness, optional PDF import, scheduling account

**Profile Import**:
The temporary local extraction of professional text from the user’s own LinkedIn PDF export to propose an editable writing profile, excluding contact details and discarding the raw file immediately.
_Avoid_: LinkedIn account connection, profile scraping, stored résumé

**Feedback Evidence**:
A bounded personalization signal from an explicit positive or negative rating, a selected reply direction, or a substantial generated-to-edited change. Copying alone is not evidence.
_Avoid_: Provider training event, public reaction, copy event, cosmetic rating

**Learned Writing Preference**:
A user-inspectable and resettable preference derived from bounded Feedback Evidence and included in later AI requests and local ordering.
_Avoid_: Model fine-tuning, hidden profile, permanent trait

**Style Guide**:
User-approved writing guidance created from the user's own samples or edited manually and applied to later drafting requests.
_Avoid_: Raw writing samples, Learned Writing Preference, provider training

**Hashtag Policy**:
The saved writing preference that chooses zero to ten generated, post-relevant hashtags and an ordered set of Custom Hashtags appended to every Rewrite Draft and Idea post. Custom Hashtags do not count toward the generated quantity and still apply when that quantity is zero; reply drafts are outside this policy.
_Avoid_: Hashtag suggestion, reply hashtags, automatic tags

**Diagnostic Bundle**:
A user-inspectable local support report containing extension version, environment, timings, state transitions, and sanitized error codes while structurally excluding content and credentials.
_Avoid_: Telemetry event, remote log, analytics payload

**Scheduled Idea Search**:
A user-configured idea search executed by a separate scheduling service at a recurring time for a signed-in user, independently of whether Chrome or the extension is open.
_Avoid_: Chrome alarm, background feed scan

**Scheduled Idea Result**:
The retained output of a Scheduled Idea Search that is emailed to the user and becomes available to the extension during its next synchronization.
_Avoid_: Notification, live extension result

**Schedule Preview**:
The non-operational extension interface that demonstrates future Scheduled Idea Search configuration before the separate scheduling service is integrated.
_Avoid_: Active schedule, local schedule, scheduled result

**Public Source Research**:
An optional Idea input mode that searches only user-enabled public sources after their corresponding host permissions are granted.
_Avoid_: Web crawling, background browsing, mandatory discovery

**Idea Search Session**:
The temporary set of sourced Idea candidates from the latest manual search, retained only for the current Chrome session and replaced by a new search. Candidates do not become Work History until the user creates a post from one.
_Avoid_: Idea History, saved posts, scheduled results

**Active Workspace**:
The tab and workflow screen most recently used in the current Chrome session. It may point to completed Work History or temporary session work, but does not duplicate either one's content.
_Avoid_: History record, persistent navigation, copied draft

**Approved Prototype Version**:
An immutable, numbered Thoughtline UI snapshot. The highest version explicitly approved by the user is the visual contract for subsequent implementation; earlier versions remain available for comparison.
_Avoid_: Overwritten prototype, unnumbered redesign, production screenshot

**Experience Fallback**:
The single guided Idea state shown when Public Source Research is disabled or produces no qualifying result; it asks the user for a real lesson before drafting an unsourced post from that lesson and the saved writing profile.
_Avoid_: Evergreen Ideas list, sourced idea, invented experience

**Source Evidence**:
The title, excerpt, tags, timestamp, and aggregate signals supplied directly by an enabled public source’s official API or RSS feed and sufficient to support an Idea.
_Avoid_: Linked article, crawled webpage, headline assumption

**Source Reference**:
The source name, item title, and canonical URL retained with an Idea so the user can inspect the original material.
_Avoid_: Embedded citation, copied attribution, browsing history
