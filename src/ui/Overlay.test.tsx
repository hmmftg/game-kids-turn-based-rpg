import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Overlay } from './Overlay.tsx';

function renderDialog({
  onDismiss = vi.fn(),
  dismissOnOutsideTap = true,
}: {
  readonly onDismiss?: () => void;
  readonly dismissOnOutsideTap?: boolean;
} = {}) {
  return {
    onDismiss,
    ...render(
      <Overlay
        testId="test-dialog"
        ariaLabel="test dialog"
        onDismiss={onDismiss}
        dismissOnOutsideTap={dismissOnOutsideTap}
      >
        <div className="panel">
          <button type="button" data-testid="inside-first">
            first
          </button>
          <button type="button" data-testid="inside-last">
            last
          </button>
        </div>
      </Overlay>,
    ),
  };
}

describe('Overlay — the shared dialog contract', () => {
  it('is a labelled modal dialog', () => {
    renderDialog();
    const layer = screen.getByTestId('test-dialog');
    expect(layer).toHaveAttribute('role', 'dialog');
    expect(layer).toHaveAttribute('aria-modal', 'true');
    expect(layer).toHaveAttribute('aria-label', 'test dialog');
  });

  it('a tap on the backdrop dismisses; a tap inside does not', () => {
    const { onDismiss } = renderDialog();
    fireEvent.pointerDown(screen.getByTestId('inside-first'));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('test-dialog'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('the celebration-style opt-out keeps outside taps inert', () => {
    const { onDismiss } = renderDialog({ dismissOnOutsideTap: false });
    fireEvent.pointerDown(screen.getByTestId('test-dialog'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('Escape dismisses — except while typing in an editable field', () => {
    const onDismiss = vi.fn();
    render(
      <Overlay testId="with-input" ariaLabel="d" onDismiss={onDismiss}>
        <div className="panel">
          <input data-testid="field" aria-label="name" />
          <button type="button">ok</button>
        </div>
      </Overlay>,
    );
    (screen.getByTestId('field') as HTMLInputElement).focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('moves focus inside on mount and returns it on unmount', () => {
    const outer = document.createElement('button');
    outer.textContent = 'outer';
    document.body.append(outer);
    outer.focus();

    const { unmount } = renderDialog();
    expect(document.activeElement).toBe(screen.getByTestId('inside-first'));
    unmount();
    expect(document.activeElement).toBe(outer);
    outer.remove();
  });

  it('wraps Tab at both ends of the dialog', () => {
    renderDialog();
    const first = screen.getByTestId('inside-first');
    const last = screen.getByTestId('inside-last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
