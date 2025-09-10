/**
 * MIDI message types and utilities
 */
export type MIDIMessage = [number, number, number?];

export interface MIDICallbacks {
  onMidi?: (message: MIDIMessage) => void;
  onNoteOn?: (note: number, velocity: number) => void;
  onNoteOff?: (note: number) => void;
  onPitchBend?: (value14bit: number) => void;
  onControlChange?: (controller: number, value: number) => void;
}

/**
 * Keyboard configuration options
 */
export interface DrawKeyboardOptions {
  /** Container element or canvas element */
  container?: HTMLElement;
  canvas?: HTMLCanvasElement;

  /** Key dimensions */
  keyWidth?: number;
  keyHeight?: number;

  /** Note range */
  baseNote?: number | string; // Accepts number (MIDI) or note name like 'C4'
  maxWhiteKeys?: number;

  /** Visual styling */
  highlightColor?: string;
  showOctaveLabels?: boolean;
  ariaLabel?: string;

  /** MIDI settings */
  velocity?: number;

  /** Event callbacks */
  onMidi?: (message: MIDIMessage) => void;
  onNoteOn?: (note: number, velocity: number) => void;
  onNoteOff?: (note: number) => void;
  onPitchBend?: (value14bit: number) => void;
  onControlChange?: (controller: number, value: number) => void;

  /** Gestures configuration */
  gestures?: {
    pitchBend?: boolean;
    modulation?: boolean;
  };

  /** QWERTY keyboard layout */
  qwertyLayout?: 'none' | 'singleRow' | 'doubleRow';
}

/**
 * Touch state tracking
 */
export interface TouchState {
  startPos: [number, number];
  currPos: [number, number];
  note: number;
}

/**
 * Keyboard layout constants
 */
export const PIANO_KEYS = {
  black: [1, 3, 6, 8, 10] as const,
  white: [0, 2, 4, 5, 7, 9, 11] as const,
} as const;

/**
 * Custom keyboard events
 */
export interface DrawKeyboardEventMap {
  midi: CustomEvent<MIDIMessage>;
  noteOn: CustomEvent<{ note: number; velocity: number }>;
  noteOff: CustomEvent<{ note: number }>;
  pitchBend: CustomEvent<{ value: number }>;
  controlChange: CustomEvent<{ controller: number; value: number }>;
}

declare global {
  interface HTMLElementEventMap extends DrawKeyboardEventMap {}
}
