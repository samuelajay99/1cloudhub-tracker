'use client';

// The classic red-triangle / blue-diamond / yellow-circle / green-square
// convention used by every mainstream quiz tool (Kahoot etc.) — shape as
// well as color distinguishes options, and it's an instantly-recognizable
// pattern for anyone who's used one of these before.
export const OPTION_STYLES = [
  { color: '#E21B3C', shape: 'triangle' as const },
  { color: '#1368CE', shape: 'diamond' as const },
  { color: '#D89E00', shape: 'circle' as const },
  { color: '#26890C', shape: 'square' as const },
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
