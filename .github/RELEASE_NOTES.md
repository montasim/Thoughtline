## What’s new in v0.3.0

- Added optional visual companions for profile-grounded Refine results through Cloudflare Workers AI and FLUX.2 Klein 4B.
- Added encrypted, device-local Cloudflare Account ID and API-token storage under **Settings → Connections**.
- Added editable visual direction, inline generation progress, full preview, regeneration, and landscape-image download.
- Fixed Idea research falling directly into the experience fallback when saved topics were multi-word phrases.
- Replaced Stack Overflow’s over-constrained combined-tag request with independent relevance searches and added complete source-to-result browser coverage.
- Added animated, cancellable Idea-search progress together with reliable back navigation and on-demand source enablement.
- Added copy controls with success feedback to every expanded Reply, Refine, and Idea History record.
- Ensured manual and context-menu Refine results finish with 5–10 relevant hashtags.
- Improved Gemini structured-output handling and expanded provider, credential, source, History, Idea, and image-generation tests.

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
