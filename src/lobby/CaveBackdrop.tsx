import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { seededRandom } from "../lib/seededRandom";
import { reducedMotion } from "../ui/transition";
import { PARTY, type PartyMember } from "./caveParty";
import { daubPath, paintRock, VIEW } from "./caveRock";

const DARK = "#04050a";

/** Where something sits in the scene, from the picture's coordinates. */
function box(x: number, y: number, width: number, height = width): CSSProperties {
  const percent = (n: number, of: number) => `${Math.round((n / of) * 1e4) / 100}%`;
  return {
    left: percent(x, VIEW.width),
    top: percent(y, VIEW.height),
    width: percent(width, VIEW.width),
    height: percent(height, VIEW.height),
  };
}

const around = (x: number, y: number, radius: number) =>
  box(x - radius, y - radius, radius * 2, radius * 2);

/** What lights the cave: where each light is, and how far it reaches. */
const TORCHES = [
  { x: 387, y: 463, flame: 62, reach: 580, period: 3.7 },
  { x: 981, y: 498, flame: 36, reach: 430, period: 4.6 },
];
const WISP = { x: 1206, y: 508, reach: 290 };

const rock = paintRock();

/** Dust adrift in the torchlight. */
const motes = (() => {
  const random = seededRandom("motes");
  return TORCHES.flatMap((torch) =>
    Array.from({ length: 7 }, () => ({
      x: torch.x + (random() - 0.5) * torch.reach * 0.7,
      y: torch.y + (random() - 0.3) * torch.reach * 0.45,
      delay: -random() * 12,
      period: 8 + random() * 7,
    })),
  );
})();

/** Roughens edges like brushwork; with `bristle`, also breaks flat colour into bristle marks. */
function BrushFilter({
  id,
  scale,
  grain,
  bristle = false,
}: {
  id: string;
  scale: number;
  grain: string;
  bristle?: boolean;
}) {
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      x="0"
      y="0"
      width={VIEW.width}
      height={VIEW.height}
      colorInterpolationFilters="sRGB"
    >
      <feTurbulence type="fractalNoise" baseFrequency={grain} numOctaves="4" seed="11" />
      <feDisplacementMap
        in="SourceGraphic"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
        result="rough"
      />
      {bristle && (
        <>
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves="3" seed="4" />
          <feColorMatrix
            type="matrix"
            values="0.5 0 0 0 0.25  0.5 0 0 0 0.25  0.5 0 0 0 0.25  0 0 0 0 1"
            result="bristle"
          />
          <feBlend in="bristle" in2="rough" mode="soft-light" />
          <feComposite in2="rough" operator="in" />
        </>
      )}
    </filter>
  );
}

/**
 * One of the party (caveParty.tsx). Its shape is painted twice over: nudged
 * towards the light in the light's colour, then in its own dark cloth, which
 * leaves a lit rim. Its detail goes on top.
 */
function AdventurerLayer({
  paint,
  shape,
  transform,
}: {
  paint: string;
  shape: ReactNode;
  transform?: string;
}) {
  return (
    <g fill={paint} stroke={paint} strokeWidth="0" transform={transform}>
      {shape}
    </g>
  );
}

function Adventurer({
  name,
  x,
  feet,
  height,
  cloth,
  light,
  rim: [dx, dy],
  shape,
  detail,
}: PartyMember) {
  return (
    <g className={`cave-depth cave-${name}`}>
      <g className="cave-adventurer" transform={`translate(${x} ${feet}) scale(${height / 100})`}>
        <AdventurerLayer paint={light} shape={shape} transform={`translate(${dx} ${dy})`} />
        <AdventurerLayer paint={cloth} shape={shape} />
        <g fill="none" strokeLinecap="round">
          {detail}
        </g>
      </g>
    </g>
  );
}

