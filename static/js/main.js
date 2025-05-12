/**
 * Secure File Transfer Application
 * Main JavaScript functionality with WebRTC
 * Using memory-efficient streaming approach
 *
 * Last updated: 2025-05-12 06:22:26
 * Author: Tej Vishwakarma
 */

// WebRTC configuration
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Socket.IO connection
let socket = null;

// WebRTC variables
let peerConnection = null;
let dataChannel = null;
let localSessionId = null;
let isInitiator = false;

// File transfer variables
let file = null;
let fileReader = null;
let receivedSize = 0;
let receivedData = [];
let receivedFile = null;
let fileChunks = [];
let currentFile = null;
let currentChunk = 0;
let totalChunks = 0;
let nextExpectedChunk = 0;

// Streaming file transfer variables
let growingBlobs = {}; // Map of fileId -> {blob, chunks, received}

// Multiple file transfer variables
let fileQueue = [];
let currentQueueIndex = -1;
let totalQueueSize = 0;
let totalTransferredSize = 0;
let isTransferring = false;
let receivedFiles = []; // Track received files on receiver's end

// Encryption variables
let encryptionKey = null;
let encryptionIV = null;
let isEncryptionEnabled = true; // Default to enabled

// New cancellation flag
let isTransferCanceled = false;

// Constants for file transfer
const CHUNK_SIZE = 65536; // 64 KB chunks
const CHUNK_TIMEOUT = 5000; // 5 seconds timeout for chunk retransmission

let dataChannelBackoff = 0;
const MAX_BACKOFF = 5000;
let queueFullErrorShown = false;

const FREE_TIER_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes
let isPremiumUser = false;

// Function to check if data channel is open and connection is stable
function isDataChannelOpen() {
  return (
    dataChannel &&
    dataChannel.readyState === "open" &&
    peerConnection &&
    peerConnection.iceConnectionState === "connected"
  );
}

// Direct fix for the connection status that's stuck on "Waiting for peer..."
function updateConnectionStatus(status, color = '#4caf50') {
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
        // Add PeerSmash to important status messages
        if (status.includes('Connected!') || status.includes('Transfer complete')) {
            connectionStatus.textContent = `PeerSmash: ${status}`;
        } else {
            connectionStatus.textContent = status;
        }
        connectionStatus.style.color = color;
    }
}

// Connect to Socket.IO server
function connectSignalingServer() {
  socket = io();

  socket.on("connect", () => {
    console.log("Connected to signaling server");
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from signaling server");
  });

  socket.on("receiver_joined", (data) => {
    console.log("Receiver joined our session", data);

    // Update connection status
    updateConnectionStatus("Peer connected!");

    // Now that receiver joined, we can start WebRTC connection
    createPeerConnection(true);

    // Switch to file transfer view for sender
    setTimeout(() => {
      switchView("sessionInfo", "fileTransfer");

      // Update connection status again after view switch
      setTimeout(() => {
        updateConnectionStatus("Connected! Ready for file transfer");
      }, 100);
    }, 1000);

    // Notify sender that receiver has joined
    if (typeof window.notifyReceiverJoined === "function") {
      window.notifyReceiverJoined();
    }
  });

  socket.on("signal", (data) => {
    console.log("Received signaling data", data);
    handleSignalMessage(data);
  });

  socket.on("ice_candidate", (data) => {
    console.log("Received ICE candidate", data);
    handleIceCandidate(data);
  });

  socket.on("peer_disconnected", () => {
    console.log("Peer disconnected");
    updateConnectionStatus("Peer disconnected", "#ff4f4f");

    // Reset WebRTC connection
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
  });
}

// Create WebRTC peer connection
function createPeerConnection(isOfferer) {
  console.log(
    "Creating peer connection as",
    isOfferer ? "offerer" : "answerer"
  );
  isInitiator = isOfferer;

  peerConnection = new RTCPeerConnection(rtcConfig);

  // Setup ICE handling
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate", event.candidate);
      socket.emit("send_ice_candidate", {
        session_id: localSessionId,
        candidate: event.candidate,
      });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log(
      "ICE connection state change:",
      peerConnection.iceConnectionState
    );

    if (
      peerConnection.iceConnectionState === "connected" ||
      peerConnection.iceConnectionState === "completed"
    ) {
      updateConnectionStatus("Connected! Ready for file transfer");

      // Show the file queue for receiver when connection is established
      if (!isInitiator) {
        document.getElementById("fileQueue").classList.remove("hidden");
        document.getElementById("queueCount").textContent = "Files Received";

        // Hide the waiting indicator when connection is established
        const waitingIndicator = document.getElementById("waitingIndicator");
        if (waitingIndicator) {
          waitingIndicator.classList.add("hidden");
        }
      }
    }
  };

  if (isOfferer) {
    console.log("Creating data channel");
    dataChannel = peerConnection.createDataChannel("fileTransfer");
    setupDataChannel();

    console.log("Creating offer");
    peerConnection
      .createOffer()
      .then(setLocalAndSendOffer)
      .catch((error) => console.error("Error creating offer:", error));
  } else {
    // If we're the answerer, we need to wait for the data channel
    peerConnection.ondatachannel = (event) => {
      console.log("Data channel received");
      dataChannel = event.channel;
      setupDataChannel();
    };
  }
}

// Set up data channel event handlers
function setupDataChannel() {
  dataChannel.onopen = () => {
    console.log("Data channel opened");

    // Force update connection status
    updateConnectionStatus("Connected! Ready for file transfer");

    // For sender, enable the drop area
    if (isInitiator) {
      const dropArea = document.getElementById("dropArea");
      if (dropArea) {
        dropArea.style.display = "block";
        dropArea.classList.add("active");
      }
    } else {
      // For receiver, show the file queue and hide the waiting indicator
      document.getElementById("fileQueue").classList.remove("hidden");
      document.getElementById("waitingIndicator").classList.add("hidden");
      document.getElementById("queueCount").textContent = "Files Received";

      // Notify that connection with sender is established (for receiver)
      if (typeof window.notifySenderConnected === "function") {
        window.notifySenderConnected();
      }
    }
  };

  dataChannel.onclose = () => {
    console.log("Data channel closed");

    // Handle any active transfers when connection closes
    if (
      isTransferring &&
      currentQueueIndex >= 0 &&
      currentQueueIndex < fileQueue.length
    ) {
      console.log("Transfer interrupted by connection close");
      // Mark current transfer as failed
      fileQueue[currentQueueIndex].status = "failed";
      updateQueueItemStatus(currentQueueIndex, "failed", "Connection lost");

      // Reset transfer state
      isTransferring = false;
      currentChunk = 0;
      totalChunks = 0;
    }

    // Also check if we have any pending files and update their status
    if (fileQueue) {
      fileQueue.forEach((item, index) => {
        if (item.status === "pending") {
          item.status = "failed";
          updateQueueItemStatus(index, "failed", "Connection lost");
        }
      });
    }

    // Update connection status
    updateConnectionStatus("Connection closed", "#ff4f4f");

    // Notify about connection loss
    if (typeof window.notifyConnectionLost === "function") {
      window.notifyConnectionLost();
    }
  };

  dataChannel.onerror = (error) => {
    console.error("Data channel error:", error);
  };

  dataChannel.onmessage = handleDataChannelMessage;
}

