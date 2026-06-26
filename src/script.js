const timeValueEl = document.getElementById('timeValue');
const remainingEl = document.getElementById('remaining');
const leaveAtEl = document.getElementById('leaveAt');
const statusDotEl = document.getElementById('statusDot');
const statusTextEl = document.getElementById('statusText');
const progressBarEl = document.getElementById('progressBar');
const targetSelectEl = document.getElementById('targetSelect');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');
const appContainer = document.getElementById('app');

const LOCAL_STORAGE_KEYS = {
  TARGET: 'zoho_time_desktop_target',
  COMPACT: 'zoho_time_desktop_compact',
  THEME: 'zoho_time_desktop_theme'
};

let appWindow = null;
let currentWindowSizeCompact = false;

// Attendance state tracking for the local clock
let latestSyncSecs = 0;
let syncReceivedAt = 0;
let isClockRunning = false;
let targetSeconds = parseInt(localStorage.getItem(LOCAL_STORAGE_KEYS.TARGET)) || 28800; // default 8h

// Initialize Tauri app window
function getTauriWindow() {
  if (appWindow) return appWindow;
  if (window.__TAURI__?.window?.getCurrentWindow) {
    appWindow = window.__TAURI__.window.getCurrentWindow();
  }
  return appWindow;
}

// Infer status from Zoho data payload
function inferStatus(payload) {
  if (!payload) return { text: 'OFFLINE', class: 'offline' };
  const current = payload.currDayData;
  if (current) {
    if (current.status) {
      const statusStr = String(current.status).toUpperCase();
      if (statusStr.includes('BREAK')) return { text: 'ON BREAK', class: 'break' };
      if (statusStr.includes('IN') || statusStr.includes('ACTIVE')) return { text: 'CHECKED IN', class: 'online' };
      if (statusStr.includes('OUT')) return { text: 'CHECKED OUT', class: 'offline' };
      return { text: statusStr, class: statusStr.includes('IN') ? 'online' : 'break' };
    }

    if (current.isOnBreak || current.onBreak || current.breakInTime) {
      return { text: 'ON BREAK', class: 'break' };
    }
    if (current.checkOutTime || current.hasOwnProperty('checkOut') || current.checkedOut) {
      return { text: 'CHECKED OUT', class: 'offline' };
    }
  }
  
  if (payload.totalsecs > 0) {
    return { text: 'CHECKED IN', class: 'online' };
  }
  return { text: 'NOT CHECKED IN', class: 'offline' };
}

// Tick local clock every 200ms to keep UI perfectly smooth
function startLocalClock() {
  setInterval(() => {
    let activeTotalSecs = latestSyncSecs;
    
    if (isClockRunning && syncReceivedAt > 0) {
      const elapsedMs = Date.now() - syncReceivedAt;
      activeTotalSecs = latestSyncSecs + (elapsedMs / 1000);
    }
    
    updateDisplay(activeTotalSecs);
  }, 200);
}

// Render values and update visual indicators
function updateDisplay(secs) {
  // Update main clock
  timeValueEl.textContent = formatDuration(secs);

  // Update progress bar
  const progressPercent = Math.min(100, (secs / targetSeconds) * 100);
  progressBarEl.style.width = `${progressPercent}%`;

  // Update stats
  const remainingSecs = Math.max(0, targetSeconds - secs);
  remainingEl.textContent = formatDuration(remainingSecs);
  leaveAtEl.textContent = formatTimeFromSeconds(remainingSecs);
}

// Convert seconds to HH:MM:SS format
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00:00';
  }
  const secs = Math.floor(seconds);
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const remainingSeconds = secs % 60;
  return [hours, minutes, remainingSeconds]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

