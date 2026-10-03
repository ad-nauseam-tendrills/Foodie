'use strict';

const state = {
  auth: null, // { email, isAdmin } once signed in
  liked: [],
  disliked: [],
  filterTags: [], // tag filter chips (AND'd together)
  planned: [], // recipe IDs currently in the meal plan
  favorites: [], // recipe IDs saved by this account
  pantry: [], // structured pantry items: { ingredient, quantity, unit, price, store, ... }
  lastResults: [], // most recent /api/recipes/match results, for client-side re-sort
  allUsers: [], // cached /api/users listing, for the browse panel's search box
};

const el = {
  menuToggleBtn: document.getElementById('menuToggleBtn'),
  bottomMenuBtn: document.getElementById('bottomMenuBtn'),
  drawerOverlay: document.getElementById('drawerOverlay'),
  drawer: document.getElementById('drawer'),
  drawerClose: document.getElementById('drawerClose'),
  accountStatusText: document.getElementById('accountStatusText'),
  adminLink: document.getElementById('adminLink'),
  changePasswordLink: document.getElementById('changePasswordLink'),
  signOutBtn: document.getElementById('signOutBtn'),
  signOutAllBtn: document.getElementById('signOutAllBtn'),
  signInLink: document.getElementById('signInLink'),
  nameSearchInput: document.getElementById('nameSearchInput'),
  favoritesOnlyToggle: document.getElementById('favoritesOnlyToggle'),
  likeInput: document.getElementById('likeInput'),
  likeTags: document.getElementById('likeTags'),
  likeSuggestions: document.getElementById('likeSuggestions'),
  dislikeInput: document.getElementById('dislikeInput'),
  dislikeTags: document.getElementById('dislikeTags'),
  dislikeSuggestions: document.getElementById('dislikeSuggestions'),
  saveBtn: document.getElementById('saveBtn'),
  matchBtn: document.getElementById('matchBtn'),
  savedExclusionsLine: document.getElementById('savedExclusionsLine'),
  results: document.getElementById('results'),
  resultsCount: document.getElementById('resultsCount'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalBody: document.getElementById('modalBody'),
  modalClose: document.getElementById('modalClose'),
  categorySelect: document.getElementById('categorySelect'),
  areaSelect: document.getElementById('areaSelect'),
  tagInput: document.getElementById('tagInput'),
  filterTags: document.getElementById('filterTags'),
  tagOptions: document.getElementById('tagOptions'),
  quickToggle: document.getElementById('quickToggle'),
  seasonalToggle: document.getElementById('seasonalToggle'),
  seasonalLabel: document.getElementById('seasonalLabel'),
  seasonalInfoBtn: document.getElementById('seasonalInfoBtn'),
  seasonalInfoBox: document.getElementById('seasonalInfoBox'),
  sortSelect: document.getElementById('sortSelect'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),
  plannedList: document.getElementById('plannedList'),
  planEmptyState: document.getElementById('planEmptyState'),
  groceryListWrap: document.getElementById('groceryListWrap'),
  groceryList: document.getElementById('groceryList'),
  pantryPanel: document.getElementById('pantryPanel'),
  pantryIngredient: document.getElementById('pantryIngredient'),
  pantrySuggestions: document.getElementById('pantrySuggestions'),
  pantryQuantity: document.getElementById('pantryQuantity'),
  pantryUnit: document.getElementById('pantryUnit'),
  pantryPrice: document.getElementById('pantryPrice'),
  pantryStore: document.getElementById('pantryStore'),
  pantryAddBtn: document.getElementById('pantryAddBtn'),
  pantryScanBtn: document.getElementById('pantryScanBtn'),
  pantryInventoryList: document.getElementById('pantryInventoryList'),
  pantryEmptyState: document.getElementById('pantryEmptyState'),
  scannerOverlay: document.getElementById('scannerOverlay'),
  scannerClose: document.getElementById('scannerClose'),
  scannerCameraWrap: document.getElementById('scannerCameraWrap'),
  scannerVideo: document.getElementById('scannerVideo'),
  scannerStatus: document.getElementById('scannerStatus'),
  scannerManualInput: document.getElementById('scannerManualInput'),
  scannerManualBtn: document.getElementById('scannerManualBtn'),
  insightsPanel: document.getElementById('insightsPanel'),
  canMakeNowList: document.getElementById('canMakeNowList'),
  canMakeNowEmpty: document.getElementById('canMakeNowEmpty'),
  unlockList: document.getElementById('unlockList'),
  unlockEmpty: document.getElementById('unlockEmpty'),
  restockList: document.getElementById('restockList'),
  restockEmpty: document.getElementById('restockEmpty'),
  invitePanel: document.getElementById('invitePanel'),
  inviteNote: document.getElementById('inviteNote'),
  generateInviteBtn: document.getElementById('generateInviteBtn'),
  inviteLinkBox: document.getElementById('inviteLinkBox'),
  inviteLinkOutput: document.getElementById('inviteLinkOutput'),
  copyInviteLinkBtn: document.getElementById('copyInviteLinkBtn'),
  pendingInvitesList: document.getElementById('pendingInvitesList'),
  browseUsersPanel: document.getElementById('browseUsersPanel'),
  userSearchInput: document.getElementById('userSearchInput'),
  userBrowseList: document.getElementById('userBrowseList'),
  browseUserResult: document.getElementById('browseUserResult'),
  browseUserTitle: document.getElementById('browseUserTitle'),
  browseUserCookStats: document.getElementById('browseUserCookStats'),
  browseLiked: document.getElementById('browseLiked'),
  browseDisliked: document.getElementById('browseDisliked'),
  browsePlanned: document.getElementById('browsePlanned'),
  browsePantryList: document.getElementById('browsePantryList'),
  browsePantryEmpty: document.getElementById('browsePantryEmpty'),
};

// ---------- Drawer (account menu + invites + browse-other-users) --------
//
// Everything that isn't part of the main "find something to cook, plan
// it, stock the pantry" flow -- account actions, inviting someone,
// browsing other accounts -- lives in a slide-in drawer instead of taking
// up scroll space in the main column. Opened from either the topbar
// hamburger (desktop) or the bottom tab bar's "More" button (mobile);
// both point at the same drawer.

function openDrawer() {
  el.drawer.classList.add('open');
  el.drawerOverlay.classList.remove('hidden');
  document.body.classList.add('drawer-open'); // locks background scroll behind the overlay
}

function closeDrawer() {
  el.drawer.classList.remove('open');
  el.drawerOverlay.classList.add('hidden');
  document.body.classList.remove('drawer-open');
}

// ---------- Tag input helper --------------------------------------------

function renderTags(list, container, kind, onChange) {
  container.innerHTML = '';
  for (const value of list) {
    const tag = document.createElement('span');
    tag.className = 'tag' + (kind === 'dislike' ? ' dislike' : '');
    tag.textContent = value;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', `Remove ${value}`);
    removeBtn.addEventListener('click', () => {
      const idx = list.indexOf(value);
      if (idx !== -1) list.splice(idx, 1);
      renderTags(list, container, kind, onChange);
      if (onChange) onChange();
    });
    tag.appendChild(removeBtn);
    container.appendChild(tag);
  }
}

function addTag(list, container, kind, rawValue, onChange) {
  const value = rawValue.trim();
  if (!value) return;
  if (!list.some((v) => v.toLowerCase() === value.toLowerCase())) {
    list.push(value);
    renderTags(list, container, kind, onChange);
  }
}

function wireTagInput({ input, tagsContainer, suggestionsContainer, list, kind, onChange }) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(list, tagsContainer, kind, input.value, onChange);
      input.value = '';
      suggestionsContainer.innerHTML = '';
      if (onChange) onChange();
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      list.pop();
      renderTags(list, tagsContainer, kind, onChange);
      if (onChange) onChange();
    }
  });

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      suggestionsContainer.innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(async () => {
      const options = await fetchJson(`/api/ingredients?q=${encodeURIComponent(q)}`);
      suggestionsContainer.innerHTML = '';
      for (const option of options.slice(0, 8)) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion-chip';
        chip.textContent = option;
        chip.addEventListener('click', () => {
          addTag(list, tagsContainer, kind, option, onChange);
          input.value = '';
          suggestionsContainer.innerHTML = '';
          input.focus();
          if (onChange) onChange();
        });
        suggestionsContainer.appendChild(chip);
      }
    }, 150);
  });
}

