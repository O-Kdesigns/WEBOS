import React from 'react';

export const SPHERE_QUALITY_PRESETS = [
  { level: 0, label: 'Eco', tris: '16Δ', segments: [4, 3], desc: '4×3' },
  { level: 1, label: 'Low', tris: '30Δ', segments: [5, 4], desc: '5×4' },
  { level: 2, label: 'Mid', tris: '48Δ', segments: [6, 5], desc: '6×5' },
  { level: 3, label: 'High', tris: '112Δ', segments: [8, 8], desc: '8×8' },
];

export function MagneticSegmentSwitch({ value = 1, onChange }) {
  const trackRef = React.useRef(null);
  const isDragging = React.useRef(false);

  const snapToClientX = (clientX) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const step = Math.round(ratio * (SPHERE_QUALITY_PRESETS.length - 1));
    if (step !== value && onChange) {
      onChange(step);
    }
  };

  const handlePointerDown = (e) => {
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    snapToClientX(e.clientX);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    snapToClientX(e.clientX);
  };

  const handlePointerUp = (e) => {
    if (isDragging.current) {
      isDragging.current = false;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  const activeIdx = Math.max(0, Math.min(SPHERE_QUALITY_PRESETS.length - 1, value ?? 1));

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '28px',
        background: 'rgba(0, 0, 0, 0.45)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        cursor: 'pointer',
        userSelect: 'none',
        overflow: 'hidden',
        touchAction: 'none'
      }}
      title="Přetažením myši nebo kliknutím přepnete detail polygonů koule"
    >
      {/* Magnetický posuvný indikátor s plynulým přichytáváním */}
      <div
        style={{
          position: 'absolute',
          top: '2px',
          bottom: '2px',
          width: `${100 / SPHERE_QUALITY_PRESETS.length}%`,
          left: `${activeIdx * (100 / SPHERE_QUALITY_PRESETS.length)}%`,
          borderRadius: '4px',
          background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.32) 0%, rgba(16, 185, 129, 0.16) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.65)',
          boxShadow: '0 0 10px rgba(16, 185, 129, 0.25)',
          transition: isDragging.current ? 'left 0.06s ease-out' : 'left 0.18s cubic-bezier(0.2, 0.8, 0.25, 1)',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />

      {/* 4 kroky / stupně detailu */}
      {SPHERE_QUALITY_PRESETS.map((preset, idx) => {
        const isActive = idx === activeIdx;
        return (
          <div
            key={preset.level}
            style={{
              flex: 1,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              zIndex: 2,
              position: 'relative',
              borderRight: idx < SPHERE_QUALITY_PRESETS.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none'
            }}
          >
            <span
              style={{
                fontSize: '0.73rem',
                fontWeight: isActive ? '700' : '500',
                color: isActive ? '#6ee7b7' : '#94a3b8',
                transition: 'color 0.15s ease'
              }}
            >
              {preset.label}
            </span>
            <span
              style={{
                fontSize: '0.62rem',
                color: isActive ? '#a7f3d0' : '#64748b',
                opacity: isActive ? 0.95 : 0.7,
                transition: 'color 0.15s ease'
              }}
            >
              ({preset.tris})
            </span>
          </div>
        );
      })}
    </div>
  );
}
