export const COLORS = {
  primary: '#007AFF',
  danger: '#FF3B30',
  warning: '#FF9500',
  success: '#34C759',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#1C1C1E',
  muted: '#8E8E93',
};

export const CATEGORIES = ['freezer', 'fridge', 'cold_room'] as const;

export const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const CACHE_TTL_MS = 10 * 60 * 1000;     // 10 minutes
