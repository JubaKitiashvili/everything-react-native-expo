import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';

/**
 * Feed — 100-item list of fake posts. Exercises:
 *   - RenderCollector storm detection (FlashList item renders)
 *   - FrameDropCollector during scroll
 *   - NetworkCollector (fetch for the post list)
 *   - ImageCollector (expo-image load times)
 *   - NavigationCollector (tap → detail screen)
 *   - TouchBoundaryCollector (every Pressable)
 */

interface Post {
  id: string;
  title: string;
  body: string;
  image: string;
}

const MOCK_POSTS: Post[] = Array.from({ length: 100 }, (_, i) => ({
  id: String(i + 1),
  title: `Post #${i + 1}`,
  body: `Body for post ${i + 1} — lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
  image: `https://picsum.photos/seed/${i}/120/120`,
}));

async function fetchPosts(): Promise<Post[]> {
  // Simulate a real API call so NetworkCollector has something to
  // capture. The degrader on the Settings screen can wedge this.
  const res = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=1');
  await res.text();
  // Return the mock data regardless — the fetch is just for telemetry.
  return MOCK_POSTS;
}

export default function FeedScreen() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts()
      .then(setPosts)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setPosts(MOCK_POSTS); // fall back to local data
      });
  }, []);

  if (!posts) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Offline mode: {error}</Text>
        </View>
      )}
      <FlashList
        data={posts}
        keyExtractor={(p) => p.id}
        estimatedItemSize={88}
        renderItem={({ item }) => <Row post={item} />}
      />
    </>
  );
}

function Row({ post }: { post: Post }) {
  return (
    <Link href={`/detail/${post.id}`} asChild>
      <Pressable style={styles.row}>
        <Image source={post.image} style={styles.thumb} contentFit="cover" />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{post.title}</Text>
          <Text numberOfLines={2} style={styles.rowBody}>
            {post.body}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner: { backgroundColor: '#fff3cd', padding: 8 },
  errorText: { color: '#5c4a00', fontSize: 12 },
  row: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
    gap: 12,
  },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontWeight: '600', fontSize: 15 },
  rowBody: { color: '#555', fontSize: 13 },
});
