// Global variables
let settings = {
  speed: 1,
  volume: 100,
  autoPause: false,
  adBlock: true,
  cookieConsentAction: 'disable'
};

// Run cookie management before page loads
(function() {
  const script = document.createElement('script');
  script.textContent = `(${manageCookies.toString()})();`;
  document.documentElement.appendChild(script);
  document.documentElement.removeChild(script);
})();

// Function to find all video elements
function findVideos() {
  return document.querySelectorAll('video');
}

// Function to set video speed
function setVideoSpeed(video, speed) {
  try {
    if (video && typeof speed === 'number') {
      video.playbackRate = speed;
    }
  } catch (e) {
    console.error('Error setting video speed:', e);
  }
}

// Function to set volume boost
function setVolumeBoost(video, volumePercent) {
  try {
    if (!video.volumeBoostInitialized) {
      // Create audio context only after user interaction
      const initializeAudioContext = () => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(video);
        const gainNode = audioCtx.createGain();
        
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        video.gainNode = gainNode;
        video.audioCtx = audioCtx;
        
        // Set initial gain value
        const gainValue = Math.max(1, volumePercent / 100);
        gainNode.gain.value = gainValue;
        
        video.volumeBoostInitialized = true;
        
        // Remove the event listeners since we only need to initialize once
        video.removeEventListener('play', initializeAudioContext);
        video.removeEventListener('click', initializeAudioContext);
      };

      // Initialize audio context on user interaction
      video.addEventListener('play', initializeAudioContext);
      video.addEventListener('click', initializeAudioContext);
    } else if (video.gainNode) {
      // If already initialized, just update the gain value
      const gainValue = Math.max(1, volumePercent / 100);
      video.gainNode.gain.value = gainValue;
    }
  } catch (e) {
    console.error('Error setting volume boost:', e);
  }
}

// Function to update video controls
function updateVideoControls() {
  const videos = findVideos();
  videos.forEach(video => {
    setVideoSpeed(video, settings.speed);
    setVolumeBoost(video, settings.volume);
  });
}

// Function to initialize a video
function initializeVideo(video) {
  if (!video.initialized) {
    video.initialized = true;
    setVideoSpeed(video, settings.speed);
    setVolumeBoost(video, settings.volume);
    
    // Add event listeners
    video.addEventListener('loadedmetadata', () => {
      setVideoSpeed(video, settings.speed);
    });
    
    video.addEventListener('play', () => {
      setVideoSpeed(video, settings.speed);
    });
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'scanQRCode') {
    // Handle QR code scanning
    scanQRCode().then(result => {
      try {
        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error('Error sending response:', error);
      }
    }).catch(error => {
      try {
        sendResponse({ success: false, error: error.message });
      } catch (error) {
        console.error('Error sending error response:', error);
      }
    });
    return true;
  }
  
  if (request.type === 'updateSettings') {
    // Update settings synchronously
    settings = { ...settings, ...request.settings };
    updateVideoControls();
    updateVisibilityListener();
    chrome.storage.local.set({ settings });
    sendResponse({ success: true });
    return false; // No async response needed
  }
});

// Load settings and initialize
chrome.storage.local.get(['settings'], (result) => {
  if (result.settings) {
    settings = { ...settings, ...result.settings };
  }
  updateVideoControls();
  updateVisibilityListener();
  initializePrivacyFeatures();
});

