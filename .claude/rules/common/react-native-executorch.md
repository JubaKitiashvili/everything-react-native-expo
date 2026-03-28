---
description: React Native ExecuTorch — on-device AI, local LLMs, image classification, object detection, speech-to-text, style transfer, OCR
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native ExecuTorch (react-native-executorch)

On-device AI inference for React Native. Run LLMs, vision models, speech models, and more — entirely on-device, no cloud API needed.

## Setup

```bash
npm install react-native-executorch
```

Add config plugin to `app.json`:

```json
{ "expo": { "plugins": ["react-native-executorch"] } }
```

Then: `npx expo prebuild --clean`

## Common Loading State

All hooks return:

```tsx
const model = useXxx({ model: MODEL_CONSTANT });

model.isReady; // true when loaded
model.downloadProgress; // 0.0 → 1.0
model.error; // string | null
```

## useLLM — On-Device Language Models

```tsx
import { useLLM, SMOLLM2_360M_QUANTIZED, Message } from 'react-native-executorch';

const llm = useLLM({ model: SMOLLM2_360M_QUANTIZED });

// Configure
llm.configure({
  chatConfig: {
    systemPrompt: 'You are a helpful assistant.',
    contextWindowLength: 10,
  },
  generationConfig: { temperature: 0.7, topp: 0.9 },
});

// Stateful chat (manages history)
await llm.sendMessage('Hello!');
console.log(llm.messageHistory); // full conversation
console.log(llm.response); // streaming response text

// Functional chat (you manage messages)
const response = await llm.generate([
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'What is 2+2?' },
]);

// Control
llm.interrupt(); // stop generation
llm.isGenerating; // boolean
llm.getPromptTokenCount();
llm.getGeneratedTokenCount();
```

### Available LLM Models

| Model                    | Size   | Notes                     |
| ------------------------ | ------ | ------------------------- |
| `SMOLLM2_135M_QUANTIZED` | Tiny   | Fastest, lowest quality   |
| `SMOLLM2_360M_QUANTIZED` | Small  | Good balance for mobile   |
| `SMOLLM2_1_7B_QUANTIZED` | Medium | Better quality            |
| `QWEN3_0_6B_QUANTIZED`   | 0.6B   | Qwen 3 quantized          |
| `QWEN3_1_7B_QUANTIZED`   | 1.7B   | Qwen 3 quantized          |
| `QWEN3_4B_QUANTIZED`     | 4B     | High quality, needs RAM   |
| `PHI4_MINI_QUANTIZED`    | ~3.8B  | Microsoft Phi-4           |
| `LLAMA3_2_1B`            | 1B     | Meta Llama full precision |
| `LLAMA3_2_3B`            | 3B     | Meta Llama full precision |
| `HAMMER2_1_*`            | 0.5-3B | Tool-calling optimized    |

### Tool Calling

```tsx
const tools = [
  {
    name: 'get_weather',
    description: 'Get weather for a location',
    parameters: {
      type: 'dict',
      properties: { location: { type: 'string', description: 'City name' } },
      required: ['location'],
    },
  },
];

llm.configure({
  toolsConfig: {
    tools,
    executeToolCallback: async (call) => {
      if (call.toolName === 'get_weather') {
        return JSON.stringify({ temp: 22, condition: 'sunny' });
      }
      return null;
    },
  },
});

await llm.sendMessage("What's the weather in Tokyo?");
// LLM calls tool → gets result → responds with weather info
```

### Structured Output (JSON with Zod)

```tsx
import { getStructuredOutputPrompt, fixAndValidateStructuredOutput } from 'react-native-executorch';
import * as z from 'zod/v4';

const schema = z.object({
  name: z.string(),
  items: z.array(z.object({ product: z.string(), qty: z.number() })),
});

const prompt = getStructuredOutputPrompt(schema);
llm.configure({ chatConfig: { systemPrompt: `Parse orders.\n${prompt}` } });
await llm.sendMessage('John ordered 2 pizzas');
const result = fixAndValidateStructuredOutput(lastMessage.content, schema);
```

## useClassification — Image Classification

```tsx
import { useClassification, EFFICIENTNET_V2_S } from 'react-native-executorch';

const model = useClassification({ model: EFFICIENTNET_V2_S });
const results = await model.forward(imageUri);
// Record<string, number> — ImageNet labels → probability
```

## useObjectDetection

```tsx
import { useObjectDetection, SSDLITE_320_MOBILENET_V3_LARGE } from 'react-native-executorch';

const detector = useObjectDetection({ model: SSDLITE_320_MOBILENET_V3_LARGE });
const detections = await detector.forward(imageUri);
// [{ bbox: [x, y, w, h], label: 'person', score: 0.95 }]
```

## useStyleTransfer

```tsx
import { useStyleTransfer, STYLE_TRANSFER_CANDY } from 'react-native-executorch';

const model = useStyleTransfer({ model: STYLE_TRANSFER_CANDY });
const styledUri = await model.forward(photoUri);
// Returns local file URI of stylized image
```

Styles: `STYLE_TRANSFER_CANDY`, `STYLE_TRANSFER_MOSAIC`, `STYLE_TRANSFER_UDNIE`, `STYLE_TRANSFER_RAIN_PRINCESS`

## useImageSegmentation

```tsx
import { useImageSegmentation, DEEPLAB_V3_RESNET50, DeeplabLabel } from 'react-native-executorch';

const model = useImageSegmentation({ model: DEEPLAB_V3_RESNET50 });
const result = await model.forward(imageUri, [DeeplabLabel.PERSON], true);
const personMask = result[DeeplabLabel.PERSON]; // Float32Array
```

