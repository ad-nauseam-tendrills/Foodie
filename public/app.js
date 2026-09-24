'use strict';

const state = {
  auth: null, // { username, household } once signed in
  authMode: 'login', // 'login' | 'signup'
  liked: [],
  disliked: [],
  planned: [], // recipe IDs currently in the meal plan
  pantry: [], // structured pantry items: { ingredient, quantity, unit, price, store, addedBy, ... }
};

const el = {
  authBar: document.getElementById('authBar'),
  authForm: document.getElementById('authForm'),
  authHousehold: document.getElementById('authHousehold'),
  authUsername: document.getElementById('authUsername'),
  authPassword: document.getElementById('authPassword'),
  authSubmitBtn: document.getElementById('authSubmitBtn'),
  authToggleModeBtn: document.getElementById('authToggleModeBtn'),
  authStatus: document.getElementById('authStatus'),
  authStatusText: document.getElementById('authStatusText'),
  signOutBtn: document.getElementById('signOutBtn'),
  authError: document.getElementById('authError'),
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
  tagOptions: document.getElementById('tagOptions'),
  quickToggle: document.getElementById('quickToggle'),
  seasonalToggle: document.getElementById('seasonalToggle'),
  seasonalLabel: document.getElementById('seasonalLabel'),
  seasonalInfoBtn: document.getElementById('seasonalInfoBtn'),
  seasonalInfoBox: document.getElementById('seasonalInfoBox'),
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
  pantryInventoryList: document.getElementById('pantryInventoryList'),
  pantryEmptyState: document.getElementById('pantryEmptyState'),
  insightsPanel: document.getElementById('insightsPanel'),
  canMakeNowList: document.getElementById('canMakeNowList'),
  canMakeNowEmpty: document.getElementById('canMakeNowEmpty'),
  unlockList: document.getElementById('unlockList'),
  unlockEmpty: document.getElementById('unlockEmpty'),
  restockList: document.getElementById('restockList'),
  restockEmpty: document.getElementById('restockEmpty'),
  membersPanel: document.getElementById('membersPanel'),
  membersList: document.getElementById('membersList'),
};

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

// ---------- Auth -----------------------------------------------------------

function warnNotSignedIn(message) {
  el.authError.textContent = message;
  el.authError.hidden = false;
  el.authHousehold.focus();
  el.authBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    el.authError.hidden = true;
  }, 3000);
}

function setAuthMode(mode) {
  state.authMode = mode;
  el.authSubmitBtn.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
  el.authToggleModeBtn.textContent =
    mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one';
  el.authPassword.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
}

async function submitAuth(e) {
  e.preventDefault();
  el.authError.hidden = true;
  const household = el.authHousehold.value.trim();
  const username = el.authUsername.value.trim();
  const password = el.authPassword.value;
  if (!household || !username || !password) {
    el.authError.textContent = 'Household, username, and password are all required.';
    el.authError.hidden = false;
    return;
  }
  try {
    const endpoint = state.authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const data = await postJson(endpoint, { household, username, password });
    el.authPassword.value = '';
    await onSignedIn(data);
  } catch (err) {
    el.authError.textContent = err.message;
    el.authError.hidden = false;
  }
}

async function onSignedIn(data) {
  state.auth = { username: data.username, household: data.household };
  el.authForm.hidden = true;
  el.authStatus.hidden = false;
  el.authStatusText.textContent = `${data.username} @ ${data.household}`;
  el.pantryPanel.hidden = false;
  el.insightsPanel.hidden = false;
  el.membersPanel.hidden = false;

  await loadHouseholdState();
  await Promise.all([loadPantry(), loadGroceryList(), loadInsights(), loadMembers()]);
  findDinner().catch(() => {});
}