// A chip list with no autocomplete fetch behind it -- used for the recipe
// tag filter, where the options come from a <datalist> instead of an
// ingredient search.
function wireTagChipInput({ input, tagsContainer, list, onChange }) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(list, tagsContainer, 'filter', input.value, onChange);
      input.value = '';
      if (onChange) onChange();
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      list.pop();
      renderTags(list, tagsContainer, 'filter', onChange);
      if (onChange) onChange();
    }
  });
}

// Simple single-value autocomplete (not a tag list) -- used for the
// pantry ingredient input, which adds one item at a time rather than
// building up a chip list.
function wireIngredientAutocomplete(input, suggestionsContainer) {
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      suggestionsContainer.innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(async () => {
      const options = await fetchJson(`/api/ingredients?q=${encodeURIComponent(q)}`);
      suggestionsContainer.innerHTML = '';
      for (const option of options.slice(0, 8)) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion-chip';
        chip.textContent = option;
        chip.addEventListener('click', () => {
          input.value = option;
          suggestionsContainer.innerHTML = '';
          input.focus();
        });
        suggestionsContainer.appendChild(chip);
      }
    }, 150);
  });
}

// ---------- Networking ---------------------------------------------------

async function fetchJson(url, options) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

function postJson(url, body) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

// ---------- Auth (signing in/up/accepting invites lives on the login
// page -- this is just the signed-in indicator + sign-out) --

function renderAccountBar() {
  el.accountStatusText.textContent = state.auth.email;
  el.adminLink.hidden = !state.auth.isAdmin;
  el.changePasswordLink.hidden = false;
  el.signOutBtn.hidden = false;
  el.signOutAllBtn.hidden = false;
  el.signInLink.hidden = true;
}

async function onSignedIn(data) {
  state.auth = { email: data.email, isAdmin: !!data.isAdmin };
  renderAccountBar();
  el.pantryPanel.hidden = false;
  el.insightsPanel.hidden = false;
  el.invitePanel.hidden = false;
  el.browseUsersPanel.hidden = false;

  await loadMeState();
  await Promise.all([loadPantry(), loadGroceryList(), loadInsights(), loadInvites(), loadUsersList()]);
  findDinner().catch(() => {});
}

// The app requires a session, full stop -- so signing out (of this
// device, or of everywhere) leaves nothing on this page worth showing.
// Straight back to the login page, same as an expired/missing session.
async function signOut() {
  await fetchJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/';
}

async function signOutAll() {
  await fetchJson('/api/auth/logout-all', { method: 'POST' }).catch(() => {});
  window.location.href = '/';
}

async function loadMeState() {
  const data = await fetchJson('/api/me');
  state.liked = data.liked;
  state.disliked = data.disliked;
  state.planned = data.planned || [];
  state.favorites = data.favorites || [];
  renderTags(state.liked, el.likeTags, 'like', findDinner);
  renderTags(state.disliked, el.dislikeTags, 'dislike', findDinner);
  renderSavedExclusionsLine();
}

function renderSavedExclusionsLine() {
  if (state.disliked.length) {
    el.savedExclusionsLine.textContent = `Saved exclusion${state.disliked.length > 1 ? 's' : ''}: ${state.disliked.join(', ')}`;
    el.savedExclusionsLine.hidden = false;
  } else {
    el.savedExclusionsLine.hidden = true;
  }
}

