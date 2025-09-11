import {
  DrawKeyboardOptions,
  MIDIMessage,
  MIDICallbacks,
  TouchState,
  PIANO_KEYS,
} from './types.js';
import { mod, clamp } from './utils.js';

// Preset QWERTY maps (KeyboardEvent.code -> semitone offset from C)
// NOTE: Offsets are applied relative to C of the octave from qwertyBase.
// Fill in or adjust as desired; runtime override available via setQwertyMap().
const QWERTY_PRESETS: Record<string, Record<string, number>> = {
  // Chromatic ladder on bottom row (interleaving S/D/G/H/J for sharps)
  singleRow: {
    KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5,
    KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
    Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  },
  // Same as singleRow plus Backquote as anchor C
  singleRowExtended: {
  Backquote: 0,
  KeyA: 1,
  KeyZ: 2,
  KeyS: 3,
  KeyX: 4,
  KeyC: 5,
  KeyF: 6,
  KeyV: 7,
  KeyG: 8,
  KeyB: 9,
  KeyH: 10,
  KeyN: 11,
  KeyM: 12,
  KeyK: 13,
  Comma: 14,
  KeyL: 15,
  Period: 16,
  Slash: 17,
  Quote: 18,
  },
  // Whites on bottom row, blacks on number keys between QWERTY letters (minimal seed; extend as needed)
  doubleRow: {
  // Base (copied from singleRowExtended ascending semitone ladder)
  Backquote: 0,
  KeyA: 1, KeyZ: 2, KeyS: 3, KeyX: 4, KeyC: 5, KeyF: 6, KeyV: 7,
  KeyG: 8, KeyB: 9, KeyH: 10, KeyN: 11, KeyM: 12, KeyK: 13,
  Comma: 14, KeyL: 15, Period: 16, Slash: 17, Quote: 18,
  // Upper row whites (qwertyuiop[] mapped to natural note pattern starting at C one octave up)
  // Updated second-row whites starting at offset 17 (Q) ascending, skipping black offsets
  KeyQ: 17, KeyW: 19, KeyE: 21, KeyR: 23, KeyT: 24, KeyY: 26, KeyU: 28,
  KeyI: 29, KeyO: 31, KeyP: 33, BracketLeft: 35, BracketRight: 36,
  // Upper row blacks using digits (start on F# one octave up: 18) sequence 2346790-
  Digit2: 18, Digit3: 20, Digit4: 22, Digit6: 25, Digit7: 27, Digit9: 30, Digit0: 32, Minus: 34,
  },
  // Extended map seeded with a broad layout (fill/modify to taste)
  doubleRowExtended: {
  // Same as doubleRow plus a few extra continuation black/white slots if desired
  Backquote: 0,
  KeyA: 1, KeyZ: 2, KeyS: 3, KeyX: 4, KeyC: 5, KeyF: 6, KeyV: 7,
  KeyG: 8, KeyB: 9, KeyH: 10, KeyN: 11, KeyM: 12, KeyK: 13,
  Comma: 14, KeyL: 15, Period: 16, Slash: 17, Quote: 18,
  // Updated second-row whites starting at offset 17 (Q) ascending, skipping black offsets
  KeyQ: 17, KeyW: 19, KeyE: 21, KeyR: 23, KeyT: 24, KeyY: 26, KeyU: 28,
  KeyI: 29, KeyO: 31, KeyP: 33, BracketLeft: 35, BracketRight: 36,
  Digit2: 18, Digit3: 20, Digit4: 22, Digit6: 25, Digit7: 27, Digit9: 30, Digit0: 32, Minus: 34,
  // Optional additional blacks continuing upward (uncomment / adjust as needed)
  // Equal: 36,
  },
};

/**
 * A touch-enabled virtual piano keyboard with MIDI output
 *
 * @example
 * ```typescript
 * const keyboard = new DrawKeyboard({
 *   container: document.getElementById('keyboard-container'),
 *   keyWidth: 20,
 *   keyHeight: 120,
 *   baseNote: 60, // Middle C
 *   onNoteOn: (note, velocity) => console.log('Note on:', note, velocity),
 *   onNoteOff: (note) => console.log('Note off:', note),
 * });
 * ```
 */
