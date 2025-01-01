let isScanning = false;
let scanOverlay = null;

function createScanningOverlay() {
  // Create main overlay
  scanOverlay = document.createElement('div');
  scanOverlay.id = 'qr-scan-overlay';
  scanOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    cursor: crosshair;
    z-index: 2147483647;
  `;

  // Create selection box
  const selectionBox = document.createElement('div');
  selectionBox.id = 'qr-selection-box';
  selectionBox.style.cssText = `
    position: absolute;
    border: 2px solid #fff;
    background: rgba(255, 255, 255, 0.1);
    display: none;
  `;

  // Create instructions
  const instructions = document.createElement('div');
  instructions.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    padding: 10px 20px;
    border-radius: 4px;
    font-family: Arial, sans-serif;
    color: black;
    z-index: 2147483648;
  `;
  instructions.textContent = 'Click and drag to select QR code area. Press ESC to cancel.';

  scanOverlay.appendChild(selectionBox);
  document.body.appendChild(instructions);
  document.body.appendChild(scanOverlay);

  return { scanOverlay, selectionBox, instructions };
}

function startScanning() {
  if (isScanning) return;
  isScanning = true;

  const { scanOverlay, selectionBox, instructions } = createScanningOverlay();
  let startX, startY;
  let isSelecting = false;

  scanOverlay.addEventListener('mousedown', (e) => {
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.display = 'block';
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
  });

  scanOverlay.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;
    
    const width = e.clientX - startX;
    const height = e.clientY - startY;
    
    selectionBox.style.width = Math.abs(width) + 'px';
    selectionBox.style.height = Math.abs(height) + 'px';
    selectionBox.style.left = (width < 0 ? e.clientX : startX) + 'px';
    selectionBox.style.top = (height < 0 ? e.clientY : startY) + 'px';
  });

  scanOverlay.addEventListener('mouseup', async () => {
    if (!isSelecting) return;
    isSelecting = false;

    const rect = selectionBox.getBoundingClientRect();
    
    try {
      // Capture the selected area
      chrome.runtime.sendMessage({
        type: 'captureArea',
        area: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      });
    } catch (error) {
      console.error('Error capturing area:', error);
    }

    cleanup();
  });

  // Handle escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cleanup();
    }
  });
}

function cleanup() {
  if (scanOverlay) {
    scanOverlay.remove();
    const instructions = document.querySelector('#qr-scan-instructions');
    if (instructions) instructions.remove();
  }
  isScanning = false;
}

// Listen for scan start message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'startQRScan') {
    startScanning();
    return true;
  }
}); 