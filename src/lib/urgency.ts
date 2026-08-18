import type { TaskUrgency } from '../types';

/**
 * Urgency colour + label + icon, used consistently everywhere a task's
 * urgency is shown. Colour is admin-customizable (see UrgencyContext /
 * urgency_settings table) but label + icon are fixed, so the app never
 * relies on colour alone to communicate urgency.
 */
export interface UrgencyMeta {
  label: string;
  color: string; // accent colour, used for text/borders
  background: string; // soft tint derived from `color`, used for badge fills
  icon: string;
}

export const URGENCY_LABELS: Record<TaskUrgency, { label: string; icon: string }> = {
  low: { label: 'Low', icon: '○' },
  normal: { label: 'Normal', icon: '◐' },
  high: { label: 'High', icon: '●' },
  urgent: { label: 'Urgent', icon: '❗' },
};

export const DEFAULT_URGENCY_COLORS: Record<TaskUrgency, string> = {
  low: '#1a7f37',
  normal: '#1f6feb',
  high: '#b35900',
  urgent: '#c0192b',
};

export const URGENCY_ORDER: TaskUrgency[] = ['urgent', 'high', 'normal', 'low'];

export function urgencyWeight(urgency: TaskUrgency): number {
  return URGENCY_ORDER.indexOf(urgency);
}

/** Derive a soft ~11% tint from a 6-digit hex colour, for badge backgrounds. */
export function tintFromColor(hexColor: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
    return `${hexColor}1c`;
  }
  return hexColor;
}

/** Build the full label+icon+color+background map from a color-only record (e.g. from the DB). */
export function buildUrgencyMeta(
  colors: Record<TaskUrgency, string>,
): Record<TaskUrgency, UrgencyMeta> {
  const result = {} as Record<TaskUrgency, UrgencyMeta>;
  (Object.keys(URGENCY_LABELS) as TaskUrgency[]).forEach((urgency) => {
    const color = colors[urgency] || DEFAULT_URGENCY_COLORS[urgency];
    result[urgency] = {
      label: URGENCY_LABELS[urgency].label,
      icon: URGENCY_LABELS[urgency].icon,
      color,
      background: tintFromColor(color),
    };
  });
  return result;
}

/** Static defaults — used as the initial value before the live settings load, and as a fallback. */
export const URGENCY_META: Record<TaskUrgency, UrgencyMeta> = buildUrgencyMeta(DEFAULT_URGENCY_COLORS);
