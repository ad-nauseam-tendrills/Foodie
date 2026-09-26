'use strict';

const el = {
  accountStatusText: document.getElementById('accountStatusText'),
  signOutBtn: document.getElementById('signOutBtn'),
  createUserForm: document.getElementById('createUserForm'),
  newUserHousehold: document.getElementById('newUserHousehold'),
  householdOptions: document.getElementById('householdOptions'),
  newUserUsername: document.getElementById('newUserUsername'),
  newUserPassword: document.getElementById('newUserPassword'),
  newUserIsAdmin: document.getElementById('newUserIsAdmin'),
  adminError: document.getElementById('adminError'),
  adminSuccess: document.getElementById('adminSuccess'),
  householdsList: document.getElementById('householdsList'),
  usersList: document.getElementById('usersList'),
};

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

async function loadHouseholds() {
  const households = await fetchJson('/api/admin/households');
  el.householdsList.innerHTML = '';
  el.householdOptions.innerHTML = '';
  for (const h of households) {
    const li = document.createElement('li');
    li.className = 'admin-list-item';
    li.innerHTML = `<span><strong>${escapeHtml(h.name)}</strong> -- ${h.memberCount} member${h.memberCount === 1 ? '' : 's'}</span>`;
    el.householdsList.appendChild(li);

    const option = document.createElement('option');
    option.value = h.name;
    el.householdOptions.appendChild(option);
  }
}

async function loadUsers() {
  const users = await fetchJson('/api/admin/users');
  el.usersList.innerHTML = '';
  for (const u of users) {
    const li = document.createElement('li');
    li.className = 'admin-list-item';

    const text = document.createElement('span');
    text.innerHTML = `<strong>${escapeHtml(u.username)}</strong> @ ${escapeHtml(u.household)}`;
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
        `New temporary password for ${u.username} @ ${u.household}\n` +
          `(at least 14 characters, avoid common words/patterns -- they'll be forced to change it on next login)`
      );
      if (password === null) return;
      try {
        await postJson(`/api/admin/users/${u.id}/reset-password`, { password });
        showSuccess(`Password reset for ${u.username} @ ${u.household} -- give it to them directly.`);
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
      if (!confirm(`Delete ${u.username} @ ${u.household}? This can't be undone.`)) return;
      try {
        await fetchJson(`/api/admin/users/${u.id}`, { method: 'DELETE' });
        await Promise.all([loadUsers(), loadHouseholds()]);
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

  const household = el.newUserHousehold.value.trim();
  const username = el.newUserUsername.value.trim();
  const password = el.newUserPassword.value;
  const isAdmin = el.newUserIsAdmin.checked;

  if (!household || !username || !password) {
    showError('Household, username, and password are all required.');
    return;
  }

  try {
    await postJson('/api/admin/users', { household, username, password, isAdmin });
    showSuccess(
      `Created ${username} @ ${household}. Give them the household, username, and temporary password directly -- ` +
        `they'll be forced to set a new one on first login.`
    );
    el.newUserHousehold.value = '';
    el.newUserUsername.value = '';
    el.newUserPassword.value = '';
    el.newUserIsAdmin.checked = false;
    await Promise.all([loadUsers(), loadHouseholds()]);
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
  el.accountStatusText.textContent = `${me.username} @ ${me.household} (admin)`;
  await Promise.all([loadHouseholds(), loadUsers()]);
})();
