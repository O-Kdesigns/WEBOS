import React from 'react';

export const DragNumberInput = ({ value, onChange, step = 1, min, max, compact = false }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [localVal, setLocalVal] = React.useState(value);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const startVal = React.useRef(0);

  React.useEffect(() => {
    if (!isEditing && !isDragging.current) setLocalVal(value);
  }, [value, isEditing]);

  const handlePointerDown = (e) => {
    if (isEditing) return;
    isDragging.current = true;
    startX.current = e.clientX;
    startVal.current = Number(value) || 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const delta = e.clientX - startX.current;
    
    const sensitivity = step < 1 ? (step < 0.1 ? 0.01 : 0.05) : 0.2; 
    let newVal = startVal.current + (delta * sensitivity);
    
    const decimals = step.toString().split('.')[1]?.length || 0;
    newVal = Number(newVal.toFixed(decimals));

    if (min !== undefined) newVal = Math.max(min, newVal);
    if (max !== undefined) newVal = Math.min(max, newVal);
    
    setLocalVal(newVal);
    onChange(newVal);
  };

  const handlePointerUp = (e) => {
    if (isDragging.current) {
      isDragging.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (Math.abs(e.clientX - startX.current) < 3) {
        setIsEditing(true);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      onChange(Number(localVal));
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    onChange(Number(localVal));
  };

  if (isEditing) {
    return (
      <input 
        autoFocus
        type="number" 
        step={step}
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`blender-input editing ${compact ? 'compact' : ''}`}
        style={compact ? { height: '24px', padding: '2px 4px', fontSize: '0.78rem', width: '56px' } : undefined}
      />
    );
  }

  return (
    <div 
      className={`blender-input drag-mode ${compact ? 'compact' : ''}`}
      style={compact ? { height: '24px', padding: '0 4px', fontSize: '0.78rem', width: '56px' } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span className="b-arrow" style={compact ? { fontSize: '0.85rem' } : undefined}>‹</span>
      <span className="b-value" style={compact ? { fontSize: '0.78rem' } : undefined}>{localVal}</span>
      <span className="b-arrow" style={compact ? { fontSize: '0.85rem' } : undefined}>›</span>
    </div>
  );
};
