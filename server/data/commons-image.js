'use strict';

// Builds a stable, hotlink-safe URL to a Wikimedia Commons file using its
// Special:FilePath redirect, which always resolves to the file's current
// version regardless of which wiki hash-bucket it's stored under.
//
// Recipes store just the plain Commons filename (e.g.
// "Chicken_noodle_soup.jpg", copied from the file's URL on
// commons.wikimedia.org) -- encoding parens/accents/umlauts correctly by
// hand is easy to get subtly wrong, so it's done here once instead.
function commonsFilePath(filename) {
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

module.exports = { commonsFilePath };