function onSignedOut() {
  state.auth = null;
  state.liked = [];
  state.disliked = [];
  state.planned = [];
  state.pantry = [];
  el.authForm.hidden = false;
  el.authStatus.hidden = true;
  el.pantryPanel.hidden = true;
  el.insightsPanel.hidden = true;
  el.membersPanel.hidden = true;
  el.groceryListWrap.hidden = true;
  renderTags(state.liked, el.likeTags, 'like', findDinner);
  renderTags(state.disliked, el.dislikeTags, 'dislike', findDinner);
  renderSavedExclusionsLine();
  renderPlannedList([]);
}

async function signOut() {
  await fetchJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
  onSignedOut();
  findDinner().catch(() => {});
}

async function loadHouseholdState() {
  const data = await fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}`);
  state.liked = data.liked;
  state.disliked = data.disliked;
  state.planned = data.planned || [];
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
  if (!state.auth) {
    warnNotSignedIn('Sign in first to save preferences');
    return;
  }
  await fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ liked: state.liked, disliked: state.disliked }),
  });
  el.authStatusText.textContent = `${state.auth.username} @ ${state.auth.household} -- saved`;
  renderSavedExclusionsLine();
}

// ---------- Matching & rendering ------------------------------------------

async function findDinner() {
  const have = state.liked.join(',');
  const exclude = state.disliked.join(',');
  const category = el.categorySelect.value;
  const categoryParam = category ? `&category=${encodeURIComponent(category)}` : '';
  const area = el.areaSelect.value;
  const areaParam = area ? `&area=${encodeURIComponent(area)}` : '';
  // The quick-toggle takes over the tag filter (server-side "quick" is
  // just the existing "Quick" tag, applied on curated recipes like
  // sloppy joes, potato pancakes, pancakes, ...) -- keeping this to one
  // active tag at a time avoids needing to support combining tags.
  const tag = el.quickToggle.checked ? 'Quick' : el.tagInput.value.trim();
  const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : '';
  const seasonalParam = el.seasonalToggle.checked ? `&seasonal=true` : '';
  el.results.innerHTML = '<p class="empty-state">Looking…</p>';

  const recipes = await fetchJson(
    `/api/recipes/match?have=${encodeURIComponent(have)}&exclude=${encodeURIComponent(exclude)}` +
      `${categoryParam}${areaParam}${tagParam}${seasonalParam}`
  );

  el.resultsCount.textContent = recipes.length ? `${recipes.length} matches` : '';
  el.results.innerHTML = '';

  if (!recipes.length) {
    el.results.innerHTML = '<p class="empty-state">No matches yet -- add a few more ingredients you like.</p>';
    return;
  }

  for (const recipe of recipes) {
    el.results.appendChild(renderRecipeCard(recipe));
  }
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

  body.appendChild(createAddToPlanButton(recipe.id));

  card.appendChild(body);
  return card;
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
      await postJson(`/api/households/${encodeURIComponent(state.auth.household)}/cooked`, { recipeId: recipe.id });
      cookedBtn.textContent = 'Logged ✓';
      cookedBtn.disabled = true;
      // Cooking can consume tracked pantry quantities -- refresh
      // everything that depends on pantry state.
      await Promise.all([loadPantry(), loadInsights(), loadMembers()]);
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
  return `foodie_grocery_checked_${state.auth ? state.auth.household : ''}`;
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
  if (!state.auth) {
    warnNotSignedIn('Sign in first to start a meal plan');
    return;
  }
  const data = await postJson(`/api/households/${encodeURIComponent(state.auth.household)}/plan`, { recipeId });
  state.planned = data.planned;
  await loadGroceryList();
}

async function removeFromPlan(recipeId) {
  const data = await fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/plan/${recipeId}`, {
    method: 'DELETE',
  });
  state.planned = data.planned;
  await loadGroceryList();
}

