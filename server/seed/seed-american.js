'use strict';

// Seeds a small, hand-curated set of classic American home-cooking
// dishes (server/data/american-recipes.js) -- filling the gap in
// TheMealDB, which skews international/pub-style and barely has things
// like chicken noodle soup or chicken and biscuits.
//
// Deliberately not a bulk import: this is a short, hand-picked list,
// not a scrape, so there's no near-duplicate bloat to worry about. Add
// more entries directly to the data file as you notice specific dishes
// missing -- that's the intended way to grow this one, rather than
// pulling in a large dataset wholesale.
//
// No network access needed -- this is entirely local data.

const db = require('../db');
const { upsertRecipe } = require('./lib');
const { AMERICAN_RECIPES } = require('../data/american-recipes');

console.log(`Seeding ${AMERICAN_RECIPES.length} hand-curated American recipes...\n`);

for (const recipe of AMERICAN_RECIPES) {
  upsertRecipe({
    externalId: recipe.id,
    name: recipe.name,
    category: recipe.category,
    area: 'American',
    instructions: recipe.instructions,
    imageUrl: null,
    sourceUrl: null,
    source: 'Foodie (curated)',
    tags: recipe.tags,
    ingredients: recipe.ingredients,
  });
  console.log(`  + ${recipe.name}`);
}

const recipeCount = db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get().n;
console.log(`\nDone. ${recipeCount} total recipes now in the local database.`);