// Calculate exact local leave time
function formatTimeFromSeconds(seconds) {
  if (seconds <= 0) return 'Done!';
  const date = new Date(Date.now() + seconds * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Handle Tauri event listeners
async function setupTauriListeners() {
  try {
    const { listen } = window.__TAURI__.event;

    // Listen to updates from Zoho tab (via Rust HTTP bridge)
    await listen('attendance-update', (event) => {
      try {
        const payload = event.payload;
        latestSyncSecs = Number(payload.totalsecs || 0);
        syncReceivedAt = Date.now();
        
        const status = inferStatus(payload);
        isClockRunning = (status.class === 'online');
        
        // Update status dot and label
        statusTextEl.textContent = status.text;
        statusDotEl.className = `status-indicator ${status.class}`;
      } catch (error) {
        console.error('attendance-update listener error', error);
      }
    });

    // Listen to connection errors / server ready
    await listen('server-ready', () => {
      if (statusTextEl.textContent === 'OFFLINE') {
        statusTextEl.textContent = 'ONLINE';
        statusDotEl.className = 'status-indicator break'; // Waiting for data state
      }
    });

    await listen('server-error', (event) => {
      console.error('Tauri local bridge server error', event.payload);
      statusTextEl.textContent = 'BRIDGE ERR';
      statusDotEl.className = 'status-indicator offline';
    });

    console.log('Tauri IPC listeners set up successfully');
  } catch (error) {
    console.log('Tauri API not fully ready, retrying...', error);
    setTimeout(setupTauriListeners, 200);
  }
}

// Adjust window size for compact / full modes
async function updateWindowSize(compact) {
  const win = getTauriWindow();
  if (!win) return;
  
  try {
    const { LogicalSize } = window.__TAURI__.window;
    if (compact) {
      appContainer.classList.add('compact');
      await win.setResizable(true); // temporary allow sizing
      await win.setSize(new LogicalSize(280, 65));
      await win.setResizable(false);
    } else {
      appContainer.classList.remove('compact');
      await win.setResizable(true);
      await win.setSize(new LogicalSize(280, 175));
      await win.setResizable(false);
    }
    currentWindowSizeCompact = compact;
    localStorage.setItem(LOCAL_STORAGE_KEYS.COMPACT, compact ? 'true' : 'false');
  } catch (e) {
    console.error('Failed to change window size', e);
  }
}

// Initialize page events and load states
window.addEventListener('DOMContentLoaded', async () => {
  // Set initial target option
  targetSelectEl.value = targetSeconds;

  // Restore theme state
  const isLightTheme = localStorage.getItem(LOCAL_STORAGE_KEYS.THEME) === 'true';
  if (isLightTheme) {
    appContainer.classList.add('light-theme');
  }

  // Restore compact state
  const wasCompact = localStorage.getItem(LOCAL_STORAGE_KEYS.COMPACT) === 'true';
  if (wasCompact) {
    appContainer.classList.add('compact');
    currentWindowSizeCompact = true;
    setTimeout(() => updateWindowSize(true), 500); // Allow window window loading
  } else {
    setTimeout(() => updateWindowSize(false), 500);
  }

  // Setup event listeners
  targetSelectEl.addEventListener('change', (e) => {
    targetSeconds = parseInt(e.target.value) || 28800;
    localStorage.setItem(LOCAL_STORAGE_KEYS.TARGET, targetSeconds);
    updateDisplay(latestSyncSecs);
  });

  minimizeBtn?.addEventListener('click', () => {
    updateWindowSize(!currentWindowSizeCompact);
  });

  closeBtn?.addEventListener('click', async () => {
    const win = getTauriWindow();
    if (win) {
      // Close requested -> triggers Rust WindowEvent::CloseRequested -> hides to system tray
      await win.close();
    }
  });



  // Double-click container to toggle Light/Dark Glass themes dynamically
  appContainer.addEventListener('dblclick', () => {
    appContainer.classList.toggle('light-theme');
    localStorage.setItem(LOCAL_STORAGE_KEYS.THEME, appContainer.classList.contains('light-theme') ? 'true' : 'false');
  });

  // Start logic
  startLocalClock();
  await setupTauriListeners();
});
