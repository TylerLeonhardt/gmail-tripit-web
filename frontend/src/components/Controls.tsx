interface ControlsProps {
  onYes: () => void;
  onNo: () => void;
  onUndo: () => void;
  disabled: boolean;
}

function Controls({ onYes, onNo, onUndo, disabled }: ControlsProps) {
  return (
    <div className="controls">
      <button className="btn btn-no" onClick={onNo} disabled={disabled}>
        <span className="icon">✗</span>
        <span className="label">Not a Flight</span>
        <span className="shortcut">N or ←</span>
      </button>

      <button className="btn btn-undo" onClick={onUndo}>
        <span className="icon">↶</span>
        <span className="label">Undo</span>
        <span className="shortcut">U</span>
      </button>

      <button className="btn btn-yes" onClick={onYes} disabled={disabled}>
        <span className="icon">✓</span>
        <span className="label">Flight Confirmation</span>
        <span className="shortcut">Y or →</span>
      </button>
    </div>
  );
}

export default Controls;
