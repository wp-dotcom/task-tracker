import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg, DateSelectArg, EventContentArg } from '@fullcalendar/core';
import type { CalendarEventWithCreator, TaskWithProfiles } from '../types';
import { useTasks } from '../context/TasksContext';
import { useUrgency } from '../context/UrgencyContext';
import { formatDueDate, toLocalHHMM, toLocalISODate } from '../lib/dates';
import { getErrorMessage } from '../lib/errors';
import { CALENDAR_EVENT_META } from '../lib/calendarEventMeta';
import ConfirmDialog from './ConfirmDialog';
import MobileAgendaCalendar from './MobileAgendaCalendar';

interface TaskCalendarProps {
  tasks: TaskWithProfiles[];
  /** Shared appointments/deliveries — shown alongside tasks, view-only here
   * (opening one calls onSelectCalendarEvent; edit/delete happens in that
   * details view, not via drag-and-drop). */
  calendarEvents?: CalendarEventWithCreator[];
  editable: boolean;
  onSelectTask: (task: TaskWithProfiles) => void;
  onSelectCalendarEvent?: (event: CalendarEventWithCreator) => void;
  /**
   * Fired when the admin clicks a date (month view) or a specific time slot
   * (week/day view) to start a new task. `timeStr` ("HH:MM") is only set
   * when the click landed on a specific time, not a whole-day cell. Only
   * pass this for users who can create tasks (admins) — when it's provided
   * alongside onCalendarEventDateClick, clicking a date/time shows a small
   * "Task or Appointment/Delivery?" chooser instead of jumping straight to
   * one or the other.
   */
  onDateClick?: (dateStr: string, timeStr?: string) => void;
  /**
   * Fired when a date/time is clicked to start a new appointment/delivery.
   * Pass this for anyone who can add one (everyone, admin or employee).
   */
  onCalendarEventDateClick?: (dateStr: string, timeStr?: string) => void;
  /** Which FullCalendar view to open on. Defaults to the month grid. */
  initialView?: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
}

interface QuickCreateState {
  dateStr: string;
  timeStr?: string;
  x: number;
  y: number;
}

interface PendingReschedule {
  task: TaskWithProfiles;
  newDate: string;
  /** "HH:MM:SS" if the event has (or picked up) a specific time, else undefined to leave due_time unchanged. */
  newTime?: string;
  revert: () => void;
}

function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

// Below this width, FullCalendar's grid (even a single day's worth of hourly
// slots) doesn't read well on a phone — event text gets cramped no matter
// the view. Below this width we swap FullCalendar out entirely for
// MobileAgendaCalendar: a compact month/week grid with small dot indicators
// (Apple Calendar's pattern) and the selected day's items listed below it.
// Only decided once, from the screen size when the calendar first mounts —
// rotating the phone or resizing a desktop window afterward doesn't yank the
// layout out from under you.
const MOBILE_BREAKPOINT_PX = 640;

function isNarrowScreen(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT_PX;
}

/** Shows the task title plus the start of its instructions, so the admin/
 * employee can get the gist without opening the task. Month-view cells are
 * narrower, so we keep the preview shorter there than in week/day view.
 * The urgency icon (not just the event's colour) is shown next to the
 * title so urgency is never communicated by colour alone. */
function renderTaskEventContent(arg: EventContentArg) {
  const { task, urgencyIcon, urgencyLabel } = arg.event.extendedProps as {
    task: TaskWithProfiles;
    urgencyIcon: string;
    urgencyLabel: string;
  };
  const maxLength = arg.view.type === 'dayGridMonth' ? 40 : 90;
  const descriptionPreview = task.description ? truncate(task.description, maxLength) : '';

  return (
    <div className="fc-task-content">
      {arg.timeText && <div className="fc-task-time">{arg.timeText}</div>}
      <div className="fc-task-title-line">
        <span className="fc-task-urgency-icon" aria-label={`${urgencyLabel} urgency`} title={`${urgencyLabel} urgency`}>
          {urgencyIcon}
        </span>
        {task.recurrence_id && (
          <span className="fc-task-repeat-icon" aria-label="Repeating task" title="Repeating task">
            🔁
          </span>
        )}
        {task.title}
      </div>
      {descriptionPreview && <div className="fc-task-desc-line">{descriptionPreview}</div>}
    </div>
  );
}

/** Shows the appointment/delivery's title with its type icon and, always,
 * who added it — the whole point being it's easy to tell at a glance. */
