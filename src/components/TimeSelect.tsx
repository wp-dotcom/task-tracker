import { useMemo } from 'react';
import Dropdown from './Dropdown';

interface TimeOption {
  value: string; // "HH:MM", 24-hour
  label: string; // e.g. "2:30 PM"
}

const INCREMENT_MINUTES = 15;

function formatLabel(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

// Tasks can only be timed between 8:00 AM and 8:00 PM, inclusive.
const MIN_HOUR = 8;
const MAX_HOUR = 20;

function buildTimeOptions(): TimeOption[] {
  const options: TimeOption[] = [];
  for (let hour = MIN_HOUR; hour <= MAX_HOUR; hour++) {
    const maxMinute = hour === MAX_HOUR ? 0 : 59;
    for (let minute = 0; minute <= maxMinute; minute += INCREMENT_MINUTES) {
      const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      options.push({ value, label: formatLabel(hour, minute) });
    }
  }
  return options;
}

const TIME_OPTIONS = buildTimeOptions();

interface TimeSelectProps {
  id?: string;
  /** "" for no time selected, otherwise "HH:MM" (24-hour). */
  value: string;
  onChange: (value: string) => void;
  /** Shown as the empty option; omit to make picking a time required. */
  emptyLabel?: string;
  className?: string;
  'aria-label'?: string;
}

/** A dropdown for picking a time of day in 15-minute increments. */
export default function TimeSelect({
  id,
  value,
  onChange,
  emptyLabel = 'No time set',
  className = '',
  'aria-label': ariaLabel,
}: TimeSelectProps) {
  // If the current value doesn't land on a 15-minute boundary (e.g. a task
  // was created some other way with an odd time), keep it selectable rather
  // than silently snapping it to the nearest option when the form re-renders.
  const options = useMemo(() => {
    if (!value || TIME_OPTIONS.some((opt) => opt.value === value)) return TIME_OPTIONS;
    const [h, m] = value.split(':').map(Number);
    const custom: TimeOption = { value, label: formatLabel(h ?? 0, m ?? 0) };
    return [...TIME_OPTIONS, custom].sort((a, b) => a.value.localeCompare(b.value));
  }, [value]);

  const dropdownOptions = useMemo(
    () => [{ value: '', label: emptyLabel }, ...options.map((opt) => ({ value: opt.value, label: opt.label }))],
    [options, emptyLabel],
  );

  return (
    <Dropdown
      id={id}
      className={className}
      value={value}
      onChange={onChange}
      options={dropdownOptions}
      placeholder={emptyLabel}
      aria-label={ariaLabel}
    />
  );
}
