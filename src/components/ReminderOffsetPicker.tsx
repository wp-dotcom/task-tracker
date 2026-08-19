import { REMINDER_OFFSET_OPTIONS } from '../lib/reminders';

interface ReminderOffsetPickerProps {
  /** Which offsets (in minutes) are currently selected. */
  value: number[];
  onToggle: (offsetMinutes: number, nextSelected: boolean) => void;
  disabled?: boolean;
  /** Offsets currently being saved/removed — shown as a brief busy state per chip. */
  pendingOffsets?: number[];
}

/**
 * A row of toggleable pills for picking one or more "remind me before it's
 * due" offsets — reuses the same look as the status filter chips
 * (.filter-chip/.filter-chip.active) rather than native checkboxes, to
 * match the rest of the app's custom-built form controls.
 */
export default function ReminderOffsetPicker({
  value,
  onToggle,
  disabled = false,
  pendingOffsets = [],
}: ReminderOffsetPickerProps) {
  return (
    <div className="filter-chips" role="group" aria-label="Reminder offsets">
      {REMINDER_OFFSET_OPTIONS.map((opt) => {
        const selected = value.includes(opt.minutes);
        const pending = pendingOffsets.includes(opt.minutes);
        return (
          <button
            key={opt.minutes}
            type="button"
            className={`filter-chip${selected ? ' active' : ''}`}
            aria-pressed={selected}
            disabled={disabled || pending}
            onClick={() => onToggle(opt.minutes, !selected)}
          >
            {pending ? '...' : opt.label}
          </button>
        );
      })}
    </div>
  );
}