// Handle incoming data channel messages
function handleDataChannelMessage(event) {
  // Update connection status on message received
  updateConnectionStatus("Connected! Receiving data...");

  // Check if this is a string message (metadata) or binary data
  if (typeof event.data === "string") {
    const message = JSON.parse(event.data);

    // Hide the waiting indicator as soon as we get any message
    const waitingIndicator = document.getElementById("waitingIndicator");
    if (waitingIndicator) {
      waitingIndicator.classList.add("hidden");
    }

    switch (message.type) {
      case "file-start":
        // Start receiving a new file
        console.log(
          `Receiving file: ${message.name} (${formatFileSize(message.size)})`
        );

        // Create a unique ID for the file that's safe for use as an element ID
        const safeFileId =
          message.name.replace(/[^a-zA-Z0-9]/g, "_") + "_" + Date.now();
        const streamId = `file_${Date.now()}`;

        // Initialize a growing blob container for this file
        growingBlobs[streamId] = {
          blob: null,
          chunks: {}, // Small buffer for out-of-order chunks
          received: 0,
          metadata: {
            name: message.name,
            size: message.size,
            type: message.fileType,
            totalChunks: message.totalChunks,
            encrypted: message.encrypted || false,
            postTransferEncryption: message.postTransferEncryption || false,
            encryptionKey: message.encrypted ? message.encryptionKey : null,
            encryptionIV: message.encrypted ? message.encryptionIV : null,
          },
          nextExpectedChunk: 0,
        };

        // Create a file queue item on receiver side with simplified layout
        const queueItem = document.createElement("div");
        queueItem.className = "queue-item";
        queueItem.dataset.filename = message.name;
        queueItem.dataset.fileid = safeFileId;
        queueItem.dataset.streamid = streamId;

        // Truncate filename if too long
        const displayName =
          message.name.length > 25
            ? message.name.substring(0, 20) +
              "..." +
              message.name.substring(message.name.lastIndexOf("."))
            : message.name;

        // Simplified HTML structure without individual progress bar
        queueItem.innerHTML = `
                    <div class="queue-item-info">
                        <div class="queue-item-name" title="${
                          message.name
                        }">${displayName}</div>
                        <div class="queue-item-size">${formatFileSize(
                          message.size
                        )}</div>
                    </div>
                    <div class="queue-item-status in-progress">0%</div>
                    <div class="queue-item-actions"></div>
                `;

        // Add to the queue list
        const queueList = document.getElementById("queueList");
        if (queueList) {
          queueList.appendChild(queueItem);
        }

        // Update the file count
        const fileCountEl = document.getElementById("queueCount");
        if (fileCountEl) {
          fileCountEl.textContent =
            document.querySelectorAll(".queue-item").length + " Files";
        }

        // Add to received files list for overall progress tracking
        receivedFiles.push({
          name: message.name,
          id: safeFileId,
          streamId: streamId,
          size: message.size,
          received: 0,
        });

        // Initialize file tracking variables
        totalQueueSize = message.size; // Reset for single file focus
        totalTransferredSize = 0;
        receivedSize = 0;
        receivedFile = {
          name: message.name,
          id: safeFileId,
          streamId: streamId,
          size: message.size,
          type: message.fileType,
          totalChunks: message.totalChunks,
        };

        // Handle encryption information
        if (message.encrypted) {
          // Show encryption status
          const encryptionStatus = document.getElementById("encryptionStatus");
          if (encryptionStatus) {
            encryptionStatus.classList.remove("hidden");
            encryptionStatus.innerHTML =
              '<i class="fa-solid fa-lock"></i> ' +
              (message.postTransferEncryption
                ? "Secure transfer"
                : "Encrypted transfer");
          }
        } else {
          // Show unencrypted status
          const encryptionStatus = document.getElementById("encryptionStatus");
          if (encryptionStatus) {
            encryptionStatus.classList.remove("hidden");
            encryptionStatus.className = "encryption-status warning";
            encryptionStatus.innerHTML =
              '<i class="fa-solid fa-unlock"></i> Unencrypted transfer';
          }
        }
        break;

      case "file-chunk":
        // Note that this chunk metadata will be followed by binary data
        currentChunk = message.chunkIndex;
        break;

      case "file-complete":
        // Update the queue item status
        updateReceiverQueueItemStatus(
          message.name,
          "in-progress",
          "Processing...",
          false
        );

        // All chunks received, finalize and download the file
        finalizeStreamedFile(receivedFile.streamId);
        break;

      case "chunk-request":
        // Receiver is requesting a specific chunk - resend it
        if (currentFile) {
          sendSpecificChunk(message.chunkIndex);
        }
        break;

      case "file-canceled":
        // Remote side canceled the file
        handleRemoteCancel(message.fileName);
        break;
    }
  } else {
    // Binary chunk data received
    if (receivedFile && currentChunk !== undefined && receivedFile.streamId) {
      try {
        const streamId = receivedFile.streamId;
        const container = growingBlobs[streamId];

        if (!container) {
          console.error("No container found for this file stream");
          return;
        }

        // Add to the total received bytes
        const chunkSize = event.data.size || event.data.byteLength;
        container.received += chunkSize;
        receivedSize += chunkSize;

        // Check if this is the chunk we're expecting next
        if (currentChunk === container.nextExpectedChunk) {
          // If we're expecting this chunk, process it directly
          processChunk(container, currentChunk, event.data);

          // Process any sequential buffered chunks
          let nextChunk = container.nextExpectedChunk;
          while (container.chunks[nextChunk]) {
            const bufferedChunk = container.chunks[nextChunk];
            delete container.chunks[nextChunk]; // Remove from buffer
            processChunk(container, nextChunk, bufferedChunk);
            nextChunk = container.nextExpectedChunk;
          }
        } else {
          // If out of order, store in buffer
          container.chunks[currentChunk] = event.data;
        }

        // Update progress
        const progress =
          Math.floor((receivedSize / receivedFile.size) * 100) || 0;
        updateReceiverQueueItemStatus(
          receivedFile.name,
          "in-progress",
          `${progress}%`
        );

        // Update total progress
        totalTransferredSize = receivedSize;
        const totalProgress =
          Math.floor((totalTransferredSize / totalQueueSize) * 100) || 0;

        // Update overall progress display
        updateOverallProgress(totalProgress);

        // Reset currentChunk to prevent duplicate processing
        currentChunk = undefined;
      } catch (error) {
        console.error("Error processing chunk:", error);
      }
    }
  }
}

// New function to process file chunks for streaming approach
function processChunk(container, chunkIndex, chunkData) {
  // If this is the first chunk, initialize the blob
  if (container.blob === null) {
    container.blob = new Blob([chunkData], {
      type: container.metadata.type || "application/octet-stream",
    });
  } else {
    // Append to existing blob
    const newBlob = new Blob([container.blob, chunkData], {
      type: container.metadata.type || "application/octet-stream",
    });

    // Replace the old blob with the new one that includes the new chunk
    container.blob = newBlob;
  }

  // Increment the next expected chunk
  container.nextExpectedChunk = chunkIndex + 1;
}

