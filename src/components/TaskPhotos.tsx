import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTaskPhotos } from '../hooks/useTaskPhotos';
import { taskPhotoUrl } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import ConfirmDialog from './ConfirmDialog';
import type { TaskPhoto } from '../types';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — generous for a phone-camera photo

/**
 * Photo attachments on a task — e.g. a finished-piece photo or a delivery
 * confirmation. Uses the public task-photos Storage bucket; anyone who can
 * open this task's details can view and add photos (see can_access_task()
 * in schema.sql).
 */
export default function TaskPhotos({ taskId }: { taskId: string }) {
  const { profile } = useAuth();
  const { photos, loading, error, addPhoto, removePhoto } = useTaskPhotos(taskId);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaskPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<TaskPhoto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError('That photo is too large (max 10MB).');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await addPhoto(file);
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await removePhoto(confirmDelete.id, confirmDelete.storage_path);
      setConfirmDelete(null);
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="task-photos">
      <div className="task-photos-header">
        <h3>Photos</h3>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : '+ Add photo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          onChange={handleFileChange}
        />
      </div>

      {loading && photos.length === 0 && <p className="muted">Loading photos...</p>}
      {!loading && photos.length === 0 && <p className="muted">No photos yet.</p>}

      {photos.length > 0 && (
        <div className="task-photo-grid">
          {photos.map((p) => {
            const canDelete = profile?.role === 'admin' || profile?.id === p.uploaded_by;
            return (
              <div key={p.id} className="task-photo-thumb">
                <button type="button" className="task-photo-thumb-btn" onClick={() => setPreview(p)}>
                  <img src={taskPhotoUrl(p.storage_path)} alt="Task attachment" loading="lazy" />
                </button>
                {canDelete && (
                  <button
                    type="button"
                    className="task-photo-delete"
                    onClick={() => setConfirmDelete(p)}
                    aria-label="Delete photo"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {uploadError && (
        <div role="alert" className="form-error">
          {uploadError}
        </div>
      )}

      {preview && (
        <div className="modal-overlay" role="presentation" onClick={() => setPreview(null)}>
          <div className="task-photo-preview" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-x"
              aria-label="Close"
              onClick={() => setPreview(null)}
            >
              ×
            </button>
            <img src={taskPhotoUrl(preview.storage_path)} alt="Task attachment" />
            <button type="button" className="btn btn-secondary" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this photo?"
        message="This cannot be undone."
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        danger
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