// Watch for new videos
const observer = new MutationObserver(() => {
  findVideos().forEach(initializeVideo);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initialize existing videos
findVideos().forEach(initializeVideo);

// Handle tab visibility changes
function handleVisibilityChange() {
  if (settings.autoPause && document.hidden) {
    findVideos().forEach(video => {
      if (!video.paused) video.pause();
    });
  }
}

// Add or remove visibility listener based on autoPause setting
function updateVisibilityListener() {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (settings.autoPause) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
}

// Initialize visibility listener
updateVisibilityListener();

// Handle QR code scanning
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'scanQRCode') {
    scanQRCode().then(result => {
      sendResponse({ success: true, data: result });
    }).catch(error => {
      console.error('Error scanning QR code:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

async function scanQRCode() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const video = document.querySelector('video');
    
    if (video) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        return code.data;
      }
    }
    
    // If no video element, scan the entire page
    const images = document.getElementsByTagName('img');
    for (const img of images) {
      if (img.complete) {
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code) {
          return code.data;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error scanning for QR codes:', error);
    throw error;
  }
}

// Cookie Management System
function manageCookies() {
  if (settings.cookieConsentAction === 'disable') return;

  // Block cookies before they are set
  const originalDocumentCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  const originalWindowCookie = Object.getOwnPropertyDescriptor(window, 'cookie');

  // Cookie categories based on CookieBlock's implementation
  const COOKIE_CATEGORIES = {
    NECESSARY: 0,
    FUNCTIONALITY: 1,
    ANALYTICS: 2,
    ADVERTISING: 3
  };

  // Common cookie patterns for each category
  const cookiePatterns = {
    necessary: [
      /_sess/i, /^sid$/i, /^auth/i, /login/i, /token/i,
      /^csrf/i, /^security/i, /^__Host-/i, /^__Secure-/i
    ],
    functionality: [
      /^prefs/i, /^settings/i, /^language/i, /^theme/i,
      /^timezone/i, /^display/i, /^ui-/i
    ],
    analytics: [
      /_ga/i, /^_utm/i, /analytics/i, /statistic/i,
      /^_pk_/i, /^_hj/i, /^plausible/i
    ],
    advertising: [
      /^ad_/i, /^ads_/i, /^advert/i, /tracking/i,
      /^fbp$/i, /^_fbp/i, /^_gcl_/i, /doubleclick/i
    ]
  };

  // Function to determine cookie category
  function getCookieCategory(name, domain, value) {
    // Check necessary cookies first
    if (cookiePatterns.necessary.some(pattern => pattern.test(name))) {
      return COOKIE_CATEGORIES.NECESSARY;
    }

    // Check functionality cookies
    if (cookiePatterns.functionality.some(pattern => pattern.test(name))) {
      return COOKIE_CATEGORIES.FUNCTIONALITY;
    }

    // Check analytics cookies
    if (cookiePatterns.analytics.some(pattern => pattern.test(name))) {
      return COOKIE_CATEGORIES.ANALYTICS;
    }

    // Check advertising cookies
    if (cookiePatterns.advertising.some(pattern => pattern.test(name))) {
      return COOKIE_CATEGORIES.ADVERTISING;
    }

    // Default to advertising if contains common tracking indicators
    if (value && (
      value.includes('uuid') ||
      value.includes('guid') ||
      value.includes('tracking') ||
      value.length > 100
    )) {
      return COOKIE_CATEGORIES.ADVERTISING;
    }

    return COOKIE_CATEGORIES.FUNCTIONALITY; // Default category
  }

  // New implementation of cookie blocking
  function blockCookie(name, value, domain) {
    const category = getCookieCategory(name, domain, value);
    
    switch (settings.cookieConsentAction) {
      case 'reject':
        return category === COOKIE_CATEGORIES.NECESSARY;
      case 'necessary':
        return category === COOKIE_CATEGORIES.NECESSARY;
      case 'accept':
        return true;
      default:
        return true;
    }
  }

  // Override document.cookie
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: function() {
      const cookies = originalDocumentCookie.get.call(this).split(';');
      return cookies
        .filter(cookie => {
          const [name, value] = cookie.trim().split('=');
          return blockCookie(name, value, window.location.hostname);
        })
        .join(';');
    },
    set: function(value) {
      try {
        const [cookieString] = value.split(';');
        const [name, cookieValue] = cookieString.split('=');
        
        if (blockCookie(name.trim(), cookieValue, window.location.hostname)) {
          return originalDocumentCookie.set.call(this, value);
        }
      } catch (e) {
        console.error('Error processing cookie:', e);
      }
      return true;
    }
  });

  // Block third-party cookies
  const originalSetCookie = document.cookie;
  document.cookie = function(value) {
    if (value.includes('domain=')) {
      const domain = value.match(/domain=([^;]+)/)[1];
      if (domain !== window.location.hostname) {
        return;
      }
    }
    return originalSetCookie.apply(this, arguments);
  };

  // Clean existing cookies
  function cleanExistingCookies() {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const [name] = cookie.trim().split('=');
      const domain = window.location.hostname;
      
      if (!blockCookie(name, '', domain)) {
        const cookiePath = location.pathname.split('/').slice(0, -1).join('/') || '/';
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${cookiePath}`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${cookiePath}; domain=${domain}`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
      }
    });
  }

  // Block storage APIs
  if (settings.cookieConsentAction === 'reject') {
    const blockStorage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {}
    };

    Object.defineProperty(window, 'localStorage', { value: blockStorage });
    Object.defineProperty(window, 'sessionStorage', { value: blockStorage });
  }

  // Initial cleanup
  cleanExistingCookies();

  // Monitor for new cookies
  setInterval(cleanExistingCookies, 1000);
}

// Initialize immediately
manageCookies();

// Ad Blocking System
function initializeAdBlocker() {
  // Don't run ad blocking on GitHub or GitHub-related domains
  if (window.location.hostname.includes('github.com') || 
      window.location.hostname.includes('githubusercontent.com')) {
    return;
  }
  
  if (settings.adBlock) {
    // Create and apply ad blocking rules
    const adBlockRules = {
      selectors: [
        // Google Ads (avoiding generic class names that might affect site themes)
        '[data-ad-client]',
        '[data-adsbygoogle-status]',
        '.adsbygoogle',
        'ins.adsbygoogle',
        
        // Specific ad containers (using more specific selectors)
        'div[id^="google_ads_"]',
        'div[id^="div-gpt-ad"]',
        'div[class^="ad-container-"]',
        
        // Overlay ads (using specific ad-related classes)
        'div[class*="ad-overlay-"]',
        'div[class*="sponsored-overlay"]'
      ]
    };

    // Block ad elements
    function removeAds() {
      adBlockRules.selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
          // Only hide if it's definitely an ad
          if (element.offsetHeight > 0 && 
              element.offsetWidth > 0 && 
              (element.getAttribute('data-ad-client') || 
               element.classList.contains('adsbygoogle'))) {
            element.style.display = 'none';
          }
        });
      });
    }

    // Create observer for dynamically loaded ads
    const adObserver = new MutationObserver(() => {
      removeAds();
    });

    // Start observing with a more specific configuration
    adObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    // Initial cleanup
    removeAds();
  }
}