/** The static picture: rock, the dark, and the party. */
function Painting({ children }: { children: ReactNode }) {
  return (
    <>
      <svg
        className="cave-painting cave-background"
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <BrushFilter id="cave-brush" scale={34} grain="0.011 0.019" bristle />
          <BrushFilter id="cave-brush-fine" scale={9} grain="0.03 0.05" />
          <filter id="cave-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="2" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <filter id="cave-soften">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <linearGradient
            id="cave-floor"
            x1="0"
            y1="577"
            x2="0"
            y2={VIEW.height}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#0b090c" />
            <stop offset="0.35" stopColor="#2a2019" />
            <stop offset="1" stopColor="#5a432e" />
          </linearGradient>
          <radialGradient id="cave-pool">
            <stop offset="0" stopOpacity="1" />
            <stop offset="0.3" stopOpacity="0.86" />
            <stop offset="0.65" stopOpacity="0.4" />
            <stop offset="1" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cave-wisp-tint">
            <stop offset="0" stopColor="#5fa8ff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#5fa8ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cave-depths" cx="800" cy="330" r="420" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#1b2233" stopOpacity="0.5" />
            <stop offset="1" stopColor="#1b2233" stopOpacity="0" />
          </radialGradient>
          <mask
            id="cave-shade"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={VIEW.width}
            height={VIEW.height}
          >
            <rect width={VIEW.width} height={VIEW.height} fill="#fff" />
            {TORCHES.map((torch) => (
              <circle
                key={torch.x}
                cx={torch.x}
                cy={torch.y}
                r={torch.reach}
                fill="url(#cave-pool)"
              />
            ))}
            <circle cx={WISP.x} cy={WISP.y} r={WISP.reach} fill="url(#cave-pool)" opacity="0.85" />
          </mask>
        </defs>

        <rect width={VIEW.width} height={VIEW.height} fill="#3a2b22" />
        <g filter="url(#cave-brush)">
          {rock.arches.map((arch, index) => (
            <path
              key={arch.d}
              className="cave-arch"
              d={arch.d}
              fill={arch.colour}
              style={{ "--cave-depth": 0.3 - (index / (rock.arches.length - 1)) * 0.9 }}
            />
          ))}
          <path d={rock.floor} fill="url(#cave-floor)" />
          <g fill="none" strokeLinecap="round">
            {rock.daubs.map((daub) => {
              const d = daubPath(daub);
              return (
                <path
                  key={d}
                  d={d}
                  stroke={daub.colour}
                  strokeWidth={Math.round(daub.width * 10) / 10}
                  opacity={Math.round(daub.opacity * 100) / 100}
                />
              );
            })}
          </g>
          {rock.spikes.map((spike) => (
            <path key={spike.d} d={spike.d} fill={spike.colour} />
          ))}
        </g>

        <circle
          className="cave-tint"
          cx={WISP.x}
          cy={WISP.y}
          r={WISP.reach}
          fill="url(#cave-wisp-tint)"
        />
        <rect
          width={VIEW.width}
          height={VIEW.height}
          fill={DARK}
          opacity="0.96"
          mask="url(#cave-shade)"
        />
        <rect width={VIEW.width} height={VIEW.height} fill="url(#cave-depths)" />
      </svg>

      <div className="cave-effects">
        <svg
          className="cave-painting"
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          preserveAspectRatio="none"
        >
          <g className="cave-depth cave-ranger">
            <ellipse
              cx="1112"
              cy="884"
              rx="92"
              ry="13"
              fill="#000"
              opacity="0.6"
              filter="url(#cave-soften)"
            />
          </g>
          <g filter="url(#cave-brush-fine)">
            {PARTY.map((member) => (
              <Adventurer key={member.name} {...member} />
            ))}
          </g>
        </svg>
        {children}
      </div>
      <svg
        className="cave-painting"
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        preserveAspectRatio="none"
      >
        <rect
          className="cave-grain"
          width={VIEW.width}
          height={VIEW.height}
          filter="url(#cave-grain)"
        />
      </svg>
    </>
  );
}

function Flame({ x, y, size }: { x: number; y: number; size: number }) {
  const outer = `cave-fire-outer-${x}`;
  const core = `cave-fire-core-${x}`;
  const blur = `cave-fire-blur-${x}`;
  return (
    <svg
      className="cave-flame"
      viewBox="-30 -72 60 84"
      style={box(x - size * 0.625, y - size * 1.5, size * 1.25, size * 1.75)}
    >
      <defs>
        <radialGradient id={outer} cx="50%" cy="75%" r="70%">
          <stop offset="0" stopColor="#ffdd86" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#f88732" stopOpacity="0.75" />
          <stop offset="0.75" stopColor="#d44e1a" stopOpacity="0.4" />
          <stop offset="1" stopColor="#b62f13" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={core} cx="50%" cy="80%" r="70%">
          <stop offset="0" stopColor="#fff4c9" />
          <stop offset="0.4" stopColor="#ffd272" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ef762a" stopOpacity="0" />
        </radialGradient>
        <filter id={blur} x="-50%" y="-30%" width="200%" height="160%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>
      <path
        fill={`url(#${outer})`}
        filter={`url(#${blur})`}
        d="M0 3C-13 3-16-7-12-17C-10-24-13-27-12-34C-7-29-8-23-5-23C-2-29-5-38 0-52C-1-39 7-35 8-25C11-30 9-35 8-39C17-29 17-17 13-9C10-2 6 3 0 3Z"
      />
      <path
        fill={`url(#${outer})`}
        opacity="0.7"
        d="M-2 2C-10 0-11-8-8-16C-5-22-7-29-3-38C-4-27 4-24 3-16C6-20 6-24 5-28C12-17 10-7 6-2C4 1 1 2-2 2Z"
      />
      <path
        fill={`url(#${core})`}
        d="M0 2C-6 2-8-4-5-10C-3-14-3-18-1-25C0-18 5-14 5-9C8-3 5 2 0 2Z"
      />
      <circle className="cave-ember" cx="-4" cy="-38" r="1.1" />
      <circle className="cave-ember" cx="5" cy="-42" r="0.9" />
      <circle className="cave-ember" cx="1" cy="-46" r="1" />
    </svg>
  );
}

