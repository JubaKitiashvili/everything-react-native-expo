---
description: Callstack React Native AI — on-device LLM with Vercel AI SDK, Apple Foundation Models, Llama GGUF, MLC
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native AI (@callstackincubator/ai)

On-device AI with Vercel AI SDK compatibility. Same `generateText`/`streamText`/`generateObject` API works with local models.

## Providers

| Provider  | Package                  | Platform      | Models                    | Download?   |
| --------- | ------------------------ | ------------- | ------------------------- | ----------- |
| **Apple** | `@react-native-ai/apple` | iOS 26+       | Apple Foundation Models   | No (system) |
| **Llama** | `@react-native-ai/llama` | iOS + Android | Any GGUF from HuggingFace | Yes         |
| **MLC**   | `@react-native-ai/mlc`   | iOS + Android | Pre-compiled LLMs         | Yes         |

## Apple Provider (iOS 26+, no download)

```tsx
import { apple } from '@react-native-ai/apple';
import { generateText, embed, experimental_transcribe as transcribe } from 'ai';

// Text generation
const { text } = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing',
});

// Embeddings (iOS 17+)
const { embedding } = await embed({
  model: apple.textEmbeddingModel(),
  value: 'Hello world',
});

// Transcription (iOS 26+)
const { text: transcript } = await transcribe({
  model: apple.transcriptionModel(),
  audio: audioBuffer,
});
```

## Llama Provider (GGUF models, iOS + Android)

```bash
npm install @react-native-ai/llama llama.rn react-native-blob-util
```

```tsx
import { llama } from '@react-native-ai/llama';
import { generateText, streamText, embed } from 'ai';

const model = llama.languageModel('ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf');

// Download + prepare
await model.download((p) => console.log(`${p.percentage}%`));
await model.prepare();

// Generate
const { text } = await generateText({
  model,
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Write a haiku.' },
  ],
});

// Stream
const { textStream } = await streamText({
  model,
  prompt: 'Write a story',
  temperature: 0.8,
  maxTokens: 500,
});
for await (const delta of textStream) {
  /* append to UI */
}

// Embeddings
const embModel = llama.textEmbeddingModel(modelPath);
await embModel.prepare();
const { embedding } = await embed({ model: embModel, value: 'What is ML?' });

// Cleanup
await model.unload(); // release memory
await model.remove(); // delete downloaded files
```

## MLC Provider

```tsx
import { mlc } from '@react-native-ai/mlc';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';

const model = mlc.languageModel('Llama-3.2-3B-Instruct');
await model.download((e) => console.log(`${e.percentage}%`));
await model.prepare();

// Structured output
const result = await generateObject({
  model,
  prompt: 'Generate a user profile',
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  }),
});
```

## Tool Calling

```tsx
import { generateText } from 'ai';
import { z } from 'zod';

const { text, toolCalls } = await generateText({
  model, // apple() or llama model
  prompt: 'What is the weather in Paris?',
  tools: {
    getWeather: {
      description: 'Get current weather',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => `Weather in ${city}: Sunny, 25C`,
    },
  },
});
```

## Model Lifecycle

```
create → download(progress) → prepare() → use → unload() → remove()
```

## vs react-native-executorch

|                         | @callstackincubator/ai                       | react-native-executorch                 |
| ----------------------- | -------------------------------------------- | --------------------------------------- |
| **API**                 | Vercel AI SDK (`generateText`, `streamText`) | React hooks (`useLLM`)                  |
| **Model format**        | GGUF, MLC, Apple native                      | `.pte` (ExecuTorch)                     |
| **Vision/CV**           | No                                           | Yes (detection, segmentation, OCR)      |
| **Apple system models** | Yes (no download)                            | No                                      |
| **Tool calling**        | Yes                                          | Yes (Hammer models)                     |
| **Structured output**   | Yes (`generateObject`)                       | Yes (Zod validation)                    |
| **Best for**            | LLM + Vercel AI SDK stack                    | Multi-modal AI (vision + text + speech) |

Use **both together**: callstack/ai for text LLM with Vercel AI SDK patterns, ExecuTorch for vision/CV tasks.
