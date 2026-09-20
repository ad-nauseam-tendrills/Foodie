'use strict';

const state = {
  household: localStorage.getItem('foodie_household') || '',
  liked: [],
  disliked: [],
  planned: [], // recipe IDs currently in the meal plan
  pantry: [], // ingredients you always have -- never shown on the grocery list
};

const el = {
  householdInput: document.getElementById('householdInput'),
  householdJoinBtn: document.getElementById('householdJoinBtn'),
  householdStatus: document.getElementById('householdStatus'),
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
  seasonalToggle: document.getElementById('seasonalToggle'),
  seasonalLabel: document.getElementById('seasonalLabel'),
  seasonalInfoBtn: document.getElementById('seasonalInfoBtn'),
  seasonalInfoBox: document.getElementById('seasonalInfoBox'),
  plannedList: document.getElementById('plannedList'),
  planEmptyState: document.getElementById('planEmptyState'),
  groceryListWrap: document.getElementById('groceryListWrap'),
  groceryList: document.getElementById('groceryList'),
  pantryLine: document.getElementById('pantryLine'),
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

// ---------- Networking ---------------------------------------------------

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ---------- Household ----------------------------------------------------

// Used anywhere an action silently needs a household first (add to plan,
// save preferences, ...) -- a status line alone is too easy to miss, so
// this also pulls the eye to where to actually fix it.
function warnNoHousehold(message) {
  el.householdStatus.textContent = message;
  el.householdStatus.classList.add('warn');
  el.householdInput.classList.add('warn');
  el.householdInput.focus();
  el.householdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => el.householdInput.classList.remove('warn'), 2000);
}

async function joinHousehold(name) {
  if (!name) return;
  const data = await fetchJson('/api/households', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  state.household = data.name;
  state.liked = data.liked;
  state.disliked = data.disliked;
  state.planned = data.planned || [];
  state.pantry = data.pantry || [];
  localStorage.setItem('foodie_household', data.name);
  el.householdStatus.textContent = `Synced as "${data.name}"`;
  el.householdStatus.classList.remove('warn');
  renderTags(state.liked, el.likeTags, 'like', findDinner);
  renderTags(state.disliked, el.dislikeTags, 'dislike', findDinner);
  renderSavedExclusionsLine();
  renderPantryLine();
  findDinner().catch(() => {});
  loadGroceryList().catch(() => {});
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
  if (!state.household) {
    warnNoHousehold('Pick a household name first');
    return;
  }
  await fetchJson(`/api/households/${encodeURIComponent(state.household)}/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ liked: state.liked, disliked: state.disliked }),
  });
  el.householdStatus.textContent = `Saved to "${state.household}"`;
  renderSavedExclusionsLine();
}

// ---------- Matching & rendering ------------------------------------------

async function findDinner() {
  const have = state.liked.join(',');
  const exclude = state.disliked.join(',');
  const householdParam = state.household ? `&household=${encodeURIComponent(state.household)}` : '';
  const category = el.categorySelect.value;
  const categoryParam = category ? `&category=${encodeURIComponent(category)}` : '';
  const area = el.areaSelect.value;
  const areaParam = area ? `&area=${encodeURIComponent(area)}` : '';
  const tag = el.tagInput.value.trim();
  const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : '';
  const seasonalParam = el.seasonalToggle.checked ? `&seasonal=true` : '';
  el.results.innerHTML = '<p class="empty-state">Looking…</p>';

  const recipes = await fetchJson(
    `/api/recipes/match?have=${encodeURIComponent(have)}&exclude=${encodeURIComponent(exclude)}` +
      `${householdParam}${categoryParam}${areaParam}${tagParam}${seasonalParam}`
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

  if (state.household) {
    const actions = document.createElement('div');
    actions.className = 'actions';

    const planBtn = createAddToPlanButton(recipe.id);
    planBtn.classList.add('secondary');
    actions.appendChild(planBtn);

    const cookedBtn = document.createElement('button');
    cookedBtn.className = 'primary';
    cookedBtn.textContent = "We're making this tonight";
    cookedBtn.addEventListener('click', async () => {
      await fetchJson(`/api/households/${encodeURIComponent(state.household)}/cooked`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: recipe.id }),
      });
      cookedBtn.textContent = 'Logged ✓';
      cookedBtn.disabled = true;
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
  return `foodie_grocery_checked_${state.household}`;
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
  if (!state.household) {
    warnNoHousehold('Pick a household first to start a meal plan');
    return;
  }
  const data = await fetchJson(`/api/households/${encodeURIComponent(state.household)}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId }),
  });
  state.planned = data.planned;
  await loadGroceryList();
}

