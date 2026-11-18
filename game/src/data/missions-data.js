// The story of BLOCKSIDE BAY: 9 missions in 7 chapters, each a list of stages with original dialogue.
// Stage types: goto, steal, drive, eliminate, wanted, lose, pickup. `at` names a city landmark.
// Per mission: `par` is the target time in seconds for the results-screen rating, `outro` plays after
// the results card closes, `failLine` is what the giver says on the MISSION FAILED card.

export const MISSIONS = [
  {
    id: 'bay', chapter: 1, title: 'WELCOME TO THE BAY', giver: 'mari', start: 'safehouse', reward: 1500, par: 200,
    blurb: 'Kai is out after six years. Mari has a job and a diner booth waiting.',
    stages: [
      { type: 'goto', at: 'diner', text: 'Meet Mari at the Flamingo Diner', say: [['mari', "Six years upstate and you still dress like a flamingo. Get to the diner, I'm buying."]] },
      { type: 'steal', text: 'Borrow a car off the street', say: [['mari', 'First rule of the Bay: never walk. Grab something with wheels.'], ['kai', 'Borrow. We say borrow.']] },
      { type: 'drive', at: 'garage', text: 'Drive it to Brix Auto in Mangrove Docks', say: [['mari', 'Teddy runs a garage by the docks. He pays cash and asks nothing.']] },
    ],
    outro: [['teddy', "Kai Navarro, in my bay, in a car he doesn't own. Like old times. Come back when you want real work."]],
    failLine: ['mari', 'Shake it off. The diner is still open and so is the job.'],
  },
  {
    id: 'pink', chapter: 1, title: 'PINK SLIP', giver: 'teddy', start: 'garage', reward: 3000, par: 260,
    blurb: 'A pink Coralline GT sits outside Reef Tower. Teddy wants it by sundown.',
    stages: [
      { type: 'steal', model: 'coralline', spawn: 'tower', text: 'Steal the pink Coralline GT at Reef Tower', say: [['teddy', "Pink Coralline, parked like it owns the street. It doesn't. You do."]] },
      { type: 'wanted', level: 2, text: 'The alarm tripped - shake the BBPD' },
      { type: 'lose', text: 'Lose the cops', say: [['dispatch', 'All units, pink sports coupe headed out of Midtown Reef.']] },
      { type: 'drive', at: 'garage', needModel: 'coralline', text: 'Bring the Coralline back to Brix Auto', say: [['teddy', "Not a scratch, Kai. That paint is worth more than you."]] },
    ],
    outro: [['teddy', 'Look at her. I could cry. I won\'t, but I could.'], ['dez', 'Hi. New friend. I wiped the tower cameras while you were joyriding. Call me Dez.']],
    failLine: ['teddy', "The Coralline isn't going anywhere. Neither is my money. Try again."],
  },
  {
    id: 'debts', chapter: 2, title: 'NEON DEBTS', giver: 'jolie', start: 'club', reward: 2000, ammo: { pistol: 48 }, par: 150,
    blurb: 'Jolie needs three Neon Vipers runners reminded of what they owe.',
    stages: [
      { type: 'goto', at: 'club', text: 'Find the runners outside Club Volta', say: [['jolie', "Three of Ocampo's runners skim my door money. Remind them who signs the checks."]] },
      { type: 'eliminate', at: 'club', gang: 'vipers', count: 3, text: 'Rough up the Viper runners', say: [['kai', 'Evening, gentlemen. Jolie sends her love.']] },
      { type: 'goto', at: 'diner', text: 'Report back at the Flamingo Diner', say: [['jolie', "Nice. Ocampo will hear about this. That's the point."]] },
    ],
    outro: [['jolie', 'Pancakes are on me. The Vipers will want a word, so eat fast.']],
    failLine: ['jolie', 'Runners scattered. They always come back to the door - so do we.'],
  },
  {
    id: 'chop', chapter: 2, title: 'CHOP SHOP RUN', giver: 'teddy', start: 'garage', reward: 2500, par: 200,
    blurb: 'A buyer in Little Caracol wants a Vista Coupe, no questions.',
    stages: [
      { type: 'steal', model: 'vista', text: 'Steal any Vista Coupe', say: [['teddy', 'Vista Coupe. Two doors, loud paint. The streets are full of them.']] },
      { type: 'drive', at: 'caracol', needModel: 'vista', text: 'Deliver the Vista to Caracol Market', say: [['dez', 'Buyer is waiting at the market. I already wiped its plates remotely. You are welcome.']] },
    ],
    outro: [['dez', 'Buyer paid in mangoes and cash. I kept the mangoes. Swing by the market sometime - I have a job about a tape.']],
    failLine: ['teddy', 'Plenty more Vistas on the street. Pick a cleaner one.'],
  },
  {
    id: 'pit', chapter: 3, title: 'VIPER PIT', giver: 'jolie', start: 'diner', reward: 5000, unlock: 'smg', night: true, par: 300,
    blurb: 'Rico Ocampo put a price on Jolie. Take the fight to Neon Mile.',
    stages: [
      { type: 'goto', at: 'club', text: 'Drive to Neon Mile', say: [['jolie', "Ocampo put a price on my head. Let's go collect it from him."]] },
      { type: 'eliminate', at: 'club', gang: 'vipers', count: 6, boss: 'ocampo', text: "Take down Rico Ocampo's crew", say: [['ocampo', 'Navarro! This is MY mile. Every light on this street answers to me!'], ['kai', 'Then tell them to dim.']] },
      { type: 'wanted', level: 3, text: 'Neon Mile lit up the scanner', say: [['dez', 'Police scanner is screaming. Three cars and a chopper, and they all hate you.']] },
      { type: 'lose', text: 'Lose the cops', hint: 'Duck into the alleys behind the clubs - the chopper beam cannot follow under neon' },
    ],
    outro: [['jolie', 'Ocampo is done. Neon Mile is quiet for the first time in years.'], ['jolie', "Keep the SMG. You'll need it. I've seen who Ocampo was working for."]],
    failLine: ['jolie', "Ocampo's still breathing. That's a problem we fix tonight."],
  },
  {
    id: 'tape', chapter: 4, title: 'SUNSET TAPE', giver: 'dez', start: 'caracol', reward: 4000, par: 260,
    blurb: 'A security tape at the Sunset Shores Motel links the crew to the Pink Slip job.',
    stages: [
      { type: 'pickup', at: 'shores', text: 'Grab the tape from the Sunset Shores Motel', say: [['pia', "Motel manager just went for a smoke. You've got a minute."], ['dez', 'Room 12. The motel camera caught your face. The tape caught your good side.']] },
      { type: 'wanted', level: 2, text: 'Motel security called it in' },
      { type: 'lose', text: 'Lose the cops', say: [['dispatch', 'Suspect fleeing Sunset Shores on foot, pink shirt, bad attitude.']] },
      { type: 'goto', at: 'safehouse', text: "Take the tape to Kai's place" },
    ],
    outro: [['dez', 'Rewinding... Salt is on this tape too. Paying the motel manager. Huh.'], ['mari', 'Augustine Salt. I knew it. Come to the diner, Kai.']],
    failLine: ['dez', "The tape is still in Room 12. I'll loop the camera again."],
  },
  {
    id: 'yacht', chapter: 5, title: 'YACHT WEEK', giver: 'mari', start: 'diner', reward: 8000, unlock: 'lance', par: 330,
    blurb: "Augustine Salt sails tonight. The Coralline is the crew's only ticket aboard.",
    stages: [
      { type: 'steal', model: 'coralline', spawn: 'caracol', text: 'Steal the Coralline GT in Little Caracol', say: [['mari', "Salt's yacht only lets in pink Corallines tonight. Don't ask. Rich people."]] },
      { type: 'wanted', level: 4, text: 'Every cop in the Bay is on you' },
      { type: 'lose', timer: 150, text: 'Lose the cops before the yacht leaves Coral Pier', hint: 'Cut down side streets - the chopper beam lags behind you', say: [['mari', "You've got the whole BBPD on your bumper. Lose them before the yacht leaves Coral Pier!"]] },
      { type: 'drive', at: 'pier', needModel: 'coralline', timer: 90, text: 'Get to the end of Coral Pier', say: [['jolie', "Clear! Floor it, Kai, they're pulling the ropes!"]] },
    ],
    outro: [['gus', 'Kai Navarro. In a pink car, on my pier. You are a long way from upstate.'], ['mari', 'Something is wrong - the yacht is empty. Kai, take the SEA LANCE from the trunk and get out of there!']],
    failLine: ['mari', 'The yacht waits for nobody. Lucky for you it has engine trouble. Go again.'],
  },
  {
    id: 'salt', chapter: 6, title: 'SALTWATER', giver: 'teddy', start: 'garage', reward: 6000, armor: 100, unlock: 'pump', par: 280,
    blurb: "The yacht was a trap. Hit Salt's warehouse before he hits back.",
    stages: [
      { type: 'goto', at: 'docks', text: 'Hit the Saltwater Kings warehouse', say: [['teddy', 'Salt sold us out on that boat. His warehouse is two blocks from my shop. Insulting.'], ['pia', 'I count eight on the roof and the loading bay. Bring the scatter gun.']] },
      { type: 'eliminate', at: 'docks', gang: 'salt', count: 8, text: 'Clear out the Saltwater Kings', hint: 'They flank - keep the crates between you and the loading bay', say: [['gus', 'You should have stayed upstate, Navarro. The Bay eats boys like you.']] },
      { type: 'pickup', at: 'docks', text: "Grab Salt's ledger" },
    ],
    outro: [['pia', "The ledger has every cop and councilman Salt owns. He'll run to the pier. He always does."]],
    failLine: ['teddy', 'Regroup at the shop. The warehouse is not going anywhere.'],
  },
  {
    id: 'lastlight', chapter: 7, title: 'LAST LIGHT ON THE BAY', giver: 'mari', start: 'safehouse', reward: 25000, night: true, par: 360,
    blurb: 'Augustine Salt makes his stand at the end of Coral Pier.',
    stages: [
      { type: 'goto', at: 'pier', text: 'Corner Augustine Salt on Coral Pier', say: [['mari', 'This is it. Salt, the pier, sunset. Bring everybody home.']] },
      { type: 'eliminate', at: 'pier', gang: 'salt', count: 5, boss: 'gus', text: 'Take down Augustine Salt', say: [['gus', 'I built this bay, block by block!'], ['kai', 'Then you know how they fall.']] },
      { type: 'wanted', level: 5, text: 'Five stars - the whole Bay is watching' },
      { type: 'lose', text: 'Lose the cops one last time', say: [['jolie', 'Kai. Drive. Anywhere but here.']] },
    ],
    outro: [['mari', 'Salt is gone. The ledger is with a reporter who owes Dez a favour.'], ['kai', 'Six years upstate. One summer back. I think I like it here.']],
    failLine: ['mari', 'Salt is still on that pier. One more push, Kai.'],
  },
];

// One-line story hook for the title screen.
export const STORY_HOOK = 'Six years upstate. One pink car. A whole bay that owes Kai Navarro.';

// Fallback tips per stage type (a stage's own `hint` wins).
export const HINTS = {
  goto: 'Follow the pink GPS line on the minimap',
  steal: 'Walk up to a car and press F to pull the driver out',
  drive: 'Park inside the marker - Shift for a handbrake slide',
  eliminate: 'Aim for the head - C to crouch, Space to roll out of fire',
  wanted: 'Every theft and shot adds heat',
  lose: 'Break line of sight - the stars cool down while hidden',
  pickup: 'Get out of the car and walk into the marker',
};

export const CHAPTER_NAMES = ['', 'HOMECOMING', 'NEON MONEY', 'VIPER PIT', 'TAPES & LIES', 'YACHT WEEK', 'SALTWATER', 'LAST LIGHT'];