export class DrawKeyboard extends EventTarget {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Dimensions and layout
  private whiteKeyWidth: number;
  private whiteKeyHeight: number;
  private blackKeyWidth: number;
  private blackKeyHeight: number;
  private startingNote: number;
  private maxVisibleWhiteKeys: number;
  private highlightColor: string;
  private noteVelocity: number;
  private showOctaveLabels = true;
  private gestures = { pitchBend: true, modulation: true } as Required<
    NonNullable<DrawKeyboardOptions['gestures']>
  >;
  private qwertyLayout: NonNullable<DrawKeyboardOptions['qwertyLayout']> = 'none';
  private qwertyBase: number = 60;
  // Optional custom QWERTY mapping: code -> semitone offset from C of selected octave
  private qwertyCustomMap: Record<string, number> | null = null;

  // Internal rendering state
  private devicePixelRatio: number;
  private readonly canvasMarginX = 2;
  private readonly canvasMarginY = 2;
  private visibleWhiteKeys = 34;
  private renderQueue: Array<[number, string, boolean]> = [];
  private activeTouches: Record<number, TouchState> = {};
  // Overlays
  private coloredNotes: Map<number, string> = new Map();
  private noteLabels: Map<number, { text: string; color?: string }> = new Map();

  // Callbacks
  private callbacks: Required<MIDICallbacks>;

  // Event handlers (bound)
  private handleResize: () => void;
  // Pointer and keyboard handlers are arrow functions and don't require manual binding

  // Animation
  private animationFrameId = 0;

  constructor(options: DrawKeyboardOptions = {}) {
    super();

    // Setup canvas
    const container = options.container || document.body;
    this.canvas =
      options.canvas || container.querySelector('canvas') || document.createElement('canvas');
    if (!this.canvas.parentElement) {
      container.appendChild(this.canvas);
    }

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D rendering context from canvas');
    }
    this.ctx = context;

    // Initialize dimensions and settings
    this.whiteKeyWidth = options.keyWidth ?? 15;
  this.whiteKeyHeight = options.keyHeight ?? 80;
    this.blackKeyWidth = this.whiteKeyWidth / 2 - 2;
    this.blackKeyHeight = this.whiteKeyHeight * 0.65 - 2;
    this.startingNote = clamp(this.parseBaseNote(options.baseNote ?? 12), 0, 127);
    this.maxVisibleWhiteKeys = clamp(options.maxWhiteKeys ?? 68, 1, 88);
    this.highlightColor = options.highlightColor || '#4ea1ff';
    this.noteVelocity = clamp(options.velocity ?? 100, 1, 127);
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.showOctaveLabels = options.showOctaveLabels ?? true;
    if (options.gestures) {
      this.gestures = {
        pitchBend: options.gestures.pitchBend ?? true,
        modulation: options.gestures.modulation ?? true,
      };
    }
  this.qwertyLayout = options.qwertyLayout ?? 'none';
  this.qwertyBase = this.parseBaseNote(options.qwertyBaseNote ?? 'C4');

    // Setup callbacks
    this.callbacks = {
      onMidi: options.onMidi || (() => {}),
      onNoteOn: options.onNoteOn || (() => {}),
      onNoteOff: options.onNoteOff || (() => {}),
      onPitchBend: options.onPitchBend || (() => {}),
      onControlChange: options.onControlChange || (() => {}),
    };

    // Bind event handlers
    this.handleResize = () => this.resize();
  // (Touch fallback removed; using Pointer Events)

  // Setup event listeners (Pointer Events)
  window.addEventListener('resize', this.handleResize);
  // Accessibility
  this.canvas.setAttribute('role', 'application');
  this.canvas.setAttribute('aria-label', options.ariaLabel || 'Interactive virtual piano keyboard');
  this.canvas.tabIndex = 0;
  // Pointer events
  this.canvas.addEventListener('pointerdown', this.onPointerDown);
  this.canvas.addEventListener('pointerup', this.onPointerUp);
  this.canvas.addEventListener('pointercancel', this.onPointerUp);
  this.canvas.addEventListener('pointermove', this.onPointerMove);
  // Keyboard (QWERTY) — listen globally so canvas focus isn't required
  window.addEventListener('keydown', this.onKeyDown);
  window.addEventListener('keyup', this.onKeyUp);

    // Initialize
    this.resize();
    this.startAnimationLoop();

    // Overlay persistent colored notes
    if (this.coloredNotes.size) {
      for (const [note, color] of this.coloredNotes) {
        this.drawKey(note - this.startingNote, color, true);
      }
    }

