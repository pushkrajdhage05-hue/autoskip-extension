# AutoSkip — Skip Intros Everywhere

A Chromium extension that auto-clicks **Skip Intro**, **Skip Recap**, **Skip Credits**, and (optionally) **Next Episode** buttons on Netflix, JioHotstar, Prime Video, Disney+ and virtually any streaming site.

## Install (unpacked)

1. Unzip this folder somewhere permanent (Chrome loads it from disk every launch).
2. Open `chrome://extensions` (also works in Edge/Brave: `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. Pin the AutoSkip icon from the puzzle-piece menu for quick access.

## Usage

Click the toolbar icon to open the panel:

- **Master switch** (top-right) — pauses everything instantly.
- **Skip intro / Skip recap / Skip credits** — on by default.
- **Binge mode** — auto-clicks "Next Episode". Off by default so a season doesn't play itself while you're asleep.

Settings sync across your Chrome profile via `chrome.storage.sync` and apply live — no page refresh needed.

## How it works

- **Site-specific selectors** for Netflix, Prime Video, Disney+, Hotstar/JioCinema, Max, SonyLIV, ZEE5 (fast and precise).
- **Generic text matching** as a fallback for any other site — matches a curated phrase list ("Skip Intro", "Skip Recap", "Next Episode", plus Hindi variants) and deliberately never matches a bare "Skip" so it won't click unrelated dialogs.
- A `MutationObserver` reacts the instant a button is injected, with a 1-second interval as a safety net.
- Per-category **5-second cooldown** and a **visibility check** prevent click-spam or clicking hidden template elements.

## Notes

- The extension requests access to all sites so text-matching works "anywhere". If you'd rather restrict it, edit `matches` in `manifest.json` to a list of specific domains, e.g. `"https://*.netflix.com/*"`.
- Streaming sites redesign often. If a site stops working, the text-matching fallback usually still catches it; otherwise update the selector in `SITE_RULES` inside `content.js`.
- It never touches ads — only intro/recap/credits/next-episode controls.
