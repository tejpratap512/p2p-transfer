/**
 * Browser Notification System for Secure File Transfer
 * Provides permissions handling and notification sending
 * Uses Font Awesome for icons
 *
 * Last updated: 2025-05-12 08:50:40
 * Author: Tej Vishwakarma
 */

// Store notification permission state
let notificationPermission = "default";
let notificationEnabled = false;

// Check if browser supports notifications
const notificationsSupported = "Notification" in window;

// Initialize notification system
function initNotifications() {
  if (!notificationsSupported) {
    console.log("Notifications not supported in this browser");
    return;
  }

  // Check existing permission
  notificationPermission = Notification.permission;
  notificationEnabled = notificationPermission === "granted";

  console.log("Notification permission:", notificationPermission);

  // Show request button if permission not determined
  if (notificationPermission === "default") {
    showNotificationPermissionButton();
  }

  // Add a toggle in settings if permission already granted
  if (notificationPermission === "granted") {
    addNotificationToggle();
  }
}

// Show permission request button
function showNotificationPermissionButton() {
  // Create the notification permission button
  const permissionBtn = document.createElement("button");
  permissionBtn.id = "notificationPermissionBtn";
  permissionBtn.className = "notification-permission-btn";
  permissionBtn.innerHTML =
    '<i class="fa-solid fa-bell"></i> Enable Notifications';
  permissionBtn.title = "Enable browser notifications for file transfers";

  // Add click event
  permissionBtn.addEventListener("click", requestNotificationPermission);

  // Add to the UI - try various places based on the current view
  let added = false;

  // Try adding to the session controls area first
  const sessionControls = document.querySelector(
    "#sessionControls .button-group"
  );
  if (sessionControls) {
    sessionControls.appendChild(permissionBtn);
    added = true;
  }

  // Alternatively, try the file transfer header
  if (!added) {
    const fileTransferHeader = document.querySelector(
      "#fileTransfer .header-actions"
    );
    if (fileTransferHeader) {
      fileTransferHeader.appendChild(permissionBtn);
      added = true;
    }
  }

  // Last resort, add to the body
  if (!added) {
    const container = document.querySelector(".container");
    if (container) {
      container.insertBefore(permissionBtn, container.firstChild);
    }
  }
}

// Add a notifications toggle switch in settings
function addNotificationToggle() {
  // Create a toggle switch element
  const toggleContainer = document.createElement("div");
  toggleContainer.className = "setting-item notification-toggle";
  toggleContainer.innerHTML = `
        <span class="setting-label">
            <i class="fa-solid fa-bell"></i> Notifications
        </span>
        <label class="toggle-switch">
            <input type="checkbox" id="notificationToggle" ${
              notificationEnabled ? "checked" : ""
            }>
            <span class="toggle-slider"></span>
        </label>
    `;

  // Find a place to add the toggle
  const settingsContainer = document.querySelector(".settings-container");

  if (settingsContainer) {
    settingsContainer.appendChild(toggleContainer);
  } else {
    // Create settings container if it doesn't exist
    const newSettingsContainer = document.createElement("div");
    newSettingsContainer.className = "settings-container";
    newSettingsContainer.appendChild(toggleContainer);

    // Try to add it to the file transfer view
    const fileTransferContainer = document.querySelector(
      "#fileTransfer .container"
    );
    if (fileTransferContainer) {
      fileTransferContainer.appendChild(newSettingsContainer);
    }
  }

  // Add event listener for toggle
  document
    .getElementById("notificationToggle")
    ?.addEventListener("change", function () {
      notificationEnabled = this.checked;
      console.log("Notifications enabled:", notificationEnabled);

      // Save preference to local storage
      try {
        localStorage.setItem(
          "notificationsEnabled",
          notificationEnabled ? "true" : "false"
        );
      } catch (e) {
        console.error(
          "Could not save notification preference to localStorage",
          e
        );
      }
    });

  // Load saved preference
  try {
    const savedPref = localStorage.getItem("notificationsEnabled");
    if (savedPref !== null) {
      notificationEnabled = savedPref === "true";
      const toggle = document.getElementById("notificationToggle");
      if (toggle) toggle.checked = notificationEnabled;
    }
  } catch (e) {
    console.error(
      "Could not load notification preference from localStorage",
      e
    );
  }
}