## useSpeechToText (Whisper)

```tsx
import { useSpeechToText, WHISPER_TINY_EN } from 'react-native-executorch';

const model = useSpeechToText({ model: WHISPER_TINY_EN });

// Batch transcription
const text = await model.transcribe(audioBuffer); // Float32Array, 16kHz

// Real-time streaming
model.streamInsert(audioChunk.getChannelData(0));
await model.stream();
model.committedTranscription; // finalized text
model.nonCommittedTranscription; // in-progress text
model.streamStop();
```

Models: `WHISPER_TINY_EN`, `WHISPER_TINY`, `WHISPER_BASE_EN`, `WHISPER_BASE`, `WHISPER_SMALL_EN`, `WHISPER_SMALL`

## useTextToSpeech (Kokoro)

```tsx
import { useTextToSpeech, KOKORO_SMALL, KOKORO_VOICE_AF_HEART } from 'react-native-executorch';

const tts = useTextToSpeech({ model: KOKORO_SMALL, voice: KOKORO_VOICE_AF_HEART });
```

## useOCR

```tsx
import { useOCR, OCR_ENGLISH } from 'react-native-executorch';
const ocr = useOCR({ model: OCR_ENGLISH });
```

Models: `OCR_ENGLISH`, `OCR_LATIN`, `OCR_CYRILLIC`

## useTextEmbeddings

```tsx
import { useTextEmbeddings, ALL_MINILM_L6_V2 } from 'react-native-executorch';
const embeddings = useTextEmbeddings({ model: ALL_MINILM_L6_V2 });
```

Models: `ALL_MINILM_L6_V2`, `ALL_MPNET_BASE_V2`, `MULTI_QA_MINILM_L6_COS_V1`, `CLIP_VIT_BASE_PATCH32_TEXT`

## useExecutorchModule — Custom Models

```tsx
import { useExecutorchModule, ScalarType, TensorPtr } from 'react-native-executorch';

const model = useExecutorchModule({ modelSource: require('./model.pte') });

const input: TensorPtr = {
  dataPtr: new Float32Array(1 * 3 * 224 * 224),
  sizes: [1, 3, 224, 224],
  scalarType: ScalarType.FLOAT,
};

const outputs = await model.forward([input]);
```

## Additional Hooks

```tsx
// Vertical OCR (Japanese/Chinese)
import { useVerticalOCR } from 'react-native-executorch';
const ocr = useVerticalOCR({ model: OCR_JAPANESE });

// Text to Image
import { useTextToImage, BK_SDM_TINY_VPRED_256 } from 'react-native-executorch';
const model = useTextToImage({ model: BK_SDM_TINY_VPRED_256 });

// Image Embeddings
import { useImageEmbeddings, CLIP_VIT_BASE_PATCH32_IMAGE } from 'react-native-executorch';
const model = useImageEmbeddings({ model: CLIP_VIT_BASE_PATCH32_IMAGE });

// Voice Activity Detection
import { useVAD, FSMN_VAD } from 'react-native-executorch';
const vad = useVAD({ model: FSMN_VAD });

// Tokenizer (count tokens before processing)
import { useTokenizer } from 'react-native-executorch';
const tokenizer = useTokenizer({ model: modelPath });
const count = tokenizer.encode(text).length;
```

## ResourceFetcher (Download Management)

```tsx
import { ResourceFetcher } from 'react-native-executorch';

await ResourceFetcher.fetch(modelUrl, (progress) => console.log(progress));
ResourceFetcher.pauseFetching(modelUrl);
ResourceFetcher.resumeFetching(modelUrl);
ResourceFetcher.cancelFetching(modelUrl);
const files = await ResourceFetcher.listDownloadedFiles();
const totalSize = await ResourceFetcher.getFilesTotalSize();
await ResourceFetcher.deleteResources(modelUrl);
```

## Metro Config

Add `.pte` and `.bin` to asset extensions:

```javascript
// metro.config.js
config.resolver.assetExts.push('pte', 'bin');
```

## Critical Rules

- **Interrupt before unmounting** — unmounting while `isGenerating` is `true` crashes the app. Always call `interrupt()` in cleanup
- **STT requires 16kHz mono audio** — other sample rates produce garbage output
- **TTS requires 24kHz audio** — check sample rate compatibility
- **GGUF models not supported** — ExecuTorch uses `.pte` format exclusively
- **`preventLoad` option** — set to `true` to defer model loading until explicitly needed

## Performance Rules

- Use `*_QUANTIZED` models — significantly smaller and faster with minimal quality loss
- Show `downloadProgress` — large models take time to download initially
- Use `interrupt()` to let users stop long LLM generations
- Set `contextWindowLength` to manage memory for chat
- Prefer dedicated hooks (`useLLM`, `useClassification`) over raw `useExecutorchModule`
- Local file URIs avoid redundant network calls for image inputs
- `SMOLLM2_135M` for speed, `QWEN3_4B` for quality — choose based on device capability
- Use `outputTokenBatchSize` / `batchTimeInterval` to prevent UI jank during generation

### Device Tiers

| Tier | RAM | Recommended Models |
|---|---|---|
| Low-end | <4GB | `SMOLLM2_135M`, `WHISPER_TINY_EN` |
| Mid-range | 4-6GB | `SMOLLM2_360M`, `QWEN3_0_6B`, `WHISPER_BASE` |
| High-end | 8GB+ | `QWEN3_4B`, `LLAMA3_2_3B`, `WHISPER_SMALL` |
