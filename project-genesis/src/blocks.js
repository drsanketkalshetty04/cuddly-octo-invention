// Building materials. The natural landscape is a continuous heightfield
// (public/terrain.js); these are the pieces inhabitants build with, placed on
// a 1 m construction grid.
export const BLOCKS = [
  { id: 0, name: 'air', solid: false, color: null },
  { id: 1, name: 'stone', solid: true, color: '#8d8a84' },
  { id: 2, name: 'timber', solid: true, color: '#6b4a2b' },
  { id: 3, name: 'planks', solid: true, color: '#b48a55' },
  { id: 4, name: 'brick', solid: true, color: '#9b4a35' },
  { id: 5, name: 'glass', solid: true, color: '#cfe8f0' },
  { id: 6, name: 'plaster', solid: true, color: '#e6e0d2' },
  { id: 7, name: 'slate', solid: true, color: '#3f4650' },
];
export const AIR = 0;
export const PLACEABLE = new Set([1, 2, 3, 4, 5, 6, 7]);
export const isSolid = (id) => BLOCKS[id]?.solid === true;
