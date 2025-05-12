/**
 * Secure File Transfer Application
 * Encryption Utilities
 * 
 * Last updated: 2025-05-10
 */

// Encryption constants
const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 12 bytes for AES-GCM

// Generate a random encryption key
async function generateEncryptionKey() {
    try {
        const key = await window.crypto.subtle.generateKey(
            {
                name: ENCRYPTION_ALGORITHM,
                length: KEY_LENGTH
            },
            true, // extractable
            ['encrypt', 'decrypt']
        );
        
        // Export the key to raw format
        const exportedKey = await window.crypto.subtle.exportKey('raw', key);
        return {
            key,
            exportedKey
        };
    } catch (error) {
        console.error('Error generating encryption key:', error);
        throw error;
    }
}

// Import a key from raw format
async function importEncryptionKey(keyData) {
    try {
        return await window.crypto.subtle.importKey(
            'raw',
            keyData,
            {
                name: ENCRYPTION_ALGORITHM,
                length: KEY_LENGTH
            },
            false, // not extractable
            ['decrypt']
        );
    } catch (error) {
        console.error('Error importing encryption key:', error);
        throw error;
    }
}

// Generate a random initialization vector
function generateIV() {
    return window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

// Encrypt a file chunk
async function encryptChunk(chunk, key, iv) {
    try {
        // Convert the chunk to an ArrayBuffer if it's not already
        const chunkArrayBuffer = chunk instanceof ArrayBuffer ? chunk : await chunk.arrayBuffer();
        
        // Encrypt the chunk
        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: ENCRYPTION_ALGORITHM,
                iv: iv
            },
            key,
            chunkArrayBuffer
        );
        
        return encryptedData;
    } catch (error) {
        console.error('Error encrypting chunk:', error);
        throw error;
    }
}

// Decrypt a file chunk
async function decryptChunk(encryptedChunk, key, iv) {
    try {
        // Decrypt the chunk
        const decryptedData = await window.crypto.subtle.decrypt(
            {
                name: ENCRYPTION_ALGORITHM,
                iv: iv
            },
            key,
            encryptedChunk
        );
        
        return decryptedData;
    } catch (error) {
        console.error('Error decrypting chunk:', error);
        throw error;
    }
}

// Convert ArrayBuffer to Base64 string (for key exchange)
function arrayBufferToBase64(buffer) {
    const binary = String.fromCharCode.apply(null, new Uint8Array(buffer));
    return window.btoa(binary);
}

// Convert Base64 string to ArrayBuffer (for key exchange)
function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}