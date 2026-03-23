---
description: Expo media packages — expo-audio, expo-video, expo-image, expo-camera (SDK 55+)
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# Expo Media Packages

## expo-audio (Stable — replaces expo-av audio)

**expo-av is REMOVED in SDK 55.** All audio must use expo-audio.

### Playback

```tsx
import { useAudioPlayer } from 'expo-audio';
import { useEvent } from 'expo';

const player = useAudioPlayer(require('./sound.mp3'), {
  updateInterval: 500, // status update interval in ms
  downloadFirst: false, // download before playing
});

// Reactive state via useEvent
const { isPlaying } = useEvent(player, 'playingChange', {
  isPlaying: player.playing,
});

// Methods
player.play();
player.pause();
player.seekTo(seconds); // NOTE: seconds, not milliseconds
player.replace(newSource); // swap audio source
player.remove(); // free memory
player.setPlaybackRate(1.5); // speed control
player.volume = 0.8; // 0-1
player.muted = false;
player.loop = true;

// Lock screen controls
player.setActiveForLockScreen(true, {
  title: 'Song Name',
  artist: 'Artist',
  album: 'Album',
  artworkSource: require('./cover.png'),
});
player.updateLockScreenMetadata({ title: 'New Title' });
player.clearLockScreenControls();
```

### Recording

```tsx
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';

// Request permission
await AudioModule.requestRecordingPermissionsAsync();
await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });

const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
const state = useAudioRecorderState(recorder);

// Record
await recorder.prepareToRecordAsync();
recorder.record();
recorder.recordForDuration(30); // record for 30 seconds
recorder.pause();
await recorder.stop();
console.log(recorder.uri); // saved file URI

// Input devices
const inputs = await recorder.getAvailableInputs();
await recorder.setInput(inputs[0].uid);
```

### Migration from expo-av

| expo-av                           | expo-audio                                    |
| --------------------------------- | --------------------------------------------- |
| `Audio.Sound.createAsync(source)` | `useAudioPlayer(source)`                      |
| `sound.playAsync()`               | `player.play()`                               |
| `sound.setPositionMillis(ms)`     | `player.seekTo(seconds)` — **seconds not ms** |
| `sound.unloadAsync()`             | `player.remove()`                             |
| `Audio.Recording` class           | `useAudioRecorder(preset)`                    |
| `setOnPlaybackStatusUpdate`       | `useEvent(player, event)`                     |

---

## expo-video (Stable — replaces expo-av video)

### Playback

```tsx
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';

const player = useVideoPlayer('https://example.com/video.mp4', (p) => {
  p.loop = true;
  p.play();
});

const { isPlaying } = useEvent(player, 'playingChange', {
  isPlaying: player.playing,
});

// Methods
player.play();
player.pause();
player.seekTo(seconds);
player.replace(newSource);
player.release(); // only needed with createVideoPlayer()
```

### VideoView Component

```tsx
<VideoView
  player={player}
  style={{ width: 350, height: 275 }}
  contentFit="cover" // 'contain' | 'cover' | 'fill'
  nativeControls={true}
  allowsPictureInPicture={true} // requires config plugin
  allowsFullscreen={true}
  onFirstFrameRender={() => {}}
  onFullscreenEnter={() => {}}
  onFullscreenExit={() => {}}
/>
```

### DRM Support

```tsx
const player = useVideoPlayer({
  uri: 'https://example.com/protected.mp4',
  drm: {
    type: 'widevine', // or 'fairplay', 'clearkey'
    licenseServer: 'https://license.example.com',
    headers: { Authorization: 'Bearer token' },
  },
});
```

### Picture-in-Picture Config

```json
{
  "plugins": [
    [
      "expo-video",
      {
        "supportsBackgroundPlayback": true,
        "supportsPictureInPicture": true
      }
    ]
  ]
}
```

### Events (via useEvent from 'expo')

- `playingChange` — `{ isPlaying }`
- `statusChange` — player status (loading, ready, error)
- `timeUpdate` — periodic time updates
- `playToEnd` — reached end
- `sourceChange` / `sourceLoad` — media source events
- `subtitleTrackChange` / `audioTrackChange` — track selection
- `availableSubtitleTracksChange` / `availableAudioTracksChange`

---

## expo-image (Stable)

### Component

```tsx
import { Image } from 'expo-image';

<Image
  source="https://example.com/photo.jpg"
  placeholder={{ blurhash: '|rF?hV%2WCj[ayj[a|j[az' }}
  contentFit="cover"
  contentPosition="center"
  transition={300} // ms for cross-dissolve
  cachePolicy="memory-disk" // 'none' | 'disk' | 'memory' | 'memory-disk'
  priority="high" // 'low' | 'normal' | 'high'
  recyclingKey={uri} // reset for FlashList recycling
  blurRadius={0}
  tintColor={null}
  allowDownscaling={true}
  autoplay={true} // for GIF/APNG/WebP
  enableLiveTextInteraction={false} // iOS Live Text
  defaultSource={fallbackImage} // NEW — fallback if primary fails
  accessibilityLabel="Photo"
  style={{ width: 200, height: 200 }}
  onLoad={(e) => {}}
  onError={(e) => {}}
  onProgress={(e) => {}}
/>;
```

### Static Methods

```tsx
Image.prefetch(urls); // prefetch into cache
Image.clearDiskCache();
Image.clearMemoryCache();
Image.generateBlurhashAsync(url, [4, 3]); // generate blurhash
Image.getCachePathAsync(url); // get cached file path
```

### SDK 55 Additions

- HDR image support (iOS)
- SF Symbols rendering
- Cookie support for authenticated image URLs
- `defaultSource` prop for fallback images
- `responsivePolicy: 'live'` for real-time responsive source selection (web)

---

## expo-camera (Stable)

### CameraView

```tsx
import { CameraView, useCameraPermissions } from 'expo-camera';

const [permission, requestPermission] = useCameraPermissions();

<CameraView
  ref={cameraRef}
  style={{ flex: 1 }}
  facing="back" // 'front' | 'back'
  flash="auto" // 'on' | 'off' | 'auto'
  enableTorch={false}
  zoom={0} // 0-1
  mirror={false}
  videoQuality="1080p"
  videoBitrate={10_000_000}
  videoStabilizationMode="auto"
  selectedLens="builtInWideAngleCamera" // iOS multi-lens
  barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13'] }}
  onBarcodeScanned={(result) => console.log(result.data)}
  onCameraReady={() => {}}
  onMountError={(error) => {}}
  onAvailableLensesChanged={(lenses) => {}} // iOS
/>;
```

### Ref Methods

```tsx
const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
const video = await cameraRef.current.recordAsync();
cameraRef.current.stopRecording();
await cameraRef.current.toggleRecordingAsync();
cameraRef.current.pausePreview();
cameraRef.current.resumePreview();
const sizes = await cameraRef.current.getAvailablePictureSizesAsync();
const lenses = cameraRef.current.getAvailableLenses();
const features = cameraRef.current.getSupportedFeatures();
```

### Permissions

```tsx
// Hook
const [permission, requestPermission] = useCameraPermissions();
const [micPermission, requestMicPermission] = useMicrophonePermissions();

// Static
await Camera.getCameraPermissionsAsync();
await Camera.requestCameraPermissionsAsync();
await Camera.getMicrophonePermissionsAsync();
await Camera.requestMicrophonePermissionsAsync();
```
