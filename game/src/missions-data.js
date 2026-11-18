// The story of BLOCKSIDE BAY: 9 missions in 7 chapters, each a list of stages with original dialogue.
// Stage types: goto, steal, drive, eliminate, wanted, lose, pickup. `at` names a city landmark.

export const MISSIONS = [
  {
    id: 'bay', chapter: 1, title: 'WELCOME TO THE BAY', giver: 'mari', start: 'safehouse', reward: 1500,
    blurb: 'Kai is out after six years. Mari has a job and a diner booth waiting.',
    stages: [
      { type: 'goto', at: 'diner', text: 'Meet Mari at the Flamingo Diner', say: [['mari', "Six years upstate and you still dress like a flamingo. Get to the diner, I'm buying."]] },
      { type: 'steal', text: 'Borrow a car off the street', say: [['mari', 'First rule of the Bay: never walk. Grab something with wheels.'], ['kai', 'Borrow. We say borrow.']] },
      { type: 'drive', at: 'garage', text: 'Drive it to Brix Auto in Mangrove Docks', say: [['mari', 'Teddy runs a garage by the docks. He pays cash and asks nothing.']] },
    ],
  },
  {
    id: 'pink', chapter: 1, title: 'PINK SLIP', giver: 'teddy', start: 'garage', reward: 3000,
    blurb: 'A pink Coralline GT sits outside Reef Tower. Teddy wants it by sundown.',
    stages: [
      { type: 'steal', model: 'coralline', spawn: 'tower', text: 'Steal the pink Coralline GT at Reef Tower', say: [['teddy', "Pink Coralline, parked like it owns the street. It doesn't. You do."]] },
      { type: 'wanted', level: 2, text: 'The alarm tripped - shake the BBPD' },
      { type: 'lose', text: 'Lose the cops', say: [['dispatch', 'All units, pink sports coupe headed out of Midtown Reef.']] },
      { type: 'drive', at: 'garage', needModel: 'coralline', text: 'Bring the Coralline back to Brix Auto', say: [['teddy', "Not a scratch, Kai. That paint is worth more than you."]] },
    ],
  },
  {
    id: 'debts', chapter: 2, title: 'NEON DEBTS', giver: 'jolie', start: 'club', reward: 2000, ammo: { pistol: 48 },
    blurb: 'Jolie needs three Neon Vipers runners reminded of what they owe.',
    stages: [
      { type: 'goto', at: 'club', text: 'Find the runners outside Club Volta', say: [['jolie', "Three of Ocampo's runners skim my door money. Remind them who signs the checks."]] },
      { type: 'eliminate', at: 'club', gang: 'vipers', count: 3, text: 'Rough up the Viper runners', say: [['kai', 'Evening, gentlemen. Jolie sends her love.']] },
      { type: 'goto', at: 'diner', text: 'Report back at the Flamingo Diner', say: [['jolie', "Nice. Ocampo will hear about this. That's the point."]] },
    ],
  },
  {
    id: 'chop', chapter: 2, title: 'CHOP SHOP RUN', giver: 'teddy', start: 'garage', reward: 2500,
    blurb: 'A buyer in Little Caracol wants a Vista Coupe, no questions.',
    stages: [
      { type: 'steal', model: 'vista', text: 'Steal any Vista Coupe', say: [['teddy', 'Vista Coupe. Two doors, loud paint. The streets are full of them.']] },
      { type: 'drive', at: 'caracol', needModel: 'vista', text: 'Deliver the Vista to Caracol Market', say: [['dez', 'Buyer is waiting at the market. I already wiped its plates remotely. You are welcome.']] },
    ],
  },
  {
    id: 'pit', chapter: 3, title: 'VIPER PIT', giver: 'jolie', start: 'diner', reward: 5000, unlock: 'smg', night: true,
    blurb: 'Rico Ocampo put a price on Jolie. Take the fight to Neon Mile.',
    stages: [
      { type: 'goto', at: 'club', text: 'Drive to Neon Mile', say: [['jolie', "Ocampo put a price on my head. Let's go collect it from him."]] },
      { type: 'eliminate', at: 'club', gang: 'vipers', count: 6, boss: 'ocampo', text: "Take down Rico Ocampo's crew", say: [['ocampo', 'Navarro! This is MY mile. Every light on this street answers to me!'], ['kai', 'Then tell them to dim.']] },
      { type: 'lose', text: 'Lose the cops', say: [['dez', 'Police scanner is screaming. Get out of Neon Mile.']] },
    ],
  },
  {
    id: 'tape', chapter: 4, title: 'SUNSET TAPE', giver: 'dez', start: 'caracol', reward: 4000,
    blurb: 'A security tape at the Sunset Shores Motel links the crew to the Pink Slip job.',
    stages: [
      { type: 'pickup', at: 'shores', text: 'Grab the tape from the Sunset Shores Motel', say: [['dez', 'Room 12. The motel camera caught your face. The tape caught your good side.']] },
      { type: 'wanted', level: 2, text: 'Motel security called it in' },
      { type: 'lose', text: 'Lose the cops', say: [['dispatch', 'Suspect fleeing Sunset Shores on foot, pink shirt, bad attitude.']] },
      { type: 'goto', at: 'safehouse', text: "Take the tape to Kai's place" },
    ],
  },
  {
    id: 'yacht', chapter: 5, title: 'YACHT WEEK', giver: 'mari', start: 'diner', reward: 8000,
    blurb: "Augustine Salt sails tonight. The Coralline is the crew's only ticket aboard.",
    stages: [
      { type: 'steal', model: 'coralline', spawn: 'caracol', text: 'Steal the Coralline GT in Little Caracol', say: [['mari', "Salt's yacht only lets in pink Corallines tonight. Don't ask. Rich people."]] },
      { type: 'wanted', level: 4, text: 'Every cop in the Bay is on you' },
      { type: 'lose', timer: 150, text: 'Lose the cops before the yacht leaves Coral Pier', say: [['mari', "You've got the whole BBPD on your bumper. Lose them before the yacht leaves Coral Pier!"]] },
      { type: 'drive', at: 'pier', needModel: 'coralline', timer: 90, text: 'Get to the end of Coral Pier', say: [['jolie', "Clear! Floor it, Kai, they're pulling the ropes!"]] },
    ],
  },
  {
    id: 'salt', chapter: 6, title: 'SALTWATER', giver: 'teddy', start: 'garage', reward: 6000, armor: 100,
    blurb: "The yacht was a trap. Hit Salt's warehouse before he hits back.",
    stages: [
      { type: 'goto', at: 'docks', text: 'Hit the Saltwater Kings warehouse', say: [['teddy', 'Salt sold us out on that boat. His warehouse is two blocks from my shop. Insulting.']] },
      { type: 'eliminate', at: 'docks', gang: 'salt', count: 8, text: 'Clear out the Saltwater Kings', say: [['gus', 'You should have stayed upstate, Navarro. The Bay eats boys like you.']] },
      { type: 'pickup', at: 'docks', text: "Grab Salt's ledger" },
    ],
  },
  {
    id: 'lastlight', chapter: 7, title: 'LAST LIGHT ON THE BAY', giver: 'mari', start: 'safehouse', reward: 25000, night: true,
    blurb: 'Augustine Salt makes his stand at the end of Coral Pier.',
    stages: [
      { type: 'goto', at: 'pier', text: 'Corner Augustine Salt on Coral Pier', say: [['mari', 'This is it. Salt, the pier, sunset. Bring everybody home.']] },
      { type: 'eliminate', at: 'pier', gang: 'salt', count: 5, boss: 'gus', text: 'Take down Augustine Salt', say: [['gus', 'I built this bay, block by block!'], ['kai', 'Then you know how they fall.']] },
      { type: 'wanted', level: 5, text: 'Five stars - the whole Bay is watching' },
      { type: 'lose', text: 'Lose the cops one last time', say: [['jolie', 'Kai. Drive. Anywhere but here.']] },
    ],
  },
];

export const CHAPTER_NAMES = ['', 'HOMECOMING', 'NEON MONEY', 'VIPER PIT', 'TAPES & LIES', 'YACHT WEEK', 'SALTWATER', 'LAST LIGHT'];
