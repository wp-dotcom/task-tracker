import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { TaskTemplate, TaskUrgency } from '../types';
import { useTaskTemplates } from '../hooks/useTaskTemplates';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import { URGENCY_META, URGENCY_ORDER } from '../lib/urgency';

interface TaskTemplateFormModalProps {
  open: boolean;
  onClose: () => void;
  template?: TaskTemplate | null;
  onSaved?: (template: TaskTemplate) => void;
}

export default function TaskTemplateFormModal({
  open,
  onClose,
  template = null,
  onSaved,
}: TaskTemplateFormModalProps) {
  const { createTemplate, updateTemplate } = useTaskTemplates();
  const { showToast } = useToast();
  const isEdit = Boolean(template);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<TaskUrgency>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? '');
    setDescription(template?.description ?? '');
    setUrgency(template?.urgency ?? 'normal');
    setError(null);
  }, [open, template]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please enter a title for this preset.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && template) {
        await updateTemplate(template.id, { title, description, urgency });
        onSaved?.({ ...template, title: title.trim(), description: description.trim(), urgency });
        showToast('Preset updated');
      } else {
        const created = await createTemplate({ title, description, urgency });
        onSaved?.(created);
        showToast('Preset saved');
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
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="template-form-title">{isEdit ? 'Edit preset' : 'New preset'}</h2>

        <form onSubmit={handleSubmit} className="task-form">
          <label className="field-label" htmlFor="template-title">
            Title
          </label>
          <input
            id="template-title"
            className="field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly inventory count"
            required
            autoFocus
          />

          <label className="field-label" htmlFor="template-description">
            Instructions
          </label>
          <textarea
            id="template-description"
            className="field-input field-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Default instructions for this preset..."
            rows={4}
          />

          <label className="field-label" htmlFor="template-urgency">
            Default urgency
          </label>
          <select
            id="template-urgency"
            className="field-input"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as TaskUrgency)}
          >
            {URGENCY_ORDER.slice()
              .reverse()
              .map((u) => (
                <option key={u} value={u}>
                  {URGENCY_META[u].label}
                </option>
              ))}
          </select>
          <p className="muted" style={{ marginTop: 6, fontSize: '0.8rem' }}>
            You can still change the urgency each time you use this preset.
          </p>

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
              {submitting ? 'Saving...' : 'Save preset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
