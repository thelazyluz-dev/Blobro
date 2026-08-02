// The Worker has no DOM lib (it's not a browser) so it doesn't get the Web
// Audio API's OscillatorType. src/game/types.ts (SoundParams, part of
// CharacterDef) references it purely as a string-literal shape for jingle
// synthesis params the Worker never plays — it needs the *type* to exist to
// typecheck the shared import, not the runtime API. Ambient global
// declaration only; do not add "DOM" to lib.ts — that would pull in the
// whole browser surface (window, document, …) which the Worker must never
// see. Kept in sync with lib.dom.d.ts's definition.
type OscillatorType = 'custom' | 'sawtooth' | 'sine' | 'square' | 'triangle';
