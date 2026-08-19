import type { Profile } from '../types';

/**
 * A small fixed categorical palette (8 slots) used to give each employee a
 * consistent color for quick visual scanning — the "which task is whose"
 * badge on the admin Tasks page and the desktop calendar. Slot N's actual
 * colors live in src/index.css as --employee-color-1..8 (light and dark
 * variants); this file only decides WHICH slot an employee gets.
 *
 * Slot assignment is by account creation order (profiles.created_at), not
 * alphabetical order or a hash of the id — so renaming an employee never
 * reshuffles anyone's color, and a brand-new hire is simply appended at the
 * end rather than bumping existing employees into different slots. Beyond 8
 * employees, slots repeat (color becomes a soft hint, not the only signal —
 * the initials and full name are always shown alongside it too).
 */
export const EMPLOYEE_BADGE_SLOT_COUNT = 8;

export function employeeColorSlot(employeeId: string, employees: Profile[]): number {
  const sorted = [...employees].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const idx = sorted.findIndex((e) => e.id === employeeId);
  return idx === -1 ? 0 : idx % EMPLOYEE_BADGE_SLOT_COUNT;
}

/** "Evan Smith" -> "ES"; a single-word name uses its first two letters ("Evan" -> "EV"). */
export function employeeInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
