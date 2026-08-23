'use strict';

// Seeds the local database from TheMealDB (https://www.themealdb.com), a
// recipe database that is free and open at the point of access. This is
// a ONE-TIME import: run it once (or re-run any time to refresh), and
// from then on the app runs entirely off your own local database file --
// no ongoing calls to TheMealDB, no API key, no subscription.
//
// TheMealDB's free tier doesn't expose a single "give me everything"
// endpoint, so this walks the alphabet with search.php?f=<letter>, which
// is the standard, documented way to pull the full free catalog (~300+
// recipes) without a paid supporter key.
//
// Run this from wherever the app will actually serve traffic (your
// droplet, your own machine) -- it just needs normal outbound internet
// access, which a sandboxed dev/build environment may not have.

const db = require('../db');

const BASE_URL = 'https://www.themealdb.com/api/json/v1/1';
const LETTERS_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const REQUEST_DELAY_MS = 250; // be polite to a free public API

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOrCreateIngredientId(name) {
  const clean = name.trim();
  db.prepare(`INSERT OR IGNORE INTO ingredients (name) VALUES (?)`).run(clean);
  return db.prepare(`SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE`).get(clean).id;
}

const insertRecipeStmt = db.prepare(`
  INSERT INTO recipes (external_id, name, category, area, instructions, image_url, source_url, source)
  VALUES (@external_id, @name, @category, @area, @instructions, @image_url, @source_url, 'TheMealDB')
  ON CONFLICT(external_id) DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    area = excluded.area,
    instructions = excluded.instructions,
    image_url = excluded.image_url,
    source_url = excluded.source_url
`);
const getRecipeIdStmt = db.prepare(`SELECT id FROM recipes WHERE external_id = ?`);
const linkIngredientStmt = db.prepare(`
  INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id, measure) VALUES (?, ?, ?)
`);
const clearLinksStmt = db.prepare(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`);

function importMeal(meal) {
  insertRecipeStmt.run({
    external_id: meal.idMeal,
    name: meal.strMeal,
    category: meal.strCategory || null,
    area: meal.strArea || null,
    instructions: meal.strInstructions || null,
    image_url: meal.strMealThumb || null,
    source_url: meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
  });
  const recipeId = getRecipeIdStmt.get(meal.idMeal).id;

  // Re-importing (e.g. on a refresh run) shouldn't leave stale ingredient
  // links around if a recipe's ingredient list changed upstream.
  clearLinksStmt.run(recipeId);

  for (let i = 1; i <= 20; i++) {
    const ingredientName = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (!ingredientName || !ingredientName.trim()) continue;
    const ingredientId = getOrCreateIngredientId(ingredientName);
    linkIngredientStmt.run(recipeId, ingredientId, (measure || '').trim());
  }
}

async function seedByLetter(letter) {
  const url = `${BASE_URL}/search.php?f=${letter}`;
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.warn(`  [${letter}] network error: ${err.message}`);
    return 0;
  }
  if (!response.ok) {
    console.warn(`  [${letter}] HTTP ${response.status}`);
    return 0;
  }
  const data = await response.json();
  const meals = data.meals || [];
  for (const meal of meals) importMeal(meal);
  return meals.length;
}

(async () => {
  console.log('Seeding Foodie from TheMealDB (free, open recipe API)...\n');
  let total = 0;
  for (const letter of LETTERS_AND_DIGITS) {
    const count = await seedByLetter(letter);
    if (count) console.log(`  ${letter}: +${count} recipes`);
    total += count;
    await sleep(REQUEST_DELAY_MS);
  }

  const recipeCount = db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get().n;
  const ingredientCount = db.prepare(`SELECT COUNT(*) AS n FROM ingredients`).get().n;

  console.log(`\nDone. ${recipeCount} recipes, ${ingredientCount} distinct ingredients in the local database.`);
  console.log('Attribution: recipe data courtesy of TheMealDB (themealdb.com), used under its free-tier API terms.');
  console.log('Your app now runs entirely from the local database file -- no further calls to TheMealDB are needed.');
})();
