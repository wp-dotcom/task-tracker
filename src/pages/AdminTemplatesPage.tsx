import { useState } from 'react';
import { useTaskTemplates } from '../hooks/useTaskTemplates';
import { useToast } from '../context/ToastContext';
import type { TaskTemplate } from '../types';
import TaskTemplateFormModal from '../components/TaskTemplateFormModal';
import ConfirmDialog from '../components/ConfirmDialog';
import UrgencyBadge from '../components/UrgencyBadge';
import { ListSkeleton } from '../components/Skeleton';
import { getErrorMessage } from '../lib/errors';

export default function AdminTemplatesPage() {
  const { templates, loading, error, deleteTemplate } = useTaskTemplates();
  const { showToast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaskTemplate | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(template: TaskTemplate) {
    setEditing(template);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTemplate(confirmDelete.id);
      setConfirmDelete(null);
      showToast('Preset deleted');
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Task presets</h1>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + New preset
        </button>
      </div>

      <p className="muted" style={{ marginTop: -8, marginBottom: 18 }}>
        Save commonly-assigned tasks here so you can pick them from a list instead of retyping
        them every time you create a task.
      </p>

      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <p>No presets yet. Create one to speed up assigning repeat tasks.</p>
        </div>
      ) : (
        <div className="task-list">
          {templates.map((template) => (
            <div key={template.id} className="task-card template-card">
              <div className="task-card-main">
                <span className="task-card-title">{template.title}</span>
                {template.description && (
                  <span className="task-card-due">{template.description}</span>
                )}
              </div>
              <div className="task-card-side">
                <UrgencyBadge urgency={template.urgency} />
                <button type="button" className="btn btn-ghost" onClick={() => openEdit(template)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-danger-text"
                  onClick={() => setConfirmDelete(template)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskTemplateFormModal
        open={formOpen}
        template={editing}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this preset?"
        message={
          confirmDelete
            ? `"${confirmDelete.title}" will be removed from your preset list. This does not affect any tasks already created from it.`
            : ''
        }
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setConfirmDelete(null);
          setDeleteError(null);
        }}
      />
      {deleteError && (
        <div role="alert" className="form-error">
          {deleteError}
        </div>
      )}
    </div>
  );
}
