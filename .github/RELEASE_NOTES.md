## What’s new in v0.4.1

- Added a fixed free-only OpenRouter → Gemini → Groq drafting route. OpenRouter accepts only curated `:free` models, with Gemma 4 31B selected by default for writing and multilingual work.
- Added model selection and API-key setup for all three providers in onboarding and Settings, covered by one explicit zero-cost route confirmation. Configuration import and export preserve the selected models and provider setup.
- Added bounded per-provider timeouts and automatic eligible fallback so unavailable, rate-limited, or invalid OpenRouter output can continue through Gemini and then Groq without leaving the interface in an indefinite loading state.
- Added a manual Reply journey: paste a LinkedIn post, create Insight, Question, Extend, and Challenge drafts, then edit, rate, regenerate, copy, and reopen the result through the existing Reply workspace and History.
- Added provider and model provenance below generated replies, refinements, and posts so each result identifies the model that produced it.
- Added visible startup and regeneration recovery states, including a clear message when another Thoughtline activity already owns the foreground job.
- Replaced interface action icons with Hugeicons while retaining the original Thoughtline logo.
- Refreshed the README, landing page, product screenshots, privacy/security language, and regression coverage for the new routing and manual Reply workflows.

## Install in Chrome

1. Download the Chrome ZIP and `SHA256SUMS.txt` attached to this release.
2. Place both files in the same folder and verify the archive:

   ```bash
   sha256sum --check SHA256SUMS.txt
   ```

3. Extract the ZIP to a permanent folder.
4. Open `chrome://extensions` in Chrome 120 or later.
5. Enable **Developer mode**.
6. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.
7. Open Thoughtline and complete setup. Reload any LinkedIn tabs that were already open.

Chrome loads Thoughtline from the extracted folder, so do not delete that folder while the extension is installed. GitHub installations do not update automatically; download, verify, and load each newer release when one becomes available.