async function savePreferences() {
  await fetchJson('/api/me/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ liked: state.liked, disliked: state.disliked }),
  });
  el.accountStatusText.textContent = `${state.auth.email} -- saved`;
  renderSavedExclusionsLine();
}

// ---------- Matching & rendering ------------------------------------------

function activeFilterCount() {
  let count = 0;
  if (el.nameSearchInput.value.trim()) count += 1;
  if (el.categorySelect.value) count += 1;
  if (el.areaSelect.value) count += 1;
  if (el.quickToggle.checked) count += 1;
  else if (state.filterTags.length) count += 1;
  if (el.favoritesOnlyToggle.checked) count += 1;
  if (el.seasonalToggle.checked) count += 1;
  return count;
}

async function findDinner() {
  const have = state.liked.join(',');
  const exclude = state.disliked.join(',');
  const category = el.categorySelect.value;
  const categoryParam = category ? `&category=${encodeURIComponent(category)}` : '';
  const area = el.areaSelect.value;
  const areaParam = area ? `&area=${encodeURIComponent(area)}` : '';
  // The quick-toggle takes over the tag filter (server-side "quick" is
  // just the existing "Quick" tag, applied on curated recipes like
  // sloppy joes, potato pancakes, pancakes, ...) without discarding
  // whatever tags were already picked -- unchecking it brings them back.
  const tags = el.quickToggle.checked ? ['Quick'] : state.filterTags;
  const tagParam = tags.length ? `&tag=${encodeURIComponent(tags.join(','))}` : '';
  const seasonalParam = el.seasonalToggle.checked ? `&seasonal=true` : '';
  const nameQuery = el.nameSearchInput.value.trim();
  const nameParam = nameQuery ? `&q=${encodeURIComponent(nameQuery)}` : '';
  const favoritesOnlyParam = el.favoritesOnlyToggle.checked ? `&favoritesOnly=true` : '';
  // Favorites/plan context is always your own, even while browsing
  // another user's data read-only elsewhere on the page -- searching
  // should never quietly start reflecting someone else's saved recipes.
  const emailParam = state.auth ? `&email=${encodeURIComponent(state.auth.email)}` : '';
  el.results.innerHTML = '<p class="empty-state">Looking…</p>';

  const recipes = await fetchJson(
    `/api/recipes/match?have=${encodeURIComponent(have)}&exclude=${encodeURIComponent(exclude)}` +
      `${categoryParam}${areaParam}${tagParam}${seasonalParam}${nameParam}${favoritesOnlyParam}${emailParam}`
  );
  state.lastResults = recipes;
  renderResults();
}

function renderResults() {
  const recipes = [...state.lastResults];
  if (el.sortSelect.value === 'name') {
    recipes.sort((a, b) => a.name.localeCompare(b.name));
  }

  const filterCount = activeFilterCount();
  el.resultsCount.textContent = recipes.length
    ? `${recipes.length} match${recipes.length === 1 ? '' : 'es'}${filterCount ? ` · ${filterCount} filter${filterCount === 1 ? '' : 's'} active` : ''}`
    : filterCount
      ? `0 matches · ${filterCount} filter${filterCount === 1 ? '' : 's'} active`
      : '';
  el.results.innerHTML = '';

  if (!recipes.length) {
    el.results.innerHTML = '<p class="empty-state">No matches yet -- try different ingredients or filters.</p>';
    return;
  }

  for (const recipe of recipes) {
    el.results.appendChild(renderRecipeCard(recipe));
  }
}

function clearFilters() {
  el.nameSearchInput.value = '';
  el.categorySelect.value = '';
  el.areaSelect.value = '';
  el.quickToggle.checked = false;
  el.tagInput.disabled = false;
  state.filterTags = [];
  renderTags(state.filterTags, el.filterTags, 'filter', null);
  el.favoritesOnlyToggle.checked = false;
  el.seasonalToggle.checked = false;
  el.sortSelect.value = 'match';
  findDinner();
}

function renderRecipeCard(recipe) {
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.addEventListener('click', () => openRecipeModal(recipe.id));

  const img = document.createElement('img');
  img.src = recipe.imageUrl || '';
  img.alt = recipe.name;
  img.loading = 'lazy';
  card.appendChild(img);

  const body = document.createElement('div');
  body.className = 'card-body';

  const badge = document.createElement('span');
  badge.className = 'match-badge' + (recipe.matchPct < 50 ? ' low' : '');
  badge.textContent = `${recipe.matchPct}% match`;
  body.appendChild(badge);

  const title = document.createElement('h3');
  title.textContent = recipe.name;
  body.appendChild(title);

  if (recipe.category || recipe.area || (recipe.tags && recipe.tags.length)) {
    const meta = document.createElement('p');
    meta.className = 'card-meta-line';
    meta.textContent = [recipe.category, recipe.area, ...(recipe.tags || [])].filter(Boolean).join(' • ');
    body.appendChild(meta);
  }

  if (recipe.seasonalIngredients && recipe.seasonalIngredients.length) {
    const seasonal = document.createElement('p');
    seasonal.className = 'seasonal-badge';
    seasonal.textContent = `🍂 In season: ${recipe.seasonalIngredients.slice(0, 3).join(', ')}`;
    body.appendChild(seasonal);
  }

  if (recipe.missingIngredients.length) {
    const missing = document.createElement('p');
    missing.className = 'missing-line';
    missing.textContent = `Need: ${recipe.missingIngredients.slice(0, 3).join(', ')}${
      recipe.missingIngredients.length > 3 ? '…' : ''
    }`;
    body.appendChild(missing);
  }

  if (recipe.recentlyCooked) {
    const note = document.createElement('p');
    note.className = 'recently-cooked';
    note.textContent = 'Cooked recently';
    body.appendChild(note);
  }

  const actionsRow = document.createElement('div');
  actionsRow.className = 'card-actions-row';
  if (state.auth) actionsRow.appendChild(createFavoriteButton(recipe.id, recipe.isFavorite));
  actionsRow.appendChild(createAddToPlanButton(recipe.id));
  body.appendChild(actionsRow);

  card.appendChild(body);
  return card;
}

