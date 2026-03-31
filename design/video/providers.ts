// design/video/providers.ts
// AI provider integrations for video motion analysis

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { MotionSpec, getAnalysisPrompt } from './prompts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectStack {
  expo: boolean;
  reanimated: boolean;
  gestureHandler: boolean;
  expoRouter: boolean;
  skia: boolean;
  nativewind: boolean;
}

export interface AnalysisResult {
  spec: MotionSpec;
  provider: string;
  model: string;
}

// ─── detectProjectStack ───────────────────────────────────────────────────────

/**
 * Read the project's package.json and detect which relevant packages are installed.
 */
export function detectProjectStack(projectDir: string): ProjectStack {
  const stack: ProjectStack = {
    expo: false,
    reanimated: false,
    gestureHandler: false,
    expoRouter: false,
    skia: false,
    nativewind: false,
  };

  const pkgPath = path.join(projectDir, 'package.json');

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    pkg = JSON.parse(raw);
  } catch {
    return stack;
  }

  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  stack.expo = 'expo' in deps;
  stack.reanimated = 'react-native-reanimated' in deps;
  stack.gestureHandler = 'react-native-gesture-handler' in deps;
  stack.expoRouter = 'expo-router' in deps;
  stack.skia = '@shopify/react-native-skia' in deps;
  stack.nativewind = 'nativewind' in deps;

  return stack;
}

// ─── extractJson ─────────────────────────────────────────────────────────────

/**
 * Extract the first valid JSON object from an AI response string.
 */
function extractJson(text: string): MotionSpec {
  // Try to find a JSON block within markdown fences first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : text.trim();

  // Find the first { and last } to isolate the object
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found in AI response');
  }

  const jsonStr = candidate.slice(start, end + 1);
  return JSON.parse(jsonStr) as MotionSpec;
}

// ─── analyzeWithGemini ────────────────────────────────────────────────────────

/**
 * Send a video file to Google Gemini for motion analysis.
 * Uses dynamic import to avoid hard dependency on @google/generative-ai.
 */
export async function analyzeWithGemini(
  videoPath: string,
  apiKey: string,
  projectStack: ProjectStack,
  model = 'gemini-1.5-pro',
): Promise<AnalysisResult> {
  // Dynamic import — package may not be installed in all environments
  const { GoogleGenerativeAI } = await import('@google/generative-ai' as string);

  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  // Read video as base64
  const videoBuffer = fs.readFileSync(videoPath);
  const base64Video = videoBuffer.toString('base64');

  const ext = path.extname(videoPath).toLowerCase().replace('.', '');
  const mimeType = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';

  const stackRecord: Record<string, boolean> = projectStack as unknown as Record<string, boolean>;
  const prompt = getAnalysisPrompt(stackRecord);

  const result = await genModel.generateContent([
    prompt,
    {
      inlineData: {
        mimeType,
        data: base64Video,
      },
    },
  ]);

  const responseText = result.response.text();
  const spec = extractJson(responseText);

  return { spec, provider: 'gemini', model };
}

// ─── analyzeWithOpenAI ────────────────────────────────────────────────────────

/**
 * Send extracted video frames to OpenAI GPT-4o for motion analysis.
 * Uses ffmpeg to extract frames (1fps, max 512px wide, max 10 frames).
 * Uses dynamic import to avoid hard dependency on openai.
 */
export async function analyzeWithOpenAI(
  videoPath: string,
  apiKey: string,
  projectStack: ProjectStack,
  model = 'gpt-4o',
): Promise<AnalysisResult> {
  // Dynamic import — package may not be installed in all environments
  const OpenAI = (await import('openai' as string)).default;

  const client = new OpenAI({ apiKey });

  // Create a temp directory for extracted frames
  const framesDir = path.join(path.dirname(videoPath), `.frames-${Date.now()}`);
  fs.mkdirSync(framesDir, { recursive: true });

  let frames: string[] = [];

  try {
    // Extract frames using ffmpeg: 1fps, max 512px wide, max 10 frames
    const framesPattern = path.join(framesDir, 'frame-%03d.jpg');
    execSync(
      `ffmpeg -i "${videoPath}" -vf "fps=1,scale=512:-1" -frames:v 10 "${framesPattern}" -y 2>/dev/null`,
      { stdio: 'pipe' },
    );

    // Collect generated frame files
    frames = fs
      .readdirSync(framesDir)
      .filter((f) => f.startsWith('frame-') && f.endsWith('.jpg'))
      .sort()
      .map((f) => path.join(framesDir, f));
  } catch {
    // ffmpeg not available or failed — try to proceed without frames
    frames = [];
  }

  // Build image content blocks from frames
  const imageBlocks: Array<{
    type: 'image_url';
    image_url: { url: string; detail: 'low' | 'high' | 'auto' };
  }> = frames.map((framePath) => {
    const base64 = fs.readFileSync(framePath).toString('base64');
    return {
      type: 'image_url' as const,
      image_url: {
        url: `data:image/jpeg;base64,${base64}`,
        detail: 'low' as const,
      },
    };
  });

  const stackRecord: Record<string, boolean> = projectStack as unknown as Record<string, boolean>;
  const systemPrompt = getAnalysisPrompt(stackRecord);

  const userContent: Array<{ type: 'text'; text: string } | (typeof imageBlocks)[number]> = [
    {
      type: 'text' as const,
      text:
        frames.length > 0
          ? `Analyze these ${frames.length} frames extracted from a React Native app screen recording.`
          : 'Analyze this React Native app screen recording and provide a motion specification.',
    },
    ...imageBlocks,
  ];

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: 4096,
  });

  const responseText = response.choices[0]?.message?.content ?? '';
  const spec = extractJson(responseText);

  return { spec, provider: 'openai', model };
}
