'use strict';

// Known ingredient-name variants that should collapse into one entry --
// e.g. TheMealDB and our own curated recipes don't consistently agree on
// "Carrot" vs "Carrots", so without this they'd sit as two separate rows
// in the ingredients table: separate autocomplete entries, separate
// grocery-list lines, and "avoid carrots" wouldn't catch a recipe that
// happens to only use "Carrot".
//
// Deliberately a small, hand-maintained map rather than a general
// singular/plural heuristic -- English pluralization has enough
// exceptions in food words (asparagus, hummus, couscous, molasses are
// all naturally singular despite ending in "s"; "noodles", "beans",
// "oats" are conventionally always plural) that a blanket rule would
// cause as many bad merges as it fixes. Add a pair here any time a
// duplicate is spotted; the canonical (right-hand) spelling is what
// every variant collapses to, including re-seeding existing recipes.
//
// Keys are matched case-insensitively.
const INGREDIENT_ALIASES = {
  carrots: 'Carrot',
  onions: 'Onion',
  tomatoes: 'Tomato',
  potatoes: 'Potato',
  peppers: 'Pepper',
  mushrooms: 'Mushroom',
  apples: 'Apple',
  eggs: 'Egg',
  shallots: 'Shallot',
  lemons: 'Lemon',
  limes: 'Lime',
  bananas: 'Banana',
  cucumbers: 'Cucumber',
  zucchinis: 'Zucchini',
  courgettes: 'Zucchini',
  eggplants: 'Eggplant',
  aubergines: 'Eggplant',
};

/**
 * Canonicalize an ingredient name for storage/lookup. Falls through to
 * the trimmed original name (case preserved) when there's no known alias.
 */
function canonicalizeIngredientName(rawName) {
  const trimmed = String(rawName || '').trim();
  const key = trimmed.toLowerCase();
  return INGREDIENT_ALIASES[key] || trimmed;
}

module.exports = { INGREDIENT_ALIASES, canonicalizeIngredientName };
