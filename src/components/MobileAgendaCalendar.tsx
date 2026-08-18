import { useMemo, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import type { CalendarEventWithCreator, TaskWithProfiles } from '../types';
import { useUrgency } from '../context/UrgencyContext';
import { CALENDAR_EVENT_META } from '../lib/calendarEventMeta';
import { formatDueTime, parseLocalDate, toLocalISODate, todayLocalISODate } from '../lib/dates';
import TaskCard from './TaskCard';

interface MobileAgendaCalendarProps {
  tasks: TaskWithProfiles[];
  calendarEvents: CalendarEventWithCreator[];
  onSelectTask: (task: TaskWithProfiles) => void;
  onSelectCalendarEvent?: (event: CalendarEventWithCreator) => void;
  /** Opens the "Task or Appointment/Delivery?" quick-create chooser for a date. */
  onAddForDate?: (dateStr: string) => void;
}

interface DayBucket {
  tasks: TaskWithProfiles[];
  events: CalendarEventWithCreator[];
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfMonthGrid(date: Date): Date {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const monthYearFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const agendaDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/**
 * A compact month/week grid with small dot indicators (no crammed-in event
 * text) plus a scrollable agenda list of the selected day's tasks and
 * appointments/deliveries below it — the core Apple Calendar mobile pattern.
 * Swap in for the full FullCalendar grid below MOBILE_BREAKPOINT_PX (see
 * TaskCalendar.tsx); FullCalendar's month/week/day grid still handles
 * desktop/tablet, where there's room for event text inline.
 */
export default function MobileAgendaCalendar({
  tasks,
  calendarEvents,
  onSelectTask,
  onSelectCalendarEvent,
  onAddForDate,
}: MobileAgendaCalendarProps) {
  const { urgencyMeta } = useUrgency();
  const today = todayLocalISODate();
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [focusedDate, setFocusedDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const touchStartX = useRef<number | null>(null);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, DayBucket>();
    function bucket(dateStr: string): DayBucket {
      let b = map.get(dateStr);
      if (!b) {
        b = { tasks: [], events: [] };
        map.set(dateStr, b);
      }
      return b;
    }
    tasks.forEach((t) => bucket(t.due_date).tasks.push(t));
    calendarEvents.forEach((e) => bucket(e.event_date).events.push(e));
    return map;
  }, [tasks, calendarEvents]);

  const gridDays = useMemo(() => {
    const start = mode === 'month' ? startOfMonthGrid(focusedDate) : startOfWeek(focusedDate);
    const count = mode === 'month' ? 42 : 7;
    return Array.from({ length: count }, (_, i) => addDays(start, i));
  }, [mode, focusedDate]);

  const monthLabel = monthYearFormatter.format(focusedDate);

  function go(delta: number) {
    setFocusedDate((d) =>
      mode === 'month' ? new Date(d.getFullYear(), d.getMonth() + delta, 1) : addDays(d, delta * 7),
    );
  }

  function goToday() {
    const now = new Date();
    setFocusedDate(now);
    setSelectedDate(toLocalISODate(now));
  }

  function selectDay(d: Date) {
    setSelectedDate(toLocalISODate(d));
    // Tapping a greyed-out adjacent-month day (month mode) re-centers the
    // grid on that month, matching Apple Calendar's behavior.
    if (mode === 'month' && d.getMonth() !== focusedDate.getMonth()) {
      setFocusedDate(d);
    }
  }

  // Basic left/right swipe to page between months/weeks, for a native feel —
  // no library, just a distance threshold on touchstart/touchend.
  function handleTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function handleTouchEnd(e: TouchEvent) {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 40) go(delta > 0 ? -1 : 1);
  }

  const selected = itemsByDate.get(selectedDate) ?? { tasks: [], events: [] };
  const agendaLabel = agendaDateFormatter.format(parseLocalDate(selectedDate));
  const sortedEvents = [...selected.events].sort((a, b) =>
    (a.event_time ?? '').localeCompare(b.event_time ?? ''),
  );
  const sortedTasks = [...selected.tasks].sort((a, b) => (a.due_time ?? '').localeCompare(b.due_time ?? ''));
  const hasItems = sortedEvents.length > 0 || sortedTasks.length > 0;

  return (
    <div className="apple-calendar">
      <div className="apple-calendar-header">
        <button type="button" className="apple-calendar-nav" aria-label="Previous" onClick={() => go(-1)}>
          ‹
        </button>
        <div className="apple-calendar-title-group">
          <span className="apple-calendar-title">{monthLabel}</span>
          {selectedDate !== today && (
            <button type="button" className="apple-calendar-today" onClick={goToday}>
              Today
            </button>
          )}
        </div>
        <button type="button" className="apple-calendar-nav" aria-label="Next" onClick={() => go(1)}>
          ›
        </button>
      </div>

      <div className="apple-calendar-mode-toggle" role="group" aria-label="Calendar view">
        <button
          type="button"
          className={`apple-calendar-mode-btn${mode === 'month' ? ' active' : ''}`}
          onClick={() => setMode('month')}
        >
          Month
        </button>
        <button
          type="button"
          className={`apple-calendar-mode-btn${mode === 'week' ? ' active' : ''}`}
          onClick={() => setMode('week')}
        >
          Week
        </button>
      </div>

      <div className="apple-calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>

      <div
        className={`apple-calendar-grid apple-calendar-grid-${mode}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {gridDays.map((d) => {
          const dateStr = toLocalISODate(d);
          const items = itemsByDate.get(dateStr);
          const dots: string[] = [];
          items?.tasks.forEach((t) => dots.push(urgencyMeta[t.urgency].color));
          items?.events.forEach((e) => dots.push(CALENDAR_EVENT_META[e.event_type].color));
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const isOutside = mode === 'month' && d.getMonth() !== focusedDate.getMonth();

          return (
            <button
              type="button"
              key={dateStr}
              className={`apple-calendar-day${isOutside ? ' outside' : ''}`}
              onClick={() => selectDay(d)}
            >
              <span
                className={`apple-calendar-day-number${isSelected ? ' selected' : ''}${
                  isToday && !isSelected ? ' today' : ''
                }`}
              >
                {d.getDate()}
              </span>
              <span className="apple-calendar-day-dots">
                {dots.slice(0, 4).map((color, i) => (
                  <span key={i} className="apple-calendar-dot" style={{ background: color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="apple-agenda">
        <div className="apple-agenda-header">
          <span className="apple-agenda-date">{agendaLabel}</span>
          {onAddForDate && (
            <button
              type="button"
              className="apple-agenda-add"
              aria-label="Add task or appointment for this day"
              onClick={() => onAddForDate(selectedDate)}
            >
              +
            </button>
          )}
        </div>

        {!hasItems && <p className="apple-agenda-empty">Nothing scheduled.</p>}

        {hasItems && (
          <div className="apple-agenda-list">
            {sortedEvents.map((event) => {
              const meta = CALENDAR_EVENT_META[event.event_type];
              return (
                <button
                  type="button"
                  key={`event-${event.id}`}
                  className="apple-agenda-item"
                  onClick={() => onSelectCalendarEvent?.(event)}
                >
                  <span className="apple-agenda-item-bar" style={{ background: meta.color }} aria-hidden="true" />
                  <span className="apple-agenda-item-main">
                    <span className="apple-agenda-item-title">
                      <span aria-hidden="true">{meta.icon} </span>
                      {event.title}
                    </span>
                    <span className="apple-agenda-item-sub">
                      {event.event_time ? formatDueTime(event.event_time) : 'All day'} · {meta.label} —{' '}
                      {event.creator?.full_name ?? 'Unknown'}
                    </span>
                  </span>
                </button>
              );
            })}
            {sortedTasks.map((task) => (
              <TaskCard key={`task-${task.id}`} task={task} onClick={() => onSelectTask(task)} showAssignee />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
