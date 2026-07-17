/**
 * Secure local storage utilities
 * - Encrypts/decrypts JSON blobs using AES-GCM with a key derived from the
 *   user's GitHub provider token (via PBKDF2 with a fixed salt/version).
 * - Exposes helpers to save/load an encrypted recent-projects blob.
 */

const RECENT_PROJECTS_PREFIX = "rp_encrypted_v1";
const PBKDF2_SALT = "repodre-recent-projects-salt-v1";
const PBKDF2_ITER = 250000;

function utf8ToArray(str: string) {
  return new TextEncoder().encode(str);
}

function arrayToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArray(b64: string) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKeyFromToken(token: string) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    utf8ToArray(token),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: utf8ToArray(PBKDF2_SALT),
      iterations: PBKDF2_ITER,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function makeStorageKey(userId: string) {
  return `${RECENT_PROJECTS_PREFIX}:${userId}`;
}

export async function encryptForSession(token: string, userId: string, value: unknown) {
  const key = await deriveKeyFromToken(token + "::" + userId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = utf8ToArray(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  // store iv + cipher as base64 payload
  const payload = {
    iv: arrayToBase64(iv.buffer),
    data: arrayToBase64(cipher),
    v: 1,
  };
  localStorage.setItem(makeStorageKey(userId), JSON.stringify(payload));
}

export async function decryptForSession(token: string, userId: string) {
  const raw = localStorage.getItem(makeStorageKey(userId));
  if (!raw) return null;
  let payload: { iv: string; data: string; v: number } | null = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!payload || !payload.iv || !payload.data) return null;

  try {
    const key = await deriveKeyFromToken(token + "::" + userId);
    const iv = base64ToArray(payload.iv);
    const cipher = base64ToArray(payload.data);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, cipher);
    const text = new TextDecoder().decode(plain as ArrayBuffer);
    return JSON.parse(text);
  } catch (err) {
    // decryption failed (wrong key/session expired)
    return null;
  }
}

export function clearEncryptedRecentProjects(userId?: string) {
  if (userId) {
    localStorage.removeItem(makeStorageKey(userId));
    return;
  }
  // clear all user-scoped recent-project keys
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(RECENT_PROJECTS_PREFIX + ":")) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

export function hasEncryptedRecentProjects() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(RECENT_PROJECTS_PREFIX + ":")) return true;
    }
  } catch {}
  return false;
}