async function removeFromPlan(recipeId) {
  const data = await fetchJson(
    `/api/households/${encodeURIComponent(state.household)}/plan/${recipeId}`,
    { method: 'DELETE' }
  );
  state.planned = data.planned;
  await loadGroceryList();
}

async function addToPantry(ingredient) {
  const data = await fetchJson(`/api/households/${encodeURIComponent(state.household)}/pantry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredient }),
  });
  state.pantry = data.pantry;
  renderPantryLine();
  await loadGroceryList();
}

async function removeFromPantry(ingredient) {
  const data = await fetchJson(
    `/api/households/${encodeURIComponent(state.household)}/pantry/${encodeURIComponent(ingredient)}`,
    { method: 'DELETE' }
  );
  state.pantry = data.pantry;
  renderPantryLine();
  await loadGroceryList();
}

function renderPantryLine() {
  el.pantryLine.innerHTML = '';
  if (!state.pantry.length) {
    el.pantryLine.hidden = true;
    return;
  }
  el.pantryLine.hidden = false;
  el.pantryLine.append('Always have, never on the list: ');
  state.pantry.forEach((ingredient, i) => {
    if (i > 0) el.pantryLine.append(', ');
    el.pantryLine.append(ingredient + ' ');
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.textContent = '(undo)';
    undoBtn.addEventListener('click', () => removeFromPantry(ingredient));
    el.pantryLine.appendChild(undoBtn);
  });
}

async function loadGroceryList() {
  if (!state.household) return;
  const { recipes, items } = await fetchJson(
    `/api/households/${encodeURIComponent(state.household)}/grocery-list`
  );
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
      haveItBtn.title = 'Already have this -- stop listing it';
      haveItBtn.addEventListener('click', () => addToPantry(item.ingredient));
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

el.householdJoinBtn.addEventListener('click', () => joinHousehold(el.householdInput.value.trim()));
el.householdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinHousehold(el.householdInput.value.trim());
});

el.saveBtn.addEventListener('click', savePreferences);
el.matchBtn.addEventListener('click', findDinner);
el.modalClose.addEventListener('click', closeModal);
el.modalOverlay.addEventListener('click', (e) => {
  if (e.target === el.modalOverlay) closeModal();
});
el.seasonalInfoBtn.addEventListener('click', toggleSeasonalInfo);

// Every filter re-runs the search immediately on change -- previously
// only the "What's for dinner?" button did, so adding an ingredient or
// picking a category looked like it did nothing until that separate
// click. Category/area already hard-filtered results once you searched;
// now everything responds the same way, right away.
el.categorySelect.addEventListener('change', findDinner);
el.areaSelect.addEventListener('change', findDinner);
el.seasonalToggle.addEventListener('change', findDinner);
let tagDebounce;
el.tagInput.addEventListener('input', () => {
  clearTimeout(tagDebounce);
  tagDebounce = setTimeout(findDinner, 300);
});

(async function init() {
  loadCategories().catch(() => {});
  loadAreas().catch(() => {});
  loadTags().catch(() => {});
  loadSeasonal().catch(() => {});

  if (state.household) {
    el.householdInput.value = state.household;
    try {
      await joinHousehold(state.household);
    } catch {
      // household no longer exists on this server -- ignore, start fresh
    }
  } else {
    findDinner().catch(() => {}); // browse mode -- show something immediately
  }
})();
