// Suit shapes in a 100×100 box. Each suit is a list of paths filled separately
// (used both for the DOM cards as inline SVG and for the canvas via Path2D).
export const SUIT_PATHS = {
  H: ['M50 90C24 70 5 54 5 32 5 17 16 7 29 7c10 0 17 6 21 14 4-8 11-14 21-14 13 0 24 10 24 25 0 22-19 38-45 58z'],
  D: ['M50 4Q66 28 88 50 66 72 50 96 34 72 12 50 34 28 50 4z'],
  S: ['M50 5C62 24 94 38 94 61 94 75 84 83 72 83 63 83 57 78 53 72 54 82 58 89 67 95H33C42 89 46 82 47 72 43 78 37 83 28 83 16 83 6 75 6 61 6 38 38 24 50 5z'],
  C: [
    'M50 8a19 19 0 1 1 0 38a19 19 0 1 1 0-38z',
    'M28 40a19 19 0 1 1 0 38a19 19 0 1 1 0-38z',
    'M72 40a19 19 0 1 1 0 38a19 19 0 1 1 0-38z',
    'M50 30L32 62H68z',
    'M47 56C47 76 44 86 34 95H66C56 86 53 76 53 56z',
  ],
};

export const RANK_LABEL = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const svgSuit = (suit, cls) =>
  `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">${SUIT_PATHS[suit].map((d) => `<path d="${d}"/>`).join('')}</svg>`;
