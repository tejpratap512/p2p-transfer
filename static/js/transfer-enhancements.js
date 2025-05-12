/**
 * Transfer Enhancements
 * With fixed progress calculation and queue management
 * Enhanced with streaming support and connection monitoring
 *
 * @author Tej Vishwakarma
 * @version 2.2.0
 * @date 2025-05-11 21:59:04 UTC
 */

(function () {
  // Wait until document is fully loaded
  document.addEventListener("DOMContentLoaded", function () {
    console.log(
      "Initializing transfer cancellation with improved progress calculation"
    );

    // Configuration values
    const BUFFER_HIGH = 6000000; // 6MB
    const BUFFER_LOW = 2000000; // 2MB
    const CHECK_INTERVAL = 1000; // 1 second

    // Global state to force cancellation
    window.transferCanceled = false;

    // Add CSS for cancel button
    const style = document.createElement("style");
    style.textContent = `
            /* Cancel Button */
            .queue-item-cancel {
                padding: 6px;
                min-width: 34px;
                min-height: 34px;
                font-size: 0.8rem;
                border-radius: 6px;
                background: rgba(255, 82, 82, 0.15);
                color: var(--error-color);
                cursor: pointer;
                border: none;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-left: 8px;
            }
            
            .queue-item-cancel:hover {
                background: rgba(255, 82, 82, 0.3);
                transform: translateY(-2px);
            }
            
            /* Container for action buttons */
            .queue-item-actions {
                display: flex;
                align-items: center;
                margin-left: 8px;
            }
            
            /* Fix layout when progress is showing */
            .queue-item {
                display: flex !important;
                flex-wrap: wrap;
                justify-content: space-between;
                align-items: center;
            }
            
            .queue-item-name {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                margin-right: 8px;
            }
            
            /* Buffer monitoring */
            .buffer-monitor {
                margin-top: 8px;
                padding: 6px 12px;
                border-radius: 4px;
                background: rgba(33, 150, 243, 0.1);
                border: 1px solid rgba(33, 150, 243, 0.2);
                font-size: 0.85rem;
                display: inline-block;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .buffer-monitor.active {
                opacity: 1;
            }
            
            /* Connection state warning */
            .connection-warning {
                background: rgba(255, 152, 0, 0.1);
                border: 1px solid rgba(255, 152, 0, 0.3);
                color: #ff9800;
                padding: 6px 12px;
                border-radius: 4px;
                margin-top: 8px;
                font-size: 0.85rem;
                display: none;
            }
            
            .connection-warning.active {
                display: block;
                animation: pulse 1.5s infinite alternate;
            }
            
            @keyframes pulse {
                from { opacity: 0.7; }
                to { opacity: 1; }
            }
        `;
    document.head.appendChild(style);

    // Add cancel buttons to queue items
    function addCancelButtons() {
    const queueItems = document.querySelectorAll('.queue-item');
    
    queueItems.forEach(function(item) {
        // Skip if already processed
        if (item.dataset.cancelAdded === 'true') return;
        
        // Get status element
        const statusEl = item.querySelector('.queue-item-status');
        if (!statusEl) return;
        
        // Skip completed or failed items - Enhanced check
        if (statusEl.classList.contains('completed') || 
            statusEl.textContent === 'Completed' ||
            statusEl.textContent === 'Ready' ||  // Added this condition
            statusEl.classList.contains('failed') ||
            statusEl.textContent === 'Failed' ||
            statusEl.textContent === 'Canceled') {
            
            // Actively remove any existing cancel button for completed items
            const existingCancelBtn = item.querySelector('.queue-item-cancel');
            if (existingCancelBtn) {
                existingCancelBtn.remove();
            }
            return;
        }

        // Mark as processed
        item.dataset.cancelAdded = "true";

        // Create actions container if needed
        let actionsContainer = item.querySelector(".queue-item-actions");
        if (!actionsContainer) {
          actionsContainer = document.createElement("div");
          actionsContainer.className = "queue-item-actions";
          item.appendChild(actionsContainer);
        }

        // Only add if there isn't already a cancel button
        if (!actionsContainer.querySelector(".queue-item-cancel")) {
          // Create cancel button
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "queue-item-cancel";
          cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
          cancelBtn.title = "Cancel transfer";

          // Add click handler that reads the file name
          cancelBtn.addEventListener("click", function (e) {
            e.stopPropagation();

            // Get the file name from the queue item
            const fileNameEl = item.querySelector(".queue-item-name");
            if (!fileNameEl) return;

            const fileName = fileNameEl.textContent;
            console.log(`Canceling transfer for: ${fileName}`);

            // First try to find by index if possible
            if (item.dataset.index) {
              const index = parseInt(item.dataset.index, 10);

              if (
                !isNaN(index) &&
                window.fileQueue &&
                index >= 0 &&
                index < window.fileQueue.length
              ) {
                console.log(`Found file at index ${index}, canceling`);
                cancelByIndex(index);
                return;
              }
            }

            // Otherwise cancel by file name
            cancelByFileName(fileName, item);
          });

          actionsContainer.appendChild(cancelBtn);
        }
      });
    }

    // Cancel a transfer by index (for sender)
    function cancelByIndex(index) {
      if (!window.fileQueue) {
        console.error("fileQueue not found");
        return;
      }

      // Validate we have a valid file
      if (index < 0 || index >= window.fileQueue.length) {
        console.error("Invalid index");
        return;
      }

      const fileItem = window.fileQueue[index];

      if (!fileItem || !fileItem.file) {
        console.error("No file object found at index");
        return;
      }

      // Get the file name before removal for logging
      const fileName = fileItem.file.name;
      console.log(`Canceling ${fileName}`);

      // Update status
      fileItem.status = "canceled";

      // Set global cancellation flag
      window.transferCanceled = true;

      // If this is the current file being transferred
      const wasCurrentFile = window.currentQueueIndex === index;

      // Force interrupt the transfer
      forceInterruptTransfer();

      // Update UI first
      const queueItem = document.querySelector(
        `.queue-item[data-index="${index}"]`
      );
      if (queueItem) {
        // Just mark it canceled or remove if it's not the only item
        const itemParent = queueItem.parentElement;
        if (itemParent && itemParent.children.length > 1) {
          // Update status to canceled instead of removing
          const statusEl = queueItem.querySelector(".queue-item-status");
          if (statusEl) {
            statusEl.className = "queue-item-status failed";
            statusEl.textContent = "Canceled";
          }

          // Remove cancel button
          const cancelBtn = queueItem.querySelector(".queue-item-cancel");
          if (cancelBtn) {
            cancelBtn.remove();
          }
        }
      }

      // Remove from active file tracking but keep in queue with canceled status
      window.fileQueue[index].status = "canceled";
      window.fileQueue[index].transferred = 0;

      // Update all data-index attributes for remaining queue items
      updateQueueIndexes();

      // Recalculate total queue size if that function exists
      if (typeof window.recalculateTotalQueueSize === "function") {
        window.recalculateTotalQueueSize();
      } else {
        // Fallback - try to recalculate here
        recalculateTotalQueueSize();
      }

      // Reset current queue index if needed
      if (wasCurrentFile) {
        // If we removed the current file, set current index to -1
        window.currentQueueIndex = -1;

        // Reset chunk counters
        window.currentChunk = 0;
        window.totalChunks = 0;
      } else if (window.currentQueueIndex > index) {
        // If we removed a file before the current one, decrement the index
        window.currentQueueIndex--;
      }

      // Update queue count
      if (typeof window.updateQueueCount === "function") {
        window.updateQueueCount();
      }

      // Process next file after cleaning up
      setTimeout(() => {
        // Reset cancellation flag
        window.transferCanceled = false;

        // Try to process next file if there are files in queue
        if (window.fileQueue && window.fileQueue.length > 0) {
          if (typeof window.processNextFileInQueue === "function") {
            window.processNextFileInQueue();
          }
        }
      }, 500);
    }

    // Recalculate the total queue size (fallback if main.js doesn't have this)
    function recalculateTotalQueueSize() {
      console.log(
        "Recalculating total queue size (from transfer-enhancements.js)"
      );

      if (!window.fileQueue || !window.totalQueueSize) {
        return;
      }

      // Reset total size
      window.totalQueueSize = 0;

      // Only count active and completed files
      window.fileQueue.forEach((item) => {
        if (item.status !== "canceled" && item.status !== "failed") {
          window.totalQueueSize += item.file.size;
        }
      });

      // Update progress immediately
      if (typeof window.updateTotalProgress === "function") {
        window.updateTotalProgress();
      }
    }

    // Cancel by file name (works for both sender and receiver)
    function cancelByFileName(fileName, queueItem) {
      console.log(`Canceling by file name: ${fileName}`);

      // Set global cancellation flag
      window.transferCanceled = true;

      // Force interrupt any ongoing transfer
      forceInterruptTransfer();

      // Check if we can find it in the queue
      if (window.fileQueue) {
        let foundIndex = -1;

        // Find the index of file with this name
        for (let i = 0; i < window.fileQueue.length; i++) {
          if (window.fileQueue[i]?.file?.name === fileName) {
            foundIndex = i;
            break;
          }
        }

        // If found in queue, update its status
        if (foundIndex >= 0) {
          // Get if it was current file
          const wasCurrentFile = window.currentQueueIndex === foundIndex;

          // Mark as canceled
          window.fileQueue[foundIndex].status = "canceled";
          window.fileQueue[foundIndex].transferred = 0;

          // Update status in UI
          updateQueueItemStatus(foundIndex, "failed", "Canceled");

          // Update all data-index attributes
          updateQueueIndexes();

          // Recalculate queue size
          if (typeof window.recalculateTotalQueueSize === "function") {
            window.recalculateTotalQueueSize();
          } else {
            // Fallback
            recalculateTotalQueueSize();
          }

          // Reset current queue index if needed
          if (wasCurrentFile) {
            window.currentQueueIndex = -1;
            window.currentChunk = 0;
            window.totalChunks = 0;
          }
        }
      }

      // For receiver side - we might need to check growingBlobs
      if (window.growingBlobs && window.receivedFile) {
        // If current received file matches the one being canceled
        if (
          window.receivedFile.name === fileName &&
          window.receivedFile.streamId
        ) {
          // Clean up growing blob for this file
          if (window.growingBlobs[window.receivedFile.streamId]) {
            delete window.growingBlobs[window.receivedFile.streamId];
          }
        }
      }

      // Update queue count
      if (typeof window.updateQueueCount === "function") {
        window.updateQueueCount();
      }

      // Process next file after cleaning up
      setTimeout(() => {
        // Reset cancellation flag
        window.transferCanceled = false;

        // Try to process next file if there are files in queue
        if (window.fileQueue && window.fileQueue.length > 0) {
          if (typeof window.processNextFileInQueue === "function") {
            window.processNextFileInQueue();
          }
        }
      }, 500);
    }

    // Update queue item status helper
    function updateQueueItemStatus(index, status, text) {
      const queueItem = document.querySelector(
        `.queue-item[data-index="${index}"]`
      );
      if (queueItem) {
        const statusEl = queueItem.querySelector(".queue-item-status");
        if (statusEl) {
          statusEl.className = `queue-item-status ${status}`;
          statusEl.textContent = text;
        }

        // Remove cancel button if not pending or in-progress
        if (status !== "pending" && status !== "in-progress") {
          const cancelBtn = queueItem.querySelector(".queue-item-cancel");
          if (cancelBtn) {
            cancelBtn.remove();
          }
        }
      }
    }

    // Update data-index attributes for all queue items
    function updateQueueIndexes() {
      const queueItems = document.querySelectorAll(".queue-item");
      queueItems.forEach((item, index) => {
        item.dataset.index = index.toString();
      });
    }

    // Force interrupt the current transfer
    function forceInterruptTransfer() {
      console.log("Force interrupting current transfer");

      // Set current chunk beyond total to break any loops
      if (
        typeof window.currentChunk !== "undefined" &&
        typeof window.totalChunks !== "undefined"
      ) {
        window.currentChunk = window.totalChunks + 100; // Force well beyond the end
      }

      // Clear growing blobs if that exists in the global scope
      if (typeof window.growingBlobs !== "undefined") {
        window.growingBlobs = {};
      }

      // If isTransferring flag exists, set it to false
      if (typeof window.isTransferring !== "undefined") {
        window.isTransferring = false;
      }

      // Stop any progress updates that might be in progress
      if (typeof window.progressUpdateInterval !== "undefined") {
        clearInterval(window.progressUpdateInterval);
      }

      // Replace sendNextChunk with a no-op function temporarily
      if (typeof window.sendNextChunk === "function") {
        const originalSendNextChunk = window.sendNextChunk;

        window.sendNextChunk = function () {
          console.log("Transfer canceled, blocking further chunks");
          return false;
        };

        // Restore after a delay
        setTimeout(() => {
          if (window.transferCanceled) return; // Don't restore if still canceled
          window.sendNextChunk = originalSendNextChunk;
        }, 1000);
      }

      // Try to call fileTransferComplete with false to signal error
      if (typeof window.fileTransferComplete === "function") {
        try {
          window.fileTransferComplete(false);
        } catch (e) {
          console.error("Error calling fileTransferComplete:", e);
        }
      }
    }

    // Add buffer monitoring UI
    function addBufferMonitor() {
      if (document.getElementById("bufferMonitor")) return;

      const fileTransferContainer = document.querySelector(
        "#fileTransfer .container"
      );
      if (!fileTransferContainer) return;

      const monitorDiv = document.createElement("div");
      monitorDiv.id = "bufferMonitor";
      monitorDiv.className = "buffer-monitor";
      monitorDiv.innerHTML = "Buffer: 0.00MB";

      // Add after the queue list
      const queueList = document.getElementById("queueList");
      if (queueList) {
        queueList.parentNode.insertBefore(monitorDiv, queueList.nextSibling);
      } else {
        fileTransferContainer.appendChild(monitorDiv);
      }

      // Update buffer monitor periodically
      setInterval(() => {
        if (!window.dataChannel) return;

        const bufferAmount = window.dataChannel.bufferedAmount;
        const mbAmount = (bufferAmount / 1048576).toFixed(2);

        monitorDiv.innerHTML = `Buffer: ${mbAmount}MB`;

        if (bufferAmount > BUFFER_HIGH) {
          monitorDiv.className = "buffer-monitor active";
        } else {
          monitorDiv.className = "buffer-monitor";
        }
      }, 1000);
    }

    // Add connection monitoring - stops transfer attempts when connection is lost
    function addConnectionMonitor() {
      // Add connection warning UI
      const fileTransferContainer = document.querySelector(
        "#fileTransfer .container"
      );
      if (
        fileTransferContainer &&
        !document.getElementById("connectionWarning")
      ) {
        const warningDiv = document.createElement("div");
        warningDiv.id = "connectionWarning";
        warningDiv.className = "connection-warning";
        warningDiv.innerHTML =
          '<i class="fa-solid fa-exclamation-triangle"></i> Connection unstable';

        // Add after buffer monitor or queue list
        const bufferMonitor = document.getElementById("bufferMonitor");
        if (bufferMonitor && bufferMonitor.parentNode) {
          // Use the buffer monitor's parent node for insertion
          bufferMonitor.parentNode.insertBefore(
            warningDiv,
            bufferMonitor.nextSibling
          );
        } else {
          const queueList = document.getElementById("queueList");
          if (queueList && queueList.parentNode) {
            queueList.parentNode.insertBefore(
              warningDiv,
              queueList.nextSibling
            );
          } else {
            // Fallback to simple append if parent relationships are uncertain
            fileTransferContainer.appendChild(warningDiv);
          }
        }
      }

      // Monitor connection state changes
      if (window.peerConnection) {
        window.peerConnection.addEventListener(
          "iceconnectionstatechange",
          () => {
            const state = window.peerConnection.iceConnectionState;
            console.log("ICE connection state changed to:", state);

            // Update warning visibility based on state
            const warningDiv = document.getElementById("connectionWarning");
            if (warningDiv) {
              if (state === "checking" || state === "disconnected") {
                warningDiv.classList.add("active");
                warningDiv.innerHTML =
                  '<i class="fa-solid fa-exclamation-triangle"></i> Connection unstable';
              } else if (state === "failed" || state === "closed") {
                warningDiv.classList.add("active");
                warningDiv.innerHTML =
                  '<i class="fa-solid fa-exclamation-triangle"></i> Connection lost';
              } else {
                warningDiv.classList.remove("active");
              }
            }

            if (
              state === "disconnected" ||
              state === "failed" ||
              state === "closed"
            ) {
              console.log("Connection lost, stopping any active transfers");

              // Force interrupt transfers
              forceInterruptTransfer();

              // Update queue items to failed
              if (window.fileQueue && window.currentQueueIndex >= 0) {
                if (window.fileQueue[window.currentQueueIndex]) {
                  window.fileQueue[window.currentQueueIndex].status = "failed";
                  updateQueueItemStatus(
                    window.currentQueueIndex,
                    "failed",
                    "Connection lost"
                  );
                }
              }

              // Update connection status visual
              const statusElement = document.getElementById("connectionStatus");
              if (statusElement) {
                statusElement.textContent = "Connection lost";
                statusElement.style.color = "#ff4f4f";
              }
            }
          }
        );
      }

      // Setup a recurring connection check
      setInterval(() => {
        if (
          window.isTransferring &&
          (!window.dataChannel ||
            window.dataChannel.readyState !== "open" ||
            !window.peerConnection ||
            window.peerConnection.iceConnectionState !== "connected")
        ) {
          console.log("Connection check failed, stopping transfers");
          forceInterruptTransfer();

          // Update warning display
          const warningDiv = document.getElementById("connectionWarning");
          if (warningDiv) {
            warningDiv.classList.add("active");
            warningDiv.innerHTML =
              '<i class="fa-solid fa-exclamation-triangle"></i> Connection lost';
          }

          // Update status
          if (
            window.fileQueue &&
            window.currentQueueIndex >= 0 &&
            window.fileQueue[window.currentQueueIndex]
          ) {
            window.fileQueue[window.currentQueueIndex].status = "failed";
            updateQueueItemStatus(
              window.currentQueueIndex,
              "failed",
              "Connection lost"
            );
          }
        } else {
          // Connection is good, hide warning if it's showing
          const warningDiv = document.getElementById("connectionWarning");
          if (
            warningDiv &&
            window.peerConnection &&
            window.peerConnection.iceConnectionState === "connected"
          ) {
            warningDiv.classList.remove("active");
          }
        }
      }, 3000);
    }

    // Intercept the sendNextChunk function to respect cancellation
    function enhanceSendNextChunk() {
      if (typeof window.sendNextChunk !== "function") return;

      const originalSendNextChunk = window.sendNextChunk;

      window.sendNextChunk = function enhancedSendNextChunk() {
        // Check if transfer has been canceled
        if (window.transferCanceled) {
          console.log("Transfer canceled, blocking chunk send");
          return false;
        }

        // If data channel not ready, use original function
        if (!window.dataChannel || window.dataChannel.readyState !== "open") {
          return originalSendNextChunk();
        }

        // Check buffer size - implement backpressure
        if (window.dataChannel.bufferedAmount > BUFFER_HIGH) {
          console.log(
            `Buffer full (${(
              window.dataChannel.bufferedAmount / 1048576
            ).toFixed(2)}MB), pausing`
          );

          // Wait for buffer to drain before continuing
          setTimeout(function checkBuffer() {
            // Check again if transfer was canceled while waiting
            if (window.transferCanceled) {
              console.log("Transfer canceled during buffer wait");
              return;
            }

            if (!window.dataChannel || window.dataChannel.readyState !== "open")
              return;

            const currentAmount = window.dataChannel.bufferedAmount;

            if (currentAmount < BUFFER_LOW) {
              console.log(
                `Buffer drained to ${(currentAmount / 1048576).toFixed(
                  2
                )}MB, resuming`
              );
              window.sendNextChunk();
            } else {
              setTimeout(checkBuffer, 200);
            }
          }, 200);

          return;
        }

        // Otherwise use the original function
        return originalSendNextChunk();
      };

      console.log("Enhanced sendNextChunk with cancellation support");
    }

    // Setup periodic refresh for cancel buttons
    function setupPeriodicRefresh() {
      // Add mutation observer to catch DOM changes
      const queueList = document.getElementById("queueList");
      if (queueList) {
        const observer = new MutationObserver(function () {
          setTimeout(addCancelButtons, 50);
        });

        observer.observe(queueList, { childList: true, subtree: true });
      }

      // Check every second anyway
      setInterval(addCancelButtons, CHECK_INTERVAL);
    }

    // Force 100% progress when all transfers complete
    function observeTransferCompletion() {
      const completionCheck = setInterval(() => {
        // Check if we have an "All transfers complete" message using standard DOM methods
        let allCompleted = false;
        const statusElements = document.querySelectorAll(
          "#connectionStatus, .connection-status"
        );

        statusElements.forEach((element) => {
          if (
            element.textContent &&
            element.textContent.includes("All transfers complete")
          ) {
            allCompleted = true;
          }
        });

        // Or look for the status message in any div
        if (!allCompleted) {
          const allDivs = document.querySelectorAll("div");
          for (let i = 0; i < allDivs.length; i++) {
            if (
              allDivs[i].textContent &&
              allDivs[i].textContent.includes("All transfers complete")
            ) {
              allCompleted = true;
              break;
            }
          }
        }

        // If we found the completion message, update progress to 100%
        if (allCompleted) {
          console.log("Detected all transfers complete message");
          // Find the progress bar elements
          const totalProgressBar = document.querySelector(
            '#totalProgressBar, .progress-bar, [role="progressbar"]'
          );
          const totalProgressText = document.querySelector(
            '#totalProgressText, #progressText, div:not([class*="queue"]) + div:not([class])'
          );

          // Force progress to 100%
          if (totalProgressBar) totalProgressBar.style.width = "100%";
          if (totalProgressText) totalProgressText.textContent = "100%";

          // Also check for the specific element from the screenshot
          const progressText = document.querySelector(
            'div:not([class*="queue"]) + div:not([class])'
          );
          if (progressText && progressText.textContent.includes("%")) {
            progressText.textContent = "100%";
          }
        }
      }, 1000);
    }

    // Initialize after a short delay
    setTimeout(function () {
      // Add cancel buttons to queue items
      addCancelButtons();

      // Setup periodic refresh
      setupPeriodicRefresh();

      // Add buffer monitoring
      addBufferMonitor();

      // Add connection monitoring
      addConnectionMonitor();

      // Enhance sending for large files with cancellation support
      enhanceSendNextChunk();

      // Watch for completion messages
      observeTransferCompletion();

      console.log(
        "Transfer enhancements initialized with improved progress calculation"
      );
    }, 1000);
  });
})();
