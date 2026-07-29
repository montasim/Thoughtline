## What’s new in v0.3.1

- Made manual and context-menu Refine editors grow automatically so the full draft remains visible without an inner scrollbar.
- Debounced Refine draft persistence to keep typing responsive while preserving the latest text before ratings and other result actions.
- Added browser-journey coverage for long, continuously edited Refine drafts and their persisted result.
- Hid saved Cloudflare Account IDs by default and added an explicit show/hide control matching the Workers AI token field.

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
