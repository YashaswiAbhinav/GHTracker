# Chrome Web Store Listing — GHTracker Browser Bridge

> Last Updated: 2026-06-25

## Store Listing

**Extension Name**  
GHTracker Browser Bridge

**Short Description**  
Syncs active office timers and attendance clocks from tracking portals to the GHTracker desktop widget.

**Detailed Description**  
GHTracker Browser Bridge is the companion browser extension for the GHTracker macOS widget. 

This extension operates as a local bridge. It detects running attendance clocks on your active corporate portal tabs (such as Zoho People, Workday, or Clockify) and forwards the ticking statistics locally to the GHTracker floating desktop widget on your machine.

Key Features:
- Seamless background synchronization: No manual time copying needed.
- Ephemeral updates: Sends ticking time updates locally to port 49001.
- Low footprint: Only runs content extraction when active tracking tabs are open.

How to use it:
1. Install the companion GHTracker Desktop Widget.
2. Install this Chrome extension.
3. Open your time-tracking portal (e.g. Zoho People) and check in. The desktop widget will automatically detect the timer and begin ticking.

**Category**  
Productivity

**Single Purpose**  
Syncs active browser attendance timers locally to the GHTracker desktop application.

**Primary Language**  
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ⬜ Not created | |
| Screenshot 1 | 1280×800 or 640×400 | ⬜ Not created | |

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Used to persist extension configurations and synchronization states locally. |
| `tabs` | permissions | Needed to detect if active time tracking portal tabs are open to trigger monitoring. |
| `scripting` | permissions | Injects lightweight extraction scripts to read page clock elements. |
| `https://people.zoho.com/*` | host_permissions | Allows extraction scripts to parse Zoho People attendance timers. |
| `http://127.0.0.1:49001/*` | host_permissions | Required to send timer updates locally (loopback) to the GHTracker Tauri desktop server. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No  
*(It only transmits tracking metrics locally to the loopback IP 127.0.0.1 on the user's own machine. No data is stored, transmitted off-device, or shared with third parties.)*

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Distribution

**Visibility**: Public  
**Regions**: All regions  
**Pricing**: Free  