function Wisp() {
  return (
    <svg className="cave-wisp" viewBox="-50 -50 100 100" style={around(WISP.x, WISP.y, 56)}>
      <defs>
        <radialGradient id="cave-wisp-core">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.22" stopColor="#d6ecff" />
          <stop offset="0.5" stopColor="#6fb4ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#6fb4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path className="cave-tail" d="M-5 4C-4 20 5 28 2 44C10 30 9 16 5 4Z" />
      <circle r="36" fill="url(#cave-wisp-core)" />
      <circle r="6" fill="#fff" />
      <g className="cave-orbit">
        <circle cx="21" cy="0" r="1.6" />
        <circle cx="-15" cy="-14" r="1.2" />
        <circle cx="-7" cy="25" r="1" />
      </g>
    </svg>
  );
}

/**
 * The lobby's backdrop: an adventuring party seen from behind, making their
 * way down a cave by torchlight and a wizard's wisp. The party keeps to the
 * sides and the bottom; the cave runs off into darkness at the top and centre,
 * behind the interface. The flames, the light they throw and the wisp move;
 * the rest is a still painting.
 */
export function CaveBackdrop() {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const update = () => {
      frame = 0;
      element.style.setProperty("--cave-x", `${x}px`);
      element.style.setProperty("--cave-y", `${y}px`);
      element.style.setProperty("--cave-svg-x", `${(x * VIEW.width) / element.clientWidth}px`);
      element.style.setProperty("--cave-svg-y", `${(y * VIEW.height) / element.clientHeight}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const reset = () => {
      x = 0;
      y = 0;
      schedule();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || reducedMotion.matches) return;
      x = Math.max(-8, Math.min(8, (0.5 - event.clientX / innerWidth) * 16));
      y = Math.max(-6, Math.min(6, (0.5 - event.clientY / innerHeight) * 12));
      schedule();
    };
    const leave = (event: MouseEvent) => {
      if (!event.relatedTarget) reset();
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("mouseout", leave);
    window.addEventListener("blur", reset);
    window.addEventListener("resize", reset);
    reducedMotion.addEventListener("change", reset);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("mouseout", leave);
      window.removeEventListener("blur", reset);
      window.removeEventListener("resize", reset);
      reducedMotion.removeEventListener("change", reset);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="cave-backdrop" aria-hidden="true">
      <div className="cave-scene" ref={scene}>
        <Painting>
          {TORCHES.map((torch, index) => {
            const flicker = { animationDuration: `${torch.period}s` };
            return (
              <div
                key={torch.x}
                className={`cave-light cave-${index === 0 ? "warrior" : "ranger"}`}
              >
                <div
                  className="cave-dim"
                  style={{ ...around(torch.x, torch.y, torch.reach), ...flicker }}
                />
                <div
                  className="cave-glow"
                  style={{
                    ...around(torch.x, torch.y - torch.flame / 2, torch.flame * 4),
                    ...flicker,
                  }}
                />
                <Flame x={torch.x} y={torch.y} size={torch.flame} />
              </div>
            );
          })}
          <div className="cave-light cave-wizard">
            <div className="cave-wisp-travel">
              <div className="cave-glow cave-wisp-glow" style={around(WISP.x, WISP.y, 190)} />
              <Wisp />
            </div>
          </div>
          {motes.map((mote) => (
            <i
              key={mote.delay}
              className="cave-mote"
              style={{
                ...box(mote.x, mote.y, 0),
                animationDelay: `${mote.delay.toFixed(2)}s`,
                animationDuration: `${mote.period.toFixed(2)}s`,
              }}
            />
          ))}
        </Painting>
      </div>
    </div>
  );
}
