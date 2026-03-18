/**
 * Nexus — Game Constants
 * Central source of truth for board geometry, adjacency, and rules.
 * Nothing here changes between v1 and v1.1.
 */

export const PLAYERS = {
  ONE: 1,
  TWO: 2,
};

export const CELL = {
  EMPTY: 0,
  P1: 1,
  P2: 2,
};

/** SVG canvas coordinates for each node */
export const NODE_POSITIONS = {
  A: { x: 60,  y: 60  },
  B: { x: 160, y: 60  },
  C: { x: 260, y: 60  },
  D: { x: 60,  y: 160 },
  E: { x: 160, y: 160 },
  F: { x: 260, y: 160 },
  G: { x: 60,  y: 260 },
  H: { x: 160, y: 260 },
  I: { x: 260, y: 260 },
};

/** Legal movement connections between nodes */
export const ADJACENCY = {
  A: ['B', 'D', 'E'],
  B: ['A', 'C', 'E'],
  C: ['B', 'F', 'E'],
  D: ['A', 'G', 'E'],
  E: ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'I'],
  F: ['C', 'I', 'E'],
  G: ['D', 'H', 'E'],
  H: ['G', 'I', 'E'],
  I: ['H', 'F', 'E'],
};

/**
 * All edges as pairs — used for SVG line rendering.
 * Each pair listed once (lower alpha first) to avoid duplicates.
 */
export const EDGES = [
  ['A','B'], ['B','C'],
  ['D','E'], ['E','F'],
  ['G','H'], ['H','I'],
  ['A','D'], ['D','G'],
  ['B','E'], ['E','H'],
  ['C','F'], ['F','I'],
  ['A','E'], ['C','E'],
  ['G','E'], ['I','E'],
];

/** The four valid winning lines — all pass through center node E */
export const WIN_LINES = [
  ['A', 'E', 'I'],
  ['C', 'E', 'G'],
  ['B', 'E', 'H'],
  ['D', 'E', 'F'],
];

/** Starting board positions per player */
export const INITIAL_BOARD = {
  A: CELL.P1, B: CELL.P1, C: CELL.P1,
  D: CELL.EMPTY, E: CELL.EMPTY, F: CELL.EMPTY,
  G: CELL.P2,  H: CELL.P2,  I: CELL.P2,
};

/** Game modes — v1.1 adds ONLINE */
export const GAME_MODE = {
  TWO_PLAYER: '2p',
  VS_AI:      'ai',
  ONLINE:     'online', // reserved for v1.1
};
