import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTaskComments } from '../hooks/useTaskComments';
import { formatRelativeToNow } from '../lib/dates';
import { getErrorMessage } from '../lib/errors';

/**
 * A small two-way note thread on a task — lets the admin and the assignee
 * leave short messages back and forth without editing the task itself.
 * Visible to anyone who can already open this task's details (see
 * can_access_task() in schema.sql), not just the admin.
 */
export default function TaskComments({ taskId }: { taskId: string }) {
  const { profile } = useAuth();
  const { comments, loading, error, addComment, removeComment } = useTaskComments(taskId);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      await addComment(trimmed);
      setBody('');
    } catch (err) {
      setPostError(getErrorMessage(err));
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(commentId: string) {
    setDeletingId(commentId);
    try {
      await removeComment(commentId);
    } catch (err) {
      setPostError(getErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="task-comments">
      <h3>Notes</h3>

      {loading && comments.length === 0 ? (
        <p className="muted">Loading notes...</p>
      ) : comments.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <ul className="task-comment-list">
          {comments.map((c) => {
            const canDelete = profile?.role === 'admin' || profile?.id === c.author_id;
            return (
              <li key={c.id} className="task-comment">
                <div className="task-comment-meta">
                  <span className="task-comment-author">{c.author?.full_name ?? 'Unknown'}</span>
                  <span className="task-comment-time">{formatRelativeToNow(c.created_at)}</span>
                  {canDelete && (
                    <button
                      type="button"
                      className="task-comment-delete"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      aria-label="Delete note"
                    >
                      {deletingId === c.id ? '...' : '✕'}
                    </button>
                  )}
                </div>
                <p className="task-comment-body">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {postError && (
        <div role="alert" className="form-error">
          {postError}
        </div>
      )}

      <form className="task-comment-form" onSubmit={handleSubmit}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a note for the other side..."
          rows={2}
          maxLength={2000}
          disabled={posting}
        />
        <button type="submit" className="btn btn-secondary" disabled={posting || !body.trim()}>
          {posting ? 'Posting...' : 'Post note'}
        </button>
      </form>
    </div>
  );
}
