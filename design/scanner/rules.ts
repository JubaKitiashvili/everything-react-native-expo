// design/scanner/rules.ts
// HIG violation detection rules for React Native / Expo .tsx/.ts code

export interface ScannerRule {
  id: string;
  category: string;
  description: string;
  patterns: RegExp[];
  fix: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export const rules: ScannerRule[] = [
  // ─── COLOR ──────────────────────────────────────────────────────────────────

  {
    id: 'COLOR-001',
    category: 'color',
    description: 'Hardcoded black (#000000 or #000) — use semantic color token instead',
    patterns: [
      // matches: color: '#000', backgroundColor: '#000000', etc.
      /(?:color|backgroundColor|borderColor|tintColor|shadowColor)\s*:\s*['"]#(?:000000|000)['"]/i,
    ],
    fix: "Replace with a semantic token (e.g. colors.label.primary) that adapts to dark mode. Import from your design system.",
    severity: 'high',
  },

  {
    id: 'COLOR-002',
    category: 'color',
    description: 'Hardcoded white (#FFFFFF or #FFF) — use semantic color token instead',
    patterns: [
      /(?:color|backgroundColor|borderColor|tintColor|shadowColor)\s*:\s*['"]#(?:FFFFFF|FFF|ffffff|fff)['"]/i,
    ],
    fix: "Replace with a semantic token (e.g. colors.background.primary) that adapts to dark mode.",
    severity: 'high',
  },

  {
    id: 'COLOR-003',
    category: 'color',
    description: 'Hardcoded hex color in style property — use semantic color token',
    patterns: [
      // Any hex color (#xxx or #xxxxxx) used as a style property value
      /(?:color|backgroundColor|borderColor|tintColor|shadowColor|overlayColor|placeholderTextColor)\s*:\s*['"]#[0-9A-Fa-f]{3,8}['"]/,
    ],
    fix: "Use a semantic color from your design system instead of a hardcoded hex value. This ensures dark mode and theme support.",
    severity: 'medium',
  },

  // ─── SPACING ─────────────────────────────────────────────────────────────────

  {
    id: 'SPACING-001',
    category: 'spacing',
    description: 'Spacing value not on 4pt grid (valid: 4, 8, 12, 16, 20, 24, 32, 40, 48…)',
    patterns: [
      // Matches padding/margin/gap/top/left/right/bottom with off-grid values
      // Off-grid means not divisible by 4: 1,2,3,5,6,7,9,10,11,13,14,15,17,18,19,21,22,23,25...
      /(?:padding|margin|gap|top|left|right|bottom|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical)\s*:\s*(?!0\b)(?:\d*\.)?\b([13579]|[1-9]\d*[13579]|[2-9][1-9]|[2468][^048]|[13579][0-9])\b/,
    ],
    fix: "Use 4pt grid values: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64. Round the current value to the nearest multiple of 4.",
    severity: 'medium',
  },

  // ─── TOUCH TARGET ────────────────────────────────────────────────────────────

  {
    id: 'TOUCH-001',
    category: 'touch',
    description: 'Touch target below 44pt minimum (Apple HIG requirement)',
    patterns: [
      // height or minHeight value between 1 and 43 on a line
      /(?:height|minHeight)\s*:\s*([1-9]|[1-3][0-9]|4[0-3])\b/,
    ],
    fix: "Set height/minHeight to at least 44. Use hitSlop to expand the touch area if the visual element must stay smaller.",
    severity: 'critical',
  },

  // ─── CORNERS ─────────────────────────────────────────────────────────────────

  {
    id: 'CORNER-001',
    category: 'corners',
    description: 'borderRadius used without borderCurve: "continuous" — enables Apple squircle curve',
    patterns: [
      // Line has borderRadius but NOT borderCurve on the same line
      /borderRadius\s*:\s*\d+(?![\s\S]{0,80}borderCurve)/,
    ],
    fix: "Add borderCurve: 'continuous' alongside borderRadius for Apple's squircle corner curve. Example:\n  borderRadius: 16,\n  borderCurve: 'continuous',",
    severity: 'medium',
  },

  // ─── ANIMATION ───────────────────────────────────────────────────────────────

  {
    id: 'ANIM-001',
    category: 'animation',
    description: 'Using old Animated API — use Reanimated (withSpring/withTiming) instead',
    patterns: [
      // Animated.Value, Animated.timing, Animated.spring from react-native
      /Animated\.(?:Value|timing|spring|decay|sequence|parallel|loop|event)\b/,
      /new Animated\.Value\s*\(/,
      /import\s+.*\bAnimated\b.*from\s+['"]react-native['"]/,
    ],
    fix: "Replace with react-native-reanimated: useSharedValue, withSpring, withTiming, useAnimatedStyle. Reanimated runs on the UI thread for 60fps animations.",
    severity: 'high',
  },

  {
    id: 'ANIM-002',
    category: 'animation',
    description: 'Linear easing used — spring physics feel more natural on iOS',
    patterns: [
      // Easing.linear used in withTiming
      /Easing\.linear\b/,
      // easing: Easing.linear
      /easing\s*:\s*Easing\.linear\b/,
      // duration-only withTiming without an easing (implies linear default)
      /withTiming\s*\(\s*[^,)]+,\s*\{\s*duration\s*:\s*\d+\s*\}\s*\)/,
    ],
    fix: "Replace linear easing with spring physics: withSpring(value, { damping: 20, stiffness: 300 }). For explicit timing, use Easing.out(Easing.cubic) instead of Easing.linear.",
    severity: 'high',
  },

  {
    id: 'ANIM-003',
    category: 'animation',
    description: 'Animation without reduced motion check — add useReducedMotion() accessibility support',
    // This is a file-level check applied in scanFile when the file contains animations
    // but does not import/use useReducedMotion. The pattern list here is used only to
    // detect animation presence; the index.ts scanner applies the file-level logic.
    patterns: [
      /withSpring\s*\(|withTiming\s*\(/,
    ],
    fix: "Import useReducedMotion from react-native-reanimated and check it before animating:\n  const reduceMotion = useReducedMotion();\n  // Replace movement with a crossfade when reduceMotion is true.",
    severity: 'medium',
  },

  // ─── ACCESSIBILITY ────────────────────────────────────────────────────────────

  {
    id: 'A11Y-001',
    category: 'accessibility',
    description: 'Pressable or TouchableOpacity without accessibilityLabel',
    patterns: [
      // <Pressable> without accessibilityLabel on the same or nearby line
      /<Pressable(?![^>]{0,200}accessibilityLabel)[^>]*>/,
      // <TouchableOpacity> without accessibilityLabel
      /<TouchableOpacity(?![^>]{0,200}accessibilityLabel)[^>]*>/,
    ],
    fix: "Add accessibilityLabel to describe the action:\n  <Pressable accessibilityLabel=\"Save item\" accessibilityRole=\"button\">",
    severity: 'high',
  },

  // ─── STYLE ───────────────────────────────────────────────────────────────────

  {
    id: 'STYLE-001',
    category: 'style',
    description: 'Inline style={{}} object — use StyleSheet.create for performance and memoization',
    patterns: [
      // style={{ ... }} — inline object literal in JSX
      /style\s*=\s*\{\s*\{/,
    ],
    fix: "Move styles to StyleSheet.create at the bottom of the file:\n  const styles = StyleSheet.create({ container: { ... } });\n  // Then use: style={styles.container}",
    severity: 'medium',
  },

  // ─── EXPO BEST PRACTICES ─────────────────────────────────────────────────────

  {
    id: 'EXPO-001',
    category: 'expo',
    description: 'TouchableOpacity from react-native — use Pressable for better control and native feel',
    patterns: [
      // import TouchableOpacity from react-native (not from gesture-handler)
      /import\s+\{[^}]*\bTouchableOpacity\b[^}]*\}\s+from\s+['"]react-native['"]/,
    ],
    fix: "Replace with Pressable from react-native (or react-native-gesture-handler):\n  import { Pressable } from 'react-native';\n  // Pressable supports style callbacks: style={({ pressed }) => pressed && styles.pressed}",
    severity: 'low',
  },

  {
    id: 'EXPO-002',
    category: 'expo',
    description: 'Image from react-native — use expo-image for better caching, blurhash, and performance',
    patterns: [
      // import Image from react-native
      /import\s+\{[^}]*\bImage\b[^}]*\}\s+from\s+['"]react-native['"]/,
    ],
    fix: "Replace with expo-image:\n  import { Image } from 'expo-image';\n  // Supports blurhash placeholders, memory-disk caching, and priority loading.",
    severity: 'low',
  },
];
