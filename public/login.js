'use strict';

const el = {
  authForm: document.getElementById('authForm'),
  authEmail: document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  authSubmitBtn: document.getElementById('authSubmitBtn'),
  inviteAcceptForm: document.getElementById('inviteAcceptForm'),
  inviteNoteLabel: document.getElementById('inviteNoteLabel'),
  inviteEmail: document.getElementById('inviteEmail'),
  invitePassword: document.getElementById('invitePassword'),
  inviteAcceptBtn: document.getElementById('inviteAcceptBtn'),
  inviteCancelBtn: document.getElementById('inviteCancelBtn'),
  changePasswordForm: document.getElementById('changePasswordForm'),
  changePasswordIntro: document.getElementById('changePasswordIntro'),
  currentPasswordInput: document.getElementById('currentPasswordInput'),
  newPasswordInput: document.getElementById('newPasswordInput'),
  changePasswordBtn: document.getElementById('changePasswordBtn'),
  changePasswordCancelBtn: document.getElementById('changePasswordCancelBtn'),
  authError: document.getElementById('authError'),
  authSuccess: document.getElementById('authSuccess'),
};

let inviteToken = null;
let changePasswordForced = false;

// Deliberately doesn't touch authError/authSuccess -- callers that
// switch forms as part of an init-time decision (e.g. falling back to
// the sign-in form after an invalid invite link) still want that
// message visible; submit handlers clear it themselves when a fresh
// attempt starts.
function hideAllForms() {
  el.authForm.hidden = true;
  el.inviteAcceptForm.hidden = true;
  el.changePasswordForm.hidden = true;
}

function showError(message) {
  el.authError.textContent = message;
  el.authError.hidden = false;
  el.authSuccess.hidden = true;
}

async function fetchJson(url, options) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

function postJson(url, body) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function goToApp() {
  window.location.href = '/app.html';
}

// ---------- Sign in ----------------------------------------------------
//
// Self-signup is gone (see server/index.js) -- an account only exists if
// an admin created one or a member invited you, so this form only ever
// signs in.

function showAuthForm() {
  hideAllForms();
  el.authForm.hidden = false;
}

async function submitAuth(e) {
  e.preventDefault();
  el.authError.hidden = true;
  const email = el.authEmail.value.trim();
  const password = el.authPassword.value;
  if (!email || !password) {
    showError('Email and password are both required.');
    return;
  }
  try {
    const data = await postJson('/api/auth/login', { email, password });
    if (data.mustChangePassword) {
      showChangePasswordForm({ forced: true, currentPassword: password });
    } else {
      goToApp();
    }
  } catch (err) {
    showError(err.message);
  }
}

// ---------- Accept invite --------------------------------------------------

function clearInviteFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('invite');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

async function checkForInviteLink() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  if (!token) return false;

  try {
    const invite = await fetchJson(`/api/invites/${encodeURIComponent(token)}`);
    inviteToken = token;
    hideAllForms();
    el.inviteAcceptForm.hidden = false;
    el.inviteNoteLabel.textContent = invite.note ? `"${invite.note}" -- pick an email and password` : 'Pick an email and password to create your account';
    return true;
  } catch (err) {
    showError(`That invite link ${err.status === 410 ? 'is no longer valid' : "wasn't found"} (${err.message}).`);
    clearInviteFromUrl();
    return false;
  }
}

function cancelInviteAccept() {
  inviteToken = null;
  clearInviteFromUrl();
  showAuthForm();
}

async function submitAcceptInvite(e) {
  e.preventDefault();
  el.authError.hidden = true;
  const email = el.inviteEmail.value.trim();
  const password = el.invitePassword.value;
  if (!email || !password) {
    showError('Email and password are both required.');
    return;
  }
  try {
    await postJson('/api/auth/accept-invite', { token: inviteToken, email, password });
    clearInviteFromUrl();
    goToApp();
  } catch (err) {
    showError(err.message);
  }
}

// ---------- Change password (forced, or opted into from the app) ---------

function showChangePasswordForm({ forced, currentPassword }) {
  hideAllForms();
  changePasswordForced = forced;
  el.changePasswordForm.hidden = false;
  el.changePasswordIntro.textContent = forced
    ? 'Your password needs to be changed before you can continue.'
    : 'Change your password.';
  el.changePasswordCancelBtn.hidden = forced;
  el.currentPasswordInput.value = currentPassword || '';
  el.newPasswordInput.value = '';
  el.newPasswordInput.focus();
}

async function submitChangePassword(e) {
  e.preventDefault();
  el.authError.hidden = true;
  const currentPassword = el.currentPasswordInput.value;
  const newPassword = el.newPasswordInput.value;
  if (!currentPassword || !newPassword) {
    showError('Both fields are required.');
    return;
  }
  try {
    await postJson('/api/auth/change-password', { currentPassword, newPassword });
    goToApp();
  } catch (err) {
    showError(err.message);
  }
}

// ---------- Wire up + init --------------------------------------------------

el.authForm.addEventListener('submit', submitAuth);
el.inviteAcceptForm.addEventListener('submit', submitAcceptInvite);
el.inviteCancelBtn.addEventListener('click', cancelInviteAccept);
el.changePasswordForm.addEventListener('submit', submitChangePassword);
el.changePasswordCancelBtn.addEventListener('click', goToApp);

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const wantsChangePassword = params.get('changePassword') === '1';

  let me = null;
  try {
    me = await fetchJson('/api/auth/me');
  } catch {
    // not signed in
  }

  if (me) {
    if (me.mustChangePassword) {
      showChangePasswordForm({ forced: true });
    } else if (wantsChangePassword) {
      showChangePasswordForm({ forced: false });
    } else {
      goToApp();
    }
    return;
  }

  const handledInvite = await checkForInviteLink();
  if (!handledInvite) showAuthForm();
})();