function renderCalendarEventContent(arg: EventContentArg) {
  const { event: calEvent } = arg.event.extendedProps as { event: CalendarEventWithCreator };
  const meta = CALENDAR_EVENT_META[calEvent.event_type];
  const addedBy = calEvent.creator?.full_name ?? 'Unknown';

  return (
    <div className="fc-task-content">
      {arg.timeText && <div className="fc-task-time">{arg.timeText}</div>}
      <div className="fc-task-title-line">
        <span className="fc-task-urgency-icon" aria-label={meta.label} title={meta.label}>
          {meta.icon}
        </span>
        {calEvent.title}
      </div>
      <div className="fc-task-desc-line fc-calendar-event-by">— {addedBy}</div>
    </div>
  );
}

function renderEventContent(arg: EventContentArg) {
  const kind = arg.event.extendedProps.kind as 'task' | 'calendar_event';
  return kind === 'calendar_event' ? renderCalendarEventContent(arg) : renderTaskEventContent(arg);
}

export default function TaskCalendar({
  tasks,
  calendarEvents = [],
  editable,
  onSelectTask,
  onSelectCalendarEvent,
  onDateClick,
  onCalendarEventDateClick,
  initialView = 'dayGridMonth',
}: TaskCalendarProps) {
  const { rescheduleTask } = useTasks();
  const { urgencyMeta } = useUrgency();
  const calendarRef = useRef<FullCalendar | null>(null);
  const [pending, setPending] = useState<PendingReschedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [isMobile] = useState(() => isNarrowScreen());

  const canCreateTask = Boolean(onDateClick);
  const canCreateCalendarEvent = Boolean(onCalendarEventDateClick);
  const canQuickCreate = canCreateTask || canCreateCalendarEvent;

  useEffect(() => {
    if (!quickCreate) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setQuickCreate(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [quickCreate]);

  const events = useMemo(() => {
    const taskEvents = tasks.map((task) => {
      const meta = urgencyMeta[task.urgency];
      const hasTime = Boolean(task.due_time);
      return {
        id: `task-${task.id}`,
        title: task.title,
        start: hasTime ? `${task.due_date}T${task.due_time!.slice(0, 5)}` : task.due_date,
        allDay: !hasTime,
        backgroundColor: task.status === 'completed' ? '#eef0f3' : meta.background,
        borderColor: task.status === 'completed' ? '#d8dce2' : meta.color,
        textColor: task.status === 'completed' ? '#8a8f98' : meta.color,
        classNames: [
          'fc-task-event',
          `fc-task-urgency-${task.urgency}`,
          task.status === 'completed' ? 'fc-task-completed' : '',
          !task.first_viewed_at && task.status !== 'completed' ? 'fc-task-unviewed' : '',
        ].filter(Boolean),
        extendedProps: { kind: 'task' as const, task, urgencyIcon: meta.icon, urgencyLabel: meta.label },
      };
    });

    // Appointments/deliveries are shown but never draggable — editing a
    // date/time goes through the details modal's Edit button instead, so a
    // stray drag can't silently move someone else's appointment.
    const calEvents = calendarEvents.map((calEvent) => {
      const meta = CALENDAR_EVENT_META[calEvent.event_type];
      const hasTime = Boolean(calEvent.event_time);
      return {
        id: `cal-${calEvent.id}`,
        title: calEvent.title,
        start: hasTime ? `${calEvent.event_date}T${calEvent.event_time!.slice(0, 5)}` : calEvent.event_date,
        allDay: !hasTime,
        backgroundColor: meta.background,
        borderColor: meta.color,
        textColor: meta.color,
        editable: false,
        startEditable: false,
        classNames: ['fc-task-event', `fc-calendar-event-${calEvent.event_type}`],
        extendedProps: { kind: 'calendar_event' as const, event: calEvent },
      };
    });

    return [...taskEvents, ...calEvents];
  }, [tasks, calendarEvents, urgencyMeta]);

  function handleEventClick(arg: EventClickArg) {
    const kind = arg.event.extendedProps.kind as 'task' | 'calendar_event';
    if (kind === 'calendar_event') {
      onSelectCalendarEvent?.(arg.event.extendedProps.event as CalendarEventWithCreator);
      return;
    }
    onSelectTask(arg.event.extendedProps.task as TaskWithProfiles);
  }

  function handleEventDrop(arg: EventDropArg) {
    const kind = arg.event.extendedProps.kind as 'task' | 'calendar_event';
    if (kind === 'calendar_event') {
      // Not draggable (editable/startEditable: false above), but guard and
      // revert defensively in case FullCalendar's behaviour ever changes.
      arg.revert();
      return;
    }
    const task = arg.event.extendedProps.task as TaskWithProfiles;
    const start = arg.event.start;
    if (!start) return;
    const newDate = toLocalISODate(start);
    // Only a timed event (one with a specific time slot) carries a new time;
    // an all-day event's due_time is left untouched.
    const newTime = arg.event.allDay ? undefined : `${toLocalHHMM(start)}:00`;
    setPending({ task, newDate, newTime, revert: arg.revert });
  }

  // When only one of task/appointment creation is available, skip the
  // chooser and go straight there (one less click) — e.g. an employee only
  // ever gets onCalendarEventDateClick, so their click always means "new
  // appointment/delivery," exactly like an admin's click always means "new
  // task" today. Only show the popover when there's a real choice to make.
  function triggerQuickCreate(dateStr: string, timeStr: string | undefined, jsEvent: MouseEvent | null) {
    if (canCreateTask && canCreateCalendarEvent) {
      const x = Math.min(jsEvent?.clientX ?? window.innerWidth / 2, window.innerWidth - 220);
      const y = Math.min(jsEvent?.clientY ?? window.innerHeight / 2, window.innerHeight - 110);
      setQuickCreate({ dateStr, timeStr, x: Math.max(x, 8), y: Math.max(y, 8) });
    } else if (canCreateTask) {
      onDateClick?.(dateStr, timeStr);
    } else if (canCreateCalendarEvent) {
      onCalendarEventDateClick?.(dateStr, timeStr);
    }
  }

  function handleDateClick(arg: DateClickArg) {
    // arg.date is a real local Date, so we read hours/minutes straight off
    // it rather than parsing dateStr (safer across timezones). allDay is
    // true for month-view day cells and false for a specific time slot in
    // week/day view.
    const dateStr = toLocalISODate(arg.date);
    const timeStr = arg.allDay ? undefined : toLocalHHMM(arg.date);
    triggerQuickCreate(dateStr, timeStr, arg.jsEvent);
  }

  function handleSelect(arg: DateSelectArg) {
    const dateStr = toLocalISODate(arg.start);
    const timeStr = arg.allDay ? undefined : toLocalHHMM(arg.start);
    triggerQuickCreate(dateStr, timeStr, arg.jsEvent);
    calendarRef.current?.getApi().unselect();
  }

  function chooseTask() {
    if (!quickCreate) return;
    onDateClick?.(quickCreate.dateStr, quickCreate.timeStr);
    setQuickCreate(null);
  }

  function chooseCalendarEvent() {
    if (!quickCreate) return;
    onCalendarEventDateClick?.(quickCreate.dateStr, quickCreate.timeStr);
    setQuickCreate(null);
  }

  async function confirmReschedule() {
    if (!pending || saving) return;
    setError(null);
    setSaving(true);
    try {
      await rescheduleTask(pending.task.id, pending.newDate, pending.newTime);
      setPending(null);
    } catch (err) {
      setError(getErrorMessage(err));
      pending.revert();
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  function cancelReschedule() {
    pending?.revert();
    setPending(null);
  }

  return (
    <div className="task-calendar">
      {error && (
        <div role="alert" className="form-error calendar-error">
          {error}
        </div>
      )}
      {isMobile ? (
        <MobileAgendaCalendar
          tasks={tasks}
          calendarEvents={calendarEvents}
          onSelectTask={onSelectTask}
          onSelectCalendarEvent={onSelectCalendarEvent}
          onAddForDate={canQuickCreate ? (dateStr) => triggerQuickCreate(dateStr, undefined, null) : undefined}
        />
      ) : (
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={initialView}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          height="auto"
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          events={events}
          eventContent={renderEventContent}
          eventDisplay="block"
          editable={editable}
          eventStartEditable={editable}
          selectable={canQuickCreate}
          select={canQuickCreate ? handleSelect : undefined}
          dateClick={canQuickCreate ? handleDateClick : undefined}
          eventClick={handleEventClick}
          eventDrop={editable ? handleEventDrop : undefined}
          dayMaxEvents={3}
          firstDay={0}
        />
      )}

      {quickCreate && (
        <>
          <div
            className="quick-create-backdrop"
            role="presentation"
            onClick={() => setQuickCreate(null)}
          />
          <div
            className="quick-create-menu"
            role="menu"
            style={{ left: quickCreate.x, top: quickCreate.y }}
          >
            {canCreateTask && (
              <button type="button" role="menuitem" className="quick-create-option" onClick={chooseTask}>
                + Task
              </button>
            )}
            {canCreateCalendarEvent && (
              <button
                type="button"
                role="menuitem"
                className="quick-create-option"
                onClick={chooseCalendarEvent}
              >
                + Appointment/Delivery
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title="Move this task?"
        message={
          pending
            ? `Move "${pending.task.title}" to ${formatDueDate(pending.newDate)}?`
            : ''
        }
        confirmLabel={saving ? 'Moving...' : 'Move task'}
        busy={saving}
        onConfirm={confirmReschedule}
        onCancel={cancelReschedule}
      />
    </div>
  );
}
