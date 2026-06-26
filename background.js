// Zoho Office Time Floating Monitor - Background Script
// Handles extension badge updates and lifecycle events

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message?.type === 'updateBadge') {
    const text = String(message.text || '');
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#222' });
  }
});
