import type { CalendarEventType } from '../types';

export interface CalendarEventMeta {
  label: string;
  icon: string;
  color: string;
  background: string;
}

// Deliberately neutral/slate tones, distinct from both the urgency palette
// (green/blue/orange/red) and the unviewed-task purple, since these entries
// aren't urgency-rated tasks — they're just shared logistics info.
export const CALENDAR_EVENT_META: Record<CalendarEventType, CalendarEventMeta> = {
  appointment: { label: 'Appointment', icon: '🗓️', color: '#475569', background: '#4755691c' },
  delivery: { label: 'Delivery', icon: '📦', color: '#78716c', background: '#78716c1c' },
};

export const CALENDAR_EVENT_TYPES: CalendarEventType[] = ['appointment', 'delivery'];
