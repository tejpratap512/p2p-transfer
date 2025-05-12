/**
 * Crypto Helper Functions for Secure File Transfer
 * 
 * Last updated: 2025-05-12 06:38:44
 * Author: Tej Vishwakarma
 */

// Generate a random encryption key
async function generateEncryptionKey() {
    try {
        // Generate a random key for AES-GCM
        const key = await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true, // Exportable
            ["encrypt", "decrypt"]
        );
        
        // Export the key to raw format for transmission
        const exportedKey = await window.crypto.subtle.exportKey("raw", key);
        
        return { key, exportedKey };
        
    } catch (error) {
        console.error('Error generating encryption key:', error);
        throw error;
    }
}

// Import an encryption key from raw format
async function importEncryptionKey(keyData) {
    try {
        return await window.crypto.subtle.importKey(
            "raw",
            keyData,
            {
                name: "AES-GCM",
                length: 256
            },
            false, // Not extractable
            ["encrypt", "decrypt"]
        );
    } catch (error) {
        console.error('Error importing encryption key:', error);
        throw error;
    }
}

// Generate a random initialization vector (IV)
function generateIV() {
    return window.crypto.getRandomValues(new Uint8Array(12));
}

// Safely encrypt an entire file (for post-transfer encryption)
async function safeEncryptFile(blob, key, iv) {
    try {
        // Read file as array buffer
        const arrayBuffer = await readBlobAsArrayBuffer(blob);
        
        // Console log for debugging
        console.log(`Safely encrypting file of size: ${arrayBuffer.byteLength} bytes`);
        
        // Use consistent encryption parameters
        const encryptParams = {
            name: "AES-GCM",
            iv: iv instanceof Uint8Array ? iv : new Uint8Array(iv),
            tagLength: 128
        };
        
        // Encrypt the data
        const encryptedData = await window.crypto.subtle.encrypt(
            encryptParams,
            key,
            arrayBuffer
        );
        
        // Return as a new Blob
        return new Blob([encryptedData], { type: blob.type });
    } catch (error) {
        console.error('Safe encryption failed:', error);
        // Return original blob if encryption fails
        return blob;
    }
}

// Safely decrypt an entire file
async function safeDecryptFile(blob, key, iv) {
    try {
        // Read file as array buffer
        const arrayBuffer = await readBlobAsArrayBuffer(blob);
        
        // Verify data integrity before decryption
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Empty or invalid encrypted data');
        }
        
        console.log(`Safely decrypting file of size: ${arrayBuffer.byteLength} bytes`);
        
        // Use consistent decryption parameters
        const decryptParams = {
            name: "AES-GCM",
            iv: iv instanceof Uint8Array ? iv : new Uint8Array(iv),
            tagLength: 128
        };
        
        // Attempt decryption with error handling
        const decryptedData = await window.crypto.subtle.decrypt(
            decryptParams,
            key,
            arrayBuffer
        );
        
        // Return as a new Blob
        return new Blob([decryptedData], { type: blob.type });
    } catch (error) {
        console.error('Safe decryption failed:', error);
        throw error; // Propagate the error
    }
}

// Encrypt a chunk of data (used in old approach, keeping for compatibility)
async function encryptChunk(data, key, iv) {
    try {
        // Ensure IV is properly formatted
        const ivArray = iv instanceof Uint8Array ? iv : new Uint8Array(iv);
        
        // Use consistent encryption parameters
        const encryptParams = {
            name: "AES-GCM",
            iv: ivArray,
            tagLength: 128
        };
        
        // Convert data to ArrayBuffer if needed
        const dataBuffer = data instanceof ArrayBuffer ? data : await data;
        
        // Encrypt the data
        return await window.crypto.subtle.encrypt(
            encryptParams,
            key,
            dataBuffer
        );
    } catch (error) {
        console.error('Encryption error:', error);
        throw error;
    }
}

// Decrypt a chunk of data (used in old approach, keeping for compatibility)
async function decryptChunk(data, key, iv) {
    try {
        // Ensure IV is properly formatted
        const ivArray = iv instanceof Uint8Array ? iv : new Uint8Array(iv);
        
        // Log decrypt attempt for debugging
        console.log(`Attempting to decrypt ${data.byteLength} bytes of data with AES-GCM`);
        
        // Use consistent decryption parameters
        const decryptParams = {
            name: "AES-GCM",
            iv: ivArray,
            tagLength: 128
        };
        
        // Perform decryption
        return await window.crypto.subtle.decrypt(
            decryptParams,
            key,
            data
        );
    } catch (error) {
        console.error('Decryption error:', error);
        throw error;
    }
}

// Helper function to convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Helper function to convert Base64 string to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Helper function to read a Blob as ArrayBuffer (defined in main.js but duplicated here for completeness)
function readBlobAsArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target.result);
        reader.onerror = error => reject(error);
        reader.readAsArrayBuffer(blob);
    });
}

// Detect and verify WebCrypto API support
function checkCryptoSupport() {
    if (window.crypto && window.crypto.subtle) {
        console.log('WebCrypto API supported');
        return true;
    } else {
        console.error('WebCrypto API not supported in this browser');
        return false;
    }
}

// Verify encryption support on load
document.addEventListener('DOMContentLoaded', function() {
    const supported = checkCryptoSupport();
    
    // Update any UI elements about crypto support
    const encryptionStatus = document.getElementById('encryptionStatus');
    if (encryptionStatus && !supported) {
        encryptionStatus.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Encryption not supported in this browser';
        encryptionStatus.className = 'encryption-status warning';
    }
});