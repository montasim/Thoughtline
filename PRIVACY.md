# Thoughtline privacy boundaries

Thoughtline is designed as a local-first, user-initiated writing tool. It does not include analytics, telemetry, an advertising SDK, or a Thoughtline-operated content backend.

## Data processed locally

- Settings, writing profile, approved style guide, learned preference summary, and Work History are stored in `chrome.storage.local`.
- The current workspace, idea-search session, decrypted-key cache, and foreground-job lease are stored in `chrome.storage.session`.
- Provider keys are encrypted with AES-256-GCM before persistent storage. The non-exportable device key is held in the extension's IndexedDB. Provider credentials are excluded from Data Archives and diagnostics.
- A profile PDF selected by the user is parsed locally. Contact-like lines are removed from the proposed professional text and the raw PDF is not saved.
- In split incognito mode, work is not written into persistent History.

## Data sent outside the browser

A user must accept AI processing consent before content work can run. For an explicit foreground task, Thoughtline sends a bounded, validated data envelope to the user's selected curated OpenRouter `:free` model. If a stage has an eligible credential, quota, availability, transport, model, or structured-response failure, the same request is sent to Gemini and then Groq. Each stage is tried once, apart from one local-schema-guided repair attempt for models that lack native schema enforcement.

Thoughtline validates that an OpenRouter selection still has a zero-priced catalog entry before marking it ready and never offers a paid OpenRouter model. Gemini and Groq API keys do not expose a reliable billing-status check, so those stages remain blocked until the user confirms that Gemini billing is disabled and the Groq organization is on Free Plan. Users must keep those account controls unchanged to preserve zero-cost operation.

Depending on the task, that envelope can contain visible names and text from the selected LinkedIn context, a pasted draft, selected source evidence, profile fields, user-owned writing samples, custom instructions, and accepted learned preferences. It never contains raw DOM, HTML, browser history, cookies, credentials, hidden LinkedIn content, or unrelated feed posts.

Manual Idea searches can contact only the public sources enabled by the user: Hacker News, DEV, Medium, Lobsters, and Stack Overflow. Thoughtline uses source-native API or RSS evidence and does not crawl linked articles.

Provider and source services have their own privacy policies. Thoughtline cannot control their retention after a direct request reaches them.

## LinkedIn boundary

The LinkedIn permission allows a registered content script to respond to an explicit right-click selection. Extraction is read-only and limited to one already-rendered post context. Thoughtline never scrolls, clicks, expands, publishes, makes LinkedIn data requests, or claims LinkedIn account connection.

## User controls

Users can revoke AI consent, remove any provider key, change a curated model, disable public sources, reset learned preferences, delete individual History entries, clear all History after confirmation, set retention limits, and export or import a local Data Archive or complete configuration backup. Disabling a source stops future access but intentionally does not revoke Chrome's previously granted host permission.

Scheduling is currently preview-only. No schedule account, remote job, synchronization, or email notification is created by this version.
