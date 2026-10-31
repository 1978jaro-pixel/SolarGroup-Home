import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

/** Detailné okno (na mobile cez celú obrazovku). Zatvára sa krížikom, klávesom Esc alebo klikom vedľa. */
export function Modal({ title, icon, iconClass, onClose, children, actions }: { title: string; icon?: IconName; iconClass?: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  // Aktuálny onClose cez ref – efekt beží iba pri otvorení, aby prekreslenie neukradlo fokus.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <header className="modal__head">
          {icon && <Icon name={icon} size={28} className={iconClass} filled={icon === "flame"} />}
          <h2>{title}</h2>
          <span className="modal__actions">{actions}</span>
          <button type="button" className="modal__close" aria-label="Zavrieť" onClick={onClose}>
            <Icon name="x" size={24} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Záložky v štýle návrhu (Týždenný program | Ručné nastavenie | Nastavenia). */
export function Tabs<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; size?: "md" | "sm" }) {
  return (
    <div className={`tabs tabs--${size}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? "is-active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
