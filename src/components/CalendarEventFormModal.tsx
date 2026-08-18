import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CalendarEventType, CalendarEventWithCreator } from '../types';
import { useCalendarEvents } from '../context/CalendarEventsContext';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { todayLocalISODate } from '../lib/dates';
import { CALENDAR_EVENT_META, CALENDAR_EVENT_TYPES } from '../lib/calendarEventMeta';
import TimeSelect from './TimeSelect';
import Dropdown from './Dropdown';

interface CalendarEventFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, the modal edits this entry instead of creating a new one. */
  event?: CalendarEventWithCreator | null;
  /** Pre-fill the date, e.g. when created from a calendar date click. */
  defaultDate?: string;
  /** Pre-fill the time ("HH:MM"), e.g. when created from a week/day time-slot click. */
  defaultTime?: string;
}

export default function CalendarEventFormModal({
  open,
  onClose,
  event = null,
  defaultDate,
  defaultTime,
}: CalendarEventFormModalProps) {
  const { createCalendarEvent, updateCalendarEvent } = useCalendarEvents();
  const { showToast } = useToast();

  const [eventType, setEventType] = useState<CalendarEventType>('appointment');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isEdit = Boolean(event);

  // Focus the dialog panel itself (not the title field) so opening it
  // doesn't pop the on-screen keyboard on phones/tablets — see the matching
  // comment in TaskFormModal.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setEventType(event.event_type);
      setTitle(event.title);
      setDescription(event.description);
      setEventDate(event.event_date);
      setEventTime(event.event_time ? event.event_time.slice(0, 5) : '');
    } else {
      setEventType('appointment');
      setTitle('');
      setDescription('');
      setEventDate(defaultDate ?? todayLocalISODate());
      setEventTime(defaultTime ?? '');
    }
    setError(null);
  }, [open, event, defaultDate, defaultTime]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    if (!eventDate) {
      setError('Please choose a date.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title,
        description,
        event_type: eventType,
        event_date: eventDate,
        event_time: eventTime ? `${eventTime}:00` : null,
      };
      if (isEdit && event) {
        await updateCalendarEvent(event.id, payload);
        showToast('Entry updated');
      } else {
        await createCalendarEvent(payload);
        showToast(`${CALENDAR_EVENT_META[eventType].label} added`);
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-form-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close-x" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <h2 id="calendar-event-form-title">{isEdit ? 'Edit' : 'Add'} appointment or delivery</h2>

        <form onSubmit={handleSubmit} className="task-form">
          <label className="field-label" htmlFor="cal-event-type" style={{ marginTop: 0 }}>
            Type
          </label>
          <Dropdown
            id="cal-event-type"
            value={eventType}
            onChange={(v) => setEventType(v as CalendarEventType)}
            options={CALENDAR_EVENT_TYPES.map((t) => ({
              value: t,
              label: `${CALENDAR_EVENT_META[t].icon} ${CALENDAR_EVENT_META[t].label}`,
            }))}
          />

          <label className="field-label" htmlFor="cal-event-title">
            Title
          </label>
          <input
            id="cal-event-title"
            className="field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Plumber walkthrough"
            required
          />

          <label className="field-label" htmlFor="cal-event-description">
            Notes <span className="field-optional">(optional)</span>
          </label>
          <textarea
            id="cal-event-description"
            className="field-input field-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any details worth noting..."
            rows={3}
          />

          <div className="field-row">
            <div className="field-col">
              <label className="field-label" htmlFor="cal-event-date">
                Date
              </label>
              <input
                id="cal-event-date"
                type="date"
                className="field-input"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </div>
            <div className="field-col">
              <label className="field-label" htmlFor="cal-event-time">
                Time <span className="field-optional">(optional)</span>
              </label>
              <TimeSelect id="cal-event-time" value={eventTime} onChange={setEventTime} />
            </div>
          </div>

          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