async function loadGroceryList() {
  if (!state.auth) return;
  const { recipes, items } = await fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/grocery-list`);
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
        await postJson(`/api/households/${encodeURIComponent(state.auth.household)}/pantry`, {
          ingredient: item.ingredient,
        });
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
  state.pantry = await fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/pantry`);
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
    if (item.addedBy) detailParts.push(`added by ${item.addedBy}`);
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
  if (!state.auth) {
    warnNotSignedIn('Sign in first to track your pantry');
    return;
  }
  const ingredient = el.pantryIngredient.value.trim();
  if (!ingredient) return;
  const body = { ingredient };
  if (el.pantryQuantity.value !== '') body.quantity = Number(el.pantryQuantity.value);
  if (el.pantryUnit.value.trim()) body.unit = el.pantryUnit.value.trim();
  if (el.pantryPrice.value !== '') body.price = Number(el.pantryPrice.value);
  if (el.pantryStore.value.trim()) body.store = el.pantryStore.value.trim();

  await postJson(`/api/households/${encodeURIComponent(state.auth.household)}/pantry`, body);

  el.pantryIngredient.value = '';
  el.pantryQuantity.value = '';
  el.pantryUnit.value = '';
  el.pantryPrice.value = '';
  el.pantryStore.value = '';
  el.pantrySuggestions.innerHTML = '';

  await Promise.all([loadPantry(), loadGroceryList(), loadInsights()]);
}

async function pantryItemAction(ingredient, action) {
  await fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/pantry/${encodeURIComponent(ingredient)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  await Promise.all([loadPantry(), loadGroceryList(), loadInsights()]);
}

async function deletePantryItem(ingredient) {
  await fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/pantry/${encodeURIComponent(ingredient)}`, {
    method: 'DELETE',
  });
  await Promise.all([loadPantry(), loadGroceryList(), loadInsights()]);
}

// ---------- Pantry insights: make-now / unlock / restock -----------------

async function loadInsights() {
  if (!state.auth) return;
  const [insights, restock] = await Promise.all([
    fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/pantry/insights`),
    fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/pantry/restock-suggestions`),
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

// ---------- Members --------------------------------------------------------

async function loadMembers() {
  if (!state.auth) return;
  const members = await fetchJson(`/api/households/${encodeURIComponent(state.auth.household)}/members`);
  renderMembers(members);
}

function renderMembers(members) {
  el.membersList.innerHTML = '';
  for (const m of members) {
    const li = document.createElement('li');
    li.className = 'member-item' + (m.isYou ? ' is-you' : '');
    const strong = document.createElement('strong');
    strong.textContent = m.isYou ? `${m.username} (you)` : m.username;
    li.appendChild(strong);
    const detail = document.createElement('div');
    detail.className = 'member-detail';
    detail.textContent = m.cookCount
      ? `cooked ${m.cookCount}x • favorites: ${m.topRecipes.map((r) => r.name).join(', ')}`
      : 'nothing logged yet';
    li.appendChild(detail);
    el.membersList.appendChild(li);
  }
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

wireIngredientAutocomplete(el.pantryIngredient, el.pantrySuggestions);

el.authForm.addEventListener('submit', submitAuth);
el.authToggleModeBtn.addEventListener('click', () => setAuthMode(state.authMode === 'signup' ? 'login' : 'signup'));
el.signOutBtn.addEventListener('click', signOut);

el.saveBtn.addEventListener('click', savePreferences);
el.matchBtn.addEventListener('click', findDinner);
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
  if (el.quickToggle.checked) el.tagInput.value = '';
  findDinner();
});
let tagDebounce;
el.tagInput.addEventListener('input', () => {
  clearTimeout(tagDebounce);
  tagDebounce = setTimeout(findDinner, 300);
});

(async function init() {
  setAuthMode('login');
  loadCategories().catch(() => {});
  loadAreas().catch(() => {});
  loadTags().catch(() => {});
  loadSeasonal().catch(() => {});

  try {
    const me = await fetchJson('/api/auth/me');
    await onSignedIn(me);
  } catch {
    onSignedOut();
    findDinner().catch(() => {}); // browse mode -- show something immediately
  }
})();
