import { useState } from 'react';
import { useTaskTemplates } from '../hooks/useTaskTemplates';
import type { TaskTemplate } from '../types';
import TaskTemplateFormModal from '../components/TaskTemplateFormModal';
import TaskTemplateDetailsModal from '../components/TaskTemplateDetailsModal';
import UrgencyBadge from '../components/UrgencyBadge';
import { ListSkeleton } from '../components/Skeleton';

export default function AdminTemplatesPage() {
  const { templates, loading, error } = useTaskTemplates();
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<TaskTemplate | null>(null);

  function openCreate() {
    setFormOpen(true);
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
            <button
              key={template.id}
              type="button"
              className="task-card template-card"
              onClick={() => setViewing(template)}
            >
              <div className="task-card-main">
                <span className="task-card-title">{template.title}</span>
                {template.description && (
                  <span className="task-card-due">{template.description}</span>
                )}
              </div>
              <div className="task-card-side">
                <UrgencyBadge urgency={template.urgency} />
              </div>
            </button>
          ))}
        </div>
      )}

      <TaskTemplateFormModal open={formOpen} onClose={() => setFormOpen(false)} />

      <TaskTemplateDetailsModal template={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
