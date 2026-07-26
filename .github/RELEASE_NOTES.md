## What’s new in v0.2.0

- Renamed **Generate** to **Refine** and kept pasted-content refinement in the same five-view side-panel workspace.
- Added **Thoughtline → Refine the post to make your own** to LinkedIn’s context menu. It captures only the confirmed rendered post and opens a source-and-lens review before any AI request.
- Added explicit personal-experience confirmation together with saved profile, topic, audience, tone, style-guide, and learned-preference grounding.
- Produces a standalone post in the user’s voice instead of a reply to the source author. Provider output is converted to copy-ready plain text, and focused correction passes repair reply-style or overly close drafts.
- Added optional source attribution with improved LinkedIn permalink recovery and a validated manual-link fallback when the rendered card exposes no usable URL.
- Added grounding reports and original-source provenance to editable Refine results and History, plus Settings controls for context refinement, attribution defaults, and personal-claim confirmation.
- Added v6 visual references, real-browser refinement journeys, modern LinkedIn DOM fixtures, plain-text response tests, and Android product-exploration artifacts.

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
