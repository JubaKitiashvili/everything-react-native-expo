// design/video/index.ts
// Video motion analyzer — orchestrates AI providers and writes output files

import * as fs from 'fs';
import * as path from 'path';
import { MotionSpec } from './prompts';
import { AnalysisResult, ProjectStack, detectProjectStack, analyzeWithGemini, analyzeWithOpenAI } from './providers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoAnalysisOutput {
  result: AnalysisResult;
  files: {
    analysisJson: string;
    blueprintMd: string;
  };
}

// Re-export types for consumers
export type { MotionSpec, AnalysisResult, ProjectStack };

// ─── analyzeVideo ─────────────────────────────────────────────────────────────

/**
 * Analyze a video file for motion patterns and UI interactions.
 *
 * Provider priority:
 *   1. Gemini (GEMINI_API_KEY or GOOGLE_API_KEY)
 *   2. OpenAI (OPENAI_API_KEY)
 *
 * Throws if no API key is found.
 *
 * @param videoPath   - Absolute path to the video file (.mp4, .mov, .webm)
 * @param outputDir   - Directory where analysis.json and blueprint.md will be written
 * @param projectDir  - Optional path to the React Native project (for stack detection)
 */
export async function analyzeVideo(
  videoPath: string,
  outputDir: string,
  projectDir?: string,
): Promise<VideoAnalysisOutput> {
  // Detect project stack if a project directory was provided
  const projectStack: ProjectStack = projectDir
    ? detectProjectStack(projectDir)
    : {
        expo: false,
        reanimated: false,
        gestureHandler: false,
        expoRouter: false,
        skia: false,
        nativewind: false,
      };

  // Resolve API keys from environment
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    throw new Error(
      'No AI provider API key found. Set GEMINI_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY.',
    );
  }

  // Try Gemini first, fall back to OpenAI
  let result: AnalysisResult;

  if (geminiKey) {
    try {
      result = await analyzeWithGemini(videoPath, geminiKey, projectStack);
    } catch (geminiError) {
      if (!openaiKey) {
        throw geminiError;
      }
      // Gemini failed — fall through to OpenAI
      result = await analyzeWithOpenAI(videoPath, openaiKey, projectStack);
    }
  } else {
    result = await analyzeWithOpenAI(videoPath, openaiKey!, projectStack);
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Write analysis.json
  const analysisJson = path.join(outputDir, 'analysis.json');
  fs.writeFileSync(
    analysisJson,
    JSON.stringify({ provider: result.provider, model: result.model, spec: result.spec }, null, 2),
    'utf8',
  );

  // Generate and write blueprint.md
  const blueprintMd = path.join(outputDir, 'blueprint.md');
  const markdown = generateBlueprint(result.spec, result.provider);
  fs.writeFileSync(blueprintMd, markdown, 'utf8');

  return {
    result,
    files: { analysisJson, blueprintMd },
  };
}

// ─── generateBlueprint ────────────────────────────────────────────────────────

/**
 * Convert a MotionSpec into a human-readable markdown report.
 */
