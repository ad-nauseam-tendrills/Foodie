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
  usersStats: document.getElementById('usersStats'),
  usersSearch: document.getElementById('usersSearch'),
  usersFilterChips: document.getElementById('usersFilterChips'),
  bulkActionBar: document.getElementById('bulkActionBar'),
  bulkSelectedCount: document.getElementById('bulkSelectedCount'),
  bulkDeleteBtn: document.getElementById('bulkDeleteBtn'),
  bulkClearBtn: document.getElementById('bulkClearBtn'),
  usersList: document.getElementById('usersList'),
};

let myEmail = null;
let allUsers = [];
let activeFilter = 'all';
let editingId = null;
const selectedIds = new Set();

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

function patchJson(url, body) {
  return fetchJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

async function loadUsers() {
  allUsers = await fetchJson('/api/admin/users');
  // Selections/edits can't survive a user that's gone after a refresh.
  for (const id of [...selectedIds]) {
    if (!allUsers.some((u) => u.id === id)) selectedIds.delete(id);
  }
  if (editingId !== null && !allUsers.some((u) => u.id === editingId)) editingId = null;
  renderUsers();
}

function formatDate(iso) {
  // SQLite's datetime('now') gives "YYYY-MM-DD HH:MM:SS" (UTC, no
  // offset) -- Date can't parse that as-is without the "T"/"Z" ISO 8601
  // needs to know it's UTC rather than local time.
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function renderStats() {
  const total = allUsers.length;
  const admins = allUsers.filter((u) => u.isAdmin).length;
  const pending = allUsers.filter((u) => u.mustChangePassword).length;
  el.usersStats.textContent =
    `${total} user${total === 1 ? '' : 's'} · ${admins} admin${admins === 1 ? '' : 's'}` +
    (pending ? ` · ${pending} pending password change` : '');
}

function matchesFilter(u) {
  if (activeFilter === 'admins') return u.isAdmin;
  if (activeFilter === 'pending') return u.mustChangePassword;
  return true;
}

function renderBulkBar() {
  el.bulkActionBar.hidden = selectedIds.size === 0;
  el.bulkSelectedCount.textContent = `${selectedIds.size} selected`;
}

function renderUsers() {
  renderStats();
  renderBulkBar();

  const query = el.usersSearch.value.trim().toLowerCase();
  const filtered = allUsers.filter((u) => matchesFilter(u) && (!query || u.email.toLowerCase().includes(query)));

  el.usersList.innerHTML = '';
  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'admin-list-item muted';
    li.textContent = allUsers.length === 0 ? 'No users yet.' : 'No users match the current search/filter.';
    el.usersList.appendChild(li);
    return;
  }

  for (const u of filtered) {
    el.usersList.appendChild(u.id === editingId ? renderEditRow(u) : renderRow(u));
  }
}

function renderRow(u) {
  const li = document.createElement('li');
  li.className = 'admin-list-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selectedIds.has(u.id);
  checkbox.title = 'Select for bulk delete';
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedIds.add(u.id);
    else selectedIds.delete(u.id);
    renderBulkBar();
  });
  li.appendChild(checkbox);

  const text = document.createElement('span');
  text.className = 'admin-list-item-text';
  const emailLine = document.createElement('strong');
  emailLine.textContent = u.email === myEmail ? `${u.email} (you)` : u.email;
  text.appendChild(emailLine);
  const dateLine = document.createElement('span');
  dateLine.className = 'admin-list-item-detail';
  dateLine.textContent = `created ${formatDate(u.createdAt)}`;
  text.appendChild(dateLine);
  li.appendChild(text);

  const badges = document.createElement('span');
  badges.className = 'admin-badges';
  if (u.isAdmin) badges.innerHTML += `<span class="admin-badge admin">admin</span>`;
  if (u.mustChangePassword) badges.innerHTML += `<span class="admin-badge must-change">must change password</span>`;
  li.appendChild(badges);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.textContent = 'edit';
  editBtn.addEventListener('click', () => {
    editingId = u.id;
    renderUsers();
  });
  li.appendChild(editBtn);

  const genBtn = document.createElement('button');
  genBtn.type = 'button';
  genBtn.textContent = 'generate new password';
  genBtn.addEventListener('click', async () => {
    try {
      const data = await postJson(`/api/admin/users/${u.id}/reset-password`, {});
      showSuccess(`New password for ${u.email}: ${data.password} -- give it to them directly. They'll be forced to change it on next login.`);
      await loadUsers();
    } catch (err) {
      showError(err.message);
    }
  });
  li.appendChild(genBtn);

  const setBtn = document.createElement('button');
  setBtn.type = 'button';
  setBtn.textContent = 'set password';
  setBtn.addEventListener('click', async () => {
    const password = prompt(
      `New temporary password for ${u.email}\n(at least 14 characters, avoid common words/patterns -- they'll be forced to change it on next login)`
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
  li.appendChild(setBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'danger';
  deleteBtn.textContent = 'delete';
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Delete ${u.email}? This can't be undone.`)) return;
    try {
      await fetchJson(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      selectedIds.delete(u.id);
      await loadUsers();
    } catch (err) {
      showError(err.message);
    }
  });
  li.appendChild(deleteBtn);

  return li;
}

function renderEditRow(u) {
  const li = document.createElement('li');
  li.className = 'admin-list-item admin-list-item-editing';

  const emailInput = document.createElement('input');
  emailInput.type = 'text';
  emailInput.value = u.email;
  emailInput.className = 'admin-edit-email';
  li.appendChild(emailInput);

  const adminLabel = document.createElement('label');
  adminLabel.className = 'checkbox-label';
  const adminCheckbox = document.createElement('input');
  adminCheckbox.type = 'checkbox';
  adminCheckbox.checked = u.isAdmin;
  adminLabel.appendChild(adminCheckbox);
  adminLabel.append(' admin');
  li.appendChild(adminLabel);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'primary';
  saveBtn.textContent = 'save';
  saveBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const patch = {};
    if (email !== u.email) patch.email = email;
    if (adminCheckbox.checked !== !!u.isAdmin) patch.isAdmin = adminCheckbox.checked;
    if (Object.keys(patch).length === 0) {
      editingId = null;
      renderUsers();
      return;
    }
    try {
      await patchJson(`/api/admin/users/${u.id}`, patch);
      editingId = null;
      showSuccess(`Updated ${email || u.email}.`);
      await loadUsers();
    } catch (err) {
      showError(err.message);
    }
  });
  li.appendChild(saveBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'cancel';
  cancelBtn.addEventListener('click', () => {
    editingId = null;
    renderUsers();
  });
  li.appendChild(cancelBtn);

  return li;
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  const emails = allUsers.filter((u) => selectedIds.has(u.id)).map((u) => u.email);
  if (!confirm(`Delete ${emails.length} account${emails.length === 1 ? '' : 's'}?\n\n${emails.join('\n')}\n\nThis can't be undone.`)) {
    return;
  }
  const results = await Promise.allSettled(
    [...selectedIds].map((id) => fetchJson(`/api/admin/users/${id}`, { method: 'DELETE' }))
  );
  const failed = results.filter((r) => r.status === 'rejected');
  selectedIds.clear();
  await loadUsers();
  if (failed.length) {
    showError(`${failed.length} of ${results.length} deletions failed (e.g. your own account can't be deleted this way).`);
  } else {
    showSuccess(`Deleted ${results.length} account${results.length === 1 ? '' : 's'}.`);
  }
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
el.bulkDeleteBtn.addEventListener('click', bulkDelete);
el.bulkClearBtn.addEventListener('click', () => {
  selectedIds.clear();
  renderUsers();
});
el.usersFilterChips.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  for (const chip of el.usersFilterChips.querySelectorAll('.filter-chip')) {
    chip.classList.toggle('active', chip === btn);
  }
  renderUsers();
});

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
  myEmail = me.email;
  el.accountStatusText.textContent = `${me.email} (admin)`;
  await loadUsers();
})();
