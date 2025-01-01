// Initialize controls
document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || {
      speed: 1,
      volume: 100,
      autoPause: false,
      adBlock: true,
      cookieConsentAction: 'disable'
    };

    // Set initial values
    document.getElementById('speedControl').value = settings.speed;
    document.getElementById('speedInput').value = settings.speed;
    document.getElementById('volumeControl').value = settings.volume;
    document.getElementById('volumeInput').value = settings.volume;
    document.getElementById('autoPauseToggle').checked = settings.autoPause;
    document.getElementById('adBlockToggle').checked = settings.adBlock;
    document.getElementById('cookieConsentAction').value = settings.cookieConsentAction;
  });

  // Speed control events
  document.getElementById('speedControl').addEventListener('input', (e) => {
    const speed = parseFloat(e.target.value);
    document.getElementById('speedInput').value = speed;
    updateSettings({ speed });
  });

  document.getElementById('speedInput').addEventListener('input', (e) => {
    let speed = parseFloat(e.target.value);
    speed = Math.min(Math.max(speed, 0), 16);
    document.getElementById('speedControl').value = speed;
    updateSettings({ speed });
  });

  // Volume control events
  document.getElementById('volumeControl').addEventListener('input', (e) => {
    const volume = parseInt(e.target.value);
    document.getElementById('volumeInput').value = volume;
    updateSettings({ volume });
  });

  document.getElementById('volumeInput').addEventListener('input', (e) => {
    let volume = parseInt(e.target.value);
    volume = Math.min(Math.max(volume, 0), 500);
    document.getElementById('volumeControl').value = volume;
    updateSettings({ volume });
  });

  document.getElementById('autoPauseToggle').addEventListener('change', (e) => {
    const autoPause = e.target.checked;
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'updateSettings',
          settings: { autoPause }
        });
      }
    });
    updateSettings({ autoPause });
  });

  document.getElementById('adBlockToggle').addEventListener('change', (e) => {
    updateSettings({ adBlock: e.target.checked });
  });

  document.getElementById('cookieConsentAction').addEventListener('change', (e) => {
    updateSettings({ cookieConsentAction: e.target.value });
  });

  // Screenshot functionality
  document.getElementById('captureScreen').addEventListener('click', async () => {
    try {
      // Show capturing status
      const statusElement = document.getElementById('captureStatus');
      statusElement.style.display = 'block';
      statusElement.textContent = 'Capturing full page...';

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found');

      // Capture screenshot
      const dataUrl = await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (url) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(url);
          }
        });
      });

      // Download screenshot
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: dataUrl,
          filename: `screenshot_${timestamp}.png`,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(downloadId);
          }
        });
      });

      // Update status
      statusElement.textContent = 'Screenshot saved!';
      
      // Hide status after short delay
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 2000);
    } catch (error) {
      console.error('Screenshot error:', error);
      const statusElement = document.getElementById('captureStatus');
      statusElement.textContent = 'Screenshot failed';
      statusElement.style.display = 'block';
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 2000);
    }
  });
});

// Update settings
function updateSettings(newSettings) {
  chrome.storage.local.get(['settings'], (result) => {
    const settings = { ...result.settings, ...newSettings };
    
    // Save to storage
    chrome.storage.local.set({ settings }, () => {
      // Send to active tab
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'updateSettings',
            settings: newSettings  // Only send the changed settings
          }).catch(error => {
            console.error('Error updating tab:', error);
          });
        }
      });
    });
  });
} 