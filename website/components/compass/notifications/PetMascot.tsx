'use client';

// The actual delivery UI for useTaskNotifications — a small mascot that
// walks around inside the empty strip of the tab row (to the right of
// Notes/Board/Email), waves and shows a badge count when something needs
// attention, and opens a short list on click. Purely a consumer of the
// hook's { active, count, dismiss, dismissAll } — it has no notification
// logic of its own (see useTaskNotifications.ts/taskNotifications.ts).
//
// This component's own root IS the walking area (.ch-pet-corral, a flex:1
// spacer CompassHome renders as the last child of .ch-compass-tabs) — the
// pet is positioned absolutely within it rather than fixed to the
// viewport, so it's confined to that box instead of wandering over note/
// task content the user is actually working with.
//
// Three character SVGs live in public/mascots/ (ember/nova/scout, each
// with an -idle and -wave pose) — one is picked at random per mount so
// different sessions see different pets. Swapping the actual <img src>
// between the two poses is the whole "animation": no sprite sheet, no
// frame sequence, just a still swap plus CSS handling the movement/bob
// (see the .ch-pet-* rules in globals.css) — see the design conversation
// this was built from for why (character consistency across more than 2
// AI-generated poses per pet is hard to get right, so the brief
// deliberately asked for only idle + wave).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import type { UseTaskNotifications } from './useTaskNotifications';
import { relativeDueLabel } from '../shared/taskDisplay';

const PETS = ['ember', 'nova', 'scout'] as const;
type PetName = (typeof PETS)[number];

const PET_SIZE_PX = 40; // must match .ch-pet-button's width/height in globals.css — sized to fit the tab row's own height
const ROAM_MARGIN_PX = 10; // stay clear of the corral's own edges
const ROAM_MIN_MS = 5000;
const ROAM_MAX_MS = 11000;
// The notification panel (.ch-pet-panel, 300px wide) opens anchored to the
// pet's right edge and extends leftward — with `right: -8px` against a
// ~40px-wide root, its left edge lands 300 - 40 - 8 = 252px left of the
// pet's own left edge. Keeping the pet at least that far from the corral's
// left edge means the panel never clips off-screen when it opens, without
// needing to make the panel itself edge-aware. If the corral itself is
// narrower than that (a very cramped viewport), the clamp in
// randomRoamLeft below just pins the pet to the corral's left edge instead
// — a panel that's forced to overflow slightly there is a much smaller
// problem than the pet having nowhere to stand.
const PANEL_WIDTH_PX = 300;
const PANEL_LEFT_OVERHANG_PX = PANEL_WIDTH_PX - PET_SIZE_PX - 8;

function randomRoamLeft(corralWidth: number): number {
  const idealMin = ROAM_MARGIN_PX + PANEL_LEFT_OVERHANG_PX;
  const idealMax = corralWidth - PET_SIZE_PX - ROAM_MARGIN_PX;
  if (idealMax <= idealMin) {
    // Corral too narrow to respect the panel's overhang — just keep the
    // pet fully inside the corral itself, panel positioning is secondary.
    const min = ROAM_MARGIN_PX;
    const max = Math.max(min, corralWidth - PET_SIZE_PX - ROAM_MARGIN_PX);
    return min + Math.random() * (max - min);
  }
  return idealMin + Math.random() * (idealMax - idealMin);
}