// Helper function to get cookie domain
function getCookieDomain(cookieStr) {
  const match = cookieStr.match(/domain=([^;]+)/i);
  return match ? match[1].trim() : window.location.hostname;
}

// Initialize cookie and ad blocking features
function initializePrivacyFeatures() {
  manageCookies();
  initializeAdBlocker();
  updateMetaTags();
  handleCookieConsent();
  
  // Handle Topics API
  if (document.featurePolicy?.allowsFeature('browsing-topics')) {
    document.featurePolicy.allowedFeatures().forEach(feature => {
      if (feature === 'browsing-topics') {
        // Disable Topics API if privacy settings require it
        if (settings.cookieConsentAction === 'disable') {
          Object.defineProperty(document, 'browsingTopics', {
            value: async () => [],
            writable: false
          });
        }
      }
    });
  }
}

// Add to initializePrivacyFeatures function
function updateMetaTags() {
  // Don't modify meta tags on GitHub
  if (isGitHub()) return;
  
  // Find deprecated apple meta tag
  const appleMetaTag = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
  if (appleMetaTag) {
    // Add modern equivalent
    const modernMetaTag = document.createElement('meta');
    modernMetaTag.name = 'mobile-web-app-capable';
    modernMetaTag.content = 'yes';
    document.head.appendChild(modernMetaTag);
  }
}

// Add this function to check if we're on GitHub
function isGitHub() {
  return window.location.hostname.includes('github.com');
}

// Add this to your existing code
function handleCookieConsent() {
  // Don't handle if disabled
  if (settings.cookieConsentAction === 'disable') return;
  
  // Common cookie consent button selectors
  const consentSelectors = {
    accept: [
      '[id*="accept-cookies"]',
      '[class*="accept-cookies"]',
      'button[contains(text(), "Accept")]',
      'button[contains(text(), "Agree")]',
      '[id*="cookie-accept"]',
      '[class*="cookie-accept"]',
      '[aria-label*="Accept cookies"]',
      '.cc-accept',
      '#cookieAcceptButton',
      '.cookie-consent__accept'
    ],
    reject: [
      '[id*="reject-cookies"]',
      '[class*="reject-cookies"]',
      'button[contains(text(), "Reject")]',
      'button[contains(text(), "Decline")]',
      '[id*="cookie-reject"]',
      '[class*="cookie-reject"]',
      '[aria-label*="Reject cookies"]',
      '.cc-reject',
      '#cookieRejectButton',
      '.cookie-consent__reject'
    ],
    necessary: [
      '[id*="necessary-only"]',
      '[class*="necessary-only"]',
      'button[contains(text(), "Only necessary")]',
      '[id*="cookie-minimal"]',
      '[class*="cookie-minimal"]',
      '.cc-necessary',
      '#cookieNecessaryButton'
    ]
  };

  // Function to click the appropriate button based on settings
  function handleCookiePopup() {
    let buttonToClick = null;

    switch (settings.cookieConsentAction) {
      case 'accept':
        // Try to find accept button
        for (const selector of consentSelectors.accept) {
          buttonToClick = document.querySelector(selector);
          if (buttonToClick) break;
        }
        break;

      case 'reject':
        // Try to find reject button
        for (const selector of consentSelectors.reject) {
          buttonToClick = document.querySelector(selector);
          if (buttonToClick) break;
        }
        // If no reject button, try necessary/minimal
        if (!buttonToClick) {
          for (const selector of consentSelectors.necessary) {
            buttonToClick = document.querySelector(selector);
            if (buttonToClick) break;
          }
        }
        break;

      case 'necessary':
        // Try to find necessary/minimal button
        for (const selector of consentSelectors.necessary) {
          buttonToClick = document.querySelector(selector);
          if (buttonToClick) break;
        }
        break;
    }

    // Click the button if found
    if (buttonToClick && buttonToClick.offsetParent !== null) {
      console.log('Cookie consent button found:', buttonToClick);
      buttonToClick.click();
    }
  }

  // Initial check
  handleCookiePopup();

  // Watch for cookie consent popups
  const cookieObserver = new MutationObserver(() => {
    handleCookiePopup();
  });

  // Start observing with a configuration for cookie popups
  cookieObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
} 