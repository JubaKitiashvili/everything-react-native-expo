// design/video/prompts.ts
// Motion analysis prompt builder for video AI analysis

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MotionSpec {
  pageType: string;
  title: string;
  objective: string;
  visualArchitecture: {
    theme: string;
    colorTokens: string[];
    sections: string[];
  };
  animations: Array<{
    name: string;
    trigger: string;
    target: string;
    properties: string[];
    durationMs: number;
    delayMs: number;
    staggerMs: number;
    easing: string;
  }>;
  interactions: Array<{
    name: string;
    gesture: string;
    target: string;
    behavior: string;
    implementation: string;
  }>;
  accessibility: {
    reducedMotionStrategy: string;
    contrastNotes: string;
    touchTargets: string;
  };
}

// ─── Spring Presets ───────────────────────────────────────────────────────────

const SPRING_PRESETS = {
  Smooth: { damping: 20, stiffness: 300, mass: 1 },
  Snappy: { damping: 25, stiffness: 400, mass: 0.8 },
  Bouncy: { damping: 18, stiffness: 350, mass: 1 },
};

// ─── getAnalysisPrompt ────────────────────────────────────────────────────────

/**
 * Build the system prompt for video/frame motion analysis.
 * Accepts an optional project stack context to tailor recommendations.
 */
export function getAnalysisPrompt(projectStack?: Record<string, boolean>): string {
  const stackInfo = projectStack
    ? `
## Project Stack Context
${Object.entries(projectStack)
  .filter(([, v]) => v)
  .map(([k]) => `- ${k}: true`)
  .join('\n')}
`
    : '';

  return `You are an expert React Native motion designer and animator. Analyze the provided video or frames and return a detailed motion specification as strict JSON.
${stackInfo}
## Instructions

Analyze all visible UI elements, transitions, animations, and interactions. Identify:
1. The page/screen type and its primary objective
2. The visual architecture (theme, color tokens, layout sections)
3. Every animation present — entry, exit, state-change, scroll-driven, gesture-driven
4. Every user interaction — gestures, taps, swipes, and their resulting behaviors
5. Accessibility considerations — reduced motion fallbacks, contrast, touch target sizes

## Animation Implementation Rules

All animation implementations must use react-native-reanimated (withSpring, withTiming, useAnimatedStyle) and react-native-gesture-handler. Never suggest Framer Motion, GSAP, or CSS animations.

## Spring Presets

Use these named spring configurations in your recommendations:

\`\`\`
Smooth:  { damping: ${SPRING_PRESETS.Smooth.damping}, stiffness: ${SPRING_PRESETS.Smooth.stiffness}, mass: ${SPRING_PRESETS.Smooth.mass} }
Snappy:  { damping: ${SPRING_PRESETS.Snappy.damping}, stiffness: ${SPRING_PRESETS.Snappy.stiffness}, mass: ${SPRING_PRESETS.Snappy.mass} }
Bouncy:  { damping: ${SPRING_PRESETS.Bouncy.damping}, stiffness: ${SPRING_PRESETS.Bouncy.stiffness}, mass: ${SPRING_PRESETS.Bouncy.mass} }
\`\`\`

## Required JSON Output Schema

Return ONLY valid JSON matching this exact structure — no prose, no markdown fences, no extra fields:

{
  "pageType": "string — e.g. 'feed', 'detail', 'onboarding', 'settings'",
  "title": "string — descriptive screen title",
  "objective": "string — one sentence describing the screen's purpose",
  "visualArchitecture": {
    "theme": "string — light/dark/system, color palette description",
    "colorTokens": ["array of color hex or semantic names observed"],
    "sections": ["array of named UI sections / zones"]
  },
  "animations": [
    {
      "name": "string — descriptive name e.g. 'heroImageEntrance'",
      "trigger": "string — what causes this animation: mount, scroll, tap, swipe, state-change",
      "target": "string — which element or component",
      "properties": ["array of animated properties: opacity, translateY, scale, etc."],
      "durationMs": 300,
      "delayMs": 0,
      "staggerMs": 0,
      "easing": "string — Smooth | Snappy | Bouncy | withTiming easing name"
    }
  ],
  "interactions": [
    {
      "name": "string — descriptive name e.g. 'swipeToDelete'",
      "gesture": "string — tap | longPress | pan | pinch | swipe | fling",
      "target": "string — which element",
      "behavior": "string — what happens when gesture fires",
      "implementation": "string — react-native-gesture-handler + reanimated implementation hint"
    }
  ],
  "accessibility": {
    "reducedMotionStrategy": "string — how to handle prefers-reduced-motion via useReducedMotion()",
    "contrastNotes": "string — observed contrast ratios and recommendations",
    "touchTargets": "string — touch target size observations and recommendations (min 44x44pt)"
  }
}`;
}
