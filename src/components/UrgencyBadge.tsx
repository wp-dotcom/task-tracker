import type { TaskUrgency } from '../types';
import { useUrgency } from '../context/UrgencyContext';

export default function UrgencyBadge({ urgency }: { urgency: TaskUrgency }) {
  const { urgencyMeta } = useUrgency();
  const meta = urgencyMeta[urgency];
  return (
    <span
      className="urgency-badge"
      style={{ color: meta.color, background: meta.background }}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
