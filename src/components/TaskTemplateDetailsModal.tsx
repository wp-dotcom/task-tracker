import { useState } from 'react';
import type { TaskTemplate } from '../types';
import { useTaskTemplates } from '../hooks/useTaskTemplates';
import { useToast } from '../context/ToastContext';
import { getErrorMessage } from '../lib/errors';
import UrgencyBadge from './UrgencyBadge';
import ConfirmDialog from './ConfirmDialog';
import TaskTemplateFormModal from './TaskTemplateFormModal';

interface TaskTemplateDetailsModalProps {
  template: TaskTemplate | null;
  onClose: () => void;
}

/** Tapping a preset opens this — a quick look at what it fills in, with Edit/Delete from here. */
export default function TaskTemplateDetailsModal({ template, onClose }: TaskTemplateDetailsModalProps) {
  const { deleteTemplate } = useTaskTemplates();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!template) return null;

  async function handleDelete() {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTemplate(template.id);
      setConfirmDelete(false);
      showToast('Preset deleted');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <TaskTemplateFormModal
        open={editing}
        template={template}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close-x" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <div className="task-details-header">
          <h2 id="template-details-title">{template.title}</h2>
          <UrgencyBadge urgency={template.urgency} />
        </div>

        {template.description ? (
          <p className="task-details-description">{template.description}</p>
        ) : (
          <p className="muted">No instructions saved on this preset.</p>
        )}

        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        <div className="task-details-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-danger-text"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
          <button type="button" className="btn btn-secondary task-details-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this preset?"
        message={`"${template.title}" will be removed from your preset list. This does not affect any tasks already created from it.`}
        confirmLabel={busy ? 'Deleting...' : 'Delete'}
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
