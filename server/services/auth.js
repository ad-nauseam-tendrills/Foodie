'use strict';

// Password hashing and session tokens using only Node's built-in crypto --
// no bcrypt/argon2 native module to compile, consistent with the rest of
// this app's "nothing to build on the server" approach.

const crypto = require('node:crypto');

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 14;

// No complexity rules (no forced uppercase/digit/symbol) -- length plus
// "not an obviously guessable word or pattern" does more for actual
// security than mandatory-special-character rules do, and it's less
// likely to push people toward "Password1!"-style passwords that satisfy
// a rule while being easy to guess anyway.
const BANNED_WORDS = [
  'password',
  'passwort',
  'secret',
  'letmein',
  'qwerty',
  'qwertyuiop',
  'asdfghjkl',
  'admin',
  'welcome',
  'changeme',
  'changeit',
  'login',
  'master',
  'dragon',
  'monkey',
  'football',
  'baseball',
  'princess',
  'sunshine',
  'iloveyou',
  'trustno1',
  'abc123',
  '123456',
  '12345678',
  '000000',
  'foodie',
];

// Word-boundary, not substring -- otherwise legitimate long passwords
// like "myAdministrativeAssistant2026" or "passwordlessFutureIsHere"
// get rejected just for containing "admin"/"password" as a sub-string of
// a longer, unrelated word.
const BANNED_WORD_PATTERNS = BANNED_WORDS.map((word) => ({ word, re: new RegExp(`\\b${word}\\b`, 'i') }));

/**
 * @param {string} password
 * @param {{ username?: string, household?: string }} [context] -- also
 *   rejects the password if it's built around the account's own
 *   username/household name, the most common "guessable" case a generic
 *   wordlist can't catch.
 * @returns {string|null} an error message, or null if the password passes.
 */
function validatePassword(password, context = {}) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  // The whole password is just one chunk repeated ("abcabcabc",
  // "aaaaaaaaaaaaaa") -- easy to type, easy to guess.
  if (/^(.+)\1+$/.test(password)) {
    return 'Password cannot be a repeated character or pattern';
  }
  // The same character five or more times in a row, even if the rest of
  // the password varies ("xaaaaaaaaaaaaay").
  if (/(.)\1{4,}/.test(password)) {
    return 'Password cannot contain a long run of the same character';
  }

  const lower = password.toLowerCase();
  for (const { word, re } of BANNED_WORD_PATTERNS) {
    if (re.test(password)) {
      return `Password cannot contain the word "${word}" -- it's too common/guessable`;
    }
  }
  for (const [label, value] of [
    ['username', context.username],
    ['household name', context.household],
  ]) {
    if (!value) continue;
    // Check the whole value ("bustos east") and each individual word in
    // it ("bustos", "east") -- a password containing just one word of a
    // multi-word household name is exactly as guessable as the full
    // phrase would be.
    const candidates = [String(value), ...String(value).split(/\s+/)];
    if (candidates.some((c) => c.length >= 3 && lower.includes(c.toLowerCase()))) {
      return `Password cannot contain your ${label}`;
    }
  }

  return null;
}

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

function inviteExpiryIso() {
  return new Date(Date.now() + INVITE_TTL_MS).toISOString();
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
  inviteExpiryIso,
  validatePassword,
  isLoginRateLimited,
  recordLoginAttempt,
  SESSION_TTL_MS,
  INVITE_TTL_MS,
  MIN_PASSWORD_LENGTH,
};
