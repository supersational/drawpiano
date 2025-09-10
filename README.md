# DrawKeyboard

A touch-enabled virtual piano keyboard with MIDI output for web applications.

## Features

- 🎹 **Touch and mouse support** - Works on desktop and mobile
- 🎵 **MIDI output** - Generate standard MIDI messages
- 🎨 **Customizable styling** - Colors, sizes, and layout options
- 📱 **Responsive design** - Adapts to container width
- 🎛️ **Touch gestures** - Pitch bend (X-axis) and modulation (Y-axis)
- 📦 **Multiple formats** - ESM, CommonJS, and UMD builds
- 🔧 **TypeScript support** - Full type definitions included
- 🪶 **Lightweight** - Zero dependencies

## Installation

```bash
npm install drawkeyboard
```

## Quick Start

### ES Modules

```javascript
import { DrawKeyboard } from 'drawkeyboard';

const keyboard = new DrawKeyboard({
  container: document.getElementById('keyboard-container'),
  onNoteOn: (note, velocity) => console.log('Note on:', note, velocity),
  onNoteOff: (note) => console.log('Note off:', note),
});
```

### CommonJS

```javascript
const { DrawKeyboard } = require('drawkeyboard');
```

### CDN (UMD)

```html
<script src="https://unpkg.com/drawkeyboard@latest/dist/umd/drawkeyboard.min.js"></script>
<script>
  const keyboard = new DrawKeyboard({
    container: document.body,
    onNoteOn: (note, velocity) => console.log('Note on:', note, velocity),
  });
</script>
```

## Configuration

```typescript
const keyboard = new DrawKeyboard({
  // Container and canvas
  container?: HTMLElement,          // Container element
  canvas?: HTMLCanvasElement,       // Existing canvas (optional)

  // Key dimensions
  keyWidth?: number,               // Width of white keys (default: 15)
  keyHeight?: number,              // Height of keys (default: 100)

  // Note range
  baseNote?: number | string,      // MIDI (e.g., 60) or note name (e.g., 'C4')
  maxWhiteKeys?: number,           // Maximum white keys to show (default: 68)

  // Visual styling
  highlightColor?: string,         // Color for pressed keys (default: '#4ea1ff')
  showOctaveLabels?: boolean,      // Show 'C1', 'C2' labels (default: true)
  ariaLabel?: string,              // A11y label for the canvas element

  // MIDI settings
  velocity?: number,               // Default note velocity (default: 100)

  // Gestures
  gestures?: {                     // Enable/disable touch gestures
    pitchBend?: boolean,
    modulation?: boolean,
  },

  // QWERTY input
  qwertyLayout?: 'none' | 'singleRow' | 'doubleRow',

  // Event callbacks
  onMidi?: (message: [number, number, number?]) => void,
  onNoteOn?: (note: number, velocity: number) => void,
  onNoteOff?: (note: number) => void,
  onPitchBend?: (value14bit: number) => void,
  onControlChange?: (controller: number, value: number) => void,
});
```

## API Methods

### Key Control

```typescript
// Programmatically press/release keys
keyboard.press(60, 100); // Press middle C with velocity 100
keyboard.release(60); // Release middle C

// Send MIDI messages directly
keyboard.sendMidiMessage([0x90, 60, 100]); // Note on
```

### Configuration

```typescript
// Update settings dynamically
keyboard.setKeyWidth(20);
keyboard.setKeyHeight(120);
keyboard.setBaseNote(48); // Start from C2
keyboard.setBaseNoteName('C3'); // Start from C3 (string)
keyboard.setVelocity(80);
keyboard.setHighlightColor('#ff6b6b');
```

### Utility Methods

```typescript
// Get key position for overlays
const rect = keyboard.getNoteRect(60); // Get middle C position

// Reset modulation controls
keyboard.resetModulationAndPitchBend();

// Clean up
keyboard.destroy();
```

## Touch Gestures

- **Tap/Click**: Play note
- **Drag horizontally**: Pitch bend
- **Drag up**: Modulation wheel (CC1)
- **Drag down**: Expression controller (CC11)

To disable gestures:

```ts
new DrawKeyboard({ gestures: { pitchBend: false, modulation: false } });
```

## Events

The keyboard extends `EventTarget` and dispatches custom events:

```typescript
keyboard.addEventListener('noteOn', (e) => {
  console.log('Note pressed:', e.detail); // { note: number, velocity: number }
});

keyboard.addEventListener('noteOff', (e) => {
  console.log('Note released:', e.detail); // { note: number }
});

keyboard.addEventListener('pitchBend', (e) => {
  console.log('Pitch bend:', e.detail.value); // 14-bit value
});

keyboard.addEventListener('controlChange', (e) => {
  console.log('Control change:', e.detail); // { controller: number, value: number }
});

keyboard.addEventListener('midi', (e) => {
  console.log('Raw MIDI:', e.detail); // [status, data1, data2?]
});
```

## MIDI Integration

### Web MIDI API Example

```javascript
import { DrawKeyboard } from 'drawkeyboard';

// Get MIDI output
const midiAccess = await navigator.requestMIDIAccess();
const midiOutput = midiAccess.outputs.values().next().value;

const keyboard = new DrawKeyboard({
  container: document.getElementById('keyboard'),
  onMidi: (message) => {
    if (midiOutput) {
      midiOutput.send(message);
    }
  },
});
```

### Audio Context Integration

```javascript
import { DrawKeyboard } from 'drawkeyboard';

// Simple sine wave synthesizer
const audioContext = new AudioContext();
const activeNotes = new Map();

const keyboard = new DrawKeyboard({
  container: document.getElementById('keyboard'),
  onNoteOn: (note, velocity) => {
    const frequency = 440 * Math.pow(2, (note - 69) / 12);
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime((velocity / 127) * 0.3, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();

    activeNotes.set(note, { oscillator, gainNode });
  },
  onNoteOff: (note) => {
    const noteData = activeNotes.get(note);
    if (noteData) {
      noteData.gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      noteData.oscillator.stop(audioContext.currentTime + 0.1);
      activeNotes.delete(note);
    }
  },
});
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build library
npm run build

# Run tests
npm test
```

## Keyboard Input

Enable QWERTY input:

```ts
new DrawKeyboard({ qwertyLayout: 'singleRow' });
// or
new DrawKeyboard({ qwertyLayout: 'doubleRow' });
```

## Built Files

The library ships multiple formats to support different environments:

- ESM: `dist/esm/index.js` (for modern bundlers)
- CommonJS: `dist/cjs/index.js` (for Node.js and older bundlers)
- UMD: `dist/umd/drawkeyboard.js` (browser global)
- UMD Minified: `dist/umd/drawkeyboard.min.js` (production)
- Types: `dist/types/index.d.ts` (TypeScript definitions)

## Live Examples

- Development: run `npm run dev` and open the local URL printed by Vite
- UMD Test: open `test-umd.html` in a browser
- Production: `npm run build` then serve the `dist/` folder or open `example/index.html`

## License

MIT © Sven Hollowell
