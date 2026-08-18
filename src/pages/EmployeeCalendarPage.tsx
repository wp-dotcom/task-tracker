import { useState } from 'react';
import { useTasks } from '../context/TasksContext';
import { useCalendarEvents } from '../context/CalendarEventsContext';
import TaskCalendar from '../components/TaskCalendar';
import TaskFormModal from '../components/TaskFormModal';
import TaskDetailsModal from '../components/TaskDetailsModal';
import CalendarEventFormModal from '../components/CalendarEventFormModal';
import CalendarEventDetailsModal from '../components/CalendarEventDetailsModal';
import { CalendarSkeleton } from '../components/Skeleton';
import type { CalendarEventWithCreator, TaskWithProfiles } from '../types';

export default function EmployeeCalendarPage() {
  const { tasks, loading, error } = useTasks();
  const { calendarEvents, error: calendarEventsError } = useCalendarEvents();
  const [selectedTask, setSelectedTask] = useState<TaskWithProfiles | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formDefaultDate, setFormDefaultDate] = useState<string | undefined>(undefined);
  const [formDefaultTime, setFormDefaultTime] = useState<string | undefined>(undefined);

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
    <div className="page">
      <div className="page-header">
        <h1>Calendar</h1>
        <div className="page-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => openAddCalendarEvent()}>
            + Appointment/Delivery
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openAddTask()}>
            + Add Task
          </button>
        </div>
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
          editable={false}
          onSelectTask={setSelectedTask}
          onSelectCalendarEvent={setSelectedCalendarEvent}
          onDateClick={(dateStr, timeStr) => openAddTask(dateStr, timeStr)}
          onCalendarEventDateClick={(dateStr, timeStr) => openAddCalendarEvent(dateStr, timeStr)}
          initialView="timeGridWeek"
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
