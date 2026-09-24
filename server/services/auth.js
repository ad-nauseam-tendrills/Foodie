'use strict';

// Password hashing and session tokens using only Node's built-in crypto --
// no bcrypt/argon2 native module to compile, consistent with the rest of
// this app's "nothing to build on the server" approach.

const crypto = require('node:crypto');

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHashHex) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function tokenExpiryIso() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

// In-memory login-attempt limiter. This runs as a single small process
// with no Redis, so "good enough for one instance, resets on restart"
// beats pulling in infrastructure for a personal app -- the only thing at
// stake is slowing down brute force, not perfect bookkeeping.
const attempts = new Map();

function isLoginRateLimited(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(key, success) {
  if (success) {
    attempts.delete(key);
    return;
  }
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  tokenExpiryIso,
  isLoginRateLimited,
  recordLoginAttempt,
  SESSION_TTL_MS,
};
