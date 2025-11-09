import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Controls from '../components/Controls';

describe('Controls', () => {
  it('renders all three buttons', () => {
    render(
      <Controls onYes={() => {}} onNo={() => {}} onUndo={() => {}} disabled={false} />
    );

    expect(screen.getByText('Not a Flight')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.getByText('Flight Confirmation')).toBeInTheDocument();
  });

  it('calls onNo when No button is clicked', async () => {
    const onNo = vi.fn();
    const user = userEvent.setup();

    render(
      <Controls onYes={() => {}} onNo={onNo} onUndo={() => {}} disabled={false} />
    );

    await user.click(screen.getByText('Not a Flight'));
    expect(onNo).toHaveBeenCalledTimes(1);
  });

  it('calls onYes when Yes button is clicked', async () => {
    const onYes = vi.fn();
    const user = userEvent.setup();

    render(
      <Controls onYes={onYes} onNo={() => {}} onUndo={() => {}} disabled={false} />
    );

    await user.click(screen.getByText('Flight Confirmation'));
    expect(onYes).toHaveBeenCalledTimes(1);
  });

  it('calls onUndo when Undo button is clicked', async () => {
    const onUndo = vi.fn();
    const user = userEvent.setup();

    render(
      <Controls onYes={() => {}} onNo={() => {}} onUndo={onUndo} disabled={false} />
    );

    await user.click(screen.getByText('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('disables Yes and No buttons when disabled is true', () => {
    render(
      <Controls onYes={() => {}} onNo={() => {}} onUndo={() => {}} disabled={true} />
    );

    const yesButton = screen.getByText('Flight Confirmation').closest('button');
    const noButton = screen.getByText('Not a Flight').closest('button');

    expect(yesButton).toBeDisabled();
    expect(noButton).toBeDisabled();
  });

  it('does not disable Undo button when disabled is true', () => {
    render(
      <Controls onYes={() => {}} onNo={() => {}} onUndo={() => {}} disabled={true} />
    );

    const undoButton = screen.getByText('Undo').closest('button');
    expect(undoButton).not.toBeDisabled();
  });

  it('displays keyboard shortcuts', () => {
    render(
      <Controls onYes={() => {}} onNo={() => {}} onUndo={() => {}} disabled={false} />
    );

    expect(screen.getByText('N or ←')).toBeInTheDocument();
    expect(screen.getByText('Y or →')).toBeInTheDocument();
    expect(screen.getByText('U')).toBeInTheDocument();
  });
});
