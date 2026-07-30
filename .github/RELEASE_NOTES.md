## What’s new in v0.3.2

- Added reliable targeting for visible LinkedIn comments and nested replies across feed, notification, and post-detail pages.
- Added explicit **Replying to [author]** confirmation with the selected target excerpt in the side panel.
- Limited comment-target context to the original post and visible parent thread while excluding unrelated or hidden discussions.
- Added guarded support for LinkedIn’s modern repeated comment wrappers without confusing duplicate wrappers for nested replies.
- Added direct on-device calibration recovery when LinkedIn’s layout cannot be recognized, and fixed calibration requests expiring during routine panel refreshes.
- Kept AI reply generation focused on the exact selected target through one provider operation, preventing duplicate review calls from cascading into fallback rate limits.
- Added production content-script, extraction-to-generation, top-level comment, nested-reply, calibration-lifecycle, and browser-journey coverage.

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
