'use strict';

const el = {
  accountStatusText: document.getElementById('accountStatusText'),
  signOutBtn: document.getElementById('signOutBtn'),
  createUserForm: document.getElementById('createUserForm'),
  newUserEmail: document.getElementById('newUserEmail'),
  newUserPassword: document.getElementById('newUserPassword'),
  newUserIsAdmin: document.getElementById('newUserIsAdmin'),
  adminError: document.getElementById('adminError'),
  adminSuccess: document.getElementById('adminSuccess'),
  usersSearch: document.getElementById('usersSearch'),
  usersList: document.getElementById('usersList'),
};

let allUsers = [];

async function fetchJson(url, options) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
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

async function loadUsers() {
  allUsers = await fetchJson('/api/admin/users');
  renderUsers();
}

function renderUsers() {
  const query = el.usersSearch.value.trim().toLowerCase();
  const filtered = query ? allUsers.filter((u) => u.email.toLowerCase().includes(query)) : allUsers;

  el.usersList.innerHTML = '';
  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'admin-list-item muted';
    li.textContent = query ? 'No users match that search.' : 'No users yet.';
    el.usersList.appendChild(li);
    return;
  }

  for (const u of filtered) {
    const li = document.createElement('li');
    li.className = 'admin-list-item';

    const text = document.createElement('span');
    text.innerHTML = `<strong>${escapeHtml(u.email)}</strong>`;
    li.appendChild(text);

    const badges = document.createElement('span');
    badges.className = 'admin-badges';
    if (u.isAdmin) badges.innerHTML += `<span class="admin-badge admin">admin</span>`;
    if (u.mustChangePassword) badges.innerHTML += `<span class="admin-badge must-change">must change password</span>`;
    li.appendChild(badges);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'reset password';
    resetBtn.addEventListener('click', async () => {
      const password = prompt(
        `New temporary password for ${u.email}\n` +
          `(at least 14 characters, avoid common words/patterns -- they'll be forced to change it on next login)`
      );
      if (password === null) return;
      try {
        await postJson(`/api/admin/users/${u.id}/reset-password`, { password });
        showSuccess(`Password reset for ${u.email} -- give it to them directly.`);
        await loadUsers();
      } catch (err) {
        showError(err.message);
      }
    });
    li.appendChild(resetBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'delete';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete ${u.email}? This can't be undone.`)) return;
      try {
        await fetchJson(`/api/admin/users/${u.id}`, { method: 'DELETE' });
        await loadUsers();
      } catch (err) {
        showError(err.message);
      }
    });
    li.appendChild(deleteBtn);

    el.usersList.appendChild(li);
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showError(message) {
  el.adminError.textContent = message;
  el.adminError.hidden = false;
  el.adminSuccess.hidden = true;
}

function showSuccess(message) {
  el.adminSuccess.textContent = message;
  el.adminSuccess.hidden = false;
  el.adminError.hidden = true;
}

async function submitCreateUser(e) {
  e.preventDefault();
  el.adminError.hidden = true;
  el.adminSuccess.hidden = true;

  const email = el.newUserEmail.value.trim();
  const password = el.newUserPassword.value;
  const isAdmin = el.newUserIsAdmin.checked;

  if (!email || !password) {
    showError('Email and password are both required.');
    return;
  }

  try {
    await postJson('/api/admin/users', { email, password, isAdmin });
    showSuccess(`Created ${email}. Give them the email and temporary password directly -- they'll be forced to set a new one on first login.`);
    el.newUserEmail.value = '';
    el.newUserPassword.value = '';
    el.newUserIsAdmin.checked = false;
    await loadUsers();
  } catch (err) {
    showError(err.message);
  }
}

async function signOut() {
  await fetchJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/';
}

el.createUserForm.addEventListener('submit', submitCreateUser);
el.signOutBtn.addEventListener('click', signOut);
el.usersSearch.addEventListener('input', renderUsers);

(async function init() {
  let me;
  try {
    me = await fetchJson('/api/auth/me');
  } catch {
    window.location.href = '/';
    return;
  }
  if (me.mustChangePassword) {
    window.location.href = '/?changePassword=1';
    return;
  }
  if (!me.isAdmin) {
    window.location.href = '/app.html';
    return;
  }
  el.accountStatusText.textContent = `${me.email} (admin)`;
  await loadUsers();
})();