export default function PetMascot({ notifications }: { notifications: UseTaskNotifications }) {
  const [pet] = useState<PetName>(() => PETS[Math.floor(Math.random() * PETS.length)]);
  // Starts null (not yet positioned) rather than a guessed default, since
  // the real position depends on the corral's own measured width, which
  // isn't known during server render — avoids a hydration mismatch.
  const [left, setLeft] = useState<number | null>(null);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [panelOpen, setPanelOpen] = useState(false);
  const corralRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<number | null>(null); // mirrors `left` synchronously, so the roam timer always knows the current position without depending on it as an effect dependency

  function moveTo(next: number) {
    setFacing((prevFacing) => {
      const prev = leftRef.current;
      if (prev == null) return prevFacing;
      if (next > prev + 2) return 'right';
      if (next < prev - 2) return 'left';
      return prevFacing;
    });
    leftRef.current = next;
    setLeft(next);
  }

  useEffect(() => {
    if (!corralRef.current) return;
    moveTo(randomRoamLeft(corralRef.current.clientWidth));

    let timer: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      const delay = ROAM_MIN_MS + Math.random() * (ROAM_MAX_MS - ROAM_MIN_MS);
      timer = setTimeout(() => {
        if (corralRef.current) moveTo(randomRoamLeft(corralRef.current.clientWidth));
        scheduleNext();
      }, delay);
    }
    scheduleNext();

    // The corral's width tracks the tab row, which itself tracks the
    // viewport — re-clamp on resize so the pet (and, more importantly, the
    // notification panel) never ends up stranded outside the new bounds.
    function onResize() {
      if (!corralRef.current || leftRef.current == null) return;
      const maxLeft = Math.max(ROAM_MARGIN_PX, corralRef.current.clientWidth - PET_SIZE_PX - ROAM_MARGIN_PX);
      if (leftRef.current > maxLeft) moveTo(maxLeft);
    }
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (corralRef.current && !corralRef.current.contains(e.target as Node)) setPanelOpen(false);
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [panelOpen]);

  const hasNotifications = notifications.count > 0;
  // Waves whenever there's something to flag, or right after being
  // clicked (a little acknowledgement even when there's nothing due).
  const pose = hasNotifications || panelOpen ? 'wave' : 'idle';

  return (
    <div className="ch-pet-corral" ref={corralRef}>
      {left == null ? null : (
        <div className="ch-pet-root" style={{ left }}>
          {panelOpen ? (
            <div className="ch-pet-panel">
              <div className="ch-pet-panel-head">
                <span>{hasNotifications ? 'Needs your attention' : "You're all caught up"}</span>
                <button type="button" className="ch-pet-panel-close" onClick={() => setPanelOpen(false)} aria-label="Close">
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
              {hasNotifications ? (
                <>
                  <div className="ch-pet-panel-list">
                    {notifications.active.map((t) => (
                      <div key={t.id} className="ch-pet-panel-item">
                        <div className="ch-pet-panel-item-text">
                          <div className="ch-pet-panel-item-title">{t.item}</div>
                          <div className="ch-pet-panel-item-due">{relativeDueLabel(t.due, t.status)}</div>
                        </div>
                        <button type="button" className="ch-pet-panel-dismiss" onClick={() => notifications.dismiss(t.id)}>
                          Got it
                        </button>
                      </div>
                    ))}
                  </div>
                  {notifications.active.length > 1 ? (
                    <button type="button" className="ch-pet-panel-dismiss-all" onClick={notifications.dismissAll}>
                      Dismiss all
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="ch-pet-panel-empty">Nothing due or overdue right now.</div>
              )}
            </div>
          ) : null}

          <button
            type="button"
            className="ch-pet-button"
            onClick={() => setPanelOpen((v) => !v)}
            // A CSS custom property, not an inline `transform` directly —
            // .ch-pet-button's bob keyframes also animate `transform`, and
            // a CSS animation's own transform value wins over a plain
            // inline one for the same property every frame, which would
            // silently swallow a directly-set flip. Routing the facing
            // direction through a variable the keyframes themselves read
            // (see globals.css) means one `transform` declaration handles
            // bob + flip together instead of two declarations fighting.
            style={{ ['--pet-facing' as string]: facing === 'left' ? -1 : 1 } as CSSProperties}
            aria-label={
              hasNotifications
                ? `${notifications.count} task${notifications.count === 1 ? '' : 's'} need your attention`
                : 'No notifications'
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/mascots/${pet}-${pose}.svg`} alt="" width={PET_SIZE_PX} height={PET_SIZE_PX} />
            {hasNotifications ? <span className="ch-pet-badge">{notifications.count}</span> : null}
          </button>
        </div>
      )}
    </div>
  );
}
