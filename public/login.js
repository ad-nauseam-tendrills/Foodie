'use strict';

const el = {
  authForm: document.getElementById('authForm'),
  authHousehold: document.getElementById('authHousehold'),
  authUsername: document.getElementById('authUsername'),
  authPassword: document.getElementById('authPassword'),
  authHint: document.getElementById('authHint'),
  authSubmitBtn: document.getElementById('authSubmitBtn'),
  authToggleModeBtn: document.getElementById('authToggleModeBtn'),
  inviteAcceptForm: document.getElementById('inviteAcceptForm'),
  inviteHouseholdLabel: document.getElementById('inviteHouseholdLabel'),
  inviteUsername: document.getElementById('inviteUsername'),
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
  browseLink: document.getElementById('browseLink'),
};

let authMode = 'login'; // 'login' | 'signup'
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

// ---------- Sign in / create household ----------------------------------

function setAuthMode(mode) {
  authMode = mode;
  el.authSubmitBtn.textContent = mode === 'signup' ? 'Create a new household' : 'Sign in';
  el.authToggleModeBtn.textContent =
    mode === 'signup' ? 'Already have an account? Sign in' : 'Starting a new household? Create one';
  el.authPassword.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  el.authHint.hidden = mode !== 'signup';
}

function showAuthForm() {
  hideAllForms();
  el.authForm.hidden = false;
  setAuthMode('login');
}

async function submitAuth(e) {
  e.preventDefault();
  el.authError.hidden = true;
  const household = el.authHousehold.value.trim();
  const username = el.authUsername.value.trim();
  const password = el.authPassword.value;
  if (!household || !username || !password) {
    showError('Household, username, and password are all required.');
    return;
  }
  try {
    const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const data = await postJson(endpoint, { household, username, password });
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
    el.inviteHouseholdLabel.textContent = `Joining "${invite.household}" -- pick a username and password`;
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
  const username = el.inviteUsername.value.trim();
  const password = el.invitePassword.value;
  if (!username || !password) {
    showError('Username and password are both required.');
    return;
  }
  try {
    await postJson('/api/auth/accept-invite', { token: inviteToken, username, password });
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
el.authToggleModeBtn.addEventListener('click', () => setAuthMode(authMode === 'signup' ? 'login' : 'signup'));
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
