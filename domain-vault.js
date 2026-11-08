/* RUMBO Guardian: opt-in encrypted domain context, browser Web Crypto only.
 * A passphrase is never persisted, and the AES key is non-extractable and held in memory.
 */
(function (root) {
  'use strict';
  const ITERATIONS = 310000;
  const VERSION = 1;
  const AAD = new TextEncoder().encode('RUMBO Guardian domain lists AES-GCM v1');
  const encode = new TextEncoder();
  const decode = new TextDecoder('utf-8', { fatal: true });

  function requireCrypto() {
    if (!root.crypto?.subtle || !root.crypto.getRandomValues) {
      throw new Error('Web Crypto requiere un contexto seguro HTTPS');
    }
    return root.crypto;
  }
  function base64(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      result += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(result);
  }
  function unbase64(encoded) {
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
      throw new Error('Formato cifrado inválido');
    }
    return Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  }
  function cleanLists(lists) {
    const clean = input => Array.isArray(input)
      ? [...new Set(input.filter(value => typeof value === 'string' && value.length <= 253 && value.length > 0))]
      : [];
    const blocked = clean(lists?.blocked);
    return {
      trusted: clean(lists?.trusted).filter(value => !blocked.includes(value)),
      blocked,
    };
  }
  async function deriveKey(passphrase, salt) {
    const crypto = requireCrypto();
    if (typeof passphrase !== 'string' || !passphrase) throw new Error('Frase secreta requerida');
    const input = await crypto.subtle.importKey('raw', encode.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      input, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  async function seal(lists, key, salt) {
    const crypto = requireCrypto();
    if (!(salt instanceof Uint8Array) || salt.byteLength !== 16) throw new Error('Sal inválida');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = encode.encode(JSON.stringify(cleanLists(lists)));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, payload
    );
    return { version: VERSION, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
      salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
  }
  function validate(record) {
    if (!record || record.version !== VERSION || record.kdf !== 'PBKDF2-SHA256' ||
        record.iterations !== ITERATIONS) throw new Error('Versión de archivo cifrado no soportada');
    const salt = unbase64(record.salt);
    const iv = unbase64(record.iv);
    const ciphertext = unbase64(record.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > 256000) {
      throw new Error('Estructura de archivo cifrado inválida');
    }
    return { salt, iv, ciphertext };
  }
  async function create(passphrase, lists) {
    if (typeof passphrase !== 'string' || passphrase.length < 12) {
      throw new Error('Usá una frase secreta de al menos 12 caracteres');
    }
    const salt = requireCrypto().getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const record = await seal(lists, key, salt);
    return { key, salt, record };
  }
  async function open(passphrase, record) {
    const crypto = requireCrypto();
    const { salt, iv, ciphertext } = validate(record);
    const key = await deriveKey(passphrase, salt);
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, ciphertext
    );
    const lists = cleanLists(JSON.parse(decode.decode(clear)));
    return { lists, key, salt };
  }
  const api = Object.freeze({ create, open, seal, cleanLists, validate });
  root.RumboGuardianDomainVault = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
