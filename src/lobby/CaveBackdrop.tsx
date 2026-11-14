import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { seededRandom } from "../lib/seededRandom";
import { daubPath, paintRock, VIEW } from "./caveRock";

const TORCHLIGHT = "#f2a04e";
const WISPLIGHT = "#a8d2ff";
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
 * One of the party, seen from behind. Its shape is drawn a hundred units tall
 * with the feet at the origin, twice over: nudged towards the light in the
 * light's colour, then in its own dark cloth, which leaves a lit rim.
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
  children,
}: {
  name: "ranger" | "dwarf" | "warrior" | "wizard";
  x: number;
  feet: number;
  height: number;
  cloth: string;
  light: string;
  rim: [number, number];
  shape: ReactNode;
  children?: ReactNode;
}) {
  return (
    <g className={`cave-depth cave-${name}`}>
      <g className="cave-adventurer" transform={`translate(${x} ${feet}) scale(${height / 100})`}>
        <AdventurerLayer paint={light} shape={shape} transform={`translate(${dx} ${dy})`} />
        <AdventurerLayer paint={cloth} shape={shape} />
        <g fill="none" strokeLinecap="round">
          {children}
        </g>
      </g>
    </g>
  );
}

const limb = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

const warrior = (
  <>
    <path d="M-16-79C-17-84-9-86-5-87L5-87C9-86 17-84 16-79C19-58 21-32 23-4L-22-4C-21-32-19-58-16-79Z" />
    <ellipse cx="-14.5" cy="-80.5" rx="6.5" ry="4.6" />
    <ellipse cx="14.5" cy="-80.5" rx="6.5" ry="4.6" />
    <path d="M-6.2-91C-6.5-97-3.5-100.5 0-100.5S6.5-97 6.2-91L6.8-85-6.8-85Z" />
    <path d="M15-80L24-85 27-97" strokeWidth="6.5" {...limb} />
    <path d="M26.3-93L28.6-108" strokeWidth="2.2" {...limb} />
    <ellipse cx="28.7" cy="-109.5" rx="2.2" ry="2.6" />
  </>
);

const dwarf = (
  <>
    <path d="M-21-70C-22-76-12-80 0-80S22-76 21-70C24-50 24-25 22-5L-22-5C-24-25-24-50-21-70Z" />
    <ellipse cx="0" cy="-87" rx="9" ry="8.5" />
    <path d="M-7.5-91C-14-92-16.5-97-14.5-102C-12.5-97.5-10-95.5-6.5-94.5Z" />
    <path d="M7.5-91C14-92 16.5-97 14.5-102C12.5-97.5 10-95.5 6.5-94.5Z" />
    <path d="M13-52L27-103" strokeWidth="2.6" {...limb} />
    <path d="M23.5-95C32-105 41-101 42-89C36-93 31-93 27.5-89Z" />
  </>
);

const ranger = (
  <>
    <path d="M-11-80C-12-84-6-86 0-86S12-84 11-80C14-62 16-45 17-30C10-27-8-27-16-30C-15-45-13-62-11-80Z" />
    <path d="M-7-88C-7-96-4-101 0-101S7-96 7-88C7-84 4-82 0-82S-7-84-7-88Z" />
    <path d="M-5-31L-6-3M5-31L6-3" strokeWidth="5.5" {...limb} />
    <path d="M-11-78L-19-72-22-82" strokeWidth="4.6" {...limb} />
    <path d="M-21.6-79L-23.5-95" strokeWidth="1.8" {...limb} />
    <ellipse cx="-23.6" cy="-96.5" rx="1.9" ry="2.3" />
  </>
);

