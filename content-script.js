(() => {
  const WIDGET_ID = 'zoho-office-time-widget';
  const STORAGE_KEY = 'zohoOfficeTimeWidgetSettings';
  const DEFAULT_TARGET_SECONDS = 8 * 3600;
  const TARGET_OPTIONS = [
    { label: '8h', value: 8 * 3600 },
    { label: '8.5h', value: 8.5 * 3600 },
    { label: '9h', value: 9 * 3600 }
  ];
  const MAX_WAIT_MS = 20000;
  const startWaitTime = Date.now();
  const storageApi = window.chrome?.storage?.local;
  let latestAttendance = null;

  console.log('content script loaded', { href: window.location.href, TAMSUtil: window.TAMSUtil });

  function injectPageBridge() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.onload = () => script.remove();
    script.onerror = () => {
      console.error('Failed to inject page bridge script');
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  let lastSentSecs = -1;
  let lastSentStatus = null;
  let lastTauriPostTime = 0;
  let tauriAvailable = true;
  let nextTauriRetryTime = 0;

  function sendToTauri(attendance) {
    if (!attendance) {
      return;
    }

    const currentSecs = attendance.totalsecs;
    const currentStatus = attendance.currDayData?.status || '';

    // Check if status changed
    const statusChanged = currentStatus !== lastSentStatus;
    // Check if enough time has passed to sync (5 seconds)
    const timeToSync = (Date.now() - lastTauriPostTime) >= 5000;

    // Only send if status changed, or 5s passed and time differs
    if (!statusChanged && !timeToSync) {
      return;
    }

    // If Tauri is known offline, respect the retry backoff (retry every 15s)
    if (!tauriAvailable && Date.now() < nextTauriRetryTime) {
      return;
    }

    lastTauriPostTime = Date.now();
    lastSentSecs = currentSecs;
    lastSentStatus = currentStatus;

    fetch('http://127.0.0.1:49001/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attendance),
    })
    .then((response) => {
      if (response.ok) {
        if (!tauriAvailable) {
          console.log('Tauri desktop app is now online');
        }
        tauriAvailable = true;
      }
    })
    .catch(() => {
      if (tauriAvailable) {
        console.log('Tauri desktop app is offline, backing off requests');
      }
      tauriAvailable = false;
      nextTauriRetryTime = Date.now() + 15000; // Retry after 15s
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }
    let data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (data?.type !== 'ZOHO_ATTENDANCE') {
      return;
    }
    latestAttendance = data.attendance;
    console.log('content script received attendance', latestAttendance);
    sendToTauri(latestAttendance);
  });

  function getStorage(defaults) {
    return new Promise((resolve) => {
      if (storageApi) {
        storageApi.get(defaults, (items) => resolve(items));
      } else {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(defaults);
          }
        } else {
          resolve(defaults);
        }
      }
    });
  }

  function setStorage(value) {
    if (storageApi) {
      storageApi.set(value);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '00:00:00';
    }
    const secs = Math.floor(seconds);
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remainingSeconds = secs % 60;
    return [hours, minutes, remainingSeconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  }

  function formatTimeFromSeconds(seconds) {
    const date = new Date(Date.now() + seconds * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function createWidget() {
    if (document.getElementById(WIDGET_ID)) {
      return document.getElementById(WIDGET_ID);
    }

    const widget = document.createElement('div');
    widget.id = WIDGET_ID;
    widget.className = 'zoho-office-time-widget';
    widget.innerHTML = `
      <div class="zoho-office-time-header" id="zoho-office-time-drag-handle">
        <div class="zoho-office-time-title">
          <span>⏱ Office Time</span>
          <span class="zoho-office-time-mini-value" id="zoho-office-time-mini-value">00:00:00</span>
        </div>
        <div class="zoho-office-time-controls">
          <button id="zoho-office-time-minimize" title="Minimize widget">▁</button>
          <button id="zoho-office-time-close" title="Hide widget">×</button>
        </div>
      </div>
      <div class="zoho-office-time-body">
        <div class="zoho-office-time-status" id="zoho-office-time-status">Loading…</div>
        <div class="zoho-office-time-value" id="zoho-office-time-value">00:00:00</div>
        <div class="zoho-office-time-detail" id="zoho-office-time-remaining">Remaining: 08:00:00</div>
        <div class="zoho-office-time-detail" id="zoho-office-time-leave">Leave At: --:--</div>
        <div class="zoho-office-time-config">
          <label for="zoho-office-time-target">Target:</label>
          <select id="zoho-office-time-target">
            ${TARGET_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
    return widget;
  }

  function updateWidgetElements(values) {
    const get = (id) => document.getElementById(id);
    if (!get(WIDGET_ID)) return;
    get('zoho-office-time-value').textContent = values.formattedTotal;
    get('zoho-office-time-mini-value').textContent = values.formattedTotal;
    get('zoho-office-time-remaining').textContent = `Remaining: ${values.formattedRemaining}`;
    get('zoho-office-time-leave').textContent = `Leave At: ${values.leaveAt}`;
    get('zoho-office-time-status').textContent = values.status;
    const targetSelect = get('zoho-office-time-target');
    if (targetSelect && String(targetSelect.value) !== String(values.targetSeconds)) {
      targetSelect.value = values.targetSeconds;
    }
  }

  function inferStatus(attendance) {
    if (!attendance) {
      return 'Not Checked In';
    }

    const current = attendance.currDayData;
    if (current) {
      if (current.status) {
        return String(current.status);
      }

      if (current.isOnBreak || current.onBreak || current.breakInTime) {
        return 'On Break';
      }
      if (current.checkOutTime || current.hasOwnProperty('checkOut') || current.checkedOut) {
        return 'Checked Out';
      }
      if (attendance.totalsecs > 0) {
        return 'Checked In';
      }
    }

    return attendance.totalsecs > 0 ? 'Checked In' : 'Not Checked In';
  }

  function bindWidgetEvents(widget, state) {
    const closeButton = widget.querySelector('#zoho-office-time-close');
    const minimizeButton = widget.querySelector('#zoho-office-time-minimize');
    const targetSelect = widget.querySelector('#zoho-office-time-target');
    const dragHandle = widget.querySelector('#zoho-office-time-drag-handle');

    closeButton?.addEventListener('click', () => {
      widget.style.display = 'none';
    });

    minimizeButton?.addEventListener('click', () => {
      state.isMinimized = !state.isMinimized;
      widget.classList.toggle('minimized', state.isMinimized);
      if (minimizeButton) {
        minimizeButton.textContent = state.isMinimized ? '▿' : '▁';
        minimizeButton.title = state.isMinimized ? 'Restore widget' : 'Minimize widget';
      }
      setStorage({ [STORAGE_KEY]: state });
    });

    targetSelect?.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      state.targetSeconds = value;
      setStorage({ [STORAGE_KEY]: state });
    });

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let widgetStartX = 0;
    let widgetStartY = 0;

    dragHandle?.addEventListener('mousedown', (event) => {
      isDragging = true;
      widget.classList.add('dragging');
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      const rect = widget.getBoundingClientRect();
      widgetStartX = rect.left;
      widgetStartY = rect.top;
      event.preventDefault();
    });

    document.addEventListener('mousemove', (event) => {
      if (!isDragging) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      const nextLeft = widgetStartX + dx;
      const nextTop = widgetStartY + dy;
      widget.style.left = `${Math.max(10, nextLeft)}px`;
      widget.style.top = `${Math.max(10, nextTop)}px`;
      widget.style.right = 'auto';
      event.preventDefault();
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      widget.classList.remove('dragging');
      const rect = widget.getBoundingClientRect();
      state.position = { x: rect.left, y: rect.top };
      state.size = { width: Math.max(180, rect.width), height: Math.max(120, rect.height) };
      setStorage({ [STORAGE_KEY]: state });
    });
  }

  function restorePosition(widget, position, size, isMinimized) {
    if (position) {
      widget.style.left = `${position.x}px`;
      widget.style.top = `${position.y}px`;
      widget.style.right = 'auto';
    }
    if (size) {
      widget.style.width = `${size.width}px`;
      widget.style.height = `${size.height}px`;
    }
    if (isMinimized) {
      widget.classList.add('minimized');
    }
  }

  function sendBadge(totalSeconds) {
    try {
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const hours = Math.floor(totalSeconds / 3600);
      let text;
      if (hours < 10) {
        text = `${hours}h${String(minutes).padStart(2, '0')}`;
      } else {
        text = `${hours}h`;
      }
      window.chrome?.runtime?.sendMessage({ type: 'updateBadge', text });
    } catch (error) {
      // ignore if not available
    }
  }

  async function init() {
    const defaults = { [STORAGE_KEY]: { position: { x: 20, y: 80 }, size: { width: 240, height: 190 }, targetSeconds: DEFAULT_TARGET_SECONDS, isMinimized: false } };
    const result = await getStorage(defaults);

    const state = result[STORAGE_KEY] || defaults[STORAGE_KEY];
    state.targetSeconds = Number(state.targetSeconds) || DEFAULT_TARGET_SECONDS;
    state.position = state.position || { x: 20, y: 80 };
    state.size = state.size || { width: 240, height: 190 };
    state.isMinimized = Boolean(state.isMinimized);

    injectPageBridge();

    const widget = createWidget();
    restorePosition(widget, state.position, state.size, state.isMinimized);
    bindWidgetEvents(widget, state);
    const minimizeButton = widget.querySelector('#zoho-office-time-minimize');
    if (minimizeButton) {
      minimizeButton.textContent = state.isMinimized ? '▿' : '▁';
      minimizeButton.title = state.isMinimized ? 'Restore widget' : 'Minimize widget';
    }

    function render() {
      const attendance = latestAttendance;
      const waiting = Date.now() - startWaitTime < MAX_WAIT_MS;

      if (!attendance) {
        updateWidgetElements({
          formattedTotal: '00:00:00',
          formattedRemaining: formatDuration(state.targetSeconds),
          leaveAt: '--:--',
          targetSeconds: state.targetSeconds,
          status: waiting ? 'Waiting for Zoho timer…' : 'Zoho timer unavailable'
        });
        sendBadge(0);
        return;
      }

      const totalSeconds = Number(attendance.totalsecs) || 0;
      const remainingSeconds = Math.max(0, state.targetSeconds - totalSeconds);
      const leaveAt = formatTimeFromSeconds(remainingSeconds);
      updateWidgetElements({
        formattedTotal: formatDuration(totalSeconds),
        formattedRemaining: formatDuration(remainingSeconds),
        leaveAt,
        targetSeconds: state.targetSeconds,
        status: inferStatus(attendance)
      });
      sendBadge(totalSeconds);
    }

    render();
    setInterval(render, 1000);
  }

  init();
})();
