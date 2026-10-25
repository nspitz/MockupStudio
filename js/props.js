// Built-in prop and surface library for the Gemini scene prompt. Each phrase is what goes
// into the prompt, so wording here is the thing to tune when Gemini misreads a prop.
// Props you add in the app are saved on that device only (prefs.js).

export const PROP_GROUPS = [
  {
    name: 'Paper & wrap',
    props: [
      { id: 'silk-ribbon', label: 'Silk ribbon', phrase: 'a loose silk ribbon' },
      { id: 'twine-bow', label: 'Twine bow', phrase: 'a small natural twine bow' },
      { id: 'kraft-envelope', label: 'Kraft envelope', phrase: 'a kraft paper envelope' },
      { id: 'wax-seal', label: 'Wax seal', phrase: 'a loose wax seal' },
    ],
  },
  {
    name: 'Party',
    props: [
      { id: 'confetti', label: 'Confetti', phrase: 'scattered round paper confetti' },
      { id: 'paper-plate', label: 'Paper plate + napkin', phrase: 'a paper party plate with a folded napkin' },
      { id: 'balloons', label: 'Balloons (deflated)', phrase: 'a few small deflated balloons' },
      { id: 'party-hat', label: 'Party hat', phrase: 'a paper party hat lying on its side' },
    ],
  },
  {
    name: 'Seasonal',
    props: [
      { id: 'snowflake-confetti', label: 'Snowflake confetti', phrase: 'iridescent snowflake confetti' },
      { id: 'silver-tinsel', label: 'Silver tinsel', phrase: 'silver tinsel' },
      { id: 'pine-sprig', label: 'Pine sprig', phrase: 'a fresh pine sprig' },
    ],
  },
  {
    name: 'Nature',
    props: [
      { id: 'dried-flowers', label: 'Dried flowers', phrase: 'a few dried flowers' },
      { id: 'eucalyptus', label: 'Eucalyptus sprig', phrase: 'a eucalyptus sprig' },
      { id: 'seashells', label: 'Seashells', phrase: 'a few small seashells' },
    ],
  },
];

export const SURFACES = [
  { id: 'linen', label: 'White linen tablecloth', phrase: 'a white linen tablecloth' },
  { id: 'marble', label: 'White marble', phrase: 'a white marble surface' },
  { id: 'wood', label: 'Light wood table', phrase: 'a light oak wooden table' },
  { id: 'kraft', label: 'Kraft paper', phrase: 'a sheet of kraft paper' },
];