const wizard = (
  <>
    <path d="M-13-80C-14-85-7-87 0-87S14-85 13-80C17-60 21-40 24-20L-23-20C-20-40-16-60-13-80Z" />
    <path d="M-6-96L6-96 7.5-83-7.5-83Z" />
    <ellipse cx="0" cy="-96" rx="15.5" ry="3.6" />
    <path d="M-8.5-97C-6-108-2-118 3-126C6-128.5 9.5-126 8-123C5-120.5 6-110 8.5-97Z" />
    <path d="M-12-83L-30-91-27-74-13-69Z" />
    <path d="M-12-79L-22-78-29-87" strokeWidth="5.5" {...limb} />
    <path d="M12-79L19.5-69" strokeWidth="5.5" {...limb} />
    <path d="M21-22L19.5-116" strokeWidth="2" {...limb} />
    <path
      d="M19.5-116C19-124 27-125 27-118.5C27-115 23.5-114 22.5-116.5"
      strokeWidth="1.8"
      {...limb}
    />
  </>
);

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
            <Adventurer
              name="ranger"
              x={1075}
              feet={882}
              height={396}
              cloth="#121a16"
              light={TORCHLIGHT}
              rim={[-0.9, -0.5]}
              shape={ranger}
            >
              <path d="M-10-38C8-52 12-82 4-100" stroke="#6b5236" strokeWidth="1.3" />
              <path d="M4-84L9-62" stroke="#33261a" strokeWidth="5" />
              <path
                d="M3-87L1.5-92M5.5-87L5.5-92.5M8-86L9.5-91"
                stroke="#b9a37c"
                strokeWidth="0.8"
              />
              <path
                d="M-9-72C-10-58-12-46-13-34"
                stroke={TORCHLIGHT}
                strokeWidth="0.9"
                opacity="0.45"
              />
            </Adventurer>
            <Adventurer
              name="dwarf"
              x={480}
              feet={1113}
              height={416}
              cloth="#1c1712"
              light={TORCHLIGHT}
              rim={[-0.9, -0.8]}
              shape={dwarf}
            >
              <rect x="-14" y="-70" width="28" height="40" rx="5" fill="#33261a" />
              <path d="M-14-56L14-56" stroke="#1a130d" strokeWidth="1.4" />
              <path d="M-13.5-66L-13.5-34" stroke={TORCHLIGHT} strokeWidth="1" opacity="0.5" />
              <ellipse cx="0" cy="-73" rx="18" ry="5.2" fill="#4c3b28" />
              <path
                d="M-17-74.5C-9-78 6-78.5 15-76.5"
                stroke="#c98a48"
                strokeWidth="1"
                opacity="0.6"
              />
              <path d="M-8-77.5L-8-68.5M8-77.5L8-68.5" stroke="#1a130d" strokeWidth="1.5" />
              <path d="M-5.5-93.5C-3-95.5 3-95.5 5.5-93.5" stroke="#5a4a3c" strokeWidth="1.2" />
            </Adventurer>
            <Adventurer
              name="warrior"
              x={170}
              feet={1302}
              height={756}
              cloth="#24141a"
              light={TORCHLIGHT}
              rim={[0.7, -0.6]}
              shape={warrior}
            >
              <circle cx="-2" cy="-60" r="13.5" fill="#2b2220" stroke="#120d0e" strokeWidth="1" />
              <path
                d="M-11.5-69.5L7.5-50.5M-11.5-50.5L7.5-69.5"
                stroke="#1a1413"
                strokeWidth="0.8"
              />
              <path
                d="M-2-73.5A13.5 13.5 0 0 1 11.5-60"
                stroke="#d98a45"
                strokeWidth="1.1"
                opacity="0.8"
              />
              <circle cx="-2" cy="-60" r="3" fill="#7a5a3a" />
              <path
                d="M2-99.6C4.6-98 5.8-95 5.6-91"
                stroke={TORCHLIGHT}
                strokeWidth="0.8"
                opacity="0.8"
              />
              <path
                d="M-12-44C-13-30-14-18-15-6"
                stroke="#0e080a"
                strokeWidth="1.2"
                opacity="0.6"
              />
              <path d="M14-46C15-32 17-18 18-6" stroke="#6a3426" strokeWidth="1" opacity="0.6" />
            </Adventurer>
            <Adventurer
              name="wizard"
              x={1410}
              feet={1260}
              height={720}
              cloth="#161a30"
              light={WISPLIGHT}
              rim={[-0.8, -0.4]}
              shape={wizard}
            >
              <path d="M-8.2-98.6C-3-96.8 3-96.8 8.2-98.6" stroke="#7a6aa0" strokeWidth="1.5" />
              <path
                d="M-9-66C-11-52-14-38-17-22"
                stroke="#7fa6d8"
                strokeWidth="0.9"
                opacity="0.45"
              />
              <path d="M3-70C4-54 6-38 8-22" stroke="#0b0d1c" strokeWidth="1.2" opacity="0.7" />
              <path d="M12-62C14-48 17-34 20-22" stroke="#0b0d1c" strokeWidth="1" opacity="0.6" />
              <path d="M18.6-112L20-30" stroke="#8fb4de" strokeWidth="0.5" opacity="0.6" />
            </Adventurer>
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
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
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
