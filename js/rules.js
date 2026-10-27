// Design Fidelity Rules, carried over from the Base44 MockupGenie build guide.
// Every change to this app must keep all five true. They exist because image
// models redraw whatever they are given: the only way to guarantee an Etsy
// buyer gets exactly what the photo shows is to never let a model draw the design.

export const RULES = [
  ['R1', 'The design file is never sent to an image generator. This app makes no network request with it at all: it is opened and read in your browser only.'],
  ['R2', 'Every card pixel in a final mockup comes from your original design file, via the compositing code.'],
  ['R3', 'Scene changes happen to the raw key-colour scene, and the design is composited again afterwards.'],
  ['R4', 'The design is never cropped. If an export crop cannot hold the whole card, the app shows an error instead of trimming it. The one exception is the Pile layout: the cards around the hero run off the frame edge, as in a real pile, but the hero card on top is always whole.'],
  ['R5', 'The only changes to design pixels are the perspective warp, a lighting multiply and a paper texture. Lighting and texture are sliders that can be set to 0.'],
];

export class FidelityError extends Error {}
