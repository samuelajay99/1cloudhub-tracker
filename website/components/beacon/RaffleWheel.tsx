'use client';

import { useEffect, useRef, useState } from 'react';

// Winners are already decided server-side (see runRaffle() in the host
// live-control room) — this is a cosmetic reveal. A real spinning wheel,
// one segment of which is always the true winner, is built fresh for each
// name so the reveal feels like a live draw without ever being able to
// land anywhere but the actual result.

const WHEEL_COLORS = ['#7C3AED', '#C026D3', '#EC4899', '#F97316', '#EAB308', '#0EA5E9', '#6366F1', '#DB2777'];
const SEGMENT_COUNT = 8;
const SPIN_DURATION_MS = 4200;
const CELEBRATION_PAUSE_MS = 2600;

interface WheelSegment {
  id: string;
  name: string;
}

export default function RaffleWheel({
  pool,
  winners,
  instant = false,
}: {
  pool: string[];
  winners: { participant_id: string; name: string }[];
  // Skips the spin — used when reconstructing an already-drawn raffle on
  // page load (a fresh presenter tab, or a host reload) rather than
  // reacting to the live "raffle_drawn" broadcast, where replaying the
  // multi-second draw again would be a lie about what just happened.
  instant?: boolean;
}) {
  if (instant) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
        {winners.map((w) => (
          <div key={w.participant_id} style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: '#fff' }}>
            🎉 {w.name}
          </div>
        ))}
      </div>
    );
  }
  return <SpinningRaffleWheel pool={pool} winners={winners} />;
}

function SpinningRaffleWheel({ pool, winners }: { pool: string[]; winners: { participant_id: string; name: string }[] }) {
  const [winnerIndex, setWinnerIndex] = useState(0);
  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const rotationRef = useRef(0);

  const currentWinner = winners[winnerIndex];

  useEffect(() => {
    if (!currentWinner) return;
    setCelebrating(false);

    const others = pool.filter((n) => n !== currentWinner.name);
    const shuffled = [...others].sort(() => Math.random() - 0.5);
    const winnerSlot = Math.floor(Math.random() * SEGMENT_COUNT);
    let fillerIdx = 0;
    const built: WheelSegment[] = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      if (i === winnerSlot) {
        built.push({ id: `w-${winnerIndex}`, name: currentWinner.name });
      } else {
        built.push({ id: `f-${winnerIndex}-${i}`, name: shuffled[fillerIdx++ % Math.max(shuffled.length, 1)] || currentWinner.name });
      }
    }
    setSegments(built);

    const segmentAngle = 360 / SEGMENT_COUNT;
    const winnerCenter = winnerSlot * segmentAngle + segmentAngle / 2;
    const jitter = (Math.random() - 0.5) * segmentAngle * 0.5;
    const targetRemainder = (((360 - winnerCenter + jitter) % 360) + 360) % 360;
    const currentRemainder = ((rotationRef.current % 360) + 360) % 360;
    const forwardDelta = ((targetRemainder - currentRemainder + 360) % 360) || 360;
    const extraSpins = 6;
    const target = rotationRef.current + extraSpins * 360 + forwardDelta;

    const t = setTimeout(() => {
      rotationRef.current = target;
      setRotation(target);
      setSpinning(true);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerIndex, currentWinner?.participant_id]);

  function handleTransitionEnd() {
    if (!spinning) return;
    setSpinning(false);
    setCelebrating(true);
    if (winnerIndex < winners.length - 1) {
      setTimeout(() => setWinnerIndex((i) => i + 1), CELEBRATION_PAUSE_MS);
    }
  }

  if (!currentWinner) return null;

  const segmentAngle = 360 / SEGMENT_COUNT;
  const gradientStops = segments
    .map((_, i) => {
      const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
      return `${color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`;
    })
    .join(', ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, padding: '20px 0' }}>
      <div style={{ position: 'relative', width: 340, height: 340 }}>
        {/* Pointer */}
        <div
          style={{
            position: 'absolute',
            top: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '16px solid transparent',
            borderRight: '16px solid transparent',
            borderTop: '26px solid #fff',
            filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.35))',
            zIndex: 3,
          }}
        />

        <div
          onTransitionEnd={handleTransitionEnd}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: segments.length ? `conic-gradient(${gradientStops})` : 'var(--gradient-hero)',
            boxShadow: '0 0 0 10px rgba(255,255,255,.95), 0 24px 60px rgba(0,0,0,.45)',
            position: 'relative',
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.15, 0.65, 0.15, 1)` : 'none',
          }}
        >
          {segments.map((seg, i) => {
            const angle = i * segmentAngle + segmentAngle / 2;
            // Labels in the bottom half would otherwise render upside down.
            // What matters is the label's angle once the *whole wheel* has
            // finished spinning (angle + the wheel's own rotation), not its
            // angle in the wheel's own unrotated frame — flip whichever
            // labels would land upside down at that final resting position.
            const restingAngle = ((angle + rotation) % 360 + 360) % 360;
            const flip = restingAngle > 90 && restingAngle < 270;
            const wrapperAngle = flip ? angle + 180 : angle;
            return (
              <div
                key={seg.id}
                style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, transform: `rotate(${wrapperAngle}deg)` }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: -9,
                    width: 96,
                    textAlign: flip ? 'right' : 'left',
                    ...(flip ? { right: 46 } : { left: 46 }),
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 12,
                    textShadow: '0 1px 3px rgba(0,0,0,.45)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {seg.name}
                </span>
              </div>
            );
          })}

          {/* Center hub with the Beacon mark */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(0,0,0,.3)',
            }}
          >
            <img src="/beacon-mark.png" alt="" width={34} height={34} style={{ display: 'block' }} />
          </div>
        </div>
      </div>

      <div style={{ minHeight: 90, textAlign: 'center' }}>
        {celebrating ? (
          <Celebration name={currentWinner.name} key={currentWinner.participant_id} />
        ) : (
          <p style={{ fontSize: 'var(--text-md)', color: 'rgba(255,255,255,.75)' }}>
            Drawing winner {winnerIndex + 1} of {winners.length}…
          </p>
        )}
      </div>
    </div>
  );
}

function Celebration({ name }: { name: string }) {
  const pieces = Array.from({ length: 26 }, (_, i) => i);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '-60px -80px', pointerEvents: 'none', overflow: 'visible' }}>
        {pieces.map((i) => {
          const angle = (i / pieces.length) * 360 + Math.random() * 20;
          const distance = 80 + Math.random() * 90;
          const dx = Math.cos((angle * Math.PI) / 180) * distance;
          const dy = Math.sin((angle * Math.PI) / 180) * distance - 40;
          const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
          const delay = Math.random() * 120;
          return (
            <span
              key={i}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 8,
                height: 14,
                background: color,
                borderRadius: 2,
                opacity: 0,
                animation: `beacon-confetti-piece 1400ms ease-out ${delay}ms forwards`,
                // @ts-ignore custom props read by the keyframe below
                '--dx': `${dx}px`,
                '--dy': `${dy}px`,
                '--rot': `${360 + Math.random() * 360}deg`,
              }}
            />
          );
        })}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--sky-400)', fontFamily: 'var(--font-mono)', marginBottom: 6, animation: 'beacon-raffle-pop 500ms ease' }}>
        🎉 WINNER
      </div>
      <div style={{ fontSize: 'var(--text-4xl)', fontWeight: 700, color: '#fff', animation: 'beacon-raffle-pop 500ms ease' }}>{name}</div>
      <style>{`
        @keyframes beacon-raffle-pop {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes beacon-confetti-piece {
          0% { transform: translate(-50%, -50%) rotate(0deg); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
