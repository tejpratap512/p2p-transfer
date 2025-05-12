/**
 * Daily Upload Quota Tracker for PeerSmash
 * Tracks and limits free users to 2GB total uploads per day
 *
 * Last updated: 2025-05-12 11:05:12
 * Author: tejpratap512
 */

// Constants
const DAILY_QUOTA_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB in bytes
const QUOTA_KEY_PREFIX = "peersmash_quota_";

// Current state
let todayQuotaUsed = 0;
let quotaExceeded = false;

// Initialize quota tracker
async function initQuotaTracker() {
  if (isPremiumUser) return; // No quota for premium users

  try {
    // Get today's date string for quota key
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const quotaKey = `${QUOTA_KEY_PREFIX}${today}`;

    // Try to get IP to make quota tracking more accurate
    let ipHash = await getIPHash();

    // Combine with browser fingerprint for better tracking
    const fingerprint = await getBrowserFingerprint();
    const uniqueId = `${ipHash}_${fingerprint}`;

    // Load quota data from localStorage
    const storedData = localStorage.getItem(`${quotaKey}_${uniqueId}`);
    if (storedData) {
      const quotaData = JSON.parse(storedData);
      todayQuotaUsed = quotaData.used || 0;

      console.log(
        `Loaded quota: ${formatFileSize(
          todayQuotaUsed
        )} used out of ${formatFileSize(DAILY_QUOTA_LIMIT)}`
      );
    } else {
      console.log("No quota used yet today");
      todayQuotaUsed = 0;
    }

    // Check if quota exceeded
    quotaExceeded = todayQuotaUsed >= DAILY_QUOTA_LIMIT;

    // Update quota display
    updateQuotaDisplay();
  } catch (error) {
    console.error("Error initializing quota tracker:", error);
  }
}

// Get a simple hash of the user's IP for better quota tracking
async function getIPHash() {
  try {
    // Try to get IP using a service that returns JSON
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    const ip = data.ip || "unknown";

    // Create a simple hash of the IP
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = (hash << 5) - hash + ip.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(16);
  } catch (error) {
    console.error("Error getting IP:", error);
    // Fallback to a random ID if we can't get the IP
    return Math.random().toString(36).substring(2, 15);
  }
}

// Get a simple browser fingerprint
async function getBrowserFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset(),
  ];

  // Create a simple hash of the components
  const fingerprint = components.join("|");
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    hash = (hash << 5) - hash + fingerprint.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

// Save current quota usage
async function saveQuotaUsage() {
  if (isPremiumUser) return; // No quota for premium users

  try {
    // Get today's date string for quota key
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const quotaKey = `${QUOTA_KEY_PREFIX}${today}`;

    // Try to get IP to make quota tracking more accurate
    let ipHash = await getIPHash();

    // Combine with browser fingerprint
    const fingerprint = await getBrowserFingerprint();
    const uniqueId = `${ipHash}_${fingerprint}`;

    // Save quota data to localStorage
    const quotaData = {
      used: todayQuotaUsed,
      lastUpdated: new Date().toISOString(),
    };

    localStorage.setItem(`${quotaKey}_${uniqueId}`, JSON.stringify(quotaData));
    console.log(`Saved quota usage: ${formatFileSize(todayQuotaUsed)}`);
  } catch (error) {
    console.error("Error saving quota usage:", error);
  }
}

// Add file size to quota and check if exceeded
function checkAndUpdateQuota(fileSize) {
  if (isPremiumUser) return true; // Always allow for premium

  // Check if adding this file would exceed quota
  if (todayQuotaUsed + fileSize > DAILY_QUOTA_LIMIT) {
    quotaExceeded = true;
    updateQuotaDisplay();
    showQuotaExceededError();
    return false;
  }

  // Update quota used
  todayQuotaUsed += fileSize;
  quotaExceeded = todayQuotaUsed >= DAILY_QUOTA_LIMIT;

  // Update UI and save
  updateQuotaDisplay();
  saveQuotaUsage();

  return true;
}