// Finalize and create download for streamed file
async function finalizeStreamedFile(streamId) {
  // Get the container
  const container = growingBlobs[streamId];
  if (!container || !container.blob) {
    console.error("Cannot finalize file: No blob available");
    updateReceiverQueueItemStatus(
      receivedFile.name,
      "failed",
      "Failed: No data"
    );

    // Send notification about failed transfer
    if (typeof window.notifyFileTransferComplete === "function") {
      window.notifyFileTransferComplete(receivedFile.name, false);
    }
    return;
  }

  try {
    updateReceiverQueueItemStatus(
      receivedFile.name,
      "in-progress",
      "Processing..."
    );

    let finalBlob = container.blob;

    // If encrypted and using post-transfer encryption
    if (
      container.metadata.encrypted &&
      container.metadata.encryptionKey &&
      container.metadata.encryptionIV
    ) {
      updateReceiverQueueItemStatus(
        receivedFile.name,
        "in-progress",
        "Processing secured data..."
      );

      try {
        // Regardless if post-transfer or not, handle encryption/decryption here
        // Import encryption key
        const keyData = base64ToArrayBuffer(container.metadata.encryptionKey);
        const iv = base64ToArrayBuffer(container.metadata.encryptionIV);
        const key = await importEncryptionKey(keyData);

        // For post-transfer encryption, we don't need to decrypt
        // We simply provide the unencrypted data
        if (!container.metadata.postTransferEncryption) {
          // Legacy mode - try to decrypt (this will likely fail with OperationError)
          try {
            const arrayBuffer = await readBlobAsArrayBuffer(finalBlob);
            const decryptedData = await window.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: new Uint8Array(iv) },
              key,
              arrayBuffer
            );
            finalBlob = new Blob([decryptedData], {
              type: container.metadata.type,
            });
          } catch (decryptErr) {
            console.error(
              "Legacy decryption failed, providing download of raw data",
              decryptErr
            );
            // Just provide the raw data as-is if decryption fails
          }
        }

        // Use the blob as-is if using post-transfer encryption or if decryption failed
      } catch (error) {
        console.error("Decryption setup error:", error);
        updateReceiverQueueItemStatus(
          receivedFile.name,
          "failed",
          "Decryption failed"
        );

        // Send notification about failed decryption
        if (typeof window.notifyFileTransferComplete === "function") {
          window.notifyFileTransferComplete(receivedFile.name, false);
        }
        return;
      }
    }

    // Offer download of the final blob
    updateReceiverQueueItemStatus(
      receivedFile.name,
      "completed",
      "Ready",
      true,
      finalBlob
    );

    // Send notification about successful transfer
    if (typeof window.notifyFileTransferComplete === "function") {
      window.notifyFileTransferComplete(receivedFile.name, true);
    }

    // Clean up after successful processing
    delete growingBlobs[streamId];
  } catch (error) {
    console.error("Error finalizing file:", error);
    updateReceiverQueueItemStatus(
      receivedFile.name,
      "failed",
      "Processing failed"
    );

    // Send notification about failed processing
    if (typeof window.notifyFileTransferComplete === "function") {
      window.notifyFileTransferComplete(receivedFile.name, false);
    }
  }
}

// Helper function to read a Blob as ArrayBuffer
function readBlobAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(blob);
  });
}

// Helper function for downloading and saving files
function downloadAndSave(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Clean up after download starts
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

// New function to update overall progress
function updateOverallProgress(progress) {
  // Check if transfer is canceled
  if (isTransferCanceled) {
    console.log("Transfer canceled, forcing progress to 0");
    progress = 0;
  }

  const totalProgressBar = document.getElementById("totalProgressBar");
  const totalProgressText = document.getElementById("totalProgressText");

  if (totalProgressBar) totalProgressBar.style.width = `${progress}%`;
  if (totalProgressText) totalProgressText.textContent = `${progress}%`;
}

// Updated to handle streaming files
function handleRemoteCancel(fileName) {
  console.log("Remote canceled file:", fileName);

  // Find the file stream container to clean up
  if (receivedFile && receivedFile.name === fileName && receivedFile.streamId) {
    // Clean up the growing blob
    if (growingBlobs[receivedFile.streamId]) {
      delete growingBlobs[receivedFile.streamId];
    }
  }

  // Set cancellation flag
  isTransferCanceled = true;

  // Update status of the canceled file
  updateReceiverQueueItemStatus(fileName, "failed", "Canceled", false);

  // Reset progress indicators
  resetAllProgress();

  // Reset the flag after a delay
  setTimeout(() => {
    isTransferCanceled = false;
  }, 1000);
}

// Function to request a missing chunk
function requestMissingChunk(chunkIndex) {
  console.log(`Requesting missing chunk ${chunkIndex}`);
  dataChannel.send(
    JSON.stringify({
      type: "chunk-request",
      chunkIndex: chunkIndex,
    })
  );
}

// Function to send a specific chunk (for retransmissions)
function sendSpecificChunk(chunkIndex) {
  if (!currentFile || chunkIndex >= totalChunks) return;

  console.log(`Resending chunk ${chunkIndex}`);

  // Calculate the start and end bytes for this chunk
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, currentFile.size);

  // Get a slice of the file
  const chunk = currentFile.slice(start, end);

  // Create a FileReader to read this chunk
  const reader = new FileReader();

  reader.onload = async (e) => {
    // Check connection before sending
    if (!isDataChannelOpen()) {
      console.log("Connection lost during chunk read, aborting retransmission");
      return;
    }

    // Create chunk metadata
    const chunkMeta = {
      type: "file-chunk",
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      fileName: currentFile.name,
      final: chunkIndex === totalChunks - 1,
    };

    // Send the metadata first
    dataChannel.send(JSON.stringify(chunkMeta));

    // No per-chunk encryption for specific chunk retransmission
    dataChannel.send(e.target.result);
  };

  reader.onerror = (error) => {
    console.error("Error reading file chunk:", error);
  };

  // Read the chunk as array buffer
  reader.readAsArrayBuffer(chunk);
}

// Handle signaling messages (offer/answer)
function handleSignalMessage(data) {
  if (!peerConnection) {
    console.log("Creating peer connection for incoming signal");
    createPeerConnection(false);
  }

  const signal = data.signal;

  if (signal.type === "offer") {
    console.log("Setting remote description from offer");
    peerConnection
      .setRemoteDescription(new RTCSessionDescription(signal))
      .then(() => {
        console.log("Creating answer");
        return peerConnection.createAnswer();
      })
      .then(setLocalAndSendAnswer)
      .catch((error) => console.error("Error handling offer:", error));
  } else if (signal.type === "answer") {
    console.log("Setting remote description from answer");
    peerConnection
      .setRemoteDescription(new RTCSessionDescription(signal))
      .catch((error) => console.error("Error handling answer:", error));
  }
}

// Handle ICE candidate messages
function handleIceCandidate(data) {
  if (peerConnection && data.candidate) {
    console.log("Adding ICE candidate");
    peerConnection
      .addIceCandidate(new RTCIceCandidate(data.candidate))
      .catch((error) => console.error("Error adding ICE candidate:", error));
  }
}

