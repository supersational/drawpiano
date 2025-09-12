import { DrawKeyboard } from './DrawKeyboard.js';
// Default export ensures UMD global equals the class (not a namespace)
export default DrawKeyboard;
// Keep named exports for ESM/CJS ergonomics
export { DrawKeyboard };
export type { DrawKeyboardOptions, MIDIMessage, MIDICallbacks, TouchState } from './types.js';