function createFavoriteButton(recipeId, isFavorite) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'favorite-btn' + (isFavorite ? ' active' : '');
  btn.textContent = isFavorite ? '★' : '☆';
  btn.title = isFavorite ? 'Remove from favorites' : 'Save as favorite';
  let active = isFavorite;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (active) {
      await fetchJson(`/api/me/favorites/${recipeId}`, { method: 'DELETE' });
    } else {
      await postJson('/api/me/favorites', { recipeId });
    }
    active = !active;
    btn.className = 'favorite-btn' + (active ? ' active' : '');
    btn.textContent = active ? '★' : '☆';
    btn.title = active ? 'Remove from favorites' : 'Save as favorite';
  });
  return btn;
}

async function openRecipeModal(id) {
  const recipe = await fetchJson(`/api/recipes/${id}`);
  const likedSet = new Set(state.liked.map((s) => s.toLowerCase()));

  el.modalBody.innerHTML = '';

  if (recipe.image_url) {
    const img = document.createElement('img');
    img.src = recipe.image_url;
    img.alt = recipe.name;
    el.modalBody.appendChild(img);
  }

  const title = document.createElement('h2');
  title.textContent = recipe.name;
  el.modalBody.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'muted';
  meta.textContent = [recipe.category, recipe.area].filter(Boolean).join(' • ');
  el.modalBody.appendChild(meta);

  const list = document.createElement('ul');
  list.className = 'ingredient-list';
  for (const ing of recipe.ingredients) {
    const li = document.createElement('li');
    const have = [...likedSet].some((l) => ing.name.toLowerCase().includes(l) || l.includes(ing.name.toLowerCase()));
    if (!have) li.className = 'missing';
    li.textContent = ing.measure ? `${ing.measure} ${ing.name}` : ing.name;
    list.appendChild(li);
  }
  el.modalBody.appendChild(list);

  const instructions = document.createElement('p');
  instructions.className = 'instructions';
  instructions.textContent = recipe.instructions || '';
  el.modalBody.appendChild(instructions);

  if (state.auth) {
    const actions = document.createElement('div');
    actions.className = 'actions';

    const planBtn = createAddToPlanButton(recipe.id);
    planBtn.classList.add('secondary');
    actions.appendChild(planBtn);

    const cookedBtn = document.createElement('button');
    cookedBtn.className = 'primary';
    cookedBtn.textContent = "We're making this tonight";
    cookedBtn.addEventListener('click', async () => {
      await postJson('/api/me/cooked', { recipeId: recipe.id });
      cookedBtn.textContent = 'Logged ✓';
      cookedBtn.disabled = true;
      // Cooking can consume tracked pantry quantities -- refresh
      // everything that depends on pantry state.
      await Promise.all([loadPantry(), loadInsights()]);
    });
    actions.appendChild(cookedBtn);

    el.modalBody.appendChild(actions);
  }

  el.modalOverlay.classList.remove('hidden');
}

function closeModal() {
  el.modalOverlay.classList.add('hidden');
  el.modalBody.innerHTML = '';
}

// ---------- Filters: category, area, tag, seasonal --------------------------

async function loadCategories() {
  const categories = await fetchJson('/api/categories');
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    el.categorySelect.appendChild(option);
  }
}

async function loadAreas() {
  const areas = await fetchJson('/api/areas');
  for (const area of areas) {
    const option = document.createElement('option');
    option.value = area;
    option.textContent = area;
    el.areaSelect.appendChild(option);
  }
}

async function loadTags() {
  const tags = await fetchJson('/api/tags');
  el.tagOptions.innerHTML = '';
  for (const tag of tags) {
    const option = document.createElement('option');
    option.value = tag;
    el.tagOptions.appendChild(option);
  }
}

let seasonalData = null;

async function loadSeasonal() {
  seasonalData = await fetchJson('/api/seasonal/current');
  el.seasonalLabel.textContent = `Only what's in season (${seasonalData.season})`;
}

function toggleSeasonalInfo() {
  if (!el.seasonalInfoBox.hidden) {
    el.seasonalInfoBox.hidden = true;
    return;
  }
  if (!seasonalData) return;
  el.seasonalInfoBox.textContent = seasonalData.ingredients.length
    ? `In season near the Northeast US right now (${seasonalData.season}): ${seasonalData.ingredients.join(', ')}. ` +
      `This is a static regional estimate, not based on your exact location.`
    : `No seasonal matches found in the current recipe database for ${seasonalData.season}.`;
  el.seasonalInfoBox.hidden = false;
}

// ---------- Meal plan + grocery list ---------------------------------------

function groceryCheckedKey() {
  return `foodie_grocery_checked_${state.auth ? state.auth.email : ''}`;
}

function getCheckedIngredients() {
  try {
    return new Set(JSON.parse(localStorage.getItem(groceryCheckedKey()) || '[]'));
  } catch {
    return new Set();
  }
}

function setIngredientChecked(name, checked) {
  const checkedSet = getCheckedIngredients();
  if (checked) checkedSet.add(name);
  else checkedSet.delete(name);
  try {
    localStorage.setItem(groceryCheckedKey(), JSON.stringify([...checkedSet]));
  } catch {
    // localStorage unavailable (private browsing, etc.) -- checkbox state just won't persist
  }
}

async function addToPlan(recipeId) {
  const data = await postJson('/api/me/plan', { recipeId });
  state.planned = data.planned;
  await loadGroceryList();
}

