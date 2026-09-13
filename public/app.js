'use strict';

const state = {
  household: localStorage.getItem('foodie_household') || '',
  liked: [],
  disliked: [],
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
  results: document.getElementById('results'),
  resultsCount: document.getElementById('resultsCount'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalBody: document.getElementById('modalBody'),
  modalClose: document.getElementById('modalClose'),
};

// ---------- Tag input helper --------------------------------------------

function renderTags(list, container, kind) {
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
      renderTags(list, container, kind);
    });
    tag.appendChild(removeBtn);
    container.appendChild(tag);
  }
}

function addTag(list, container, kind, rawValue) {
  const value = rawValue.trim();
  if (!value) return;
  if (!list.some((v) => v.toLowerCase() === value.toLowerCase())) {
    list.push(value);
    renderTags(list, container, kind);
  }
}

function wireTagInput({ input, tagsContainer, suggestionsContainer, list, kind }) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(list, tagsContainer, kind, input.value);
      input.value = '';
      suggestionsContainer.innerHTML = '';
    } else if (e.key === 'Backspace' && !input.value && list.length) {
      list.pop();
      renderTags(list, tagsContainer, kind);
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
          addTag(list, tagsContainer, kind, option);
          input.value = '';
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
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ---------- Household ----------------------------------------------------

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
  localStorage.setItem('foodie_household', data.name);
  el.householdStatus.textContent = `Synced as "${data.name}"`;
  renderTags(state.liked, el.likeTags, 'like');
  renderTags(state.disliked, el.dislikeTags, 'dislike');
}

async function savePreferences() {
  if (!state.household) {
    el.householdStatus.textContent = 'Pick a household name first';
    return;
  }
  await fetchJson(`/api/households/${encodeURIComponent(state.household)}/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ liked: state.liked, disliked: state.disliked }),
  });
  el.householdStatus.textContent = `Saved to "${state.household}"`;
}

// ---------- Matching & rendering ------------------------------------------

async function findDinner() {
  const have = state.liked.join(',');
  const exclude = state.disliked.join(',');
  const householdParam = state.household ? `&household=${encodeURIComponent(state.household)}` : '';
  el.results.innerHTML = '<p class="empty-state">Looking…</p>';

  const recipes = await fetchJson(
    `/api/recipes/match?have=${encodeURIComponent(have)}&exclude=${encodeURIComponent(exclude)}${householdParam}`
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
    el.modalBody.appendChild(cookedBtn);
  }

  el.modalOverlay.classList.remove('hidden');
}

function closeModal() {
  el.modalOverlay.classList.add('hidden');
  el.modalBody.innerHTML = '';
}

// ---------- Wire up --------------------------------------------------------

wireTagInput({
  input: el.likeInput,
  tagsContainer: el.likeTags,
  suggestionsContainer: el.likeSuggestions,
  list: state.liked,
  kind: 'like',
});

wireTagInput({
  input: el.dislikeInput,
  tagsContainer: el.dislikeTags,
  suggestionsContainer: el.dislikeSuggestions,
  list: state.disliked,
  kind: 'dislike',
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

(async function init() {
  if (state.household) {
    el.householdInput.value = state.household;
    try {
      await joinHousehold(state.household);
    } catch {
      // household no longer exists on this server -- ignore, start fresh
    }
  }
})();
