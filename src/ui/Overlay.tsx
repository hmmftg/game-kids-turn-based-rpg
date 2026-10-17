import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function isEditable(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/**
 * The keyboard twin of outside-tap: `Escape` calls `handler`. Typing stays
 * safe — Escape inside an editable field belongs to the field, not the
 * dialog (a rename box reverts, it doesn't close the area). `null`/`undefined`
 * disables the listener so callers can gate it on their own state.
 */
export function useDismissOnEscape(handler: (() => void) | null | undefined) {
  useEffect(() => {
    if (handler === null || handler === undefined) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || isEditable(document.activeElement)) return;
      handler();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handler]);
}

/**
 * The one modal contract every overlay shares: `role="dialog"` +
 * `aria-modal`, focus moves inside on mount and returns on unmount, `Tab`
 * wraps within the dialog, `Escape` dismisses (except while typing), and a
 * tap on the dimmed backdrop — never through it — dismisses. Callers keep
 * their own `.panel` so visuals stay per-surface. `dismissOnOutsideTap`
 * exists for the one deliberate exception (the celebration's reward beat
 * keeps button-only dismissal); `Escape` always works.
 */
export function Overlay({
  testId,
  ariaLabel,
  onDismiss,
  dismissOnOutsideTap = true,
  overlayClass = '',
  children,
}: {
  readonly testId: string;
  readonly ariaLabel: string;
  readonly onDismiss: () => void;
  readonly dismissOnOutsideTap?: boolean;
  readonly overlayClass?: string;
  readonly children: ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  useDismissOnEscape(onDismiss);

  // Focus lands inside on mount and returns to whoever had it on unmount.
  useEffect(() => {
    const layer = layerRef.current;
    const previous = document.activeElement;
    const first = layer?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? layer)?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const layer = layerRef.current;
    if (!layer) return;
    const focusable = Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !(el as HTMLButtonElement).disabled,
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (document.activeElement === layer) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    } else if (first !== undefined && last !== undefined) {
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      ref={layerRef}
      className={`layer layer--overlay${overlayClass ? ` ${overlayClass}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      data-testid={testId}
      onPointerDown={(event) => {
        // Universal leave: a tap outside the card dismisses and never
        // reaches the world beneath — the layer covers it entirely.
        if (dismissOnOutsideTap && event.target === event.currentTarget) onDismiss();
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
