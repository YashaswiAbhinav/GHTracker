# Zoho Office Time Floating Monitor

A lightweight Chrome extension that reads Zoho People office time from `window.TAMSUtil.Attendance.totalsecs` and displays it in a floating always-visible widget.

## Features

- Shows the current Zoho office time (`totalsecs`).
- Displays remaining time toward a configurable daily target (8h / 8.5h / 9h).
- Calculates leave time from the target.
- Dark-themed floating widget with drag-and-drop position persistence.
- Uses Zoho's own timer object; does not re-calculate attendance.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this repository folder.
5. Visit `https://people.zoho.com/*` and refresh.

## Notes

- The widget now injects a page-context bridge so it can read `window.TAMSUtil.Attendance` from the Zoho page.
- If Zoho is not available yet, it will wait and show `Waiting for Zoho timer…` before declaring the timer unavailable.
- Position and target hours are saved locally.

## Tauri Desktop App

This repo also includes a minimal Tauri desktop app that listens for attendance updates from the extension over a local HTTP bridge.

### How it works

- The Chrome extension posts attendance events to `http://127.0.0.1:49001/attendance`.
- The Tauri app receives these events and displays an always-on-top floating window.
- The desktop window is resizable and uses the Zoho timer as the source of truth.

### Run Tauri app

1. Install Rust and Tauri prerequisites.
2. From the repo root, run:
   ```bash
   cargo build --release
   cargo run
   ```
3. Open Zoho People in Chrome, then refresh the page.
4. Load the extension and ensure it is active.

### Tips

- Keep the Tauri app running while using Zoho People.
- If the app does not receive updates, check that the extension can reach `http://127.0.0.1:49001/attendance`.
- The Tauri window is always-on-top but the browser still hosts the page bridge.
# GHTracker
# GHTracker