// Request notification permission from user
async function requestNotificationPermission() {
  if (!notificationsSupported) return;

  try {
    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    notificationEnabled = permission === "granted";

    console.log("Notification permission:", permission);

    // Update UI based on permission result
    const permissionBtn = document.getElementById("notificationPermissionBtn");

    if (permission === "granted") {
      // Remove the request button
      if (permissionBtn) permissionBtn.remove();

      // Show notification toggle
      addNotificationToggle();

      // Show a test notification
      sendNotification("StreamSnatcher Notifications Enabled", {
        body: "You will be notified when file transfers complete.",
      });
    } else if (permission === "denied") {
      // Update button to show denied state
      if (permissionBtn) {
        permissionBtn.innerHTML =
          '<i class="fa-solid fa-bell-slash"></i> Notifications Blocked';
        permissionBtn.classList.add("disabled");
        permissionBtn.title =
          "Please enable notifications in your browser settings";
      }
    }
  } catch (error) {
    console.error("Error requesting notification permission:", error);
  }
}

// Create simple icon data URLs
function createIconDataUrl(iconType) {
  // Define colors for different notification types
  const colors = {
    default: "#4a6cf7",
    success: "#4caf50",
    error: "#f44336",
    warning: "#ff9800",
    info: "#2196f3",
  };

  // Set default color
  let color = colors.default;

  // Select color based on icon type
  if (iconType === "success") color = colors.success;
  else if (iconType === "error") color = colors.error;
  else if (iconType === "warning") color = colors.warning;
  else if (iconType === "info") color = colors.info;

  // Create a canvas to draw the icon
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");

  // Fill background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 192, 192);

  // Draw icon based on type
  ctx.fillStyle = color;

  if (iconType === "success") {
    // Draw checkmark
    ctx.beginPath();
    ctx.moveTo(48, 96);
    ctx.lineTo(84, 132);
    ctx.lineTo(144, 72);
    ctx.lineWidth = 16;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else if (iconType === "error") {
    // Draw X
    ctx.beginPath();
    ctx.moveTo(60, 60);
    ctx.lineTo(132, 132);
    ctx.moveTo(132, 60);
    ctx.lineTo(60, 132);
    ctx.lineWidth = 16;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    // Default circle
    ctx.beginPath();
    ctx.arc(96, 96, 64, 0, 2 * Math.PI);
    ctx.fill();

    // Inner circle for info or warning
    if (iconType === "info" || iconType === "warning") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(96, iconType === "warning" ? 75 : 70, 10, 0, 2 * Math.PI);
      ctx.fill();

      if (iconType === "warning") {
        // Exclamation point
        ctx.fillRect(92, 90, 8, 40);
      } else {
        // Info symbol
        ctx.fillRect(92, 90, 8, 30);
      }
    }
  }

  // Convert to data URL
  return canvas.toDataURL("image/png");
}

// Get favicon URL as fallback icon
function getFaviconUrl() {
  // Try to find favicon from link elements
  const linkIcon = document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"]'
  );
  if (linkIcon) {
    return linkIcon.href;
  }

  // Try the apple touch icon as fallback
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (appleIcon) {
    return appleIcon.href;
  }

  // Default fallback to the root favicon.ico
  return `${window.location.origin}/favicon.ico`;
}

