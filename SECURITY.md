# Security policy

## Supported versions

Security fixes are applied to the latest GitHub release. Thoughtline requires Chrome 120 or later.

## Reporting a vulnerability

Use the repository's private security-advisory feature when available. If it is not available, open a minimal issue asking for a private contact channel. Do not include API keys, LinkedIn content, exported archives, personal data, or working exploit details in a public issue.

Include the affected release, Chrome version, reproduction conditions, expected impact, and whether the report involves content extraction, provider credentials, storage, import/export, or extension permissions.

## Security design

- All externally supplied and persisted structures are validated with Zod.
- Web content is treated as untrusted data, normalized, bounded, and separated from provider instructions.
- LinkedIn extraction is passive, fail-closed, and scoped to the exact right-click target.
- Only trusted extension contexts can access credential and storage services.
- Persistent API keys use AES-256-GCM with a non-exportable device-bound IndexedDB key and per-record IVs.
- A curated free OpenRouter model is attempted first; only defined failures continue once through Gemini and then Groq, with a bounded timeout for every provider stage.
- One global foreground-job lease prevents overlapping AI jobs across extension surfaces.
- Data Archive imports are whole-file validated and merge by stable UUID plus newer update time. Credentials are structurally excluded.
- Diagnostics exclude content and credentials.
- Optional host and unlimited-storage permissions are requested only from direct user gestures.

Device-bound encryption protects persisted keys from casual storage inspection and accidental archive inclusion. It does not protect against malware, a compromised browser profile, operating-system access, or malicious code executing with the extension's privileges. Never commit or share provider keys.
