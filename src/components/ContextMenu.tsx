import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export type MenuEntry = MenuItem | 'separator';

interface ContextMenuProps {
  x: number;
  y: number;
  title?: string;
  entries?: MenuEntry[];
  children?: ReactNode;
  onClose: () => void;
}

// A floating menu at the pointer. Closes on outside click, Escape, scroll or
// choosing an item, and nudges itself back on screen near the edges. Rendered
// into <body> so zoomed/transformed parents (graph nodes) can't offset it.
export function ContextMenu({ x, y, title, entries, children, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onClose, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="context-menu-title">{title}</div>}
      {entries?.map((entry, i) =>
        entry === 'separator' ? (
          <div key={i} className="context-menu-separator" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`context-menu-item ${entry.danger ? 'danger' : ''}`}
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            {entry.label}
          </button>
        ),
      )}
      {children}
    </div>,
    document.body,
  );
}
