import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Animated, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  AppNotification, NotifType,
  getAllNotifications, markAllRead, markNotificationRead,
  deleteNotification, clearAllNotifications,
  scheduleWeeklyReminder, scheduleMonthlyReminder,
} from '../../services/notificationService';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 2 * 60 * 1000) return 'JUST NOW';
  if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400 * 1000) return `${Math.floor(diff / 3600000)} hr ago`;
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }) +
    ' — ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
}

function getIconConfig(type: NotifType): { bg: string; color: string; icon: string } {
  switch (type) {
    case 'incident': return { bg: '#FEE2E2', color: '#EF4444', icon: 'warning-outline' };
    case 'sync':     return { bg: '#DCFCE7', color: '#22C55E', icon: 'sync-outline' };
    case 'weekly':   return { bg: '#EEF0FB', color: '#5C6BC0', icon: 'calendar-outline' };
    case 'monthly':  return { bg: '#EDE9FE', color: '#7C3AED', icon: 'bar-chart-outline' };
    default:         return { bg: '#F0F2FA', color: '#6B7280', icon: 'information-circle-outline' };
  }
}

// ── Animated notification row ─────────────────────────────────────────────────
function NotifRow({
  item, index, onDelete, onRead,
}: {
  item: AppNotification;
  index: number;
  onDelete: (id: number) => void;
  onRead: (id: number) => void;
}) {
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(20)).current;
  const deleteAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleDelete = () => {
    Animated.timing(deleteAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() =>
      onDelete(item.notif_id)
    );
  };

  const cfg      = getIconConfig(item.type as NotifType);
  const timeStr  = formatTimestamp(item.timestamp);
  const isUnread = item.is_read === 0;

  return (
    <Animated.View style={{ opacity: Animated.multiply(fadeAnim, deleteAnim), transform: [{ translateY: slideAnim }] }}>
      <Pressable
        style={[styles.item, isUnread && styles.itemUnread]}
        onPress={() => { if (isUnread) onRead(item.notif_id); }}
      >
        <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
        </View>
        <View style={styles.itemBody}>
          <View style={styles.itemTitleRow}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
            {isUnread && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.itemText}>{item.body}</Text>
          <Text style={styles.itemTime}>{timeStr}</Text>
        </View>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={17} color="#C4C4C4" />
        </TouchableOpacity>
      </Pressable>
      <View style={styles.separator} />
    </Animated.View>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar({
  tab, onSelect, unreadCount,
}: {
  tab: 'all' | 'unread';
  onSelect: (t: 'all' | 'unread') => void;
  unreadCount: number;
}) {
  const pillX = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);

  useEffect(() => {
    Animated.spring(pillX, { toValue: tab === 'all' ? 0 : w / 2, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, [tab, w]);

  return (
    <View style={styles.tabRow} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w > 0 && <Animated.View style={[styles.tabPill, { width: w / 2 - 4, transform: [{ translateX: pillX }] }]} />}
      {(['all', 'unread'] as const).map(t => (
        <TouchableOpacity key={t} style={styles.tab} onPress={() => onSelect(t)} activeOpacity={0.7}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all' ? 'All' : 'Unread'}
            </Text>
            {t === 'unread' && unreadCount > 0 && (
              <View style={[styles.badge, tab === t && styles.badgeActive]}>
                <Text style={[styles.badgeText, tab === t && styles.badgeTextActive]}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function NotificationsScreen({ navigation }: any) {
  const [tab, setTab]                   = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading]           = useState(true);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY       = useRef(new Animated.Value(-16)).current;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllNotifications();
      setNotifications(data);
    } catch (e) {
      console.error('[Notifications] load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(headerY, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
    ]).start();
    load();
  }, []);

  const displayed   = tab === 'unread' ? notifications.filter(n => n.is_read === 0) : notifications;
  const unreadCount = notifications.filter(n => n.is_read === 0).length;

  const handleDelete = async (id: number) => {
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.notif_id !== id));
  };

  const handleRead = async (id: number) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.notif_id === id ? { ...n, is_read: 1 } : n));
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const handleClearAll = () => {
    Alert.alert('Clear All', 'Delete all notifications?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive',
        onPress: async () => {
          await clearAllNotifications();
          setNotifications([]);
        },
      },
    ]);
  };

  const handleReminders = () => {
    Alert.alert(
      'Schedule Reminders',
      'Set up automatic report reminders.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Weekly (Mondays)',
          onPress: async () => {
            await scheduleWeeklyReminder();
            await load();
            Alert.alert('Done', 'Weekly reminder scheduled for every Monday at 08:00.');
          },
        },
        {
          text: 'Monthly (1st)',
          onPress: async () => {
            await scheduleMonthlyReminder();
            await load();
            Alert.alert('Done', 'Monthly reminder scheduled for the 1st of every month at 09:00.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerY }] }]}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={handleMarkAllRead}>
              <Ionicons name="checkmark-done-outline" size={20} color="#5C6BC0" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerBtn} onPress={handleReminders}>
            <Ionicons name="alarm-outline" size={20} color="#5C6BC0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleClearAll}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <TabBar tab={tab} onSelect={setTab} unreadCount={unreadCount} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#5C6BC0" size="large" />
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={item => String(item.notif_id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={44} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptySubtitle}>
                {tab === 'unread'
                  ? 'All caught up! No unread notifications.'
                  : 'Notifications will appear here when devices sync or breach thresholds.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <NotifRow item={item} index={index} onDelete={handleDelete} onRead={handleRead} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0' },
  backBtn:      { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F4F6FB', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  headerBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F4F6FB', alignItems: 'center', justifyContent: 'center' },

  tabRow:       { flexDirection: 'row', margin: 16, marginBottom: 8, backgroundColor: '#F4F6FB', borderRadius: 12, padding: 4, position: 'relative' },
  tabPill:      { position: 'absolute', top: 4, left: 4, bottom: 4, backgroundColor: '#5C6BC0', borderRadius: 10 },
  tab:          { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', zIndex: 1 },
  tabText:      { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  tabTextActive:{ color: '#fff' },
  badge:        { backgroundColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeActive:  { backgroundColor: 'rgba(255,255,255,0.3)' },
  badgeText:    { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  badgeTextActive: { color: '#fff' },

  list:         { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  separator:    { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F0F0', marginVertical: 2 },

  item:         { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 14, gap: 12, borderRadius: 10 },
  itemUnread:   { backgroundColor: '#F8F9FF' },
  iconWrap:     { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  itemBody:     { flex: 1, gap: 3 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle:    { fontSize: 14, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5C6BC0' },
  itemText:     { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  itemTime:     { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  deleteBtn:    { padding: 4, marginTop: 2 },

  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap:    { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: '#374151' },
  emptySubtitle:{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
});