// Format file size to readable format
function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Show error when quota is exceeded
function showQuotaExceededError() {
  // Create toast notification
  const toast = document.createElement("div");
  toast.className = "toast-notification error";

  // Create content
  toast.innerHTML = `
        <div class="toast-icon">
            <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div class="toast-content">
            <h4>Daily Upload Limit Reached</h4>
            <p>You've reached your free tier daily limit of ${formatFileSize(
              DAILY_QUOTA_LIMIT
            )}.</p>
        </div>
        <div class="toast-actions">
            <button class="upgrade-btn">Upgrade</button>
            <button class="dismiss-btn">Dismiss</button>
        </div>
    `;

  // Add to document
  document.body.appendChild(toast);

  // Handle buttons
  toast.querySelector(".upgrade-btn").addEventListener("click", () => {
    // Will connect to upgrade flow later
    alert("Upgrade to premium for unlimited uploads!");
    toast.remove();
  });

  toast.querySelector(".dismiss-btn").addEventListener("click", () => {
    toast.remove();
  });

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.classList.add("fade-out");
      setTimeout(() => toast.remove(), 500);
    }
  }, 10000);
}

async function updateUsedQuota(bytes) {
  if (isPremiumUser) return; // No quota for premium users

  // Add to today's quota
  todayQuotaUsed += bytes;

  // Check if quota is now exceeded
  quotaExceeded = todayQuotaUsed >= DAILY_QUOTA_LIMIT;

  // Update UI display
  updateQuotaDisplay();

  // Save updated quota
  await saveQuotaUsage();

  console.log(
    `Updated quota: ${formatFileSize(todayQuotaUsed)} of ${formatFileSize(
      DAILY_QUOTA_LIMIT
    )} used today`
  );
}

// Update quota display in UI
function updateQuotaDisplay() {
  if (isPremiumUser) {
    // Hide quota display for premium users
    const quotaEl = document.getElementById("quotaDisplay");
    if (quotaEl) quotaEl.style.display = "none";
    return;
  }

  // Calculate percentage used
  const percentUsed = Math.min(100, (todayQuotaUsed / DAILY_QUOTA_LIMIT) * 100);
  const remaining = Math.max(0, DAILY_QUOTA_LIMIT - todayQuotaUsed);

  // Find or create quota display element
  let quotaEl = document.getElementById("quotaDisplay");

  if (!quotaEl) {
    quotaEl = document.createElement("div");
    quotaEl.id = "quotaDisplay";
    quotaEl.className = "quota-display";

    // Try to add it in a good location
    const dropArea = document.getElementById("dropArea");
    if (dropArea) {
      dropArea.parentNode.insertBefore(quotaEl, dropArea.nextSibling);
    } else {
      // Try file transfer area
      const fileTransfer = document.getElementById("fileTransfer");
      if (fileTransfer) {
        fileTransfer.insertBefore(quotaEl, fileTransfer.firstChild);
      } else {
        // Last resort
        document.body.appendChild(quotaEl);
      }
    }
  }

  // Update content
  quotaEl.innerHTML = `
        <div class="quota-header">
            <span class="tier-badge free">Free Tier</span>
            <span class="quota-remaining">
                ${formatFileSize(remaining)} remaining today
            </span>
            <a href="#upgrade" class="upgrade-link">Upgrade</a>
        </div>
        <div class="quota-bar-container">
            <div class="quota-bar" style="width: ${percentUsed}%"></div>
        </div>
    `;

  // Add warning class if quota is almost used up
  if (percentUsed > 80) {
    quotaEl.classList.add("quota-warning");
  } else {
    quotaEl.classList.remove("quota-warning");
  }

  // Add exceeded class if quota is exceeded
  if (quotaExceeded) {
    quotaEl.classList.add("quota-exceeded");
  } else {
    quotaEl.classList.remove("quota-exceeded");
  }
}

// Export functions
window.quotaTracker = {
  init: initQuotaTracker,
  check: checkAndUpdateQuota,
  updateUsedQuota: updateUsedQuota,
  getUsed: () => todayQuotaUsed,
  getLimit: () => DAILY_QUOTA_LIMIT,
  isExceeded: () => quotaExceeded,
};

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", initQuotaTracker);
