// Handle tab changes for auto-pause feature
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.storage.local.get(['settings'], (result) => {
    if (result.settings?.autoPause) {
      chrome.tabs.sendMessage(activeInfo.tabId, {
        type: 'tabChanged',
        active: true
      });
    }
  });
});

// Handle screenshot capture
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'captureFullPage') {
    try {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('Screenshot error:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, dataUrl: dataUrl });
        }
      });
      return true; // Keep the message channel open for async response
    } catch (error) {
      console.error('Screenshot error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
}); 