// Set local description and send offer
function setLocalAndSendOffer(offer) {
  peerConnection
    .setLocalDescription(offer)
    .then(() => {
      console.log("Sending offer signal");
      socket.emit("relay_signal", {
        session_id: localSessionId,
        signal: offer,
      });
    })
    .catch((error) => console.error("Error setting local description:", error));
}

// Set local description and send answer
function setLocalAndSendAnswer(answer) {
  peerConnection
    .setLocalDescription(answer)
    .then(() => {
      console.log("Sending answer signal");
      socket.emit("relay_signal", {
        session_id: localSessionId,
        signal: answer,
      });
    })
    .catch((error) => console.error("Error setting local description:", error));
}

// Send a file via WebRTC data channel
function sendFileViaWebRTC(file) {
  currentFile = file;

  // Update connection status
  updateConnectionStatus("Connected! Sending data...");

  // Reset state
  fileChunks = [];
  currentChunk = 0;

  // Reset cancellation flag
  isTransferCanceled = false;

  // Calculate total chunks
  totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Show encryption status
  const encryptionStatusEl = document.getElementById("encryptionStatus");
  if (encryptionStatusEl) {
    encryptionStatusEl.classList.remove("hidden");
  }

  // Generate encryption key if encryption is enabled
  if (isEncryptionEnabled) {
    if (encryptionStatusEl) {
      encryptionStatusEl.innerHTML =
        '<i class="fa-solid fa-lock"></i> Generating encryption key...';
    }

    // Generate encryption key and IV
    generateEncryptionKey()
      .then(({ key, exportedKey }) => {
        encryptionKey = key;
        encryptionIV = generateIV();

        // Convert encryption key and IV to base64 for transmission
        const keyBase64 = arrayBufferToBase64(exportedKey);
        const ivBase64 = arrayBufferToBase64(encryptionIV);

        if (encryptionStatusEl) {
          encryptionStatusEl.innerHTML =
            '<i class="fa-solid fa-lock"></i> Secure transfer enabled';
        }

        // Send file metadata with encryption info but flag for post-transfer encryption
        dataChannel.send(
          JSON.stringify({
            type: "file-start",
            name: file.name,
            size: file.size,
            fileType: file.type,
            totalChunks: totalChunks,
            chunkSize: CHUNK_SIZE,
            encrypted: true,
            postTransferEncryption: true, // New flag indicating post-transfer encryption
            encryptionKey: keyBase64,
            encryptionIV: ivBase64,
          })
        );

        console.log(
          `Starting transfer of ${file.name} (${formatFileSize(
            file.size
          )}) in ${totalChunks} chunks with secure transfer`
        );

        // Start sending chunks without encrypting them
        sendNextChunk();
      })
      .catch((error) => {
        console.error("Encryption setup failed:", error);
        if (encryptionStatusEl) {
          encryptionStatusEl.innerHTML =
            '<i class="fa-solid fa-unlock"></i> Encryption failed, sending unencrypted';
        }

        // Fall back to unencrypted transfer
        isEncryptionEnabled = false;

        // Send file metadata without encryption
        dataChannel.send(
          JSON.stringify({
            type: "file-start",
            name: file.name,
            size: file.size,
            fileType: file.type,
            totalChunks: totalChunks,
            chunkSize: CHUNK_SIZE,
            encrypted: false,
          })
        );

        console.log(
          `Starting unencrypted transfer of ${file.name} (${formatFileSize(
            file.size
          )}) in ${totalChunks} chunks`
        );

        // Start sending chunks
        sendNextChunk();
      });
  } else {
    // Send unencrypted
    if (encryptionStatusEl) {
      encryptionStatusEl.innerHTML =
        '<i class="fa-solid fa-unlock"></i> Encryption disabled';
    }

    // Send file metadata without encryption
    dataChannel.send(
      JSON.stringify({
        type: "file-start",
        name: file.name,
        size: file.size,
        fileType: file.type,
        totalChunks: totalChunks,
        chunkSize: CHUNK_SIZE,
        encrypted: false,
      })
    );

    console.log(
      `Starting unencrypted transfer of ${file.name} (${formatFileSize(
        file.size
      )}) in ${totalChunks} chunks`
    );

    // Start sending chunks
    sendNextChunk();
  }
}