// Send a notification
function sendNotification(title, options = {}) {
  // Check if notifications are supported and enabled
  if (
    !notificationsSupported ||
    !notificationEnabled ||
    notificationPermission !== "granted"
  ) {
    console.log("Notifications not enabled or permitted");
    return;
  }

  // Create notification icon based on type
  let iconUrl = getFaviconUrl(); // Fallback to favicon

  // Use icon type if specified, otherwise use notification type
  const iconType = options.iconType || options.type || "default";

  // Generate icon data URL
  try {
    iconUrl = createIconDataUrl(iconType);
  } catch (e) {
    console.warn("Could not create icon, using favicon", e);
  }

  // Default options
  const defaultOptions = {
    icon: iconUrl,
    badge: iconUrl,
    silent: false,
  };

  // Merge options
  const notificationOptions = { ...defaultOptions, ...options };

  try {
    // Create and show notification
    const notification = new Notification(title, notificationOptions);

    // Add click handler
    notification.addEventListener("click", function () {
      console.log("Notification clicked");
      window.focus(); // Focus the browser window
      this.close();

      // If a specific action is provided, execute it
      if (options.onClick && typeof options.onClick === "function") {
        options.onClick();
      }
    });

    // Auto-close after timeout if specified
    if (options.timeout) {
      setTimeout(() => {
        notification.close();
      }, options.timeout);
    }

    return notification;
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

// Notification for file transfer completion
function notifyFileTransferComplete(filename, success = true) {
  if (!notificationsSupported || !notificationEnabled) return;

  const title = success
    ? "StreamSnatcher: Transfer Complete"
    : "StreamSnatcher: Transfer Failed";
  const body = success
    ? `"${truncateFilename(filename)}" has been successfully transferred.`
    : `Transfer of "${truncateFilename(filename)}" failed.`;

  sendNotification(title, {
    body: body,
    iconType: success ? "success" : "error",
    tag: "file-transfer-" + Date.now(),
    requireInteraction: !success,
  });
}

// Notification for when receiver joins
function notifyReceiverJoined() {
  if (!notificationsSupported || !notificationEnabled) return;

  sendNotification("Receiver Connected", {
    body: "Someone joined your file transfer session.",
    iconType: "info",
    tag: "receiver-joined-" + Date.now(),
  });
}

// Notification for when sender connects
function notifySenderConnected() {
  if (!notificationsSupported || !notificationEnabled) return;

  sendNotification("Connected to Sender", {
    body: "Connection established with the file sender.",
    iconType: "info",
    tag: "sender-connected-" + Date.now(),
  });
}

// Notification for when connection is lost
function notifyConnectionLost() {
  if (!notificationsSupported || !notificationEnabled) return;

  sendNotification("Connection Lost", {
    body: "The file transfer connection was lost.",
    iconType: "error",
    tag: "connection-lost-" + Date.now(),
    requireInteraction: true,
  });
}

// Helper to truncate long filenames for notifications
function truncateFilename(filename, maxLength = 30) {
  if (!filename) return "Unknown file";

  if (filename.length <= maxLength) return filename;

  const extension =
    filename.lastIndexOf(".") > 0
      ? filename.substring(filename.lastIndexOf("."))
      : "";

  return (
    filename.substring(0, maxLength - extension.length - 3) + "..." + extension
  );
}

// Add CSS for notification UI elements
function addNotificationStyles() {
  const style = document.createElement("style");
  style.textContent = `
        .notification-permission-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px 16px;
            background: var(--accent-color, #4a6cf7);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s ease;
            margin: 10px 0;
        }
        
        .notification-permission-btn:hover {
            background: var(--accent-hover, #3a5ce7);
            transform: translateY(-2px);
        }
        
        .notification-permission-btn.disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        
        .notification-permission-btn i {
            margin-right: 8px;
        }
        
        .settings-container {
            margin-top: 20px;
            padding: 15px;
            background: rgba(0, 0, 0, 0.03);
            border-radius: 8px;
        }
        
        .setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
        }
        
        .setting-label {
            font-size: 0.9rem;
            display: flex;
            align-items: center;
        }
        
        .setting-label i {
            margin-right: 8px;
            color: var(--accent-color, #4a6cf7);
        }
        
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }
        
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 24px;
        }
        
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .toggle-slider {
            background-color: var(--accent-color, #4a6cf7);
        }
        
        input:checked + .toggle-slider:before {
            transform: translateX(26px);
        }
    `;
  document.head.appendChild(style);
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Add notification styles
  addNotificationStyles();

  // Initialize notifications
  initNotifications();
});

// Export functions for main.js to use
window.notifyFileTransferComplete = notifyFileTransferComplete;
window.notifyReceiverJoined = notifyReceiverJoined;
window.notifySenderConnected = notifySenderConnected;
window.notifyConnectionLost = notifyConnectionLost;
