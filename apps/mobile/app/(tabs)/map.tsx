import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const LIVE_POLL_MS = 10_000;

type MapUserLocation = { latitude: number; longitude: number };
type MapBucket = { latitude: number; longitude: number; user_count: number };

/** Expand bucket rows (lat, lng, count) into one location per user with small jitter so markers don't stack. */
function expandBucketsToUserLocations(buckets: MapBucket[]): MapUserLocation[] {
  const out: MapUserLocation[] = [];
  const jitter = 0.012;
  buckets.forEach((b) => {
    const lat = Number(b.latitude);
    const lng = Number(b.longitude);
    const n = Math.max(0, Math.min(Number(b.user_count) || 0, 50));
    for (let i = 0; i < n; i++) {
      const t = (i / Math.max(n, 1)) * 2 - 1;
      out.push({
        latitude: lat + t * jitter,
        longitude: lng + (1 - Math.abs(t)) * jitter * (i % 2 === 0 ? 1 : -1),
      });
    }
  });
  return out;
}

const INITIAL_REGION = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 120,
  longitudeDelta: 120,
};

const ACCENT = '#22d3ee';
const GLASS = 'rgba(8,12,24,0.82)';
const GLASS_BORDER = 'rgba(255,255,255,0.08)';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MapUserLocation[]>([]);
  const [friendsOnlineCount, setFriendsOnlineCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isFirstLoad = useRef(true);

  const fetchFriendsOnline = useCallback(async () => {
    const { data: list } = await supabase.rpc('get_my_friends_with_status');
    const friends = (list ?? []) as { is_online?: boolean }[];
    setFriendsOnlineCount(friends.filter((f) => f.is_online === true).length);
  }, []);

  const fetchMapData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const { data: rows, error: rpcError } = await supabase.rpc('get_online_user_locations_for_map', {
        p_minutes: 10,
      });
      if (!rpcError) {
        setData((rows as MapUserLocation[]) ?? []);
        return;
      }
      // Fallback when new RPC not deployed yet: use bucket RPC and expand to one marker per user
      const { data: bucketRows, error: bucketError } = await supabase.rpc('get_online_users_for_map', {
        p_minutes: 10,
      });
      if (bucketError) throw bucketError;
      const buckets = (bucketRows as MapBucket[]) ?? [];
      setData(expandBucketsToUserLocations(buckets));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg ? `Failed to load map data (${msg})` : 'Failed to load map data');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const run = () => fetchMapData(isFirstLoad.current);
      run();
      fetchFriendsOnline();
      if (isFirstLoad.current) isFirstLoad.current = false;
      const interval = setInterval(() => {
        fetchMapData(false);
        fetchFriendsOnline();
      }, LIVE_POLL_MS);
      return () => clearInterval(interval);
    }, [fetchMapData, fetchFriendsOnline])
  );

  const totalOnline = data.length;
  const markers = data
    .filter(
      (r) =>
        Number.isFinite(Number(r.latitude)) &&
        Number.isFinite(Number(r.longitude))
    )
    .map((r, i) => ({
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      key: `user-${i}-${r.latitude}-${r.longitude}`,
    }));

  if (error) {
    return (
      <View style={styles.centered}>
        <View style={styles.errorCard}>
          <Ionicons name="warning" size={24} color="#f87171" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={INITIAL_REGION}
        mapType="standard"
        showsUserLocation={false}
      >
        {markers.map((m) => (
          <Marker
            key={m.key}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            title="Online"
            description="User online"
            tracksViewChanges={false}
          >
            <View style={styles.markerOuter}>
              <View style={styles.markerInner}>
                <Ionicons name="person" size={20} color="#fff" />
              </View>
            </View>
          </Marker>
        ))}
      </MapView>
      <View style={[styles.bottomBarWrap, { paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.bottomRow}>
          <View style={styles.pill}>
            <View style={styles.headerLeft}>
              <View style={styles.liveDot} />
              <Text style={styles.label}>USERS ONLINE</Text>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : (
              <Text style={styles.count} numberOfLines={1}>
                {totalOnline.toLocaleString()}
              </Text>
            )}
          </View>
          <View style={styles.pill}>
            <View style={styles.headerLeft}>
              <Ionicons name="people" size={14} color={ACCENT} />
              <Text style={styles.label}>FRIENDS ONLINE</Text>
            </View>
            <Text style={styles.count} numberOfLines={1}>
              {friendsOnlineCount.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0a0e14',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: GLASS,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    maxWidth: '100%',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  bottomBarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    maxWidth: 400,
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: GLASS,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
    opacity: 0.95,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.9)',
  },
  count: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(34,211,238,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  markerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(34,211,238,0.7)',
    backgroundColor: 'rgba(8,12,24,0.88)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  markerInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34,211,238,0.25)',
  },
});