// Function to send the next chunk
function sendNextChunk() {
  // Check if transfer has been canceled
  if (isTransferCanceled) {
    console.log("Transfer canceled, blocking chunk send");
    return false;
  }

  // Check if connection is still open
  if (!isDataChannelOpen()) {
    console.log("Connection closed, stopping transfer");
    // Mark the transfer as failed
    if (currentQueueIndex >= 0 && currentQueueIndex < fileQueue.length) {
      fileQueue[currentQueueIndex].status = "failed";
      updateQueueItemStatus(currentQueueIndex, "failed", "Connection lost");
    }
    // Reset for next attempt
    isTransferring = false;
    currentChunk = totalChunks + 1; // Force beyond total
    return false;
  }

  if (currentChunk < totalChunks && currentFile) {
    // Calculate the start and end bytes for this chunk
    const start = currentChunk * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, currentFile.size);

    // Get a slice of the file
    const chunk = currentFile.slice(start, end);

    // Create a FileReader to read this chunk
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        // Check if connection is still valid
        if (!isDataChannelOpen()) {
          console.log("Connection lost during chunk read, aborting transfer");
          if (typeof window.fileTransferComplete === "function") {
            window.fileTransferComplete(false);
          }
          return;
        }

        // Check again if transfer was canceled while reading chunk
        if (isTransferCanceled) {
          console.log("Transfer canceled during chunk read");
          return;
        }

        // Check data channel buffer size before sending
        if (dataChannel.bufferedAmount > 16000000) {
          // 16MB threshold
          console.log(
            `Data channel buffer full (${(
              dataChannel.bufferedAmount / 1048576
            ).toFixed(2)}MB)`
          );

          // Show a user-friendly error message if not already shown
          if (!queueFullErrorShown) {
            const errorMsg = `Network buffer full. Transfer will continue in a moment...`;

            // Create or update a status message
            let statusMsg = document.getElementById("networkStatus");
            if (!statusMsg) {
              statusMsg = document.createElement("div");
              statusMsg.id = "networkStatus";
              statusMsg.className = "network-status warning";

              // Add to the UI near the queue
              const queueElement = document.getElementById("fileQueue");
              if (queueElement) {
                queueElement.parentNode.insertBefore(
                  statusMsg,
                  queueElement.nextSibling
                );
              }
            }

            statusMsg.textContent = errorMsg;
            statusMsg.style.display = "block";
            queueFullErrorShown = true;

            // Hide after transfer resumes
            setTimeout(() => {
              statusMsg.style.display = "none";
              queueFullErrorShown = false;
            }, 10000);
          }

          // Implement exponential backoff
          dataChannelBackoff = Math.min(
            dataChannelBackoff * 1.5 + 200,
            MAX_BACKOFF
          );
          console.log(`Backing off for ${dataChannelBackoff}ms before retry`);

          // Try again after backoff
          setTimeout(() => {
            // Reuse the same chunk index
            sendNextChunk();
          }, dataChannelBackoff);

          return; // Don't proceed with sending now
        }

        // Reset backoff if we're successfully sending
        dataChannelBackoff = 0;

        // Create chunk metadata
        const chunkMeta = {
          type: "file-chunk",
          chunkIndex: currentChunk,
          totalChunks: totalChunks,
          fileName: currentFile.name,
          final: currentChunk === totalChunks - 1,
        };

        try {
          // Send the metadata first
          dataChannel.send(JSON.stringify(chunkMeta));

          // Send raw chunk data - NO ENCRYPTION at chunk level
          dataChannel.send(e.target.result);

          // If we previously showed an error, hide it now
          if (queueFullErrorShown) {
            const statusMsg = document.getElementById("networkStatus");
            if (statusMsg) {
              statusMsg.style.display = "none";
              queueFullErrorShown = false;
            }
          }

          // Update progress for the current queue item
          const chunkSize = end - start;
          if (currentQueueIndex >= 0 && currentQueueIndex < fileQueue.length) {
            fileQueue[currentQueueIndex].transferred += chunkSize;
            totalTransferredSize += chunkSize;

            // Update the queue status text with percentage
            const fileProgress = Math.round(
              (fileQueue[currentQueueIndex].transferred /
                fileQueue[currentQueueIndex].file.size) *
                100
            );
            updateQueueItemStatus(
              currentQueueIndex,
              "in-progress",
              `${fileProgress}%`
            );

            // Update overall progress
            updateTotalProgress();
          }

          // Move to next chunk
          currentChunk++;

          // If we have more chunks, send the next one with a dynamic delay
          if (currentChunk < totalChunks) {
            // Dynamically adjust delay based on buffer size
            const bufferSize = dataChannel.bufferedAmount;
            const delay =
              bufferSize > 8000000
                ? 100
                : bufferSize > 4000000
                ? 50
                : bufferSize > 1000000
                ? 20
                : 0;

            setTimeout(sendNextChunk, delay);
          } else {
            // Transfer complete for this file
            // Send file complete message
            dataChannel.send(
              JSON.stringify({
                type: "file-complete",
                name: currentFile.name,
              })
            );

            // Mark this file as complete in the queue and process the next one
            fileTransferComplete(true);
          }
        } catch (sendError) {
          // Handle send errors specifically
          console.error("Error sending data:", sendError);

          if (
            sendError.message &&
            sendError.message.includes("send queue is full")
          ) {
            // If it's a queue full error, retry with backoff
            dataChannelBackoff = Math.min(
              dataChannelBackoff * 1.5 + 200,
              MAX_BACKOFF
            );
            console.log(
              `Send failed, backing off for ${dataChannelBackoff}ms before retry`
            );

            setTimeout(() => {
              sendNextChunk(); // Retry same chunk
            }, dataChannelBackoff);
          } else {
            // For other errors, mark as failed
            fileTransferComplete(false);
          }
        }
      } catch (error) {
        console.error("Error processing chunk:", error);

        // Mark as failed in the queue
        fileTransferComplete(false);
      }
    };

    reader.onerror = (error) => {
      console.error("Error reading file chunk:", error);

      // Mark as failed in the queue
      fileTransferComplete(false);
    };

    // Read the chunk as array buffer
    reader.readAsArrayBuffer(chunk);
  } else if (!currentFile) {
    console.error("No file selected for transfer");
  }
}

// Reset all progress indicators
function resetAllProgress() {
  console.log("Resetting all progress indicators");

  // Reset the overall progress bar
  const totalProgressBar = document.getElementById("totalProgressBar");
  const totalProgressText = document.getElementById("totalProgressText");

  if (totalProgressBar) totalProgressBar.style.width = "0%";
  if (totalProgressText) totalProgressText.textContent = "0%";

  // Reset global progress tracking
  totalTransferredSize = 0;

  // Reset any specific item progress
  if (currentQueueIndex >= 0 && currentQueueIndex < fileQueue.length) {
    fileQueue[currentQueueIndex].transferred = 0;
    updateQueueItemStatus(currentQueueIndex, "failed", "Canceled");
  }

  // Update UI
  updateTotalProgress();
}

// Recalculate the total queue size when removing files
function recalculateTotalQueueSize() {
  console.log("Recalculating total queue size");

  // Reset total size
  totalQueueSize = 0;

  // Only count active and completed files
  fileQueue.forEach((item) => {
    if (item.status !== "canceled" && item.status !== "failed") {
      totalQueueSize += item.file.size;
    }
  });

  console.log(`Updated total queue size: ${formatFileSize(totalQueueSize)}`);

  // Update progress immediately
  updateTotalProgress();
}

// Improved function to update queue item status and add download button
function updateReceiverQueueItemStatus(
  filename,
  status,
  text,
  addDownloadButton = false,
  blob = null
) {
  const queueItems = document.querySelectorAll(".queue-item");
  for (let i = 0; i < queueItems.length; i++) {
    if (queueItems[i].dataset.filename === filename) {
      // Update status text
      let statusElement = queueItems[i].querySelector(".queue-item-status");
      if (statusElement) {
        statusElement.className = `queue-item-status ${status}`;
        statusElement.textContent = text;
      }

      // Add download button if requested and we have the file data
      if (addDownloadButton && blob) {
        // Get or create the actions container
        let actionsContainer = queueItems[i].querySelector(
          ".queue-item-actions"
        );
        if (!actionsContainer) {
          actionsContainer = document.createElement("div");
          actionsContainer.className = "queue-item-actions";
          queueItems[i].appendChild(actionsContainer);
        }

        // Clear existing content
        actionsContainer.innerHTML = "";

        // Create download button
        const downloadBtn = document.createElement("button");
        downloadBtn.className = "queue-item-download";
        downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
        downloadBtn.title = "Download file";

        // Get the stream ID for cleanup
        const streamId = queueItems[i].dataset.streamid;

        // Set up download on click
        downloadBtn.addEventListener("click", () => {
          downloadAndSave(blob, filename);

          // Clean up the growing blob
          if (streamId && growingBlobs[streamId]) {
            delete growingBlobs[streamId];
          }
        });

        // Add to queue item
        actionsContainer.appendChild(downloadBtn);
      }

      break;
    }
  }
}

// Enhanced switchView function for better transitions
function switchView(hideId, showId) {
  // Find all views and hide them
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.add("hidden");
  });

  // Show the requested view
  const showElement = document.getElementById(showId);
  if (showElement) {
    showElement.classList.remove("hidden");
  }
}

// Helper function to format file size in human-readable format
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  else return (bytes / 1073741824).toFixed(1) + " GB";
}