async function removeFromPlan(recipeId) {
  const data = await fetchJson(`/api/me/plan/${recipeId}`, { method: 'DELETE' });
  state.planned = data.planned;
  await loadGroceryList();
}

async function loadGroceryList() {
  if (!state.auth) return;
  const { recipes, items } = await fetchJson('/api/me/grocery-list');
  renderPlannedList(recipes);
  renderGroceryList(items);
}

function renderPlannedList(recipes) {
  el.plannedList.innerHTML = '';
  el.planEmptyState.hidden = recipes.length > 0;

  for (const recipe of recipes) {
    const chip = document.createElement('span');
    chip.className = 'planned-chip';
    chip.textContent = recipe.name;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', `Remove ${recipe.name} from plan`);
    removeBtn.addEventListener('click', () => removeFromPlan(recipe.id));
    chip.appendChild(removeBtn);
    el.plannedList.appendChild(chip);
  }
}

function renderGroceryList(items) {
  el.groceryList.innerHTML = '';
  el.groceryListWrap.hidden = items.length === 0;
  const checkedSet = getCheckedIngredients();

  // Items already arrive sorted by section from the server; group them
  // for rendering without losing that order.
  const bySection = new Map();
  for (const item of items) {
    if (!bySection.has(item.section)) bySection.set(item.section, []);
    bySection.get(item.section).push(item);
  }

  for (const [section, sectionItems] of bySection) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'grocery-section';

    const title = document.createElement('h4');
    title.className = 'grocery-section-title';
    title.textContent = section;
    sectionEl.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'grocery-items';

    for (const item of sectionItems) {
      const li = document.createElement('li');
      li.className = 'grocery-item';
      const key = item.ingredient.toLowerCase();
      if (checkedSet.has(key)) li.classList.add('checked');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = checkedSet.has(key);
      checkbox.addEventListener('change', () => {
        li.classList.toggle('checked', checkbox.checked);
        setIngredientChecked(key, checkbox.checked);
      });
      li.appendChild(checkbox);

      const text = document.createElement('div');
      text.className = 'grocery-item-text';
      const name = document.createElement('span');
      name.className = 'grocery-item-name';
      name.textContent = item.ingredient;
      text.appendChild(name);

      const detail = document.createElement('span');
      detail.className = 'grocery-item-detail';
      detail.textContent = item.entries.map((e) => (e.measure ? `${e.measure} for ${e.recipe}` : e.recipe)).join('; ');
      text.appendChild(detail);
      li.appendChild(text);

      const haveItBtn = document.createElement('button');
      haveItBtn.type = 'button';
      haveItBtn.className = 'have-it-btn';
      haveItBtn.textContent = '✕ have it';
      haveItBtn.title = 'Already have this -- add to pantry and stop listing it';
      haveItBtn.addEventListener('click', async () => {
        await postJson('/api/me/pantry', { ingredient: item.ingredient });
        await Promise.all([loadPantry(), loadGroceryList(), loadInsights()]);
      });
      li.appendChild(haveItBtn);

      list.appendChild(li);
    }

    sectionEl.appendChild(list);
    el.groceryList.appendChild(sectionEl);
  }
}

function createAddToPlanButton(recipeId) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const isPlanned = state.planned.includes(recipeId);
  btn.className = 'add-to-plan-btn' + (isPlanned ? ' added' : '');
  btn.textContent = isPlanned ? '✓ Planned' : '+ Add to plan';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (state.planned.includes(recipeId)) {
      await removeFromPlan(recipeId);
    } else {
      await addToPlan(recipeId);
    }
    btn.className = 'add-to-plan-btn' + (state.planned.includes(recipeId) ? ' added' : '');
    btn.textContent = state.planned.includes(recipeId) ? '✓ Planned' : '+ Add to plan';
  });
  return btn;
}

// ---------- Pantry inventory -------------------------------------------

async function loadPantry() {
  if (!state.auth) return;
  state.pantry = await fetchJson('/api/me/pantry');
  renderPantryInventory();
}

function renderPantryInventory() {
  el.pantryInventoryList.innerHTML = '';
  el.pantryEmptyState.hidden = state.pantry.length > 0;

  for (const item of state.pantry) {
    const li = document.createElement('li');
    li.className = 'pantry-item';

    const text = document.createElement('div');
    text.className = 'pantry-item-text';
    const name = document.createElement('span');
    name.className = 'pantry-item-name';
    const qtyLabel = item.quantity !== null ? `${item.quantity}${item.unit ? ' ' + item.unit : ''} ` : '';
    name.textContent = `${qtyLabel}${item.ingredient}`;
    text.appendChild(name);

    const detailParts = [];
    if (item.price !== null) detailParts.push(`$${item.price.toFixed(2)}${item.store ? ` at ${item.store}` : ''}`);
    else if (item.store) detailParts.push(item.store);
    if (detailParts.length) {
      const detail = document.createElement('span');
      detail.className = 'pantry-item-detail';
      detail.textContent = detailParts.join(' • ');
      text.appendChild(detail);
    }
    li.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'pantry-item-actions';

    const usedUpBtn = document.createElement('button');
    usedUpBtn.type = 'button';
    usedUpBtn.textContent = 'used it up';
    usedUpBtn.title = 'Remove and count as used';
    usedUpBtn.addEventListener('click', () => pantryItemAction(item.ingredient, 'used_up'));
    actions.appendChild(usedUpBtn);

    const wastedBtn = document.createElement('button');
    wastedBtn.type = 'button';
    wastedBtn.textContent = 'wasted';
    wastedBtn.title = 'Remove and count as thrown out';
    wastedBtn.addEventListener('click', () => pantryItemAction(item.ingredient, 'wasted'));
    actions.appendChild(wastedBtn);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'danger';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove (added by mistake)';
    removeBtn.addEventListener('click', () => deletePantryItem(item.ingredient));
    actions.appendChild(removeBtn);

    li.appendChild(actions);
    el.pantryInventoryList.appendChild(li);
  }
}

