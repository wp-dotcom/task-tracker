import { useState } from 'react';
import { useTasks } from '../context/TasksContext';
import { useCalendarEvents } from '../context/CalendarEventsContext';
import { useEmployees } from '../hooks/useEmployees';
import TaskCalendar from './TaskCalendar';
import TaskFormModal from './TaskFormModal';
import TaskDetailsModal from './TaskDetailsModal';
import CalendarEventFormModal from './CalendarEventFormModal';
import CalendarEventDetailsModal from './CalendarEventDetailsModal';
import { CalendarSkeleton } from './Skeleton';
import type { CalendarEventWithCreator, TaskWithProfiles } from '../types';

/**
 * The full interactive admin calendar — task/appointment quick-add,
 * drag-to-reschedule, click-through to details — as its own self-contained
 * piece. Originally lived directly in AdminCalendarPage; pulled out here so
 * the Dashboard page can embed the exact same live calendar (not a
 * read-only preview) without duplicating all of this state and wiring.
 */
export default function AdminTaskCalendarPanel() {
  const { tasks, loading, error } = useTasks();
  const { calendarEvents, error: calendarEventsError } = useCalendarEvents();
  const { employees } = useEmployees();
  const [formOpen, setFormOpen] = useState(false);
  const [formDefaultDate, setFormDefaultDate] = useState<string | undefined>(undefined);
  const [formDefaultTime, setFormDefaultTime] = useState<string | undefined>(undefined);
  const [selectedTask, setSelectedTask] = useState<TaskWithProfiles | null>(null);

  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventFormDefaultDate, setEventFormDefaultDate] = useState<string | undefined>(undefined);
  const [eventFormDefaultTime, setEventFormDefaultTime] = useState<string | undefined>(undefined);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<CalendarEventWithCreator | null>(
    null,
  );

  function openAddTask(dateStr?: string, timeStr?: string) {
    setFormDefaultDate(dateStr);
    setFormDefaultTime(timeStr);
    setFormOpen(true);
  }

  function openAddCalendarEvent(dateStr?: string, timeStr?: string) {
    setEventFormDefaultDate(dateStr);
    setEventFormDefaultTime(timeStr);
    setEventFormOpen(true);
  }

  return (
    <div className="admin-calendar-panel">
      <div className="admin-calendar-panel-actions">
        <button type="button" className="btn btn-secondary" onClick={() => openAddCalendarEvent()}>
          + Appointment/Delivery
        </button>
        <button type="button" className="btn btn-primary" onClick={() => openAddTask()}>
          + Add Task
        </button>
      </div>

      {(error || calendarEventsError) && (
        <div role="alert" className="form-error">
          {error || calendarEventsError}
        </div>
      )}

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <TaskCalendar
          tasks={tasks}
          calendarEvents={calendarEvents}
          editable
          onSelectTask={setSelectedTask}
          onSelectCalendarEvent={setSelectedCalendarEvent}
          onDateClick={(dateStr, timeStr) => openAddTask(dateStr, timeStr)}
          onCalendarEventDateClick={(dateStr, timeStr) => openAddCalendarEvent(dateStr, timeStr)}
          showAssigneeBadges
          employees={employees}
        />
      )}

      <TaskFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        defaultDate={formDefaultDate}
        defaultTime={formDefaultTime}
      />

      <TaskDetailsModal task={selectedTask} onClose={() => setSelectedTask(null)} />

      <CalendarEventFormModal
        open={eventFormOpen}
        onClose={() => setEventFormOpen(false)}
        defaultDate={eventFormDefaultDate}
        defaultTime={eventFormDefaultTime}
      />

      <CalendarEventDetailsModal
        event={selectedCalendarEvent}
        onClose={() => setSelectedCalendarEvent(null)}
      />
    </div>
  );
}