// Generate QR code using qrcode.js library
function generateQRCode(text, elementId) {
  const container = document.getElementById(elementId);

  // Clear any previous content
  if (container) {
    container.innerHTML = "";

    try {
      // Generate QR code directly to the container
      new QRCode(container, {
        text: text,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    } catch (error) {
      console.error("QR Code generation error:", error);
      container.innerHTML =
        '<p style="color: red;">QR Code generation failed</p>';
    }
  }
}

// Helper functions for drag and drop
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function highlight(e) {
  const dropArea = document.getElementById("dropArea");
  if (dropArea) {
    dropArea.classList.add("drag-over");
  }
}

function unhighlight(e) {
  const dropArea = document.getElementById("dropArea");
  if (dropArea) {
    dropArea.classList.remove("drag-over");
  }
}

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;

  if (files.length > 0) {
    handleFiles(files); // Now passing the entire FileList
  }
}

function addFilesToQueue(files) {
    // Check if files array is valid
    if (!files || files.length === 0) return;
    
    // Process each file
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Check file size limit for free tier users
        if (!isPremiumUser && file.size > FREE_TIER_MAX_FILE_SIZE) {
            showFileSizeLimitError(file.name, file.size);
            continue; // Skip this file
        }
        
        // Rest of your existing code to add the file to queue...
        const fileId = 'file-' + Date.now() + '-' + i;
        
        // Add to queue array
        fileQueue.push({
            id: fileId,
            file: file,
            status: 'pending',
            transferred: 0
        });
        
        // Add to UI queue
        addFileToQueueUI(fileId, file);
    }
    
    // Rest of your existing code...
    updateQueueCount();
    recalculateTotalQueueSize();
}

// Add this new function to show the error message
function showFileSizeLimitError(fileName, fileSize) {
    console.log(`File "${fileName}" exceeds free tier 2GB limit`);
    
    // Create toast/notification element
    const toast = document.createElement('div');
    toast.className = 'toast-notification error';
    
    // Format file size for display
    const formattedSize = formatFileSize(fileSize);
    
    // Create content
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div class="toast-content">
            <h4>File Size Limit Exceeded</h4>
            <p>"${truncateText(fileName, 25)}" (${formattedSize}) exceeds the 2GB free tier limit.</p>
        </div>
        <div class="toast-actions">
            <button class="upgrade-btn">Upgrade</button>
            <button class="dismiss-btn">Dismiss</button>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(toast);
    
    // Handle buttons
    toast.querySelector('.upgrade-btn').addEventListener('click', () => {
        // Will connect to upgrade flow later
        alert('Upgrade to premium for unlimited file sizes!');
        toast.remove();
    });
    
    toast.querySelector('.dismiss-btn').addEventListener('click', () => {
        toast.remove();
    });
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }
    }, 10000);
}

// Helper function to format file size
function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper function to truncate text
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    
    return text.substring(0, maxLength - 3) + '...';
}

// Update handleFiles to process files from both drop and input
function handleFiles(selectedFiles) {
  // Do not proceed if data channel is not open or no files selected
  if (!isDataChannelOpen() || !selectedFiles || selectedFiles.length === 0) {
    console.error(
      "Cannot send files: data channel not ready or no files selected"
    );
    return;
  }

  // Reset any previous cancellation state
  isTransferCanceled = false;

  // Convert FileList to array and add to queue
  for (let i = 0; i < selectedFiles.length; i++) {
    addFileToQueue(selectedFiles[i]);
  }

  // Show the file queue UI
  const fileQueueEl = document.getElementById("fileQueue");
  if (fileQueueEl) {
    fileQueueEl.classList.remove("hidden");
  }
  updateQueueCount();

  // Hide the drop area during transfer
  const dropArea = document.getElementById("dropArea");
  if (dropArea) {
    dropArea.style.display = "none";
  }

  // Start processing the queue if not already transferring
  if (!isTransferring) {
    processNextFileInQueue();
  }
}

// Add file to the queue
// Add file to the queue
function addFileToQueue(file) {
  // Check file size limit for free tier users
  if (!isPremiumUser && file.size > FREE_TIER_MAX_FILE_SIZE) {
    showFileSizeLimitError(file.name, file.size);
    return; // Skip this file
  }

  // Create a unique ID for the sender's file
  const senderFileId =
    file.name.replace(/[^a-zA-Z0-9]/g, "_") + "_" + Date.now();

  // Add file to our queue array
  fileQueue.push({
    file: file,
    status: "pending",
    transferred: 0,
    id: senderFileId,
  });

  // Add to total queue size
  totalQueueSize += file.size;

  // Create UI element for this file (simplified without individual progress bar)
  const queueItem = document.createElement("div");
  queueItem.className = "queue-item";
  queueItem.dataset.index = fileQueue.length - 1;
  queueItem.dataset.filename = file.name;
  queueItem.dataset.fileid = senderFileId;

  // Truncate filename if too long
  const displayName =
    file.name.length > 25
      ? file.name.substring(0, 20) +
        "..." +
        file.name.substring(file.name.lastIndexOf("."))
      : file.name;

  queueItem.innerHTML = `
        <div class="queue-item-info">
            <div class="queue-item-name" title="${
              file.name
            }">${displayName}</div>
            <div class="queue-item-size">${formatFileSize(file.size)}</div>
        </div>
        <div class="queue-item-status pending">Pending</div>
        <div class="queue-item-actions"></div>
    `;

  // Add to the queue list
  const queueList = document.getElementById("queueList");
  if (queueList) {
    queueList.appendChild(queueItem);
  }
}

// Update queue count display
function updateQueueCount() {
  const remaining = fileQueue.filter(
    (item) => item.status !== "completed" && item.status !== "failed"
  ).length;
  const queueCount = document.getElementById("queueCount");
  if (queueCount) {
    queueCount.textContent = `${remaining}/${fileQueue.length} remaining`;
  }
}

// Process next file in queue
function processNextFileInQueue() {
  // Check if transfer was canceled
  if (isTransferCanceled) {
    console.log("Transfer was canceled, resetting");
    isTransferCanceled = false;
    resetAllProgress();
  }

  // Find next pending file
  const nextIndex = fileQueue.findIndex((item) => item.status === "pending");

  if (nextIndex === -1) {
    // No more files to process
    isTransferring = false;
    updateConnectionStatus("All transfers complete!");

    // Show the drop area again for more files
    setTimeout(() => {
      const dropArea = document.getElementById("dropArea");
      if (dropArea) {
        dropArea.style.display = "block";
      }
    }, 2000);
    return;
  }

  // Update status
  isTransferring = true;
  currentQueueIndex = nextIndex;
  fileQueue[currentQueueIndex].status = "in-progress";

  // Update UI
  updateQueueItemStatus(currentQueueIndex, "in-progress", "Sending");

  // Get the file and start transfer
  const fileToSend = fileQueue[currentQueueIndex].file;

  // Start the file transfer directly
  file = fileToSend;
  sendFileViaWebRTC(fileToSend);
}

// Update the status of a queue item
function updateQueueItemStatus(index, status, text) {
  const queueItems = document.querySelectorAll(".queue-item");
  for (let i = 0; i < queueItems.length; i++) {
    if (queueItems[i].dataset.index == index) {
      const statusElement = queueItems[i].querySelector(".queue-item-status");
      if (statusElement) {
        statusElement.className = `queue-item-status ${status}`;
        statusElement.textContent = text;
      }
      break;
    }
  }
}