async function addPantryItem() {
  const ingredient = el.pantryIngredient.value.trim();
  if (!ingredient) return;
  const body = { ingredient };
  if (el.pantryQuantity.value !== '') body.quantity = Number(el.pantryQuantity.value);
  if (el.pantryUnit.value.trim()) body.unit = el.pantryUnit.value.trim();
  if (el.pantryPrice.value !== '') body.price = Number(el.pantryPrice.value);
  if (el.pantryStore.value.trim()) body.store = el.pantryStore.value.trim();

  await postJson('/api/me/pantry', body);

  el.pantryIngredient.value = '';
  el.pantryQuantity.value = '';
  el.pantryUnit.value = '';
  el.pantryPrice.value = '';
  el.pantryStore.value = '';
  el.pantrySuggestions.innerHTML = '';

  await Promise.all([loadPantry(), loadGroceryList(), loadInsights()]);
}

// ---------- Barcode scanning -------------------------------------------
//
// Uses the browser's native BarcodeDetector API where it exists (Chrome,
// Edge, Android -- notably not Safari/iOS as of writing) so there's no
// extra JS library to ship for this; browsers without it just get the
// manual-entry fallback, which is always available either way in case
// the camera struggles with a label (glare, a curved surface, bad
// lighting). A scanned/typed barcode resolves to a product name via
// GET /api/barcode/:upc, which the person still gets to edit/confirm
// before it's added to the pantry -- same "never trust a guess blindly"
// principle as the planned receipt-scanning feature.

let scannerStream = null;
let scannerRAF = null;
let scannerBusy = false;
let scannerDetector = null;

function stopDetectLoop() {
  if (scannerRAF) cancelAnimationFrame(scannerRAF);
  scannerRAF = null;
}

function scheduleDetectFrame() {
  scannerRAF = requestAnimationFrame(detectFrame);
}

async function detectFrame() {
  if (!scannerStream || scannerBusy || !scannerDetector) return;
  try {
    const results = await scannerDetector.detect(el.scannerVideo);
    if (results.length) {
      scannerBusy = true;
      await lookupBarcode(results[0].rawValue, { fromCamera: true });
      return; // lookupBarcode reschedules on failure, or closes the scanner on success
    }
  } catch {
    // one frame failing to decode isn't worth surfacing -- just try the next one
  }
  scheduleDetectFrame();
}

async function openScanner() {
  scannerBusy = false;
  el.scannerManualInput.value = '';
  el.scannerOverlay.classList.remove('hidden');

  if (!('BarcodeDetector' in window)) {
    el.scannerCameraWrap.hidden = true;
    el.scannerStatus.textContent = "This browser can't scan with the camera -- type the barcode number below instead.";
    return;
  }

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    el.scannerCameraWrap.hidden = true;
    el.scannerStatus.textContent =
      "Couldn't access the camera -- it needs HTTPS and camera permission. Type the barcode number below instead.";
    return;
  }

  el.scannerCameraWrap.hidden = false;
  el.scannerVideo.srcObject = scannerStream;
  el.scannerStatus.textContent = 'Point your camera at a barcode…';
  scannerDetector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
  scheduleDetectFrame();
}

function closeScanner() {
  stopDetectLoop();
  if (scannerStream) {
    for (const track of scannerStream.getTracks()) track.stop();
    scannerStream = null;
  }
  scannerDetector = null;
  el.scannerVideo.srcObject = null;
  el.scannerOverlay.classList.add('hidden');
  scannerBusy = false;
}

async function lookupBarcode(rawUpc, { fromCamera = false } = {}) {
  const upc = String(rawUpc || '').trim();
  if (!/^\d{6,14}$/.test(upc)) {
    el.scannerStatus.textContent = "That doesn't look like a barcode -- numbers only, 6-14 digits.";
    if (fromCamera) {
      setTimeout(() => {
        scannerBusy = false;
        scheduleDetectFrame();
      }, 1200);
    }
    return;
  }

  el.scannerStatus.textContent = `Looking up ${upc}…`;
  try {
    const data = await fetchJson(`/api/barcode/${encodeURIComponent(upc)}`);
    el.scannerStatus.textContent = `Found: ${data.name}${data.brand ? ` (${data.brand})` : ''}`;
    setTimeout(() => {
      closeScanner();
      el.pantryIngredient.value = data.name;
      el.pantryQuantity.focus();
    }, 900);
  } catch (err) {
    el.scannerStatus.textContent =
      err.status === 404
        ? `No product found for ${upc} -- close this and type the ingredient in manually.`
        : err.message || 'Lookup failed -- try again or type it in manually.';
    if (fromCamera) {
      setTimeout(() => {
        scannerBusy = false;
        scheduleDetectFrame();
      }, 1500);
    }
  }
}

function submitManualBarcode() {
  lookupBarcode(el.scannerManualInput.value);
}

