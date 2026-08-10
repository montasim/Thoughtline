## What’s new in v0.4.0

- Added portable JSON configuration backups in onboarding and Settings. Export the complete setup, optionally include provider credentials, and restore available settings into a fresh installation.
- Added permission-safe configuration imports that apply only permissions declared by the extension and clearly confirm when the imported setup becomes active.
- Added a Hashtags setting for choosing 0–10 generated hashtags and defining preferred custom hashtags that appear in generated and refined posts.
- Added step-by-step setup guidance and direct provider links for Gemini, Groq, and Cloudflare Workers AI credentials.
- Improved LinkedIn post and comment extraction across changing layouts, with stronger calibration recovery and regression coverage.
- Refined configuration backup, import-success, copy-control, and narrow-screen onboarding layouts.
- Updated the project README and landing page with the new backup, hashtag, privacy, and provider-setup workflows.

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