    // Overlay note labels
    if (this.noteLabels.size) {
      for (const [note, { text, color }] of this.noteLabels) {
        this.drawNoteLabel(note, text, color);
      }
    }
  }

  private drawNoteLabel(noteNumber: number, text: string, color?: string): void {
    if (!text) return;
    const rect = this.getNoteRect(noteNumber);
    if (!rect) return;
    const rel = noteNumber - this.startingNote;
    const chromaticNote = mod(rel + 1200, 12);
    const isBlack = PIANO_KEYS.black.includes(chromaticNote as any);
  const ctx = this.ctx;
  ctx.save();
  const small = rect.width < 15;
    const fontSize = small ? 7 : 10;
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = color || (isBlack ? '#fff' : '#111');
    ctx.textBaseline = 'middle';
    if (small) {
      ctx.textAlign = 'left';
      ctx.fillText(text, rect.x + 2, rect.y + rect.height * 0.6, Math.max(4, rect.width - 4));
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width - 4);
    }
    ctx.restore();
  }

  // Public API methods

  /**
   * Set the width of white keys
   */
  setKeyWidth(width: number): void {
    this.whiteKeyWidth = Math.max(6, Math.floor(width));
    this.blackKeyWidth = this.whiteKeyWidth / 2 - 2;
    this.resize();
  }

  /**
   * Set the height of keys
   */
  setKeyHeight(height: number): void {
    this.whiteKeyHeight = Math.max(20, Math.floor(height));
    this.blackKeyHeight = this.whiteKeyHeight * 0.65 - 2;
    this.resize();
  }

  /** Show or hide octave labels (e.g., C1, C2) */
  setShowOctaveLabels(show: boolean): void {
    this.showOctaveLabels = !!show;
    this.redrawAllKeys();
  }

  /** Enable/disable gestures (pitch bend, modulation) */
  setGestures(gestures: Partial<{ pitchBend: boolean; modulation: boolean }>): void {
    this.gestures = { ...this.gestures, ...gestures };
  }

  /** Set QWERTY input layout */
  setQwertyLayout(layout: NonNullable<DrawKeyboardOptions['qwertyLayout']>): void {
    this.qwertyLayout = layout;
  }

  /** Set QWERTY mapping base note (number or note name like 'C4') */
  setQwertyBase(note: number | string): void {
    this.qwertyBase = clamp(this.parseBaseNote(note as any), 0, 127);
  }

  /**
   * Provide a custom QWERTY mapping of KeyboardEvent.code -> semitone offset from C.
   * Offsets are applied relative to C in the octave from qwertyBaseNote.
   * Pass null to clear.
   */
  setQwertyMap(map: Record<string, number> | null): void {
    this.qwertyCustomMap = map;
  }

  /** Persistently color a note (pass null/undefined to clear) */
  setNoteColor(noteNumber: number, color?: string | null): void {
    if (noteNumber < 0 || noteNumber > 127) return;
    if (color) this.coloredNotes.set(noteNumber, color);
    else this.coloredNotes.delete(noteNumber);
    this.redrawAllKeys();
  }

  /** Add/update a text label on a note (empty/undefined text clears) */
  setNoteLabel(noteNumber: number, text?: string, color?: string): void {
    if (noteNumber < 0 || noteNumber > 127) return;
    if (text && text.length) {
      const entry: { text: string; color?: string } = { text };
      if (typeof color === 'string') entry.color = color;
      this.noteLabels.set(noteNumber, entry);
    }
    else this.noteLabels.delete(noteNumber);
    this.redrawAllKeys();
  }

  /**
   * Set the starting/base MIDI note number
   */
  setBaseNote(noteNumber: number): void {
    this.startingNote = clamp(Math.floor(noteNumber), 0, 127);
    this.redrawAllKeys();
  }
  /** Set base note via string like 'C4' */
  setBaseNoteName(note: string): void {
    this.startingNote = clamp(this.parseBaseNote(note), 0, 127);
    this.redrawAllKeys();
  }

  /**
   * Set the highlight color for pressed keys
   */
  setHighlightColor(color: string): void {
    this.highlightColor = color;
  }

  /**
   * Set the default velocity for notes
   */
  setVelocity(velocity: number): void {
    this.noteVelocity = clamp(Math.floor(velocity), 1, 127);
  }

  /**
   * Update callback functions
   */
  setCallbacks(newCallbacks: Partial<MIDICallbacks>): void {
    Object.assign(this.callbacks, newCallbacks);
  }

  /**
   * Programmatically press a key (highlight and optionally send note on)
   */
  press(
    noteNumber: number,
    velocity = this.noteVelocity,
    color = this.highlightColor,
    sendMidi = false
  ): void {
    if (noteNumber < 0 || noteNumber > 127) return;
    this.enqueueKeyDraw([noteNumber - this.startingNote, color, true]);
    if (sendMidi) {
      this.sendMidiMessage([0x90, noteNumber, velocity]);
    }
  }

  /**
   * Programmatically release a key (clear highlight and optionally send note off)
   */
  release(noteNumber: number, sendMidi = false): void {
    if (noteNumber < 0 || noteNumber > 127) return;
    this.enqueueKeyDraw([noteNumber - this.startingNote, this.highlightColor, false]);
    // If a persistent color is set for this note, reapply it
    const persistent = this.coloredNotes.get(noteNumber);
    if (persistent) {
      this.enqueueKeyDraw([noteNumber - this.startingNote, persistent, true]);
    }
    if (sendMidi) {
      this.sendMidiMessage([0x80, noteNumber, 0]);
    }
  }

  /**
   * Send a MIDI message
   */
  sendMidiMessage(message: MIDIMessage): void {
    this.callbacks.onMidi(message);
    this.processMidiMessage(message);
  }

  /**
   * Reset pitch bend and modulation to center/zero
   */
  resetModulationAndPitchBend(): void {
    const centerPitchBend = 8192;
    this.sendMidiMessage([0xe0, centerPitchBend & 0x7f, (centerPitchBend >> 7) & 0x7f]);
    this.sendMidiMessage([0xb0, 1, 0]); // Modulation wheel (CC1)
    this.sendMidiMessage([0xb0, 11, 127]); // Expression (CC11)
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get the bounding rect of a specific note key
   */
  getNoteRect(noteNumber: number): DOMRect | null {
    const relativeNote = noteNumber - this.startingNote;
    const chromaticNote = mod(relativeNote + 1200, 12);
    const isBlackKey = PIANO_KEYS.black.includes(chromaticNote as any);
    const octaveNumber = Math.floor(relativeNote / 12);

    if (isBlackKey) {
      const blackKeyXIndex =
        7 * octaveNumber +
        (chromaticNote < 4 ? (chromaticNote + 1) / 2 : chromaticNote / 2 + 1) -
        1;
      const x =
        this.canvasMarginX + blackKeyXIndex * this.whiteKeyWidth + this.whiteKeyWidth * 0.75;
      const y = this.canvasMarginY;
      return new DOMRect(x, y, this.blackKeyWidth, this.blackKeyHeight);
    } else {
      const whiteKeyIndex = PIANO_KEYS.white.indexOf(chromaticNote as any);
      const whiteKeyPosition = whiteKeyIndex + 7 * octaveNumber;
      const x = this.canvasMarginX + whiteKeyPosition * this.whiteKeyWidth;
      const y = this.canvasMarginY;
      return new DOMRect(x, y, this.whiteKeyWidth, this.whiteKeyHeight);
    }
  }

  /**
   * Clean up event listeners and stop animation
   */
  destroy(): void {
    window.removeEventListener('resize', this.handleResize);
  this.canvas.removeEventListener('pointerdown', this.onPointerDown);
  this.canvas.removeEventListener('pointerup', this.onPointerUp);
  this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  this.canvas.removeEventListener('pointermove', this.onPointerMove);
  window.removeEventListener('keydown', this.onKeyDown);
  window.removeEventListener('keyup', this.onKeyUp);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  // Private methods

  private resize(): void {
    const containerWidth = this.canvas.parentElement
      ? this.canvas.parentElement.clientWidth
      : window.innerWidth;

    this.devicePixelRatio = window.devicePixelRatio || 1;

    // Calculate how many white keys fit in the available width
    this.visibleWhiteKeys = Math.min(
      this.maxVisibleWhiteKeys,
      Math.max(1, Math.floor((containerWidth - 4) / this.whiteKeyWidth))
    );

    const canvasWidthCSS = this.visibleWhiteKeys * this.whiteKeyWidth + 4;
    const canvasHeightCSS = Math.max(1, this.whiteKeyHeight) + 4;

    // Set canvas size accounting for device pixel ratio
    this.canvas.width = Math.max(1, canvasWidthCSS) * this.devicePixelRatio;
    this.canvas.height = Math.max(1, canvasHeightCSS) * this.devicePixelRatio;

    // Set CSS size (actual display size)
    this.canvas.style.width = canvasWidthCSS + 'px';
    this.canvas.style.height = canvasHeightCSS + 'px';

    // Reset and scale context for high-DPI displays
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);

    this.drawKeyboardSkeleton();
  }

  private redrawAllKeys(): void {
    this.drawKeyboardSkeleton();
  }

  private drawKeyboardSkeleton(): void {
    const ctx = this.ctx;
    const keyWidth = this.whiteKeyWidth;
    const keyHeight = this.whiteKeyHeight;

    // Clear canvas with white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw white keys and black keys
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#333';

    for (let whiteKeyIndex = 0; whiteKeyIndex < this.visibleWhiteKeys; whiteKeyIndex++) {
      // Draw white key outline
      ctx.beginPath();
      ctx.moveTo(this.canvasMarginX + whiteKeyIndex * keyWidth, this.canvasMarginY);
      ctx.lineTo(this.canvasMarginX + whiteKeyIndex * keyWidth + keyWidth, this.canvasMarginY);
      ctx.lineTo(
        this.canvasMarginX + whiteKeyIndex * keyWidth + keyWidth,
        this.canvasMarginY + keyHeight
      );
      ctx.lineTo(this.canvasMarginX + whiteKeyIndex * keyWidth, this.canvasMarginY + keyHeight);
      if (whiteKeyIndex === 0) {
        ctx.lineTo(this.canvasMarginX + whiteKeyIndex * keyWidth, this.canvasMarginY);
      }
      ctx.stroke();

      // Draw black key if this white key position should have one
      const whiteKeyPattern = whiteKeyIndex % 7; // C D E F G A B pattern
      const shouldHaveBlackKey =
        whiteKeyIndex !== this.visibleWhiteKeys - 1 &&
        (whiteKeyPattern === 0 ||
          whiteKeyPattern === 1 ||
          whiteKeyPattern === 3 ||
          whiteKeyPattern === 4 ||
          whiteKeyPattern === 5);

      if (shouldHaveBlackKey) {
        ctx.fillRect(
          this.canvasMarginX + whiteKeyIndex * keyWidth + keyWidth * 0.75,
          this.canvasMarginY,
          this.whiteKeyWidth / 2,
          this.whiteKeyHeight * 0.65
        );
      }

      // Draw octave labels
      if (this.showOctaveLabels && whiteKeyIndex % 7 === 0) {
        this.drawOctaveLabel(Math.floor(whiteKeyIndex / 7));
      }
    }
  }

  private drawOctaveLabel(octaveNumber: number): void {
    const ctx = this.ctx;
    const keyWidth = this.whiteKeyWidth;
    const keyHeight = this.whiteKeyHeight;
    const small = keyWidth < 15;
    const fontSize = small ? 7 : 10;
    ctx.fillStyle = '#333';
    ctx.font = `${fontSize}px Arial`;
    ctx.textBaseline = 'middle';
    if (small) {
      ctx.textAlign = 'left';
      ctx.fillText(
        'C' + octaveNumber,
        this.canvasMarginX + octaveNumber * keyWidth * 7 + 2,
        this.canvasMarginY + keyHeight * 0.9
      );
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(
        'C' + octaveNumber,
        this.canvasMarginX + octaveNumber * keyWidth * 7 + keyWidth / 2,
        this.canvasMarginY + keyHeight * 0.85
      );
    }
  }

  private enqueueKeyDraw(drawArgs: [number, string, boolean]): void {
    this.renderQueue.push(drawArgs);
  }

  private startAnimationLoop = (): void => {
    for (const args of this.renderQueue) {
      this.drawKey(...args);
    }
    this.renderQueue.length = 0;
    this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
  };

  private drawKey(relativeNoteIndex: number, color: string, isHighlighted: boolean): void {
    const ctx = this.ctx;
    const keyWidth = this.whiteKeyWidth;
    const keyHeight = this.whiteKeyHeight;
  // Draw with sharp corners; no dynamic border expansion
    const chromaticNote = mod(relativeNoteIndex + 1200, 12);
    const isBlackKey = PIANO_KEYS.black.includes(chromaticNote as any);
    const octaveNumber = Math.floor(relativeNoteIndex / 12);

    if (isBlackKey) {
      // Draw black key
      const blackKeyXIndex =
        7 * octaveNumber +
        (chromaticNote < 4 ? (chromaticNote + 1) / 2 : chromaticNote / 2 + 1) -
        1;
      ctx.fillStyle = isHighlighted ? color : '#333';
      ctx.fillRect(
        this.canvasMarginX + blackKeyXIndex * keyWidth + keyWidth * 0.75,
        this.canvasMarginY,
        this.blackKeyWidth,
        this.blackKeyHeight
      );
    } else {
      // Draw white key
      const whiteKeyIndex = PIANO_KEYS.white.indexOf(chromaticNote as any);
      const blackKeySides = [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 1],
        [1, 0],
      ][whiteKeyIndex];
      const whiteKeyPosition = whiteKeyIndex + 7 * octaveNumber;
      ctx.fillStyle = isHighlighted ? color : '#fff';

      // Draw bottom portion of white key (always full width)
      ctx.fillRect(
        this.canvasMarginX + whiteKeyPosition * keyWidth + 2,
        this.canvasMarginY + keyHeight * 0.65 + 2,
        keyWidth - 4,
        keyHeight * 0.35 - 4
      );

      // Draw top portion of white key (width varies based on adjacent black keys)
      if (blackKeySides) {
        ctx.fillRect(
          this.canvasMarginX +
            whiteKeyPosition * keyWidth +
            2 +
            keyWidth * 0.25 * blackKeySides[0],
          this.canvasMarginY + 2,
          keyWidth - 4 - keyWidth * 0.25 * (blackKeySides[0] + blackKeySides[1]),
          keyHeight * 0.65
        );
      }

  if (this.showOctaveLabels && chromaticNote === 0) {
        this.drawOctaveLabel(octaveNumber);
      }
    }

  // Draw label if present for this note
  const noteNumber = relativeNoteIndex + this.startingNote;
  const label = this.noteLabels.get(noteNumber);
  if (label) this.drawNoteLabel(noteNumber, label.text, label.color);
  }

  private coordsToNote(canvasX: number, canvasY: number): number {
    const adjustedX = canvasX - this.canvasMarginX;
    const couldBeBlackKey = canvasY < this.blackKeyHeight + 2;

    // Determine which white key we're over
  const whiteKeyIndex = Math.floor(adjustedX / this.whiteKeyWidth);

    // Check if we might be hitting a black key on the left or right side
    const xWithinKey = adjustedX - whiteKeyIndex * this.whiteKeyWidth;
    const leftBlackKeyZone = couldBeBlackKey && xWithinKey < this.whiteKeyWidth * 0.35;
    const rightBlackKeyZone = couldBeBlackKey && xWithinKey > this.whiteKeyWidth * (1 - 0.35);

    // Convert white key index to octave and position within octave
  const octaveNumber = Math.floor(whiteKeyIndex / 7);
    let whiteKeyInOctave = whiteKeyIndex - octaveNumber * 7;

    // Map white key position to chromatic note (0-11)
    PIANO_KEYS.black.forEach((blackKeyNote) => {
      if (blackKeyNote <= whiteKeyInOctave) whiteKeyInOctave++;
    });

    let chromaticNote = octaveNumber * 12 + whiteKeyInOctave;

    // Check if we should select an adjacent black key instead
    if (rightBlackKeyZone && PIANO_KEYS.black.indexOf(mod(chromaticNote + 1, 12) as any) !== -1) {
      chromaticNote++;
    }
    if (leftBlackKeyZone && PIANO_KEYS.black.indexOf(mod(chromaticNote - 1, 12) as any) !== -1) {
      chromaticNote--;
    }

    return chromaticNote + this.startingNote;
  }

  private processMidiMessage(message: MIDIMessage): void {
    const statusNibble = message[0] & 0xf0;

    if (statusNibble === 0x90 && message[2]! > 0) {
      this.callbacks.onNoteOn(message[1], message[2]!);
      this.dispatchEvent(
        new CustomEvent('noteOn', {
          detail: { note: message[1], velocity: message[2]! },
        })
      );
    } else if (statusNibble === 0x80 || (statusNibble === 0x90 && message[2] === 0)) {
      this.callbacks.onNoteOff(message[1]);
      this.dispatchEvent(
        new CustomEvent('noteOff', {
          detail: { note: message[1] },
        })
      );
    } else if (statusNibble === 0xe0) {
      const pitchBendValue = message[1] | (message[2]! << 7);
      this.callbacks.onPitchBend(pitchBendValue);
      this.dispatchEvent(
        new CustomEvent('pitchBend', {
          detail: { value: pitchBendValue },
        })
      );
    } else if ((message[0] & 0xf0) === 0xb0) {
      this.callbacks.onControlChange(message[1], message[2]!);
      this.dispatchEvent(
        new CustomEvent('controlChange', {
          detail: { controller: message[1], value: message[2]! },
        })
      );
    }

    this.dispatchEvent(new CustomEvent('midi', { detail: message }));
  }

  private updateTouchPitchBendAndMod(): void {
    let averageXMovement = 0;
    let maxYMovement = -1000;
    const touchValues = Object.values(this.activeTouches);
    const touchCount = touchValues.length;

    if (touchCount === 0) {
      averageXMovement = 0;
      maxYMovement = 0;
    } else {
      for (const touch of touchValues) {
        const xMovement = touch.currPos[0] - touch.startPos[0];
        const yMovement = touch.currPos[1] - touch.startPos[1];
        averageXMovement += xMovement;
        maxYMovement = Math.max(yMovement, maxYMovement);
      }
      averageXMovement /= touchCount;
    }

    // Handle pitch bend (X-axis movement)
  if (this.gestures.pitchBend && Math.abs(averageXMovement) > 10) {
      const bendDirection = averageXMovement > 0;
      const bendAmount = Math.min(127, Math.max(0, Math.abs(averageXMovement) - 10));
      const pitchBendValue = 8192 + ((bendDirection ? 1 : -1) * bendAmount * 8191) / 127;
      this.sendMidiMessage([0xe0, pitchBendValue & 0x7f, (pitchBendValue >> 7) & 0x7f]);
    }

    // Handle modulation (Y-axis movement)
    let controlChangeNumber = 11;
    let modulationAmount = 0;
    if (this.gestures.modulation && maxYMovement >= 0) {
      controlChangeNumber = 11;
      modulationAmount = Math.min(127, Math.max(0, 127 - maxYMovement));
    } else if (this.gestures.modulation) {
      controlChangeNumber = 1;
      modulationAmount = Math.min(127, Math.max(0, Math.abs(maxYMovement)));
    }
    if (this.gestures.modulation) this.sendMidiMessage([0xb0, controlChangeNumber, modulationAmount]);
  }

  // Pointer events
  private onPointerDown = (evt: PointerEvent): void => {
    this.canvas.setPointerCapture(evt.pointerId);
    this.handleSyntheticTouchLike(evt, 'start');
  };
  private onPointerUp = (evt: PointerEvent): void => {
    this.handleSyntheticTouchLike(evt, 'end');
    try {
      this.canvas.releasePointerCapture(evt.pointerId);
    } catch {
      // Ignore release errors
    }
  };
  private onPointerMove = (evt: PointerEvent): void => {
    this.handleSyntheticTouchLike(evt, 'move');
  };

  private handleSyntheticTouchLike(evt: PointerEvent, phase: 'start' | 'move' | 'end'): void {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = evt.clientX - rect.left;
    const canvasY = evt.clientY - rect.top;
    if (phase === 'start') {
      const noteNumber = this.coordsToNote(canvasX, canvasY);
      this.activeTouches[evt.pointerId] = {
        startPos: [evt.clientX, evt.clientY],
        currPos: [evt.clientX, evt.clientY],
        note: noteNumber,
      };
      this.resetModulationAndPitchBend();
      if (noteNumber >= 0 && noteNumber <= 127) {
        this.sendMidiMessage([0x90, noteNumber, this.noteVelocity]);
        this.press(noteNumber);
      }
    } else if (phase === 'move') {
      if (this.activeTouches[evt.pointerId]) {
        this.activeTouches[evt.pointerId].currPos = [evt.clientX, evt.clientY];
        this.updateTouchPitchBendAndMod();
      }
    } else if (phase === 'end') {
      if (this.activeTouches[evt.pointerId]) {
        const noteNumber = this.activeTouches[evt.pointerId].note;
        if (noteNumber >= 0 && noteNumber <= 127) {
          this.sendMidiMessage([0x80, noteNumber, 0]);
          this.release(noteNumber);
        }
        delete this.activeTouches[evt.pointerId];
        this.updateTouchPitchBendAndMod();
      }
    }
  }

  // QWERTY keyboard support
  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) {
      return;
    }
    if (e.repeat) return;
    if (this.qwertyLayout === 'none') return;
    const map = this.getQwertyMap();
    const code = e.code;
    if (map[code] !== undefined) {
      const note = map[code];
      this.sendMidiMessage([0x90, note, this.noteVelocity]);
      this.press(note);
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) {
      return;
    }
    if (this.qwertyLayout === 'none') return;
    const map = this.getQwertyMap();
    const code = e.code;
    if (map[code] !== undefined) {
      const note = map[code];
      this.sendMidiMessage([0x80, note, 0]);
      this.release(note);
      e.preventDefault();
    }
  };

  private getQwertyMap(): Record<string, number> {
    const base = this.qwertyBase;
    const notes: Record<string, number> = {};
    // Helper: anchor to C of the configured octave
    const baseC = 12 * Math.floor(base / 12);

    // If a custom map is defined, apply it directly (extended-style semantics)
    if (this.qwertyCustomMap && (this.qwertyLayout === 'singleRowExtended' || this.qwertyLayout === 'doubleRowExtended')) {
      for (const code in this.qwertyCustomMap) {
        const offset = this.qwertyCustomMap[code]!;
        notes[code] = clamp(baseC + offset, 0, 127);
      }
      return notes;
    }

    // If a preset exists for this layout, apply it (anchored to baseC)
    const preset = QWERTY_PRESETS[this.qwertyLayout];
    if (preset && Object.keys(preset).length) {
      for (const code in preset) {
        const offset = preset[code]!;
        notes[code] = clamp(baseC + offset, 0, 127);
      }
      return notes;
    }
  if (this.qwertyLayout === 'singleRow' || this.qwertyLayout === 'singleRowExtended') {
      // Interleaved single-row mapping including black keys using nearby home-row codes
      // Sequence covers 13 semitones starting at base: Z S X D C V G B H N J M ,
      const seq = [
        'KeyZ','KeyS','KeyX','KeyD','KeyC','KeyV','KeyG','KeyB','KeyH','KeyN','KeyJ','KeyM','Comma'
      ];
      const ext = ['Period','Slash']; // continue upward by semitone
      const row = this.qwertyLayout === 'singleRowExtended' ? seq.concat(ext) : seq;
      for (let i = 0; i < row.length; i++) notes[row[i]] = clamp(base + i, 0, 127);
      // In extended single row, also make Backquote a convenient C of selected octave
      if (this.qwertyLayout === 'singleRowExtended') {
        notes['Backquote'] = clamp(baseC + 0, 0, 127);
      }
      return notes;
    }
    if (this.qwertyLayout === 'doubleRow' || this.qwertyLayout === 'doubleRowExtended') {
      // Whites on bottom (diatonic), blacks on upper keys between appropriate whites
      const bottomWhites = ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash'];
      // Q-row and number keys for interstitial sharps/flats: Q 2 W 3 E | R 5 T 6 Y 7 U ...
      const topBlacksBase = [
        'KeyQ','Digit2','KeyW','Digit3','KeyE',
        'KeyR','Digit5','KeyT','Digit6','KeyY','Digit7','KeyU'
      ];
  const topBlacksExt = ['Minus','Equal','Semicolon'];
      const topBlacks = this.qwertyLayout === 'doubleRowExtended' ? topBlacksBase.concat(topBlacksExt) : topBlacksBase;

      // Map whites sequentially to natural notes starting from aligned base
      const WHITE = [0,2,4,5,7,9,11];
      const isBlack = (n:number)=>[1,3,6,8,10].includes((n%12+12)%12);
      let n = base;
      while (isBlack(n)) n--; // align to nearest lower white
      let wIdx = WHITE.indexOf(((n%12)+12)%12);
      let oct = Math.floor(n/12);
      const whites: number[] = [];
      for (let i=0;i<bottomWhites.length;i++){
        const chroma = WHITE[wIdx];
        const note = oct*12+chroma;
        notes[bottomWhites[i]] = note;
        whites.push(note);
        wIdx++; if (wIdx===7){wIdx=0; oct++;}
      }
      // Insert blacks between white neighbors separated by 2 semitones
      let bi=0;
      for (let i=0;i<whites.length-1 && bi<topBlacks.length;i++){
        const a = whites[i];
        const b = whites[i+1];
        if (((b-a)+12)%12===2){
          notes[topBlacks[bi++]] = a+1;
        }
      }
      // In extended mode, also make Backquote a convenient C of selected octave
      if (this.qwertyLayout === 'doubleRowExtended') {
        notes['Backquote'] = clamp(baseC + 0, 0, 127);
      }
      return notes;
    }
    return notes;
  }

  // Static-like mapping for extended layout: KeyboardEvent.code -> semitone offset from C
  // Covers common US and ISO variants and duplicates where practical for ergonomics
  // Removed unused extended offsets helper after adding setQwertyMap API

  private parseBaseNote(input: number | string): number {
    if (typeof input === 'number') return Math.floor(input);
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(input.trim());
    if (!m) return 12;
    const noteMap: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    const letter = m[1].toLowerCase();
    const accidental = m[2];
    const octave = parseInt(m[3], 10);
    let semitone = noteMap[letter];
    if (accidental === '#') semitone += 1;
    if (accidental === 'b') semitone -= 1;
    return 12 * (octave + 1) + semitone; // MIDI note number
  }

  // (Removed TouchEvent handlers; Pointer Events cover all inputs)
}
