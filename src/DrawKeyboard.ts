import { 
  DrawKeyboardOptions, 
  MIDIMessage, 
  MIDICallbacks, 
  TouchState,
  PIANO_KEYS 
} from './types.js';
import { mod, clamp, mouseToTouch } from './utils.js';

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
  
  // Internal rendering state
  private devicePixelRatio: number;
  private readonly canvasMarginX = 2;
  private readonly canvasMarginY = 2;
  private visibleWhiteKeys = 34;
  private renderQueue: Array<[number, string, boolean]> = [];
  private activeTouches: Record<number, TouchState> = {};
  
  // Callbacks
  private callbacks: Required<MIDICallbacks>;
  
  // Event handlers (bound)
  private handleResize: () => void;
  private handleTouchStart: (evt: TouchEvent) => void;
  private handleTouchEnd: (evt: TouchEvent) => void;
  private handleTouchMove: (evt: TouchEvent) => void;
  
  // Animation
  private animationFrameId = 0;

  constructor(options: DrawKeyboardOptions = {}) {
    super();
    
    // Setup canvas
    const container = options.container || document.body;
    this.canvas = options.canvas || container.querySelector('canvas') || document.createElement('canvas');
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
    this.whiteKeyHeight = options.keyHeight ?? 100;
    this.blackKeyWidth = this.whiteKeyWidth / 2 - 2;
    this.blackKeyHeight = this.whiteKeyHeight * 0.65 - 2;
    this.startingNote = clamp(options.baseNote ?? 12, 0, 127);
    this.maxVisibleWhiteKeys = clamp(options.maxWhiteKeys ?? 68, 1, 88);
    this.highlightColor = options.highlightColor || '#4ea1ff';
    this.noteVelocity = clamp(options.velocity ?? 100, 1, 127);
    this.devicePixelRatio = window.devicePixelRatio || 1;

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
    this.handleTouchStart = this.onTouchStart.bind(this);
    this.handleTouchEnd = this.onTouchEnd.bind(this);
    this.handleTouchMove = this.onTouchMove.bind(this);

    // Setup event listeners
    window.addEventListener('resize', this.handleResize);
    mouseToTouch(this.canvas);
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    document.addEventListener('touchmove', this.handleTouchMove, { passive: true });

    // Initialize
    this.resize();
    this.startAnimationLoop();
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

  /**
   * Set the starting/base MIDI note number
   */
  setBaseNote(noteNumber: number): void {
    this.startingNote = clamp(Math.floor(noteNumber), 0, 127);
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
  press(noteNumber: number, velocity = this.noteVelocity, color = this.highlightColor, sendMidi = false): void {
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
    this.sendMidiMessage([0xE0, centerPitchBend & 0x7F, (centerPitchBend >> 7) & 0x7F]);
    this.sendMidiMessage([0xB0, 1, 0]); // Modulation wheel (CC1)
    this.sendMidiMessage([0xB0, 11, 127]); // Expression (CC11)
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
      const blackKeyXIndex = 7 * octaveNumber + (chromaticNote < 4 ? (chromaticNote + 1) / 2 : chromaticNote / 2 + 1) - 1;
      const x = this.canvasMarginX + blackKeyXIndex * this.whiteKeyWidth + this.whiteKeyWidth * 0.75;
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
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    document.removeEventListener('touchmove', this.handleTouchMove);
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
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#333';

    for (let whiteKeyIndex = 0; whiteKeyIndex < this.visibleWhiteKeys; whiteKeyIndex++) {
      // Draw white key outline
      ctx.beginPath();
      ctx.moveTo(this.canvasMarginX + whiteKeyIndex * keyWidth, this.canvasMarginY);
      ctx.lineTo(this.canvasMarginX + whiteKeyIndex * keyWidth + keyWidth, this.canvasMarginY);
      ctx.lineTo(this.canvasMarginX + whiteKeyIndex * keyWidth + keyWidth, this.canvasMarginY + keyHeight);
      ctx.lineTo(this.canvasMarginX + whiteKeyIndex * keyWidth, this.canvasMarginY + keyHeight);
      if (whiteKeyIndex === 0) {
        ctx.lineTo(this.canvasMarginX + whiteKeyIndex * keyWidth, this.canvasMarginY);
      }
      ctx.stroke();

      // Draw black key if this white key position should have one
      const whiteKeyPattern = whiteKeyIndex % 7; // C D E F G A B pattern
      const shouldHaveBlackKey = whiteKeyIndex !== this.visibleWhiteKeys - 1 &&
        (whiteKeyPattern === 0 || whiteKeyPattern === 1 || whiteKeyPattern === 3 || whiteKeyPattern === 4 || whiteKeyPattern === 5);

      if (shouldHaveBlackKey) {
        ctx.fillRect(
          this.canvasMarginX + whiteKeyIndex * keyWidth + keyWidth * 0.75,
          this.canvasMarginY,
          this.whiteKeyWidth / 2,
          this.whiteKeyHeight * 0.65
        );
      }

      // Draw octave labels
      if (whiteKeyIndex % 7 === 0) {
        this.drawOctaveLabel(Math.floor(whiteKeyIndex / 7));
      }
    }
  }

  private drawOctaveLabel(octaveNumber: number): void {
    const ctx = this.ctx;
    const keyWidth = this.whiteKeyWidth;
    const keyHeight = this.whiteKeyHeight;
    ctx.fillStyle = '#333';
    ctx.font = '9px Arial';
    ctx.fillText(
      'C' + octaveNumber,
      this.canvasMarginX + octaveNumber * keyWidth * 7 + 2,
      this.canvasMarginY + keyHeight * 0.9
    );
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
    const border = isHighlighted ? 0 : 1;
    const chromaticNote = mod(relativeNoteIndex + 1200, 12);
    const isBlackKey = PIANO_KEYS.black.includes(chromaticNote as any);
    const octaveNumber = Math.floor(relativeNoteIndex / 12);

    if (isBlackKey) {
      // Draw black key
      const blackKeyXIndex = 7 * octaveNumber + (chromaticNote < 4 ? (chromaticNote + 1) / 2 : chromaticNote / 2 + 1) - 1;
      ctx.fillStyle = isHighlighted ? color : '#333';
      ctx.fillRect(
        this.canvasMarginX + blackKeyXIndex * keyWidth + keyWidth * 0.75 - border + 1,
        this.canvasMarginY + 1 - border,
        this.blackKeyWidth + border,
        this.blackKeyHeight + border * 2,
      );
    } else {
      // Draw white key
      const whiteKeyIndex = PIANO_KEYS.white.indexOf(chromaticNote as any);
      const blackKeySides = [[0, 1], [1, 1], [1, 0], [0, 1], [1, 1], [1, 1], [1, 0]][whiteKeyIndex];
      const whiteKeyPosition = whiteKeyIndex + 7 * octaveNumber;
      ctx.fillStyle = isHighlighted ? color : '#fff';

      // Draw bottom portion of white key (always full width)
      ctx.fillRect(
        this.canvasMarginX + whiteKeyPosition * keyWidth + 2 - border,
        this.canvasMarginY + keyHeight * 0.65 + 2 - border,
        keyWidth - 4 + border * 2,
        keyHeight * 0.35 - 4 + border * 2,
      );

      // Draw top portion of white key (width varies based on adjacent black keys)
      if (blackKeySides) {
        ctx.fillRect(
          this.canvasMarginX + whiteKeyPosition * keyWidth + 2 + keyWidth * 0.25 * blackKeySides[0] - border,
          this.canvasMarginY + 2 - border,
          keyWidth - 4 - keyWidth * 0.25 * (blackKeySides[0] + blackKeySides[1]) + border * 2,
          keyHeight * 0.65 + border * 2,
        );
      }

      if (chromaticNote === 0) {
        this.drawOctaveLabel(octaveNumber);
      }
    }
  }

  private coordsToNote(canvasX: number, canvasY: number): number {
    const adjustedX = canvasX - this.canvasMarginX;
    const couldBeBlackKey = canvasY < this.blackKeyHeight + 2;

    // Determine which white key we're over
    let whiteKeyIndex = Math.floor(adjustedX / this.whiteKeyWidth);

    // Check if we might be hitting a black key on the left or right side
    const xWithinKey = adjustedX - whiteKeyIndex * this.whiteKeyWidth;
    const leftBlackKeyZone = couldBeBlackKey && xWithinKey < this.whiteKeyWidth * 0.35;
    const rightBlackKeyZone = couldBeBlackKey && xWithinKey > this.whiteKeyWidth * (1 - 0.35);

    // Convert white key index to octave and position within octave
    let octaveNumber = Math.floor(whiteKeyIndex / 7);
    let whiteKeyInOctave = whiteKeyIndex - octaveNumber * 7;

    // Map white key position to chromatic note (0-11)
    PIANO_KEYS.black.forEach(blackKeyNote => {
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
    const statusNibble = message[0] & 0xF0;
    
    if (statusNibble === 0x90 && message[2]! > 0) {
      this.callbacks.onNoteOn(message[1], message[2]!);
      this.dispatchEvent(new CustomEvent('noteOn', { 
        detail: { note: message[1], velocity: message[2]! } 
      }));
    } else if ((statusNibble === 0x80) || (statusNibble === 0x90 && message[2] === 0)) {
      this.callbacks.onNoteOff(message[1]);
      this.dispatchEvent(new CustomEvent('noteOff', { 
        detail: { note: message[1] } 
      }));
    } else if (statusNibble === 0xE0) {
      const pitchBendValue = message[1] | (message[2]! << 7);
      this.callbacks.onPitchBend(pitchBendValue);
      this.dispatchEvent(new CustomEvent('pitchBend', { 
        detail: { value: pitchBendValue } 
      }));
    } else if ((message[0] & 0xF0) === 0xB0) {
      this.callbacks.onControlChange(message[1], message[2]!);
      this.dispatchEvent(new CustomEvent('controlChange', { 
        detail: { controller: message[1], value: message[2]! } 
      }));
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
    if (Math.abs(averageXMovement) > 10) {
      const bendDirection = averageXMovement > 0;
      const bendAmount = Math.min(127, Math.max(0, Math.abs(averageXMovement) - 10));
      const pitchBendValue = 8192 + ((bendDirection ? 1 : -1) * bendAmount * 8191) / 127;
      this.sendMidiMessage([0xE0, pitchBendValue & 0x7F, (pitchBendValue >> 7) & 0x7F]);
    }

    // Handle modulation (Y-axis movement)
    let controlChangeNumber = 11;
    let modulationAmount = 0;
    if (maxYMovement >= 0) {
      controlChangeNumber = 11;
      modulationAmount = Math.min(127, Math.max(0, 127 - maxYMovement));
    } else {
      controlChangeNumber = 1;
      modulationAmount = Math.min(127, Math.max(0, Math.abs(maxYMovement)));
    }
    this.sendMidiMessage([0xB0, controlChangeNumber, modulationAmount]);
  }

  private onTouchStart = (evt: TouchEvent): void => {
    if (evt.cancelable) evt.preventDefault();
    const canvasRect = this.canvas.getBoundingClientRect();
    const changedTouches = evt.changedTouches;

    for (let i = 0; i < changedTouches.length; i++) {
      const touch = changedTouches[i];
      const canvasX = touch.clientX - canvasRect.left;
      const canvasY = touch.clientY - canvasRect.top;
      const noteNumber = this.coordsToNote(canvasX, canvasY);

      this.activeTouches[touch.identifier] = {
        startPos: [touch.clientX, touch.clientY],
        currPos: [touch.clientX, touch.clientY],
        note: noteNumber
      };

      // Reset pitch bend and control changes
      this.resetModulationAndPitchBend();

      // Send note on message and highlight key
      if (noteNumber >= 0 && noteNumber <= 127) {
        this.sendMidiMessage([0x90, noteNumber, this.noteVelocity]);
        this.press(noteNumber);
      }
    }
  };

  private onTouchEnd = (evt: TouchEvent): void => {
    if (evt.cancelable) evt.preventDefault();
    const changedTouches = evt.changedTouches;
    let hadActiveTouches = false;

    for (let i = 0; i < changedTouches.length; i++) {
      const touch = changedTouches[i];
      if (this.activeTouches[touch.identifier]) {
        hadActiveTouches = true;
        const noteNumber = this.activeTouches[touch.identifier].note;
        if (noteNumber >= 0 && noteNumber <= 127) {
          this.sendMidiMessage([0x80, noteNumber, 0]);
          this.release(noteNumber);
        }
        delete this.activeTouches[touch.identifier];
      }
    }

    if (hadActiveTouches) {
      this.updateTouchPitchBendAndMod();
    }
  };

  private onTouchMove = (evt: TouchEvent): void => {
    const changedTouches = evt.changedTouches;
    let hadActiveTouches = false;

    for (let i = 0; i < changedTouches.length; i++) {
      const touch = changedTouches[i];
      if (this.activeTouches[touch.identifier]) {
        hadActiveTouches = true;
        this.activeTouches[touch.identifier].currPos = [touch.clientX, touch.clientY];
      }
    }

    if (hadActiveTouches) {
      this.updateTouchPitchBendAndMod();
    }
  };
}
