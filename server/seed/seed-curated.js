'use strict';

// Seeds every hand-curated cuisine file in server/data/curated/ -- each
// one fills a specific gap in TheMealDB (which skews international/
// pub-style) with a short, hand-picked list rather than a bulk scrape,
// so there's no near-duplicate bloat to worry about. See american.js in
// that directory for the reasoning in full; add a new file there for a
// new cuisine (e.g. chilean.js, german.js) and it's picked up
// automatically -- nothing here needs to change.
//
// Each file must export { area: string, recipes: Array }, where each
// recipe is:
//   {
//     id: string,              // stable slug, used as external_id (upsert key)
//     name: string,
//     category: string,        // TheMealDB-style grouping (Beef, Dessert, Soup, ...)
//     tags: string,             // comma-separated, freeform (e.g. "Soup,Comfort Food")
//     instructions: string,
//     ingredients: Array<[name, measure]>,
//   }
//
// No network access needed -- this is entirely local data.

const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const { upsertRecipe } = require('./lib');

const CURATED_DIR = path.join(__dirname, '..', 'data', 'curated');

const files = fs.readdirSync(CURATED_DIR).filter((f) => f.endsWith('.js'));

let total = 0;
for (const file of files) {
  const { area, recipes } = require(path.join(CURATED_DIR, file));
  console.log(`\n${area} (${file}): ${recipes.length} recipes`);

  for (const recipe of recipes) {
    upsertRecipe({
      externalId: recipe.id,
      name: recipe.name,
      category: recipe.category,
      area,
      instructions: recipe.instructions,
      imageUrl: null,
      sourceUrl: null,
      source: 'Foodie (curated)',
      tags: recipe.tags,
      ingredients: recipe.ingredients,
    });
    console.log(`  + ${recipe.name}`);
    total += 1;
  }
}

const recipeCount = db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get().n;
console.log(`\nDone. Seeded ${total} curated recipes across ${files.length} cuisine file(s).`);
console.log(`${recipeCount} total recipes now in the local database.`);