export function generateBlueprint(spec: MotionSpec, provider: string): string {
  const lines: string[] = [];

  lines.push(`# Motion Blueprint: ${spec.title}`);
  lines.push('');
  lines.push(`> **Analyzed by:** ${provider}`);
  lines.push(`> **Page type:** ${spec.pageType}`);
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push(spec.objective);
  lines.push('');

  // ── Visual Architecture ──────────────────────────────────────────────────────
  lines.push('## Visual Architecture');
  lines.push('');
  lines.push(`**Theme:** ${spec.visualArchitecture.theme}`);
  lines.push('');

  if (spec.visualArchitecture.colorTokens.length > 0) {
    lines.push('**Color Tokens:**');
    for (const token of spec.visualArchitecture.colorTokens) {
      lines.push(`- ${token}`);
    }
    lines.push('');
  }

  if (spec.visualArchitecture.sections.length > 0) {
    lines.push('**Layout Sections:**');
    for (const section of spec.visualArchitecture.sections) {
      lines.push(`- ${section}`);
    }
    lines.push('');
  }

  // ── Animations ───────────────────────────────────────────────────────────────
  lines.push('## Animations');
  lines.push('');

  if (spec.animations.length === 0) {
    lines.push('_No animations detected._');
    lines.push('');
  } else {
    for (const anim of spec.animations) {
      lines.push(`### ${anim.name}`);
      lines.push('');
      lines.push(`| Property | Value |`);
      lines.push(`|----------|-------|`);
      lines.push(`| Trigger | ${anim.trigger} |`);
      lines.push(`| Target | ${anim.target} |`);
      lines.push(`| Properties | ${anim.properties.join(', ')} |`);
      lines.push(`| Duration | ${anim.durationMs}ms |`);
      lines.push(`| Delay | ${anim.delayMs}ms |`);
      if (anim.staggerMs > 0) {
        lines.push(`| Stagger | ${anim.staggerMs}ms |`);
      }
      lines.push(`| Easing | ${anim.easing} |`);
      lines.push('');

      // Provide a reanimated implementation hint
      const springPresets: Record<string, string> = {
        Smooth: '{ damping: 20, stiffness: 300, mass: 1 }',
        Snappy: '{ damping: 25, stiffness: 400, mass: 0.8 }',
        Bouncy: '{ damping: 18, stiffness: 350, mass: 1 }',
      };

      const isSpring = anim.easing in springPresets;
      const animFn = isSpring
        ? `withSpring(toValue, ${springPresets[anim.easing]})`
        : `withTiming(toValue, { duration: ${anim.durationMs} })`;

      const withDelay =
        anim.delayMs > 0 ? `withDelay(${anim.delayMs}, ${animFn})` : animFn;

      lines.push('```tsx');
      lines.push(`// ${anim.name}`);
      lines.push(`const ${anim.properties[0] ?? 'value'} = useSharedValue(0);`);
      lines.push(`const animatedStyle = useAnimatedStyle(() => ({`);
      for (const prop of anim.properties) {
        lines.push(`  ${prop}: ${anim.properties[0] ?? 'value'}.value,`);
      }
      lines.push(`}));`);
      lines.push(`// Trigger: ${anim.trigger}`);
      lines.push(`${anim.properties[0] ?? 'value'}.value = ${withDelay};`);
      lines.push('```');
      lines.push('');
    }
  }

  // ── Interactions ─────────────────────────────────────────────────────────────
  lines.push('## Interactions');
  lines.push('');

  if (spec.interactions.length === 0) {
    lines.push('_No interactions detected._');
    lines.push('');
  } else {
    for (const interaction of spec.interactions) {
      lines.push(`### ${interaction.name}`);
      lines.push('');
      lines.push(`- **Gesture:** ${interaction.gesture}`);
      lines.push(`- **Target:** ${interaction.target}`);
      lines.push(`- **Behavior:** ${interaction.behavior}`);
      lines.push(`- **Implementation:** ${interaction.implementation}`);
      lines.push('');
    }
  }

  // ── Accessibility ────────────────────────────────────────────────────────────
  lines.push('## Accessibility');
  lines.push('');
  lines.push(`**Reduced Motion Strategy:**`);
  lines.push(spec.accessibility.reducedMotionStrategy);
  lines.push('');
  lines.push(`**Contrast Notes:**`);
  lines.push(spec.accessibility.contrastNotes);
  lines.push('');
  lines.push(`**Touch Targets:**`);
  lines.push(spec.accessibility.touchTargets);
  lines.push('');

  // ── Implementation Checklist ─────────────────────────────────────────────────
  lines.push('## Implementation Checklist');
  lines.push('');
  lines.push('- [ ] Install `react-native-reanimated` and `react-native-gesture-handler`');
  lines.push('- [ ] Wrap app root with `GestureHandlerRootView`');
  lines.push('- [ ] Implement `useReducedMotion()` check for all animations');

  for (const anim of spec.animations) {
    lines.push(`- [ ] Implement \`${anim.name}\` animation (${anim.trigger} → ${anim.target})`);
  }

  for (const interaction of spec.interactions) {
    lines.push(`- [ ] Implement \`${interaction.name}\` gesture handler`);
  }

  lines.push('- [ ] Verify all touch targets meet 44×44pt minimum');
  lines.push('- [ ] Test with VoiceOver (iOS) and TalkBack (Android)');
  lines.push('');

  return lines.join('\n');
}
