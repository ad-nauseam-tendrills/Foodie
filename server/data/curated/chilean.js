'use strict';

// Hand-picked classic Chilean dishes -- see american.js in this same
// directory for why this is curated rather than bulk-imported, and
// server/seed/seed-curated.js for how files here get loaded.

const RECIPES = [
  {
    id: 'chilean-cazuela',
    name: 'Cazuela',
    imageFile: 'Chilean_Cazuela.JPG',
    category: 'Beef',
    tags: 'Soup,Comfort Food',
    instructions:
      'Season beef with salt and pepper and brown in oil in a large pot over medium-high heat. Add onion and ' +
      'garlic and cook until softened. Add water or stock, bring to a boil, then reduce heat and simmer, ' +
      'covered, for 45 minutes. Add pumpkin, potato, and corn; simmer until the vegetables are tender, about ' +
      '25 minutes. Add green beans and rice in the last 10 minutes. Stir in cilantro just before serving.',
    ingredients: [
      ['Beef Short Rib', '2 lb'],
      ['Pumpkin', '2 cups, cubed'],
      ['Potato', '2, quartered'],
      ['Corn', '2 ears, halved'],
      ['Green Beans', '1 cup'],
      ['Rice', '1/4 cup'],
      ['Onion', '1, diced'],
      ['Garlic', '2 cloves, minced'],
      ['Beef Stock', '8 cups'],
      ['Cilantro', '2 tbsp, chopped'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'chilean-pastel-de-choclo',
    name: 'Pastel de Choclo',
    imageFile: 'Pastel_de_choclo_01.JPG',
    category: 'Beef',
    tags: 'Casserole,Baking,Comfort Food',
    instructions:
      'Make the pino: cook onion in oil until soft, add ground beef and brown, then season with cumin, ' +
      'paprika, salt, and pepper. Spoon into a baking dish and scatter with olives, raisins, and quartered ' +
      'hard-boiled eggs. For the topping, blend corn kernels with milk and basil, then cook in a saucepan with ' +
      'butter and sugar, stirring, until thickened like a loose polenta. Spread over the meat, sprinkle with a ' +
      'little sugar, and bake at 375°F (190°C) until golden on top, about 30 minutes.',
    ingredients: [
      ['Ground Beef', '1.5 lb'],
      ['Corn', '5 cups, kernels'],
      ['Onion', '1, diced'],
      ['Milk', '1/2 cup'],
      ['Basil', '2 tbsp, chopped'],
      ['Butter', '2 tbsp'],
      ['Eggs', '2, hard-boiled and quartered'],
      ['Black Olives', '1/2 cup'],
      ['Raisins', '1/4 cup'],
      ['Cumin', '1 tsp'],
      ['Paprika', '1 tsp'],
      ['Sugar', '2 tbsp'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'chilean-empanadas-de-pino',
    name: 'Empanadas de Pino',
    imageFile: 'Empanadas_chilenas_de_pino.jpg',
    category: 'Beef',
    tags: 'Baking,Snack',
    instructions:
      'Cook onion slowly in oil until very soft and sweet, about 20 minutes. Add ground beef and cook until ' +
      'browned, then season with cumin, paprika, oregano, salt, and pepper; cool completely. Roll out empanada ' +
      'dough into rounds. Place a spoonful of the beef mixture on each, along with a slice of hard-boiled egg, ' +
      'a raisin, and an olive. Fold, seal the edges, and brush with beaten egg. Bake at 400°F (200°C) until ' +
      'golden, about 20 minutes.',
    ingredients: [
      ['Ground Beef', '1 lb'],
      ['Onion', '2, finely diced'],
      ['Empanada Dough', '12 discs'],
      ['Eggs', '2, hard-boiled and sliced, plus 1 beaten'],
      ['Black Olives', '12'],
      ['Raisins', '2 tbsp'],
      ['Cumin', '1 tsp'],
      ['Paprika', '1 tsp'],
      ['Oregano', '1 tsp'],
      ['Vegetable Oil', '3 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'chilean-porotos-granados',
    name: 'Porotos Granados',
    imageFile: 'Porotos_granados_(Chilean_bean_stew).jpg',
    category: 'Vegetarian',
    tags: 'Stew,Vegetarian',
    instructions:
      'Cook onion, garlic, and bell pepper in oil until softened. Stir in paprika and tomato paste, then add ' +
      'beans, pumpkin, and enough water or stock to cover. Simmer until the beans and pumpkin are tender, ' +
      'about 30 minutes. Add corn kernels and basil in the last 10 minutes. Season with salt and pepper; the ' +
      'stew should be thick, not soupy.',
    ingredients: [
      ['Cranberry Beans', '4 cups, fresh or frozen'],
      ['Pumpkin', '2 cups, cubed'],
      ['Corn', '2 cups, kernels'],
      ['Onion', '1, diced'],
      ['Garlic', '2 cloves, minced'],
      ['Bell Pepper', '1, diced'],
      ['Tomato Paste', '2 tbsp'],
      ['Paprika', '1 tsp'],
      ['Basil', '3 tbsp, chopped'],
      ['Vegetable Oil', '2 tbsp'],
      ['Vegetable Stock', '2 cups'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'chilean-charquican',
    name: 'Charquicán',
    imageFile: 'Charquicán.jpg',
    category: 'Beef',
    tags: 'Stew,Comfort Food',
    instructions:
      'Brown beef in oil in a large pot, then remove and set aside. Cook onion and garlic in the same pot ' +
      'until softened. Stir in paprika, add potato, pumpkin, and beef stock; simmer until the vegetables are ' +
      'nearly tender, about 15 minutes. Return the beef to the pot with corn and green beans; simmer until ' +
      'everything is tender and the liquid has mostly reduced, about 15 minutes more. Mash some of the potato ' +
      'against the side of the pot to thicken. Serve topped with a fried egg.',
    ingredients: [
      ['Beef Chuck Roast', '1 lb, cubed'],
      ['Potato', '3, cubed'],
      ['Pumpkin', '2 cups, cubed'],
      ['Corn', '1 cup, kernels'],
      ['Green Beans', '1 cup'],
      ['Onion', '1, diced'],
      ['Garlic', '2 cloves, minced'],
      ['Paprika', '1 tsp'],
      ['Beef Stock', '2 cups'],
      ['Eggs', '4, fried, to serve'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'chilean-chorrillana',
    name: 'Chorrillana',
    imageFile: 'Chorrillana.jpg',
    category: 'Beef',
    tags: 'Comfort Food,Quick',
    instructions:
      'Fry or bake the potatoes until golden and crisp; keep warm. Cook onion in a hot skillet with a little ' +
      'oil until starting to char at the edges, then push to one side. Add thinly sliced beef to the skillet ' +
      'and cook quickly over high heat until browned, seasoning with salt and pepper. Pile the fries onto a ' +
      'platter, top with the beef and onions, and finish with fried eggs on top.',
    ingredients: [
      ['Potato', '4, cut into fries'],
      ['Beef Sirloin', '1 lb, thinly sliced'],
      ['Onion', '2, sliced'],
      ['Eggs', '4, fried'],
      ['Vegetable Oil', '3 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'chilean-pebre',
    name: 'Pebre',
    imageFile: 'Pebre_chileno.jpg',
    category: 'Side',
    tags: 'Sauce,Condiment,Vegetarian,Quick',
    instructions:
      'Finely dice tomato, onion, and chili pepper. Combine with chopped cilantro, garlic, oil, vinegar, and a ' +
      'splash of water in a bowl. Season with salt and let sit at room temperature for at least 15 minutes ' +
      'before serving with bread, empanadas, or grilled meat.',
    ingredients: [
      ['Tomato', '2, diced'],
      ['Onion', '1/2, finely diced'],
      ['Chili Pepper', '1, finely diced'],
      ['Cilantro', '1/4 cup, chopped'],
      ['Garlic', '1 clove, minced'],
      ['Olive Oil', '3 tbsp'],
      ['Red Wine Vinegar', '1 tbsp'],
      ['Salt', 'to taste'],
    ],
  },
  {
    id: 'chilean-humitas',
    name: 'Humitas',
    category: 'Vegetarian',
    tags: 'Steamed,Vegetarian',
    instructions:
      'Blend corn kernels with basil and a little milk until you have a thick paste. Cook onion in oil until ' +
      'soft, then stir into the corn mixture with paprika, sugar, salt, and pepper. Spoon the mixture onto ' +
      'softened corn husks, fold into parcels, and tie with kitchen string. Steam or simmer in a large pot of ' +
      'water for about 45 minutes, until firm. Serve warm, unwrapped.',
    ingredients: [
      ['Corn', '8 cups, kernels'],
      ['Onion', '1, finely diced'],
      ['Basil', '3 tbsp, chopped'],
      ['Milk', '1/4 cup'],
      ['Paprika', '1 tsp'],
      ['Sugar', '1 tsp'],
      ['Corn Husks', '16, softened in warm water'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'chilean-sopaipillas',
    name: 'Sopaipillas',
    imageFile: 'Sopaipillas_chilenas.jpg',
    category: 'Side',
    tags: 'Fried,Snack,Vegetarian',
    instructions:
      'Mash cooked pumpkin until smooth. Mix with flour, baking powder, salt, and melted butter to form a ' +
      'soft dough, adding a splash of water if needed. Roll out and cut into rounds, pricking each a few ' +
      'times with a fork. Fry in hot oil until puffed and golden, about 2 minutes per side. Drain on paper ' +
      'towels and serve with pebre or chancaca syrup.',
    ingredients: [
      ['Pumpkin', '1 cup, cooked and mashed'],
      ['Flour', '3 cups'],
      ['Baking Powder', '1 tbsp'],
      ['Butter', '3 tbsp, melted'],
      ['Vegetable Oil', 'for frying'],
      ['Salt', '1 tsp'],
    ],
  },
  {
    id: 'chilean-leche-asada',
    name: 'Leche Asada',
    imageFile: 'LecheAsada.jpg',
    category: 'Dessert',
    tags: 'Dessert,Baking',
    instructions:
      'Preheat oven to 350°F (175°C). Whisk together eggs, milk, sugar, and vanilla until smooth. Pour into a ' +
      'buttered baking dish and sprinkle the top with a little extra sugar. Bake in a water bath (set the dish ' +
      'inside a larger pan filled with hot water) until just set with a light golden top, about 45 minutes. ' +
      'Chill before serving.',
    ingredients: [
      ['Eggs', '4'],
      ['Milk', '4 cups'],
      ['Sugar', '3/4 cup'],
      ['Vanilla Extract', '1 tsp'],
      ['Butter', '1 tbsp, for greasing'],
    ],
  },
  {
    id: 'chilean-completo',
    name: 'Completo',
    imageFile: 'Completo_italiano.jpg',
    category: 'Starter',
    tags: 'Sandwich,Quick',
    instructions:
      'Grill or boil the hot dogs and warm the buns. Assemble by placing a hot dog in each bun and topping ' +
      'generously with mashed avocado, diced tomato, and mayonnaise. Add sauerkraut or chopped green chili if ' +
      'you like it "completo italiano" style, with the green, white, and red toppings.',
    ingredients: [
      ['Hot Dogs', '4'],
      ['Hot Dog Buns', '4'],
      ['Avocado', '2, mashed'],
      ['Tomato', '2, diced'],
      ['Mayonnaise', '1/2 cup'],
      ['Sauerkraut', '1/2 cup, optional'],
      ['Salt', 'to taste'],
    ],
  },
  {
    id: 'chilean-curanto-en-olla',
    name: 'Curanto en Olla (Pot-Cooked Curanto)',
    imageFile: 'Curanto_al_hoyo.jpg',
    category: 'Seafood',
    tags: 'Stew,Southern Chile,Comfort Food',
    instructions:
      'This is a stovetop version of the traditional earth-pit curanto from southern Chile. Layer sausage and ' +
      'pork in the bottom of a very large pot, followed by chicken, then clams and mussels, and finally ' +
      'potatoes on top. Add a cup of water, cover tightly, and cook over medium-low heat, without stirring, ' +
      'until everything is cooked through and the shellfish have opened, about 45 minutes. Serve everything ' +
      'together in the cooking broth.',
    ingredients: [
      ['Pork Shoulder', '1 lb, cubed'],
      ['Chorizo', '1 lb, sliced'],
      ['Chicken Thighs', '1 lb'],
      ['Clams', '1 lb'],
      ['Mussels', '1 lb'],
      ['Potato', '4, halved'],
      ['Salt', 'to taste'],
    ],
  },
];

module.exports = { area: 'Chilean', recipes: RECIPES };
