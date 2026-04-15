export type ReminderFrequency = 'daily' | 'weekly' | 'monthly';

export interface Reminder {
  reminder_id?: number;
  frequency: ReminderFrequency;
  last_sent?: number | null;
  is_active: boolean;
}