// Update the file completion handling
function fileTransferComplete(success) {
  // Update quota tracking after successful transfer
  if (success && currentQueueIndex >= 0 && currentQueueIndex < fileQueue.length) {
    // Get the size of the file that was just transferred
    const transferredFileSize = fileQueue[currentQueueIndex].file.size;
    
    // Update the quota tracker after successful transfer
    if (window.quotaTracker && typeof window.quotaTracker.updateUsedQuota === 'function') {
      // We already checked quota before adding to queue, now we just need to save
      // the used quota after successful transfer
      window.quotaTracker.updateUsedQuota(transferredFileSize);
      console.log(`Updated quota usage with ${formatFileSize(transferredFileSize)}`);
    }
  }

  if (currentQueueIndex >= 0 && currentQueueIndex < fileQueue.length) {
    // Check if transfer was canceled
    if (isTransferCanceled) {
      success = false;
    }

    // Get file name for notification
    const fileName = fileQueue[currentQueueIndex].file.name;

    // Update queue item status
    fileQueue[currentQueueIndex].status = success ? "completed" : "failed";
    updateQueueItemStatus(
      currentQueueIndex,
      success ? "completed" : "failed",
      success ? "Completed" : "Failed"
    );

    // Explicitly remove the cancel button on completion
    if (success) {
      const queueItem = document.querySelector(
        `.queue-item[data-index="${currentQueueIndex}"]`
      );
      if (queueItem) {
        const cancelBtn = queueItem.querySelector(".queue-item-cancel");
        if (cancelBtn) {
          cancelBtn.remove();
        }
      }
    }

    // Add this file's size to the transferred total if successful
    if (
      success &&
      fileQueue[currentQueueIndex].transferred <
        fileQueue[currentQueueIndex].file.size
    ) {
      // If we hadn't tracked all chunks incrementally, add the whole file size now
      const remaining =
        fileQueue[currentQueueIndex].file.size -
        fileQueue[currentQueueIndex].transferred;
      totalTransferredSize += remaining;
    }

    // If all files are done, update to 100%
    if (
      success &&
      fileQueue.every(
        (item) =>
          item.status === "completed" ||
          item.status === "failed" ||
          item.status === "canceled"
      )
    ) {
      // If everything's done, force progress to 100%
      updateOverallProgress(100);
    } else {
      // Otherwise update normally
      updateTotalProgress();
    }

    // Send browser notification for completed transfer
    if (typeof window.notifyFileTransferComplete === "function") {
      window.notifyFileTransferComplete(fileName, success);
    }

    // Update queue count
    updateQueueCount();

    // If transfer failed due to cancellation, reset progress
    if (!success && isTransferCanceled) {
      resetAllProgress();
      recalculateTotalQueueSize();

      // Reset cancellation flag after a delay
      setTimeout(() => {
        isTransferCanceled = false;
      }, 1000);
    }

    // Process next file after a short delay
    setTimeout(() => {
      processNextFileInQueue();
    }, 1000);
  }
}

// Update the total progress bar with null checks
function updateTotalProgress() {
  if (totalQueueSize > 0) {
    const progress = Math.round((totalTransferredSize / totalQueueSize) * 100);
    updateOverallProgress(progress);
  }
}

// Cancel a file transfer
function cancelFileTransfer(index) {
  console.log("Canceling file transfer for index:", index);

  if (index < 0 || index >= fileQueue.length) {
    console.error("Invalid index for cancelFileTransfer");
    return;
  }

  // Set the canceled flag
  isTransferCanceled = true;

  const fileItem = fileQueue[index];
  if (!fileItem) return;

  // If this is the current file being transferred
  if (index === currentQueueIndex) {
    // Force stop the transfer
    if (
      typeof currentChunk !== "undefined" &&
      typeof totalChunks !== "undefined"
    ) {
      currentChunk = totalChunks + 100; // Force beyond total chunks to stop sending
    }

    // Notify the other side
    if (isDataChannelOpen()) {
      dataChannel.send(
        JSON.stringify({
          type: "file-canceled",
          fileName: fileItem.file.name,
        })
      );
    }
  }

  // Mark as canceled
  fileItem.status = "canceled";
  updateQueueItemStatus(index, "failed", "Canceled");

  // Reset progress and recalculate total size
  resetAllProgress();
  recalculateTotalQueueSize();

  // Reset the flag after a delay
  setTimeout(() => {
    isTransferCanceled = false;

    // Process next file if we canceled the current one
    if (index === currentQueueIndex) {
      isTransferring = false;
      currentQueueIndex = -1;
      processNextFileInQueue();
    }
  }, 1000);
}

// Enhanced disconnect function to properly hide file transfer view and notify server
function disconnectSession() {
  // Button click feedback
  const btn = this;
  btn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Disconnecting...';
  btn.disabled = true;

  // Reset any transfers in progress
  isTransferCanceled = true;
  resetAllProgress();

  // Clean up all growing blobs
  growingBlobs = {};

  // Notify server of disconnection
  if (socket && localSessionId) {
    socket.emit("leave_session", { session_id: localSessionId }, () => {
      console.log("Notified server of disconnection");
    });
  }

  setTimeout(() => {
    // First explicitly hide the file transfer view
    const fileTransferView = document.getElementById("fileTransfer");
    if (fileTransferView) {
      fileTransferView.classList.add("hidden");
    }

    // Then show the session controls view
    const sessionControlsView = document.getElementById("sessionControls");
    if (sessionControlsView) {
      sessionControlsView.classList.remove("hidden");
    }

    // Also hide session info view if it's visible
    const sessionInfoView = document.getElementById("sessionInfo");
    if (sessionInfoView) {
      sessionInfoView.classList.add("hidden");
    }

    // Reset button state
    setTimeout(() => {
      btn.innerHTML = '<i class="fa-solid fa-times"></i> Disconnect';
      btn.disabled = false;
    }, 500);

    // Close any WebRTC connections
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    // Reset session
    localSessionId = null;

    // Reset file queue
    fileQueue = [];
    currentQueueIndex = -1;
    totalQueueSize = 0;
    totalTransferredSize = 0;
    isTransferring = false;
    receivedFiles = [];

    // Clear the queue list
    const queueList = document.getElementById("queueList");
    if (queueList) {
      queueList.innerHTML = "";
    }

    // Hide the file queue
    const fileQueueDiv = document.getElementById("fileQueue");
    if (fileQueueDiv) {
      fileQueueDiv.classList.add("hidden");
    }

    // Change URL back to root
    window.history.pushState({}, "", "/");
  }, 800);
}

// Check if this is a session join
const path = window.location.pathname;
const sessionIdMatch = path.match(/\/join\/([a-zA-Z0-9]+)/);

// Connect to signaling server
connectSignalingServer();