async function pantryItemAction(ingredient, action) {
  await fetchJson(`/api/me/pantry/${encodeURIComponent(ingredient)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  await Promise.all([loadPantry(), loadGroceryList(), loadInsights()]);
}

async function deletePantryItem(ingredient) {
  await fetchJson(`/api/me/pantry/${encodeURIComponent(ingredient)}`, { method: 'DELETE' });
  await Promise.all([loadPantry(), loadGroceryList(), loadInsights()]);
}

// ---------- Pantry insights: make-now / unlock / restock -----------------

async function loadInsights() {
  if (!state.auth) return;
  const [insights, restock] = await Promise.all([
    fetchJson('/api/me/pantry/insights'),
    fetchJson('/api/me/pantry/restock-suggestions'),
  ]);
  renderCanMakeNow(insights.canMakeNow);
  renderUnlockList(insights.unlockSuggestions);
  renderRestockList(restock);
}

function renderCanMakeNow(recipes) {
  el.canMakeNowList.innerHTML = '';
  el.canMakeNowEmpty.hidden = recipes.length > 0;
  for (const recipe of recipes) {
    el.canMakeNowList.appendChild(renderRecipeCard(recipe));
  }
}

function renderUnlockList(suggestions) {
  el.unlockList.innerHTML = '';
  el.unlockEmpty.hidden = suggestions.length > 0;
  for (const s of suggestions) {
    const li = document.createElement('li');
    li.className = 'unlock-item';
    const strong = document.createElement('strong');
    strong.textContent = `+ ${s.ingredient}`;
    li.appendChild(strong);
    const detail = document.createElement('div');
    detail.className = 'unlock-recipes';
    detail.textContent = `unlocks: ${s.unlocks.map((u) => u.name).join(', ')}`;
    li.appendChild(detail);
    el.unlockList.appendChild(li);
  }
}

function renderRestockList(suggestions) {
  el.restockList.innerHTML = '';
  el.restockEmpty.hidden = suggestions.length > 0;
  for (const s of suggestions) {
    const li = document.createElement('li');
    li.className = 'restock-item';
    const strong = document.createElement('strong');
    strong.textContent = s.ingredient;
    li.appendChild(strong);
    const detail = document.createElement('div');
    detail.className = 'restock-detail';
    const parts = [`used ${s.timesUsedRecently}x in the last 60 days`];
    if (s.avgPrice !== null) parts.push(`avg $${s.avgPrice.toFixed(2)}`);
    if (s.cheapestKnown) parts.push(`cheapest seen: $${s.cheapestKnown.price.toFixed(2)}${s.cheapestKnown.store ? ` at ${s.cheapestKnown.store}` : ''}`);
    detail.textContent = parts.join(' • ');
    li.appendChild(detail);
    el.restockList.appendChild(li);
  }
}

// ---------- Invites (the only way to get a new account besides admin) --

async function loadInvites() {
  if (!state.auth) return;
  const invites = await fetchJson('/api/invites');
  renderInvites(invites);
}

function renderInvites(invites) {
  el.pendingInvitesList.innerHTML = '';
  for (const invite of invites) {
    const li = document.createElement('li');
    li.className = 'pending-invite-item';

    const text = document.createElement('span');
    const statusSpan = document.createElement('span');
    statusSpan.className = `invite-status ${invite.status}`;
    statusSpan.textContent = invite.status;
    text.appendChild(statusSpan);
    const label = invite.note ? ` -- ${invite.note}` : '';
    const detail =
      invite.status === 'used'
        ? `${label} (created ${invite.usedByEmail})`
        : invite.status === 'expired'
          ? `${label} (expired ${new Date(invite.expiresAt).toLocaleDateString()})`
          : `${label} (expires ${new Date(invite.expiresAt).toLocaleDateString()})`;
    text.append(' ' + detail);
    li.appendChild(text);

    if (invite.status === 'pending') {
      const revokeBtn = document.createElement('button');
      revokeBtn.type = 'button';
      revokeBtn.textContent = 'revoke';
      revokeBtn.addEventListener('click', async () => {
        await fetchJson(`/api/invites/${invite.id}`, { method: 'DELETE' });
        await loadInvites();
      });
      li.appendChild(revokeBtn);
    }

    el.pendingInvitesList.appendChild(li);
  }
}

async function generateInvite() {
  const note = el.inviteNote.value.trim();
  const data = await postJson('/api/invites', note ? { note } : {});
  el.inviteNote.value = '';
  el.inviteLinkBox.hidden = false;
  el.inviteLinkOutput.value = data.url;
  el.inviteLinkOutput.select();
  await loadInvites();
}

async function copyInviteLink() {
  const value = el.inviteLinkOutput.value;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    el.inviteLinkOutput.select();
    document.execCommand('copy');
  }
  const original = el.copyInviteLinkBtn.textContent;
  el.copyInviteLinkBtn.textContent = 'Copied!';
  setTimeout(() => {
    el.copyInviteLinkBtn.textContent = original;
  }, 1500);
}

// ---------- Browse other users (read-only) ---------------------------
//
// Any signed-in user can view any other user's data -- this is separate
// from the main search/plan/pantry panels above, which always stay bound
// to your own account, so looking at someone else's never quietly starts
// acting on their behalf.

async function loadUsersList() {
  state.allUsers = await fetchJson('/api/users');
  renderUserBrowseList();
}

function renderUserBrowseList() {
  const query = el.userSearchInput.value.trim().toLowerCase();
  const filtered = query ? state.allUsers.filter((u) => u.email.toLowerCase().includes(query)) : state.allUsers;

  el.userBrowseList.innerHTML = '';
  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'member-item muted';
    li.textContent = 'No users match that search.';
    el.userBrowseList.appendChild(li);
    return;
  }

  for (const u of filtered) {
    const li = document.createElement('li');
    li.className = 'member-item' + (u.isYou ? ' is-you' : '');

    const strong = document.createElement('strong');
    strong.textContent = u.isYou ? `${u.email} (you)` : u.email;
    li.appendChild(strong);

    const detail = document.createElement('div');
    detail.className = 'member-detail';
    detail.textContent = u.cookCount ? `cooked ${u.cookCount}x` : 'nothing logged yet';
    li.appendChild(detail);

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.textContent = 'view';
    viewBtn.addEventListener('click', () => loadOtherUser(u.email).catch(() => {}));
    li.appendChild(viewBtn);

    el.userBrowseList.appendChild(li);
  }
}

async function loadOtherUser(email) {
  const [userData, pantry] = await Promise.all([
    fetchJson(`/api/users/${encodeURIComponent(email)}`),
    fetchJson(`/api/users/${encodeURIComponent(email)}/pantry`),
  ]);

  el.browseUserResult.hidden = false;
  el.browseUserTitle.textContent = email;
  el.browseUserCookStats.textContent = userData.cookCount
    ? `cooked ${userData.cookCount}x -- favorites: ${userData.topRecipes.map((r) => r.name).join(', ') || 'none logged'}`
    : 'nothing cooked/logged yet';
  el.browseLiked.textContent = userData.liked.length ? userData.liked.join(', ') : 'nothing saved';
  el.browseDisliked.textContent = userData.disliked.length ? userData.disliked.join(', ') : 'nothing saved';

  if (userData.planned.length) {
    const recipeNames = await Promise.all(
      userData.planned.map((id) => fetchJson(`/api/recipes/${id}`).then((r) => r.name).catch(() => null))
    );
    el.browsePlanned.textContent = recipeNames.filter(Boolean).join(', ') || 'nothing planned';
  } else {
    el.browsePlanned.textContent = 'nothing planned';
  }

  el.browsePantryList.innerHTML = '';
  el.browsePantryEmpty.hidden = pantry.length > 0;
  for (const item of pantry) {
    const li = document.createElement('li');
    li.className = 'pantry-item';
    const qtyLabel = item.quantity !== null ? `${item.quantity}${item.unit ? ' ' + item.unit : ''} ` : '';
    const priceLabel = item.price !== null ? ` -- $${item.price.toFixed(2)}${item.store ? ` at ${item.store}` : ''}` : '';
    li.textContent = `${qtyLabel}${item.ingredient}${priceLabel}`;
    el.browsePantryList.appendChild(li);
  }

  el.browseUserResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Wire up --------------------------------------------------------

wireTagInput({
  input: el.likeInput,
  tagsContainer: el.likeTags,
  suggestionsContainer: el.likeSuggestions,
  list: state.liked,
  kind: 'like',
  onChange: findDinner,
});

wireTagInput({
  input: el.dislikeInput,
  tagsContainer: el.dislikeTags,
  suggestionsContainer: el.dislikeSuggestions,
  list: state.disliked,
  kind: 'dislike',
  onChange: findDinner,
});

wireTagChipInput({
  input: el.tagInput,
  tagsContainer: el.filterTags,
  list: state.filterTags,
  onChange: findDinner,
});

wireIngredientAutocomplete(el.pantryIngredient, el.pantrySuggestions);

el.menuToggleBtn.addEventListener('click', openDrawer);
el.bottomMenuBtn.addEventListener('click', openDrawer);
el.drawerClose.addEventListener('click', closeDrawer);
el.drawerOverlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && el.drawer.classList.contains('open')) closeDrawer();
});
// Jumping to a section via the topbar/bottom nav should also close the
// drawer if it happened to be open (e.g. opened, then changed their mind
// and tapped a nav link instead) -- otherwise it's left covering the
// section they just asked to see.
for (const link of document.querySelectorAll('.topbar-nav a, .bottom-nav a')) {
  link.addEventListener('click', closeDrawer);
}

el.signOutBtn.addEventListener('click', signOut);
el.signOutAllBtn.addEventListener('click', signOutAll);
el.generateInviteBtn.addEventListener('click', generateInvite);
el.copyInviteLinkBtn.addEventListener('click', copyInviteLink);
el.userSearchInput.addEventListener('input', renderUserBrowseList);

el.saveBtn.addEventListener('click', savePreferences);
el.matchBtn.addEventListener('click', findDinner);
el.clearFiltersBtn.addEventListener('click', clearFilters);
el.modalClose.addEventListener('click', closeModal);
el.modalOverlay.addEventListener('click', (e) => {
  if (e.target === el.modalOverlay) closeModal();
});
el.seasonalInfoBtn.addEventListener('click', toggleSeasonalInfo);
el.pantryAddBtn.addEventListener('click', addPantryItem);
el.pantryIngredient.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addPantryItem();
  }
});
el.pantryScanBtn.addEventListener('click', () => openScanner().catch(() => {}));
el.scannerClose.addEventListener('click', closeScanner);
el.scannerOverlay.addEventListener('click', (e) => {
  if (e.target === el.scannerOverlay) closeScanner();
});
el.scannerManualBtn.addEventListener('click', submitManualBarcode);
el.scannerManualInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitManualBarcode();
  }
});

// Every filter re-runs the search immediately on change -- previously
// only the "What's for dinner?" button did, so adding an ingredient or
// picking a category looked like it did nothing until that separate
// click. Category/area already hard-filtered results once you searched;
// now everything responds the same way, right away.
el.categorySelect.addEventListener('change', findDinner);
el.areaSelect.addEventListener('change', findDinner);
el.seasonalToggle.addEventListener('change', findDinner);
el.quickToggle.addEventListener('change', () => {
  el.tagInput.disabled = el.quickToggle.checked;
  findDinner();
});
el.favoritesOnlyToggle.addEventListener('change', findDinner);
el.sortSelect.addEventListener('change', renderResults);
let nameSearchDebounce;
el.nameSearchInput.addEventListener('input', () => {
  clearTimeout(nameSearchDebounce);
  nameSearchDebounce = setTimeout(findDinner, 300);
});

(async function init() {
  // The whole app requires a session now -- no anonymous browsing --
  // so check that before touching anything else (those endpoints would
  // just 401 for a signed-out visitor anyway).
  let me;
  try {
    me = await fetchJson('/api/auth/me');
  } catch {
    window.location.href = '/';
    return;
  }
  // A bookmarked/direct link to app.html shouldn't let a
  // must-change-password account (e.g. a freshly admin-created one)
  // past this screen either -- the login page is where that gets
  // resolved.
  if (me.mustChangePassword) {
    window.location.href = '/?changePassword=1';
    return;
  }

  loadCategories().catch(() => {});
  loadAreas().catch(() => {});
  loadTags().catch(() => {});
  loadSeasonal().catch(() => {});
  await onSignedIn(me);
})();
