import { useLocalSearchParams } from 'expo-router';
import { Suspense, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

/**
 * Detail screen — exercises SuspenseCollector, StateCollector-like
 * patterns, and ActivityCollector via a synthetic lazy subtree.
 * Tapping 'Force Re-render Storm' triggers a render burst that the
 * SDK should classify as a storm (with `renderReason: 'storm'`).
 */
export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tick, setTick] = useState(0);

  const postId = id ?? '0';
  const imageUrl = useMemo(
    () => `https://picsum.photos/seed/${postId}/600/400`,
    [postId],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Post #{postId}</Text>
      <Image source={imageUrl} style={styles.image} contentFit="cover" />
      <Text style={styles.body}>
        This is a detail view for post {postId}. Renders here flow
        through Suspense + Activity so the SDK can attribute their
        cost to boundaries and emit render events with the right
        reason classification.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Force re-render storm"
        style={styles.button}
        onPress={() => {
          for (let i = 0; i < 10; i++) setTick((t) => t + 1);
        }}
      >
        <Text style={styles.buttonLabel}>Force Re-render Storm ({tick})</Text>
      </Pressable>

      <Suspense fallback={<Text>Loading nested…</Text>}>
        <Nested tick={tick} />
      </Suspense>
    </View>
  );
}

function Nested({ tick }: { tick: number }) {
  return (
    <View style={styles.nested}>
      <Text style={styles.nestedTitle}>Nested (tick={tick})</Text>
      <Text style={styles.nestedBody}>
        This subtree re-renders whenever `tick` changes. With the
        default Phase 5 thresholds the render storm only emits once
        the count crosses three within a 1-second window.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12 },
  body: { fontSize: 15, color: '#333', lineHeight: 22 },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 10,
  },
  buttonLabel: { color: 'white', textAlign: 'center', fontWeight: '600' },
  nested: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    gap: 6,
  },
  nestedTitle: { fontWeight: '600' },
  nestedBody: { color: '#444', fontSize: 13 },
});