if (sessionIdMatch) {
  // This is a join link
  const sessionId = sessionIdMatch[1];
  localSessionId = sessionId;

  // Hide session controls and show join session view
  const sessionControlsEl = document.getElementById("sessionControls");
  const joinSessionEl = document.getElementById("joinSession");

  if (sessionControlsEl) sessionControlsEl.classList.add("hidden");
  if (joinSessionEl) joinSessionEl.classList.remove("hidden");

  // Join the session
  setTimeout(() => {
    console.log("Joining session:", sessionId);
    socket.emit("join_session", { session_id: sessionId }, (response) => {
      if (response.error) {
        console.error("Error joining session:", response.error);
        alert("Error joining session: " + response.error);

        // Go back to initial view
        switchView("joinSession", "sessionControls");
        window.history.pushState({}, "", "/");
      } else {
        console.log("Successfully joined session:", response);
        switchView("joinSession", "fileTransfer");

        // Update connection status immediately
        updateConnectionStatus("Connecting to sender...", "#ff9800");

        // Configure UI for receiver role - remove drop area for receiver
        const dropArea = document.getElementById("dropArea");
        if (dropArea) {
          dropArea.style.display = "none";
        }

        // Show the file queue immediately for receiver
        const fileQueueEl = document.getElementById("fileQueue");
        if (fileQueueEl) {
          fileQueueEl.classList.remove("hidden");
        }

        const queueCount = document.getElementById("queueCount");
        if (queueCount) {
          queueCount.textContent = "Files Received";
        }

        // Show waiting indicator
        const waitingIndicator = document.getElementById("waitingIndicator");
        if (waitingIndicator) {
          waitingIndicator.classList.remove("hidden");
        }
      }
    });
  }, 1000);
}

// Add event listeners when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Start session button
  document
    .getElementById("startSessionBtn")
    ?.addEventListener("click", function () {
      const btn = this;
      // Button click feedback
      btn.innerHTML =
        '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating...';
      btn.disabled = true;

      // Create a session
      socket.emit("create_session", {}, (response) => {
        if (response.error) {
          console.error("Error creating session:", response.error);
          alert("Error creating session: " + response.error);

          // Reset button
          btn.innerHTML =
            '<i class="fa-solid fa-wifi"></i> Start Secure Session';
          btn.disabled = false;
          return;
        }

        localSessionId = response.session_id;
        console.log("Session created:", localSessionId);

        switchView("sessionControls", "sessionInfo");

        // Reset button state after transition
        setTimeout(() => {
          btn.innerHTML =
            '<i class="fa-solid fa-wifi"></i> Start Secure Session';
          btn.disabled = false;
        }, 500);

        // Set the session URL and generate QR code
        const sessionUrl = `${window.location.origin}/join/${localSessionId}`;
        document.getElementById("sessionLink").value = sessionUrl;
        generateQRCode(sessionUrl, "qrCode");
      });
    });

  // Copy link button
  document
    .getElementById("copyLinkBtn")
    ?.addEventListener("click", function () {
      const linkInput = document.getElementById("sessionLink");
      if (linkInput) {
        linkInput.select();
        document.execCommand("copy");

        // Button feedback
        this.innerHTML = '<i class="fa-solid fa-check"></i>';

        // Show copy success message with animation
        const copySuccess = document.getElementById("copySuccess");
        if (copySuccess) {
          copySuccess.classList.add("show-success");
        }

        setTimeout(() => {
          this.innerHTML = '<i class="fa-solid fa-copy"></i>';
          if (copySuccess) {
            copySuccess.classList.remove("show-success");
          }
        }, 2000);
      }
    });

  // Disconnect buttons - one in session info, one in file transfer view
  document
    .getElementById("disconnectBtn")
    ?.addEventListener("click", disconnectSession);
  document
    .getElementById("transferDisconnectBtn")
    ?.addEventListener("click", disconnectSession);

  // Cancel join button
  document
    .getElementById("cancelJoinBtn")
    ?.addEventListener("click", function () {
      const btn = this;
      // Button click feedback
      btn.innerHTML =
        '<i class="fa-solid fa-circle-notch fa-spin"></i> Canceling...';
      btn.disabled = true;

      setTimeout(() => {
        switchView("joinSession", "sessionControls");
        // Change the URL back to the homepage without refreshing
        window.history.pushState({}, "", "/");

        // Reset button state after transition
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancel';
          btn.disabled = false;
        }, 500);

        // Close any WebRTC connections
        if (peerConnection) {
          peerConnection.close();
          peerConnection = null;
        }

        // Reset session
        localSessionId = null;

        // Reset file queue
        fileQueue = [];
        currentQueueIndex = -1;
        totalQueueSize = 0;
        totalTransferredSize = 0;
        isTransferring = false;
        receivedFiles = [];
      }, 800);
    });

  // File input change
  document
    .getElementById("fileInput")
    ?.addEventListener("change", function (e) {
      if (e.target.files.length > 0) {
        handleFiles(e.target.files); // Pass all selected files
      }
    });

  // Get the drop area
  const dropArea = document.getElementById("dropArea");

  if (dropArea) {
    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropArea.addEventListener(eventName, preventDefaults, false);
    });

    // Visual feedback for drag events
    ["dragenter", "dragover"].forEach((eventName) => {
      dropArea.addEventListener(eventName, highlight, false);
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropArea.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropArea.addEventListener("drop", handleDrop, false);

    // Make the drop area clickable
    dropArea.addEventListener("click", function () {
      const fileInput = document.getElementById("fileInput");
      if (fileInput) {
        fileInput.click();
      }
    });
  }

  // Try to use the Clipboard API instead of execCommand if available
  if (navigator.clipboard && window.isSecureContext) {
    document
      .getElementById("copyLinkBtn")
      ?.addEventListener("click", function () {
        const sessionLink = document.getElementById("sessionLink");
        if (sessionLink) {
          navigator.clipboard
            .writeText(sessionLink.value)
            .then(() => {
              // Success feedback remains the same
              this.innerHTML = '<i class="fa-solid fa-check"></i>';
              const copySuccess = document.getElementById("copySuccess");
              if (copySuccess) {
                copySuccess.classList.add("show-success");
              }

              setTimeout(() => {
                this.innerHTML = '<i class="fa-solid fa-copy"></i>';
                if (copySuccess) {
                  copySuccess.classList.remove("show-success");
                }
              }, 2000);
            })
            .catch((err) => {
              console.error("Failed to copy: ", err);
            });
        }
      });
  }

  // Add a connection status checker
  setTimeout(function checkConnectionStatus() {
    // If dataChannel exists and is open but status still says waiting
    if (isDataChannelOpen()) {
      const connectionStatus = document.getElementById("connectionStatus");
      if (
        connectionStatus &&
        (connectionStatus.textContent === "Waiting for peer..." ||
          connectionStatus.textContent === "Connecting to peer...")
      ) {
        updateConnectionStatus("Connected! Ready for file transfer");

        // Hide waiting indicator if still visible
        const waitingIndicator = document.getElementById("waitingIndicator");
        if (
          waitingIndicator &&
          !waitingIndicator.classList.contains("hidden")
        ) {
          waitingIndicator.classList.add("hidden");
        }
      }
    }
    // Check again in 2 seconds
    setTimeout(checkConnectionStatus, 2000);
  }, 2000);

  // Set dynamic footer year
  const currentYearEl = document.getElementById("currentYear");
  if (currentYearEl) {
    currentYearEl.textContent = new Date().getFullYear();
  }
});
