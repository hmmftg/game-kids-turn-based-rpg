import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { DialogueView } from 'waypoint-rpg-narrative';
import type { DemoNarrativeAction } from './runtime.js';

interface DialogueDialogProps {
  readonly view: DialogueView | null;
  readonly speakerName: string;
  readonly choicesLabel: string;
  readonly continueLabel: string;
  readonly finishLabel: string;
  readonly closeLabel: string;
  readonly leaveLabel: string;
  readonly onCommand: (action: DemoNarrativeAction) => void;
  readonly openerRef: RefObject<HTMLButtonElement | null>;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
}

export function DialogueDialog({
  view,
  speakerName,
  choicesLabel,
  continueLabel,
  finishLabel,
  closeLabel,
  leaveLabel,
  onCommand,
  openerRef,
  fallbackFocusRef,
}: DialogueDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = view !== null;
  const exitAllowed = view?.exitAllowed ?? false;
  const activeNodeId = view?.nodeId ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) {
      dialog.close();
      const opener = openerRef.current;
      if (opener?.isConnected && !opener.disabled) opener.focus();
      else fallbackFocusRef.current?.focus();
    }
  }, [fallbackFocusRef, isOpen, openerRef]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (exitAllowed) onCommand({ type: 'EXIT_DIALOGUE' });
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [exitAllowed, onCommand]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const containTabFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog.open) return;
      const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      const active = dialog.ownerDocument.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', containTabFocus);
    return () => dialog.removeEventListener('keydown', containTabFocus);
  }, []);

  useEffect(() => {
    if (activeNodeId === null || !dialogRef.current?.open) return;
    const first = dialogRef.current.querySelector<HTMLButtonElement>(
      '[data-dialogue-primary]:not(:disabled), button:not(:disabled)',
    );
    first?.focus();
  }, [activeNodeId]);

  return (
    <dialog
      ref={dialogRef}
      className="narrative-dialog"
      aria-modal="true"
      aria-labelledby="narrative-speaker"
      aria-describedby="narrative-text"
      data-testid="narrative-dialog"
      dir="rtl"
      lang="fa"
    >
      {view && (
        <section className="narrative-dialog__content">
          <h2 id="narrative-speaker">{speakerName}</h2>
          <p id="narrative-text" key={view.nodeId} aria-live="polite">
            {view.text}
          </p>
          {view.choices.length > 0 ? (
            <div className="narrative-dialog__choices" aria-label={choicesLabel} role="group">
              {view.choices.map((choice, index) => (
                <button
                  key={choice.id}
                  type="button"
                  data-testid={`dialogue-choice-${choice.id}`}
                  data-dialogue-primary={index === 0 ? '' : undefined}
                  disabled={!choice.available}
                  onClick={() => onCommand({ type: 'CHOOSE', choiceId: choice.id })}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          ) : view.closeAllowed ? (
            <button
              type="button"
              data-testid="dialogue-close"
              data-dialogue-primary=""
              onClick={() => onCommand({ type: 'CLOSE_DIALOGUE' })}
            >
              {closeLabel}
            </button>
          ) : view.terminal ? (
            <button
              type="button"
              data-testid="dialogue-finish"
              data-dialogue-primary=""
              onClick={() => onCommand({ type: 'FINISH' })}
            >
              {finishLabel}
            </button>
          ) : (
            <button
              type="button"
              data-testid="dialogue-advance"
              data-dialogue-primary=""
              onClick={() => onCommand({ type: 'ADVANCE' })}
            >
              {continueLabel}
            </button>
          )}
          {view.exitAllowed && (
            <button
              type="button"
              className="narrative-dialog__leave"
              data-testid="dialogue-leave"
              onClick={() => onCommand({ type: 'EXIT_DIALOGUE' })}
            >
              {leaveLabel}
            </button>
          )}
        </section>
      )}
    </dialog>
  );
}
