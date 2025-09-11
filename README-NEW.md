# DrawPiano

Touch-enabled virtual piano keyboard with MIDI output for web applications.

## Key Benefits

- **Zero dependencies** - Lightweight, self-contained
- **Touch + Mouse** - Works on desktop and mobile
- **MIDI compliant** - Standard MIDI message output
- **Multiple formats** - ESM, CommonJS, UMD builds
- **TypeScript** - Full type definitions included
- **Responsive** - Auto-fits container width
- **Touch gestures** - Pitch bend (X) and modulation (Y)

## Installation

```bash
npm install drawpiano
```

CDN:

```html
<script src="https://unpkg.com/drawpiano/dist/umd/drawpiano.min.js"></script>
```

## Quick Start

```javascript
import { DrawKeyboard } from 'drawpiano';

const keyboard = new DrawKeyboard({
  container: document.getElementById('keyboard'),
  onNoteOn: (note, velocity) => console.log('Note on:', note),
  onNoteOff: (note) => console.log('Note off:', note),
});
```

## Configuration

```javascript
const keyboard = new DrawKeyboard({
  keyWidth: 20, // White key width in pixels
  keyHeight: 120, // Key height in pixels
  baseNote: 60, // Starting MIDI note (middle C)
  highlightColor: '#ff0000', // Pressed key color
  velocity: 100, // Default note velocity

  // Callbacks
  onMidi: (msg) => {}, // [status, data1, data2]
  onNoteOn: (note, vel) => {}, // Note pressed
  onNoteOff: (note) => {}, // Note released
  onPitchBend: (value) => {}, // 14-bit pitch bend
  onControlChange: (cc, val) => {}, // Control change
});
```

## Usage Examples

### Web MIDI Output

```javascript
const midiAccess = await navigator.requestMIDIAccess();
const output = midiAccess.outputs.values().next().value;

const keyboard = new DrawKeyboard({
  container: document.getElementById('keyboard'),
  onMidi: (message) => output?.send(message),
});
```

### Web Audio Synth

```javascript
const ctx = new AudioContext();
const notes = new Map();

const keyboard = new DrawKeyboard({
  container: document.getElementById('keyboard'),
  onNoteOn: (note, velocity) => {
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = freq;
    gain.gain.value = (velocity / 127) * 0.3;

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    notes.set(note, osc);
  },
  onNoteOff: (note) => {
    notes.get(note)?.stop();
    notes.delete(note);
  },
});
```

### React Hook

```jsx
import { useEffect, useRef } from 'react';
import { DrawKeyboard } from 'drawpiano';

function useKeyboard(onNotePlay) {
  const ref = useRef();
  const keyboardRef = useRef();

  useEffect(() => {
    keyboardRef.current = new DrawKeyboard({
      container: ref.current,
      onNoteOn: onNotePlay,
    });
    return () => keyboardRef.current.destroy();
  }, [onNotePlay]);

  return ref;
}

function Piano() {
  const keyboardRef = useKeyboard((note, vel) => console.log('Played:', note));
  return <div ref={keyboardRef} />;
}
```

### CDN Usage

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="piano"></div>
  <script src="https://unpkg.com/drawpiano/dist/umd/drawpiano.min.js"></script>
    <script>
      new DrawKeyboard({
        container: document.getElementById('piano'),
        onNoteOn: (note) => console.log('Note:', note),
      });
    </script>
  </body>
</html>
```

## API Methods

```javascript
// Control keys programmatically
keyboard.press(60, 100); // Press middle C
keyboard.release(60); // Release middle C

// Update settings
keyboard.setKeyWidth(25);
keyboard.setKeyHeight(150);
keyboard.setBaseNote(48); // Start from C2
keyboard.setHighlightColor('#00ff00');

// MIDI control
keyboard.sendMidiMessage([0x90, 60, 100]); // Note on
keyboard.resetModulationAndPitchBend(); // Reset controllers

// Utilities
const rect = keyboard.getNoteRect(60); // Get key bounds
keyboard.destroy(); // Cleanup
```

## Touch Gestures

- **Tap**: Play note
- **Horizontal drag**: Pitch bend
- **Vertical drag up**: Modulation (CC1)
- **Vertical drag down**: Expression (CC11)

## Events

```javascript
keyboard.addEventListener('noteOn', (e) => {
  console.log('Note pressed:', e.detail.note, e.detail.velocity);
});

keyboard.addEventListener('pitchBend', (e) => {
  console.log('Pitch bend:', e.detail.value);
});
```

## Browser Support

Chrome 60+, Firefox 55+, Safari 12+, Edge 79+

## License

MIT
