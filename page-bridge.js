(function () {
  // Prevent duplicate injections on the same page context
  if (window.__ZOHO_TIME_BRIDGE_INJECTED__) {
    console.log('Zoho Time Bridge already active on this page');
    return;
  }
  window.__ZOHO_TIME_BRIDGE_INJECTED__ = true;

  function sendAttendance() {
    try {
      const attendance = window.TAMSUtil?.Attendance;
      window.postMessage(
        {
          type: 'ZOHO_ATTENDANCE',
          attendance: attendance
            ? {
                totalsecs: attendance.totalsecs,
                currDayData: attendance.currDayData,
              }
            : null,
        },
        '*'
      );
    } catch (error) {
      console.error('Zoho Time Bridge: send error', error);
    }
  }

  function handleBridgeRequest(event) {
    if (event.data?.type === 'ZOHO_ATTENDANCE_BRIDGE_REQUEST') {
      sendAttendance();
    }
  }

  window.addEventListener('message', handleBridgeRequest);

  // Send initial data immediately and schedule updates
  sendAttendance();
  window.setInterval(sendAttendance, 1000);
})();
