import { useTheme } from '../context/ThemeContext';
import type { ThemePreference } from '../context/ThemeContext';
import Dropdown from './Dropdown';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: '☀ Light' },
  { value: 'dark', label: '● Dark' },
  { value: 'system', label: '◐ Match system' },
];

/** Light/dark/system theme picker, shown to both roles in the sidebar/mobile menu. */
export default function ThemeToggle({ id }: { id: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <Dropdown
      id={id}
      value={preference}
      onChange={(v) => setPreference(v as ThemePreference)}
      options={OPTIONS}
      aria-label="Theme"
    />
  );
}
