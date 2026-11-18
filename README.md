# BLOCKSIDE BAY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tinhdowoss/blockside-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tinhdowoss/blockside-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

BLOCKSIDE BAY is an original voxel open-world crime game that runs in the browser. You play Kai Navarro, six years out of prison and back in a pastel art-deco bay city, working with Mari, Teddy, Jolie, Dez and Pia against the Neon Vipers and Augustine Salt's Saltwater Kings. Steal cars, shake the BBPD and work through a 9-mission story across 7 chapters. All characters, places, dialogue, textures and music are original. It is plain JavaScript ES modules with no build step, and three.js is vendored in `game/vendor/three.min.js`.

![Police chase](screenshots/1-chase.jpg)
![Title screen](screenshots/2-title.jpg)

**Features**

- A grid city with 7 districts (Palmetto Heights, Neon Mile, Midtown Reef, Mangrove Docks, Little Caracol, Coral Pier, Sunset Shores) plus Seaglass Beach, the ocean and a pier
- 6 drivable car models, civilian traffic that drives in lanes, and pedestrians who duck and cover or run from gunfire and dive clear of speeding cars
- Carjacking: pulling a driver out of a car adds a wanted star
- Wanted level from 0 to 5 stars. Police cars chase and ram you, a helicopter with a searchlight joins at 3 stars and roadblocks go up at 4. A BBPD response panel lists every unit by call sign with its distance and state (RAMMING, PURSUIT, ROADBLOCK, SPOTLIGHT, SEARCHING). Stay out of sight long enough and the stars drop
- Fists, a pistol, an SMG and the SCATTER shotgun (the last two unlock through the story), with reloading, hit sparks and headshot bonuses
- Street reputation: XP from missions, takedowns, carjacks and escapes raises your REP level and title
- 9 story missions with dialogue: steal, deliver, eliminate, pick up, timed escapes and boss fights. The mission panel shows the stage, the objective, what comes next and a tip; the map shows numbered story pins and a route
- A day/night cycle with golden-hour haze and a bloom post pass (neon, light bars and muzzle flashes glow), tyre smoke, skid marks, speed streaks and speed-based camera FOV and shake, a rotating minimap, and a pause menu with Map, Missions, Stats, Save and Settings tabs
- In-game graphics: filmic tone curve, exposure, a time-of-day colour grade and vignette, soft distance haze, a gradient sky with sun disc, moon and drifting voxel clouds, texel-snapped soft shadows, and a shader sea with rolling swells, sun glitter and shoreline foam
- Landmarks of its own: the HALCYON SPAN suspension bridge with its own traffic, the CORAL WHEEL Ferris wheel by the pier, MANGROVE MARINA with bobbing boats, and the POINT GLASS lighthouse whose beam sweeps the bay at night
- Street life: shopfronts with invented names and striped awnings, rooftop billboards, benches, bins, hydrants, mailboxes, BAYLINK bus shelters and working traffic signals that civilian cars stop for; headlights, tail lights and police strobes at night; tall beams over mission markers
- Side activities (press **G**): three street races with checkpoints, a countdown and bronze/silver/gold times; PALOMAR CAB taxi fares with tips and streaks; BAYLINK PARCEL delivery runs; PAINT & PISTON garages (repair, respray that sheds a star if the police can't see you, engine and grip upgrades); LEAD & LIME gun counters (ammo, early SMG and scatter gun with enough rep, body armor); 30 hidden SEA GLASS shards. All of them show on the minimap and the pause map legend, pay cash and rep, and are counted in STATS and saved
- Procedural WebAudio: a mixer with compressor, limiter and reverb/delay sends; four radio stations (synthwave, bay house, tropical brass, lo-fi keys) with drums, bass, chords and lead/arpeggio; an engine that shifts through five gears and responds to the throttle; tyre screech; police sirens with distance, stereo pan and doppler; surf, city hum, gulls by day and crickets at night; UI clicks and hovers. All of it follows the volume settings
- Skills that improve as you play (driving, shooting, stamina, stealth) and 3 save slots stored in localStorage

**Controls**

- **WASD**: move on foot, or drive (W throttle, S brake/reverse, A/D steer)
- **Mouse**: aim the camera. **Left click**: shoot (click the game first to lock the pointer)
- **Shift**: sprint on foot, handbrake in a car (Space also works as handbrake)
- **F**: enter, exit or steal a vehicle
- **E**: talk to a nearby pedestrian on foot, change radio station in a car
- **G**: start a race, go on taxi duty, take a parcel run, or open a garage / gun counter. **1-4** buy in those menus
- **Tab** (or Q): cycle weapons. **1-4**: pick a weapon. **R**: reload
- **M**: map and save menu
- **Esc**: pause

## Source layout

`game/src` is split by job:

- `core/`: boot and main loop, config, seeded RNG, shared state, input, save slots, settings
- `world/`: city builder, daylight and sky, clouds, water, landmarks, storefronts, street furniture and signals, activity sites, textures, voxel batching, models, traffic, pedestrians
- `gameplay/`: player, camera, vehicles, carjacking, police, combat, missions, progression, side activities (races, jobs, shops, collectibles)
- `data/`: story missions, the cast, side-activity data
- `ui/`: HUD, minimap, menus, dialogue, pixel font
- `audio/`: mixer, radio stations, sound effects, ambience
- `fx/`: particles, smoke, skid marks, car lights, post-processing, colour grade
- `dev/`: deterministic screenshot scenes (`?shot=chase|title|combat|map&seed=1`)

## Run it

```sh
cd game && python3 -m http.server 8000
# then open http://localhost:8000 in desktop Chrome
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
