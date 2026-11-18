// BLOCKSIDE BAY — tuning constants and static tables shared by every system.

export const GAME_TITLE = 'BLOCKSIDE BAY';

// City grid: road centre lines sit on multiples of CELL; blocks fill the gaps.
export const CELL = 48;          // road centre to road centre
export const ROAD_W = 12;        // asphalt width
export const WALK_W = 3;         // sidewalk ring width inside each block
export const GRID_N = 8;         // blocks per side
export const CITY_SIZE = CELL * GRID_N;  // 384
export const BEACH_W = 46;       // sand strip east of the last road
export const OCEAN_X = CITY_SIZE + ROAD_W / 2 + BEACH_W;

// Districts by block coordinate (bx, bz). Each block belongs to exactly one.
export const DISTRICTS = [
  { id: 'palmetto', name: 'PALMETTO HEIGHTS', color: '#ffb3d1', test: (bx, bz) => bx <= 2 && bz <= 2 },
  { id: 'neon', name: 'NEON MILE', color: '#d36bff', test: (bx, bz) => bx >= 3 && bz <= 2 },
  { id: 'midtown', name: 'MIDTOWN REEF', color: '#7fd8ff', test: (bx, bz) => bx >= 2 && bx <= 5 && bz >= 3 && bz <= 5 },
  { id: 'docks', name: 'MANGROVE DOCKS', color: '#ffc46b', test: (bx, bz) => bx <= 1 && bz >= 3 },
  { id: 'caracol', name: 'LITTLE CARACOL', color: '#9dff8a', test: (bx, bz) => bx >= 2 && bx <= 4 && bz >= 6 },
  { id: 'pier', name: 'CORAL PIER', color: '#ff8f6b', test: (bx, bz) => bx >= 5 && bz >= 6 },
  { id: 'shores', name: 'SUNSET SHORES', color: '#ffe36b', test: (bx, bz) => bx >= 6 && bz >= 3 },
];
export const BEACH_NAME = 'SEAGLASS BEACH';

// Pastel art-deco facade palettes: wall, trim, accent.
export const PALETTES = [
  { wall: '#ffc2d9', trim: '#ffffff', accent: '#ff5fa2' },
  { wall: '#a8f0e0', trim: '#ffffff', accent: '#21b8a5' },
  { wall: '#fff0a8', trim: '#ffffff', accent: '#ffb300' },
  { wall: '#c9b8ff', trim: '#ffffff', accent: '#7a5cff' },
  { wall: '#ffd2a8', trim: '#fff6e8', accent: '#ff7a3d' },
  { wall: '#b8e4ff', trim: '#ffffff', accent: '#2f8dff' },
  { wall: '#f4f4f4', trim: '#9ff0ff', accent: '#ff6ec7' },
  { wall: '#d8ffb8', trim: '#ffffff', accent: '#3fbf4f' },
];

// Vehicle models: size in world units, top speed (u/s), accel, grip, colours.
export const CAR_MODELS = {
  coralline: { name: 'CORALLINE GT', len: 4.6, wid: 2.1, hgt: 1.1, top: 46, accel: 22, grip: 7.5, colors: ['#ff4fa3'], sporty: true },
  cruza: { name: 'CRUZA SEDAN', len: 4.4, wid: 2.0, hgt: 1.4, top: 34, accel: 15, grip: 6.5, colors: ['#3fd0ff', '#ffe066', '#ffffff', '#7cf29a', '#ff8a5c'] },
  palomar: { name: 'PALOMAR CAB', len: 4.4, wid: 2.0, hgt: 1.45, top: 33, accel: 14, grip: 6.5, colors: ['#ffd23f'], taxi: true },
  bayrunner: { name: 'BAYRUNNER VAN', len: 5.2, wid: 2.2, hgt: 2.2, top: 28, accel: 11, grip: 6, colors: ['#ffffff', '#a6e3ff', '#ffb3c7'] },
  vista: { name: 'VISTA COUPE', len: 4.2, wid: 2.0, hgt: 1.2, top: 40, accel: 18, grip: 7, colors: ['#9b6bff', '#ff6b6b', '#29e0c0', '#ffffff'], sporty: true },
  interceptor: { name: 'BBPD INTERCEPTOR', len: 4.7, wid: 2.1, hgt: 1.35, top: 44, accel: 21, grip: 7.5, colors: ['#ffffff'], police: true },
};
export const TRAFFIC_MODELS = ['cruza', 'cruza', 'palomar', 'bayrunner', 'vista', 'cruza', 'vista'];

export const WEAPONS = [
  { id: 'fists', name: 'FISTS', icon: 'FIST', damage: 18, range: 2.4, rate: 0.38, auto: false, clip: 0, spread: 0 },
  { id: 'pistol', name: 'PISTOL', icon: 'PSTL', damage: 34, range: 90, rate: 0.26, auto: false, clip: 12, spread: 0.012 },
  { id: 'smg', name: 'SMG', icon: 'SMG', damage: 20, range: 70, rate: 0.085, auto: true, clip: 30, spread: 0.035 },
];

export const PLAYER = {
  walk: 5.2, sprint: 9.5, radius: 0.5, maxHealth: 100, maxArmor: 100,
};

export const WANTED = {
  max: 5,
  evadeTime: [0, 6, 8, 10, 13, 16],   // seconds out of sight to drop a star
  policeCars: [0, 1, 2, 4, 5, 6],      // simultaneous pursuit cars
  heliAt: 3,
  roadblockAt: 4,
};

export const HEADSHOT_BONUS = 150;

// Radio stations, all procedural.
export const STATIONS = [
  { id: 'wave', name: 'WAVE 88.1', tag: 'Synth sunsets', color: '#ff5fa2', bpm: 104, root: 45, scale: [0, 3, 5, 7, 10], style: 'synth' },
  { id: 'reef', name: 'REEF RADIO 102', tag: 'Bay bass & palms', color: '#2ee6c8', bpm: 122, root: 41, scale: [0, 2, 4, 7, 9], style: 'house' },
  { id: 'cumbia', name: 'CARACOL 95.5', tag: 'Tropical brass', color: '#ffd23f', bpm: 96, root: 50, scale: [0, 2, 4, 5, 7, 9], style: 'tropical' },
  { id: 'off', name: 'RADIO OFF', tag: '', color: '#8a8a8a', style: 'off' },
];

export const SAVE_KEY = 'blockside-bay-save-';
export const SAVE_SLOTS = 3;
