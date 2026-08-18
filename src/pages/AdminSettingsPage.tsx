import { useEffect, useMemo, useState } from 'react';
import { useUrgency } from '../context/UrgencyContext';
import { URGENCY_ORDER, buildUrgencyMeta, tintFromColor } from '../lib/urgency';
import type { TaskUrgency } from '../types';
import { getErrorMessage } from '../lib/errors';

export default function AdminSettingsPage() {
  const { urgencyMeta, loading, error, updateColor } = useUrgency();
  const [draft, setDraft] = useState<Record<TaskUrgency, string>>(() => {
    const initial = {} as Record<TaskUrgency, string>;
    URGENCY_ORDER.forEach((u) => {
      initial[u] = urgencyMeta[u].color;
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keep the draft in sync whenever the live colors change (e.g. loaded
  // from the DB after initial mount, or updated from another device).
  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      URGENCY_ORDER.forEach((u) => {
        next[u] = urgencyMeta[u].color;
      });
      return next;
    });
  }, [urgencyMeta]);

  const dirty = useMemo(
    () => URGENCY_ORDER.some((u) => draft[u] !== urgencyMeta[u].color),
    [draft, urgencyMeta],
  );

  const previewMeta = useMemo(() => buildUrgencyMeta(draft), [draft]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const changed = URGENCY_ORDER.filter((u) => draft[u] !== urgencyMeta[u].color);
      await Promise.all(changed.map((u) => updateColor(u, draft[u])));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function handleResetToDefaults() {
    const defaults: Record<TaskUrgency, string> = {
      low: '#1a7f37',
      normal: '#1f6feb',
      high: '#b35900',
      urgent: '#c0192b',
    };
    setDraft(defaults);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="info-panel">
        <h2>Urgency colors</h2>
        <p className="muted">
          Choose the accent color for each urgency level. Labels and icons stay the same either
          way, so urgency is never communicated by color alone.
        </p>

        {(error || saveError) && (
          <div role="alert" className="form-error">
            {saveError ?? error}
          </div>
        )}

        {loading ? (
          <p className="muted">Loading...</p>
        ) : (
          <div className="urgency-settings-list">
            {URGENCY_ORDER.map((urgency) => {
              const meta = previewMeta[urgency];
              return (
                <div key={urgency} className="urgency-setting-row">
                  <input
                    type="color"
                    className="color-input"
                    value={draft[urgency]}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [urgency]: e.target.value }))}
                    aria-label={`${meta.label} color`}
                  />
                  <span
                    className="urgency-badge"
                    style={{ color: meta.color, background: tintFromColor(meta.color) }}
                  >
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </span>
                  <code className="urgency-setting-hex">{draft[urgency]}</code>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 20 }}>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleResetToDefaults} disabled={saving}>
            Reset to defaults
          </button>
          {saved && <span className="muted">Saved.</span>}
        </div>
      </div>
    </div>
  );
}
