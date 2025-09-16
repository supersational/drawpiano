## 🎹 Quick Start

### Via npm/yarn

```bash
npm install drawpiano
# or
yarn add drawpiano
```

### Via CDN

```html
  <script src="https://unpkg.com/drawpiano@latest/dist/umd/drawpiano.min.js"></script>
```

## 📦 Usage Examples

### 1. ES Modules (Modern)

```javascript
import { DrawPiano } from 'drawpiano';

const keyboard = new DrawPiano({
  container: document.getElementById('keyboard'),
  onNoteOn: (note, velocity) => console.log('🎵 Note on:', note),
  onNoteOff: (note) => console.log('🔇 Note off:', note),
});
```

### 2. CommonJS (Node.js)

```javascript
const { DrawPiano } = require('drawpiano');

const keyboard = new DrawPiano({
  container: document.getElementById('keyboard'),
});
```

### 3. UMD (Browser Global)

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Piano App</title>
  </head>
  <body>
    <div id="keyboard"></div>

  <script src="https://unpkg.com/drawpiano@latest/dist/umd/drawpiano.min.js"></script>
    <script>
  const keyboard = new DrawPiano({
        container: document.getElementById('keyboard'),
        keyWidth: 20,
        keyHeight: 120,
        onNoteOn: (note, velocity) => {
          console.log('Note pressed:', note, 'velocity:', velocity);
        },
      });
    </script>
  </body>
</html>
```
### 4. TypeScript

```typescript
import { DrawPiano, DrawPianoOptions } from 'drawpiano';

const options: DrawPianoOptions = {
  container: document.getElementById('keyboard')!,
  keyWidth: 25,
  keyHeight: 100,
  baseNote: 60, // Middle C
  onNoteOn: (note: number, velocity: number) => {
    console.log(`Note ${note} pressed with velocity ${velocity}`);
  },
};

const keyboard = new DrawPiano(options);
```
## 🎛️ Advanced Examples

### With Web MIDI API

```javascript
import { DrawPiano } from 'drawpiano';

navigator.requestMIDIAccess().then((midiAccess) => {
  const midiOutput = Array.from(midiAccess.outputs.values())[0];

  const keyboard = new DrawPiano({
    container: document.getElementById('keyboard'),
    onMidi: (message) => {
      if (midiOutput) {
        midiOutput.send(message);
      }
  });
});
```

### With Web Audio API

```javascript
import { DrawPiano } from 'drawpiano';

const audioContext = new AudioContext();
const activeNotes = new Map();

const keyboard = new DrawPiano({
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
  activeNotes.delete(note);
    }
  },
});
```

## 🎯 Built Files

- **ESM**: `dist/esm/index.js` - For modern bundlers
- **CommonJS**: `dist/cjs/index.js` - For Node.js and older bundlers
- **UMD**: `dist/umd/drawpiano.js` - For browser globals
- **UMD Minified**: `dist/umd/drawpiano.min.js` - Production ready
- **Types**: `dist/types/index.d.ts` - TypeScript definitions

## 📏 Bundle Size

- **UMD Minified**: ~10KB
- **ESM**: ~15KB
- **Total dist/**: 312KB (includes all formats + sourcemaps)

## 🎪 Live Examples

- **Development**: `npm run dev` → http://localhost:5174
- **UMD Test**: Open `test-umd.html` in browser
- **Production**: `npm run build` then serve the files
