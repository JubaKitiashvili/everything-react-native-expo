---
description: React Native Audio API — Web Audio API for React Native, real-time audio processing, synthesis, effects, recording
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native Audio API (react-native-audio-api)

High-performance audio engine for React Native. Web Audio API-compatible — same API patterns work on iOS, Android, and web.

## Setup

```bash
npx expo install react-native-audio-api
```

## AudioContext

```tsx
import { AudioContext } from 'react-native-audio-api';

const audioContext = new AudioContext({ sampleRate: 44100 });

audioContext.sampleRate; // 44100
audioContext.currentTime; // seconds since creation
audioContext.state; // 'running' | 'suspended' | 'closed'
audioContext.destination; // final output node

await audioContext.suspend();
await audioContext.resume();
await audioContext.close(); // release resources (cannot reuse)
```

## Audio Nodes

### GainNode (volume)

```tsx
const gain = audioContext.createGain();
gain.gain.value = 0.5; // 0 = silent, 1 = full

// Smooth fade (no clicks)
gain.gain.setValueAtTime(0, audioContext.currentTime);
gain.gain.exponentialRampToValueAtTime(1, audioContext.currentTime + 0.1);
```

### OscillatorNode (waveform generator)

```tsx
const osc = audioContext.createOscillator();
osc.type = 'sine'; // 'sine' | 'square' | 'sawtooth' | 'triangle'
osc.frequency.value = 440; // Hz
osc.detune.value = 0; // cents
osc.start(audioContext.currentTime);
osc.stop(audioContext.currentTime + 2);
```

### BiquadFilterNode (EQ / tone shaping)

```tsx
const filter = audioContext.createBiquadFilter();
filter.type = 'lowpass'; // lowpass, highpass, bandpass, lowshelf, highshelf, peaking, notch, allpass
filter.frequency.value = 1000;
filter.Q.value = 5;
filter.gain.value = 0; // dB (shelf and peaking only)
```

### DelayNode

```tsx
const delay = audioContext.createDelay(2.0); // maxDelayTime
delay.delayTime.value = 0.3; // seconds
```

### StereoPannerNode

```tsx
const panner = audioContext.createStereoPanner();
panner.pan.value = 0; // -1 (left) to 1 (right)
```

### WaveShaperNode (distortion)

```tsx
const shaper = audioContext.createWaveShaper();
shaper.curve = makeDistortionCurve(400); // Float32Array
shaper.oversample = '4x'; // 'none' | '2x' | '4x'
```

### AnalyserNode (visualization)

```tsx
const analyser = audioContext.createAnalyser();
analyser.fftSize = 512;
const freqData = new Uint8Array(analyser.frequencyBinCount);
analyser.getByteFrequencyData(freqData); // spectrum
analyser.getByteTimeDomainData(freqData); // waveform
```

### ConvolverNode (reverb)

```tsx
const impulse = await audioContext.decodeAudioData(arrayBuffer);
const convolver = audioContext.createConvolver({ buffer: impulse });
```

## Loading & Playing Audio

```tsx
const response = await fetch('https://example.com/song.mp3');
const arrayBuffer = await response.arrayBuffer();
const buffer = await audioContext.decodeAudioData(arrayBuffer);

const source = audioContext.createBufferSource();
source.buffer = buffer;
source.connect(audioContext.destination);
source.start(audioContext.currentTime);
// AudioBufferSourceNode is one-shot — create new instance each play
```

## AudioParam Automation

```tsx
param.setValueAtTime(0, now);
param.linearRampToValueAtTime(1, now + 1);
param.exponentialRampToValueAtTime(0.01, now + 2); // target must be > 0
param.setTargetAtTime(0.5, now, 0.1); // exponential approach
param.cancelScheduledValues(now);
```

## Custom Audio Processing (Worklets)

```tsx
const workletFn = (input: Array<Float32Array>, output: Array<Float32Array>, frames: number) => {
  'worklet';
  for (let ch = 0; ch < input.length; ch++) {
    for (let i = 0; i < frames; i++) {
      output[ch][i] = Math.tanh(input[ch][i] * 2.0); // soft clipping
    }
  }
};

const worklet = audioContext.createWorkletProcessingNode(workletFn, 'AudioRuntime');
source.connect(worklet);
worklet.connect(audioContext.destination);
```

## Recording

```tsx
import { AudioRecorder, AudioManager, FileFormat, FilePreset } from 'react-native-audio-api';

AudioManager.setAudioSessionOptions({
  iosCategory: 'playAndRecord',
  iosMode: 'default',
  iosOptions: ['defaultToSpeaker'],
});
await AudioManager.requestRecordingPermissions();

const recorder = new AudioRecorder();
recorder.enableFileOutput({ format: FileFormat.M4A, preset: FilePreset.High, channelCount: 1 });

await AudioManager.setAudioSessionActivity(true);
recorder.start(); // { path: string }
recorder.stop(); // { duration, size }
```

## Common Patterns

### Effects Chain

```tsx
source.connect(filter); // EQ
filter.connect(shaper); // distortion
shaper.connect(delay); // echo
delay.connect(convolver); // reverb
convolver.connect(gain); // master volume
gain.connect(audioContext.destination);
```

### Synthesizer Note

```tsx
function playNote(freq: number, duration: number) {
  const osc = audioContext.createOscillator();
  const env = audioContext.createGain();
  const now = audioContext.currentTime;

  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.8, now + 0.01); // attack
  env.gain.linearRampToValueAtTime(0.4, now + 0.1); // decay
  env.gain.setValueAtTime(0.4, now + duration - 0.05);
  env.gain.linearRampToValueAtTime(0, now + duration); // release

  osc.connect(env);
  env.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + duration);
}
```

## Performance Rules

- Use single `AudioContext` per app — store in `useRef`, create/close at mount/unmount
- Use `AudioParam` automation (sample-accurate) instead of `setInterval` for parameter changes
- `AudioBufferSourceNode` is one-shot — create new instance each play
- Keep worklet functions lean — no allocations, closures, or console.log
- Use `OfflineAudioContext` for non-realtime processing (audio export, pre-rendering)
- Configure audio session via `AudioManager` to avoid conflicts with other audio sources
