'use client';

// The classic red-triangle / blue-diamond / yellow-circle / green-square
// convention used by every mainstream quiz tool (Kahoot etc.) — shape as
// well as color distinguishes options, and it's an instantly-recognizable
// pattern for anyone who's used one of these before. Colors are softer than
// the original neon Kahoot palette (participants stare at these for the
// length of an event, and a wall of saturated color reads as harsh) — `tint`
// is a light, easy-on-the-eyes background for the unselected state, `color`
// stays strong enough to read clearly as an icon, bar-chart fill, or a
// selected option's fill.
export const OPTION_STYLES = [
  { color: '#F0656E', tint: '#FDEBEC', shape: 'triangle' as const },
  { color: '#4D8FE0', tint: '#EAF1FC', shape: 'diamond' as const },
  { color: '#E0A339', tint: '#FBF1E1', shape: 'circle' as const },
  { color: '#4FAE6C', tint: '#EAF6ED', shape: 'square' as const },
];

export function optionStyle(index: number) {
  return OPTION_STYLES[index % OPTION_STYLES.length];
}

export default function OptionShape({ index, size = 18 }: { index: number; size?: number }) {
  const { color, shape } = optionStyle(index);
  const common: React.CSSProperties = { display: 'inline-block', flexShrink: 0 };

  if (shape === 'circle') {
    return <span style={{ ...common, width: size, height: size, borderRadius: '50%', background: color }} />;
  }
  if (shape === 'square') {
    return <span style={{ ...common, width: size, height: size, background: color, borderRadius: 3 }} />;
  }
  if (shape === 'diamond') {
    return (
      <span
        style={{
          ...common,
          width: size * 0.78,
          height: size * 0.78,
          background: color,
          borderRadius: 2,
          transform: 'rotate(45deg)',
        }}
      />
    );
  }
  return (
    <span
      style={{
        ...common,
        width: 0,
        height: 0,
        borderLeft: `${size / 2}px solid transparent`,
        borderRight: `${size / 2}px solid transparent`,
        borderBottom: `${size * 0.86}px solid ${color}`,
      }}
    />
  );
}
