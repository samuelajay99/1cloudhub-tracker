'use client';

import { useEffect, useRef, useState } from 'react';
import { RaffleWinnerDisplay, RafflePoolEntry } from '../../lib/beacon';

// Winners are already decided server-side (see runRaffle() in the host
// live-control room) — this is a cosmetic reveal. A real spinning wheel,
// one segment of which is always the true winner, is built fresh for each
// name so the reveal feels like a live draw without ever being able to
// land anywhere but the actual result.

const WHEEL_COLORS = ['#7C3AED', '#C026D3', '#EC4899', '#F97316', '#EAB308', '#0EA5E9', '#6366F1', '#DB2777'];
const SEGMENT_COUNT = 8;
// 9600ms of spin + the 350ms pre-spin pause below = ~10s of suspense before
// the wheel settles, on request — long enough for the room to feel it build.
const SPIN_DURATION_MS = 9600;
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
  pool: RafflePoolEntry[];
  winners: RaffleWinnerDisplay[];
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
          <div key={w.participant_id} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: '#fff' }}>🎉 {w.name}</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.7)', fontFamily: 'var(--font-mono)' }}>{w.email}</div>
          </div>
        ))}
      </div>
    );
  }
  return <SpinningRaffleWheel pool={pool} winners={winners} />;
}

function SpinningRaffleWheel({ pool, winners }: { pool: RafflePoolEntry[]; winners: RaffleWinnerDisplay[] }) {
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

    // Excluded by participant_id, not name — two different people at the
    // same event can share a name, and filtering by name string would
    // incorrectly drop the OTHER person's filler slot along with the
    // winner's, and (worse) could make the wrong same-named participant
    // vanish from the wheel entirely.
    const others = pool.filter((p) => p.participant_id !== currentWinner.participant_id).map((p) => p.name);
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
    // Scaled up with SPIN_DURATION_MS so the longer spin still feels fast
    // and builds tension, rather than crawling for 10 seconds.
    const extraSpins = 14;
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
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            boxShadow: '0 0 0 10px rgba(255,255,255,.95), 0 24px 60px rgba(0,0,0,.45)',
          }}
        >
          <WheelFace segments={segments} segmentAngle={segmentAngle} rotation={rotation} spinning={spinning} onSettled={handleTransitionEnd} />
        </div>
      </div>

      <div style={{ minHeight: 90, textAlign: 'center' }}>
        {celebrating ? (
          <Celebration name={currentWinner.name} email={currentWinner.email} key={currentWinner.participant_id} />
        ) : (
          <p style={{ fontSize: 'var(--text-md)', color: 'rgba(255,255,255,.75)' }}>
            Drawing winner {winnerIndex + 1} of {winners.length}…
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Wheel face (SVG) ----------
// Names read along the rim (SVG text-on-a-path) instead of as flat, tilted
// labels — the standard technique real wheel-of-fortune UIs use, since a
// straight label rotated to an arbitrary angle just reads badly at most
// positions around a circle. Wedge fills and label paths share the exact
// same polar-coordinate math, so there's no separate system that could ever
// drift out of sync with the segment it's meant to label.
const CX = 170;
const CY = 170;
const WHEEL_R = 170;
const LABEL_R = 122;
const HUB_R = 28;

function polarPoint(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
}

function wedgePath(startAngle: number, endAngle: number) {
  const p1 = polarPoint(startAngle, WHEEL_R);
  const p2 = polarPoint(endAngle, WHEEL_R);
  return `M ${CX} ${CY} L ${p1.x} ${p1.y} A ${WHEEL_R} ${WHEEL_R} 0 0 1 ${p2.x} ${p2.y} Z`;
}

// A short arc at label radius for the name to curve along. Bottom-half
// segments have their arc drawn in reverse (end -> start) so the text's
// "up" direction still points outward instead of rendering upside down —
// same readability goal as before, just resolved by picking which way the
// path runs instead of computing a compensating rotation by hand.
function labelPath(startAngle: number, endAngle: number, flip: boolean) {
  const a = flip ? endAngle : startAngle;
  const b = flip ? startAngle : endAngle;
  const p1 = polarPoint(a, LABEL_R);
  const p2 = polarPoint(b, LABEL_R);
  const sweep = flip ? 0 : 1;
  return `M ${p1.x} ${p1.y} A ${LABEL_R} ${LABEL_R} 0 0 ${sweep} ${p2.x} ${p2.y}`;
}

function WheelFace({
  segments,
  segmentAngle,
  rotation,
  spinning,
  onSettled,
}: {
  segments: WheelSegment[];
  segmentAngle: number;
  rotation: number;
  spinning: boolean;
  onSettled: () => void;
}) {
  return (
    <svg
      viewBox="0 0 340 340"
      width="100%"
      height="100%"
      style={{ display: 'block', borderRadius: '50%', overflow: 'visible' }}
    >
      <g
        onTransitionEnd={onSettled}
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition: spinning ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.15, 0.65, 0.15, 1)` : 'none',
        }}
      >
        {!segments.length && <circle cx={CX} cy={CY} r={WHEEL_R} fill="#334D7A" />}
        {segments.map((seg, i) => {
          const startAngle = i * segmentAngle;
          const endAngle = startAngle + segmentAngle;
          const center = startAngle + segmentAngle / 2;
          // Whether this segment lands upright or upside-down once the
          // wheel finishes spinning — same "final resting position"
          // reasoning as the rotation target itself, not its angle in the
          // wheel's own unrotated frame.
          const restingAngle = ((center + rotation) % 360 + 360) % 360;
          const flip = restingAngle > 90 && restingAngle < 270;
          const pathId = `beacon-raffle-label-${seg.id}`;
          return (
            <g key={seg.id}>
              <path d={wedgePath(startAngle, endAngle)} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} />
              <path id={pathId} d={labelPath(startAngle, endAngle, flip)} fill="none" />
              <text fontSize={13.5} fontWeight={700} fill="#fff" style={{ textShadow: '0 1px 3px rgba(0,0,0,.45)' }}>
                <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
                  {seg.name}
                </textPath>
              </text>
            </g>
          );
        })}
      </g>

      {/* Center hub with the Beacon mark — outside the rotating group, so it never spins */}
      <circle cx={CX} cy={CY} r={HUB_R} fill="#fff" style={{ filter: 'drop-shadow(0 2px 10px rgba(0,0,0,.3))' }} />
      <image href="/beacon-mark.png" x={CX - 17} y={CY - 17} width={34} height={34} />
    </svg>
  );
}

function Celebration({ name, email }: { name: string; email: string }) {
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
      <div style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.7)', fontFamily: 'var(--font-mono)', marginTop: 4, animation: 'beacon-raffle-pop 500ms ease' }}>{email}</div>
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
