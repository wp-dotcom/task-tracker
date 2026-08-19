import { useEffect, useId, useRef, useState } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  id?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Shown when nothing matches `value` — e.g. "Select employee". Purely cosmetic. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * A dropdown built to match the rest of the app instead of the browser's
 * native <select> menu (which can't be restyled once it's open — that's a
 * hard browser limitation, not a choice). Same value/onChange contract as
 * a native select, so it drops into any existing form field.
 *
 * Reimplements what a native select gives you for free: opens on click or
 * Enter/Space/Arrow keys, Up/Down moves the highlight, Enter/Space picks
 * it, Escape cancels, typing a letter jumps to the next option starting
 * with it, and clicking/tapping outside (or scrolling the page) closes it.
 * Positioned with `position: fixed` from the trigger's own bounding box so
 * it always escapes a modal's clipped/scrolling body instead of getting
 * cut off.
 */
export default function Dropdown({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ top: 0, left: 0, width: 0, maxHeight: 264 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef('');
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;

  const selected = options.find((o) => o.value === value) ?? null;

  // Prefers opening downward (like a native select usually does), but flips
  // upward when there's little room below and meaningfully more above — e.g.
  // a field near the bottom of a tall form in a modal on a short screen.
  const GAP = 4;
  const MAX_HEIGHT = 264;
  const MIN_USABLE = 120;

  function computePosition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const openUp = spaceBelow < MIN_USABLE && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    setPos(
      openUp
        ? {
            bottom: window.innerHeight - rect.top + GAP,
            left: rect.left,
            width: rect.width,
            maxHeight: Math.max(120, Math.min(MAX_HEIGHT, available)),
          }
        : {
            top: rect.bottom + GAP,
            left: rect.left,
            width: rect.width,
            maxHeight: Math.max(120, Math.min(MAX_HEIGHT, available)),
          },
    );
  }

  function openDropdown() {
    if (disabled || options.length === 0) return;
    computePosition();
    const initialIndex = options.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(initialIndex >= 0 ? initialIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  }

  function closeDropdown() {
    setOpen(false);
  }

  function commit(index: number) {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    closeDropdown();
    triggerRef.current?.focus();
  }

  // Close on outside click/tap, Escape, or scroll of any ancestor (rather
  // than tracking and re-computing position live — matches how the
  // calendar's quick-create popover behaves).
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      closeDropdown();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeDropdown();
        triggerRef.current?.focus();
      }
    }
    function handleScroll(e: Event) {
      // Scroll events don't bubble, but a capture-phase listener on window
      // still sees them fire on any scrolled descendant — including the
      // listbox itself (e.g. TimeSelect's ~49-option list, which needs to
      // scroll internally to reach entries past the maxHeight cap). Only
      // treat this as "the page/an ancestor scrolled out from under us",
      // not "the user is scrolling to find an option".
      const target = e.target as Node;
      if (listRef.current?.contains(target)) return;
      closeDropdown();
    }
    function handleResize() {
      closeDropdown();
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  // Keep the highlighted option scrolled into view as it changes.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  function moveActive(delta: number) {
    if (options.length === 0) return;
    let next = activeIndex;
    for (let i = 0; i < options.length; i++) {
      next = (next + delta + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActiveIndex(next);
  }

  function handleTypeahead(char: string) {
    if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
    typeaheadRef.current += char.toLowerCase();
    typeaheadTimer.current = setTimeout(() => {
      typeaheadRef.current = '';
    }, 600);
    const match = options.findIndex(
      (o) => !o.disabled && o.label.toLowerCase().startsWith(typeaheadRef.current),
    );
    if (match >= 0) setActiveIndex(match);
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(options.findIndex((o) => !o.disabled));
        break;
      case 'End':
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i].disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Tab':
        closeDropdown();
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          handleTypeahead(e.key);
        }
    }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        className={`dropdown-trigger ${className}`.trim()}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
      >
        <span className={selected ? 'dropdown-trigger-value' : 'dropdown-trigger-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="dropdown-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="dropdown-listbox"
          style={{
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            minWidth: pos.width,
            maxHeight: pos.maxHeight,
          }}
          tabIndex={-1}
        >
          {options.map((opt, index) => (
            <li
              key={opt.value}
              data-index={index}
              role="option"
              aria-selected={opt.value === value}
              aria-disabled={opt.disabled || undefined}
              className={[
                'dropdown-option',
                opt.value === value ? 'selected' : '',
                index === activeIndex ? 'active' : '',
                opt.disabled ? 'disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => !opt.disabled && setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="dropdown-option-check" aria-hidden="true">
                {opt.value === value ? '✓' : ''}
              </span>
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
