import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Animated, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type NotifType = 'weekly' | 'monthly';

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1', type: 'weekly',
    title: 'Weekly Report Reminder',
    body: "It's time to generate your weekly temperature report for the main storage unit.",
    timestamp: Date.now() - 60 * 1000,
    read: false,
  },
  {
    id: '2', type: 'weekly',
    title: 'Weekly Report Reminder',
    body: 'System performance logs for last week are ready for export and review.',
    timestamp: new Date('2026-03-09T08:00:00').getTime(),
    read: true,
  },
  {
    id: '3', type: 'monthly',
    title: 'Monthly Report Reminder',
    body: 'Complete monthly temperature trend analysis is available for download.',
    timestamp: new Date('2026-03-01T09:15:00').getTime(),
    read: true,
  },
  {
    id: '4', type: 'weekly',
    title: 'Weekly Report Reminder',
    body: "It's time to generate your weekly temperature report.",
    timestamp: new Date('2026-02-23T08:00:00').getTime(),
    read: true,
  },
  {
    id: '5', type: 'weekly',
    title: 'Weekly Report Reminder',
    body: "It's time to generate your weekly temperature report.",
    timestamp: new Date('2026-02-16T08:00:00').getTime(),
    read: true,
  },
];

function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 2 * 60 * 1000) return 'JUST NOW';
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }) +
    ' — ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
}

// ── Animated notification row ─────────────────────────────────────────────────
function NotifRow({
  item, index, onDelete,
}: { item: Notification; index: number; onDelete: (id: string) => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const deleteAnim = useRef(new Animated.Value(1)).current;
  const deleteHeight = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 350, delay: index * 70, useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0, friction: 8, tension: 60, delay: index * 70, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleDelete = () => {
    Animated.parallel([
      Animated.timing(deleteAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(deleteHeight, { toValue: 0, duration: 300, delay: 200, useNativeDriver: true }),
    ]).start(() => onDelete(item.id));
  };

  const timeStr = formatTimestamp(item.timestamp);
  const isJustNow = timeStr === 'JUST NOW';
  const iconBg = item.type === 'monthly' ? '#EDE9FE' : '#EEF0FB';
  const iconColor = item.type === 'monthly' ? '#7C3AED' : '#5C6BC0';
  const iconName = item.type === 'monthly' ? 'bar-chart-outline' : 'calendar-outline';

  return (
    <Animated.View style={{
      opacity: Animated.multiply(fadeAnim, deleteAnim),
      transform: [
        { translateY: slideAnim },
        { scaleY: deleteHeight },
      ],
    }}>
      <View style={styles.item}>
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName as any} size={20} color={iconColor} />
        </View>
        <View style={styles.itemBody}>
          <View style={styles.itemTitleRow}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            {isJustNow && <Text style={styles.justNow}>JUST NOW</Text>}
          </View>
          <Text style={styles.itemText}>{item.body}</Text>
          {!isJustNow && <Text style={styles.itemTime}>{timeStr}</Text>}
        </View>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={18} color="#C4C4C4" />
        </TouchableOpacity>
      </View>
      <View style={styles.separator} />
    </Animated.View>
  );
}

// ── Animated tab pill ─────────────────────────────────────────────────────────
function TabBar({ tab, onSelect }: { tab: 'all' | 'unread'; onSelect: (t: 'all' | 'unread') => void }) {
  const pillX = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    Animated.spring(pillX, {
      toValue: tab === 'all' ? 0 : containerWidth / 2,
      friction: 8, tension: 70, useNativeDriver: true,
    }).start();
  }, [tab, containerWidth]);

  return (
    <View
      style={styles.tabRow}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.tabPill,
            { width: containerWidth / 2 - 4, transform: [{ translateX: pillX }] },
          ]}
        />
      )}
      {(['all', 'unread'] as const).map(t => (
        <TouchableOpacity key={t} style={styles.tab} onPress={() => onSelect(t)} activeOpacity={0.7}>
          <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
            {t === 'all' ? 'All' : 'Unread'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function NotificationsScreen({ navigation }: any) {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(headerY, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
    ]).start();
  }, []);

  const displayed = tab === 'unread' ? notifications.filter(n => !n.read) : notifications;

  const deleteNotif = (id: string) =>
    setNotifications(prev => prev.filter(n => n.id !== id));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerY }] }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 44 }} />
      </Animated.View>

      <TabBar tab={tab} onSelect={setTab} />

      <FlatList
        data={displayed}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyText}>No notifications</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <NotifRow item={item} index={index} onDelete={deleteNotif} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0',
  },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F4F6FB', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  tabRow: {
    flexDirection: 'row', margin: 16, marginBottom: 8,
    backgroundColor: '#F4F6FB', borderRadius: 12, padding: 4,
    position: 'relative',
  },
  tabPill: {
    position: 'absolute', top: 4, left: 4, bottom: 4,
    backgroundColor: '#5C6BC0', borderRadius: 10,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', zIndex: 1 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  tabTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F0F0', marginVertical: 2 },
  item: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  itemBody: { flex: 1, gap: 3 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  justNow: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },
  itemText: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  itemTime: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  deleteBtn: { padding: 4, marginTop: 2 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
});
