import { type ComponentType, type ReactNode, useId } from "react";

/*
 * Every interface icon in the app, named for what it means rather than what
 * it shows. Each is drawn here on a 24-unit grid in a single colour, taken
 * from the text around it: solid shapes for what matters, a translucent
 * shape for what sits behind, and outlines (square-cornered) where a solid
 * would hide the form. Swap an icon here and it changes everywhere.
 *
 * Library entries (gear, classes, moves) have rendered, full-colour art
 * instead: see entryIcons.tsx.
 */

export type IconProps = { size?: number; className?: string };
export type Icon = ComponentType<IconProps>;

/** Icons on the main toolbar and the sidebar tabs. */
export const PROMINENT_ICON_SIZE = 32;

/**
 * The art is drawn in white into a mask, and the text colour painted
 * through it once: where shapes overlap they merge, rather than a
 * translucent text colour building up darker at the seams.
 */
/**
 * An icon's drawing, or a function that draws it given `ref`, which makes
 * ids for its gradients that are unique to each icon on the page.
 */
type Art = ReactNode | ((ref: (local: string) => string) => ReactNode);

function glyph(name: string, art: Art): Icon {
  return function Glyph({ size = 22, className }) {
    // Unique across the page: every extra React root sets its own identifierPrefix.
    const id = useId();
    const drawing = typeof art === "function" ? art((local) => `${id}-${local}`) : art;
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        data-icon={name}
        aria-hidden="true"
      >
        <mask id={id} maskUnits="userSpaceOnUse" x="-8" y="-8" width="40" height="40" color="white">
          <g className="art" fill="currentColor">
            {drawing}
          </g>
        </mask>
        {/* Room around the icon for motion that travels past its edge. */}
        <rect x="-8" y="-8" width="40" height="40" fill="currentColor" mask={`url(#${id})`} />
      </svg>
    );
  };
}

/** Outlines: square caps and mitred corners. */
const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "square",
  strokeLinejoin: "miter",
} as const;
/** What sits behind the subject. */
const faint = { opacity: 0.4 } as const;

/**
 * A straight fade from one opacity to another, between two points of the
 * grid. Drawn in user space, so it works on strokes with no height too.
 */
function fade(
  id: string,
  [x1, y1, x2, y2]: [number, number, number, number],
  [from, to]: [number, number],
) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop stopColor="currentColor" stopOpacity={from} />
      <stop offset="1" stopColor="currentColor" stopOpacity={to} />
    </linearGradient>
  );
}

/** A toothed wheel around a hole, as an even-odd path. */
function cogPath(teeth: number, outer: number, inner: number, hole: number) {
  const step = (Math.PI * 2) / teeth;
  const at = (r: number, a: number) =>
    `${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`;
  const rim = Array.from({ length: teeth }, (_, i) => {
    const a = i * step - Math.PI / 2 - step * 0.3;
    return [
      at(inner, a),
      at(outer, a + step * 0.15),
      at(outer, a + step * 0.45),
      at(inner, a + step * 0.6),
    ].join("L");
  }).join("L");
  return `M${rim}Z M${12 + hole} 12a${hole} ${hole} 0 1 0 ${-2 * hole} 0a${hole} ${hole} 0 1 0 ${2 * hole} 0Z`;
}

/** A four-pointed sparkle centred on (x, y), reaching r. */
function sparkle(x: number, y: number, r: number) {
  const k = r * 0.15;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
}

/** Erases the mask outside a circle of radius r: crops what's drawn before it. */
function outsideCircle(r: number) {
  return (
    <path
      fill="black"
      fillRule="evenodd"
      d={`M0 0h24v24H0zM${12 + r} 12a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0z`}
    />
  );
}

const bust = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20.5c0-4 3.1-7 7-7s7 3 7 7z" />
  </>
);

const folderBack = <path {...faint} d="M2.5 4.5h7l2 2h10v13h-19z" />;

const tray = <path {...line} d="M4 15v5h16v-5" />;

// Canvas tools
export const IconSelect = glyph(
  "select",
  <path d="M5 2.5v17.5l4.4-4.2 3 6.7 3.1-1.4-3-6.6 6.1-.2z" />,
);
export const IconPan = glyph(
  "pan",
  <>
    <rect x="6.8" y="5.5" width="2.6" height="9" />
    <rect x="10" y="3" width="2.6" height="11" />
    <rect x="13.2" y="4" width="2.6" height="10" />
    <rect x="16.4" y="6.5" width="2.6" height="8" />
    <path d="M6.8 12.5h12.2v3c0 3.6-2.9 6.5-6.5 6.5h-.9c-2 0-3.5-.9-4.6-2.6L3.4 15a1.5 1.5 0 0 1 2.5-1.7l.9 1.3z" />
  </>,
);
/** A quill. */
export const IconDraw = glyph("draw", (ref) => (
  <>
    {fade(ref("vane"), [8, 17, 21, 2.5], [0.2, 0.85])}
    <g className="quill">
      <path
        fill={`url(#${ref("vane")})`}
        d="M8 16.6C5.6 11.4 9.5 4.8 21 2.5c-2.7 6.4-6 11.6-10.6 15z"
      />
      <path {...line} strokeWidth="1.75" d="M4 20Q10 11.5 21 2.5" />
    </g>
    <path {...faint} className="stroke" d="M4 20.5h12V22H4z" />
  </>
));
export const IconEraser = glyph(
  "eraser",
  <>
    <g className="rubber">
      <path {...faint} d="M3.4 14.9 11.9 6.4l5.6 5.6-8.5 8.5H6.4z" />
      <path d="m11.9 6.4 3-3 5.6 5.6-3 3z" />
    </g>
    <path {...line} d="M11 21h9" />
  </>,
);
export const IconShapes = glyph(
  "shapes",
  <>
    <path className="p1" d="M8.5 2.5 14 11.5H3z" />
    <rect {...faint} className="p2" x="2.5" y="13.5" width="8" height="8" />
    <circle {...line} className="p3" cx="17" cy="16.5" r="4.5" />
  </>,
);
export const IconText = glyph(
  "text",
  <path d="M4 3.5h16v5h-2l-1-2.5h-3.5v12l2.5 1v1.5H8V19l2.5-1V6H7L6 8.5H4z" />,
);
export const IconBold = glyph(
  "bold",
  <path
    fillRule="evenodd"
    d="M6 3.5h7c3 0 5 1.6 5 4.2 0 1.6-.9 2.8-2.3 3.4 1.9.5 3.1 1.9 3.1 3.9 0 3-2.3 4.9-5.6 4.9H6zm4.2 3.3v3.6h2.4c1.2 0 1.9-.7 1.9-1.8s-.7-1.8-1.9-1.8zm0 6.7v3.9h2.9c1.3 0 2.1-.7 2.1-1.95s-.8-1.95-2.1-1.95z"
  />,
);
export const IconItalic = glyph(
  "italic",
  <path d="M10 3.5h8v2.2h-2.8l-3.6 12.6h2.9v2.2h-8v-2.2h2.8l3.6-12.6H10z" />,
);
/** A pair of dividers. */
export const IconMeasure = glyph(
  "measure",
  <>
    <rect x="11" y="1" width="2" height="2.5" />
    <circle cx="12" cy="6" r="2.6" />
    <path {...line} className="leg-left" d="M10.8 8.5 5.5 21" />
    <path {...line} className="leg-right" d="M13.2 8.5 18.5 21" />
    <path {...line} {...faint} d="M7 17.5q5 2.2 10 0" />
  </>,
);
/** A radar sweep. */
export const IconPing = glyph("ping", (ref) => (
  <>
    {/* The sweep's trail fades behind its leading edge. */}
    {fade(ref("trail"), [19, 8.5, 11, 3], [0.75, 0])}
    <circle {...line} cx="12" cy="12" r="9.5" />
    <circle {...line} {...faint} strokeWidth="1.5" cx="12" cy="12" r="5" />
    <g className="sweep">
      <path fill={`url(#${ref("trail")})`} d="M12 12V2.5a9.5 9.5 0 0 1 8.23 4.75z" />
      <path {...line} d="M12 12l7.4-4.3" />
    </g>
    <circle className="blip" cx="15.5" cy="16" r="1.7" />
    <circle cx="12" cy="12" r="1.5" />
  </>
));
export const IconWall = glyph(
  "wall",
  <path d="M2 3.5h9.2V8H2zm10.8 0H22V8h-9.2zM2 9.5h4V14H2zm5.6 0h8.8V14H7.6zm10.4 0h4V14h-4zM2 15.5h9.2V20H2zm10.8 0H22V20h-9.2z" />,
);
/** A lantern. */
export const IconLight = glyph("light", (ref) => (
  <>
    {/* The glass glows brightest about the flame. */}
    <radialGradient id={ref("glow")} gradientUnits="userSpaceOnUse" cx="12" cy="15" r="6">
      <stop stopColor="currentColor" stopOpacity={0.75} />
      <stop offset="1" stopColor="currentColor" stopOpacity={0.15} />
    </radialGradient>
    <circle {...line} strokeWidth="1.75" cx="12" cy="3.5" r="1.75" />
    <path d="M6.5 9.5 9.5 5.8h5l3 3.7z" />
    <rect fill={`url(#${ref("glow")})`} x="8" y="10" width="8" height="8.5" />
    <path
      className="flame"
      d="M12 11.3c1.7 1.7 2.3 2.9 2.3 4.2a2.3 2.3 0 0 1-4.6 0c0-1.3.6-2.5 2.3-4.2z"
    />
    <path {...line} strokeWidth="1.5" d="M7.75 10v8.5M16.25 10v8.5" />
    <rect x="6" y="19" width="12" height="2.5" />
  </>
));
/** A drift of magic sparkles. */
export const IconEffects = glyph(
  "effects",
  <>
    <path className="p1" d={sparkle(9.5, 10, 6.5)} />
    <path className="p2" d={sparkle(18, 5, 3.5)} />
    <path {...faint} className="p3" d={sparkle(17, 16.5, 4)} />
    <path className="p4" d={sparkle(6, 19, 2.5)} />
    <circle {...faint} cx="3.5" cy="4" r="1" />
    <circle {...faint} cx="21" cy="11" r="1" />
    <circle cx="12.5" cy="21" r=".9" />
  </>,
);
export const IconRain = glyph(
  "rain",
  <>
    <path d="M7 15a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 17.6 7.8 3.6 3.6 0 0 1 17.5 15z" />
    <path {...line} className="drops" d="M8 18.5l-1 2.5M12.5 18.5l-1 2.5M17 18.5l-1 2.5" />
  </>,
);
const snowArm = <path d="M12 2.5v19M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />;
export const IconSnow = glyph(
  "snow",
  <g {...line} strokeWidth="1.75">
    {snowArm}
    <g transform="rotate(60 12 12)">{snowArm}</g>
    <g transform="rotate(120 12 12)">{snowArm}</g>
  </g>,
);
/** Wisps of fog, thinning out to the right. */
export const IconFog = glyph("fog", (ref) => (
  <>
    {fade(ref("thick"), [3, 0, 21, 0], [1, 0.25])}
    {fade(ref("thin"), [3, 0, 21, 0], [0.6, 0.1])}
    <g {...line}>
      <path className="p1" stroke={`url(#${ref("thin")})`} d="M4 6.5h11M18 6.5h2" />
      <path className="p2" stroke={`url(#${ref("thick")})`} d="M3 12h13M19 12h2" />
      <path className="p3" stroke={`url(#${ref("thin")})`} d="M5 17.5h13" />
    </g>
  </>
));
export const IconEmbers = glyph(
  "embers",
  <>
    <path
      className="flame"
      fillRule="evenodd"
      d="M12 2c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.2-4.2 2.4-5.4.2 1.6.9 2.6 1.9 3C10.8 7.8 11.5 4.7 12 2zm0 9.5c-.9 1.3-2.2 2.3-2.2 4a2.2 2.2 0 0 0 4.4 0c0-1.7-1.3-2.7-2.2-4z"
    />
    <circle {...faint} className="p1" cx="19.5" cy="5" r="1.2" />
    <circle {...faint} className="p2" cx="4.5" cy="7" r="1" />
  </>,
);
/** A wand, starred at its tip. */
export const IconMagic = glyph(
  "magic",
  <>
    <path {...line} className="wand" strokeWidth="2.5" d="M4 20 12.5 11.5" />
    <path className="star" d="m16.5 2.5 1.3 3.7 3.7 1.3-3.7 1.3-1.3 3.7-1.3-3.7-3.7-1.3 3.7-1.3z" />
    <circle {...faint} cx="7" cy="5" r="1.2" />
    <circle {...faint} cx="20" cy="15" r="1.2" />
  </>,
);

// Scene elements and canvas actions
export const IconToken = glyph(
  "token",
  <path d="M12 2.5a3.3 3.3 0 0 0-2 5.9c-1 .4-1.6 1.1-1.6 1.8h7.2c0-.7-.6-1.4-1.6-1.8a3.3 3.3 0 0 0-2-5.9zM9.8 11.5h4.4l1 6H8.8zM5.5 19.5c0-.9.8-1.5 1.8-1.5h9.4c1 0 1.8.6 1.8 1.5v2h-13z" />,
);
/** A treasure map: the route dashed to where X marks the spot. */
export const IconMap = glyph(
  "map",
  <>
    <path {...faint} d="M4 5h16v14H4z" />
    <rect x="2" y="3.5" width="3.5" height="16.5" />
    <rect x="18.5" y="4" width="3.5" height="16.5" />
    <path
      {...line}
      className="route"
      strokeWidth="1.75"
      strokeDasharray="2 2"
      d="M7.5 16.5c2.5-4 4.5 1 6.5-4"
    />
    <path {...line} className="mark" d="M14.5 7l3 3m0-3-3 3" />
  </>,
);
/** A crosshair. */
export const IconTarget = glyph(
  "target",
  <>
    <circle {...line} className="ring" cx="12" cy="12" r="7.5" />
    <path {...line} d="M12 2v5.5M12 16.5V22M2 12h5.5M16.5 12H22" />
    <circle cx="12" cy="12" r="1.5" />
  </>,
);
export const IconPost = glyph(
  "post",
  <>
    <path {...faint} d="M2.5 11.2 21 3 11.2 13.8z" />
    <path d="M21 3 11.2 13.8l4.3 7.2z" />
  </>,
);
const lockBody = (
  <path
    fillRule="evenodd"
    d="M4.5 10.5h15v11h-15zM12 13.5a1.6 1.6 0 0 0-.8 3V19h1.6v-2.5a1.6 1.6 0 0 0-.8-3z"
  />
);
export const IconLock = glyph(
  "lock",
  <>
    <path {...line} className="shackle" strokeWidth="2.5" d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    {lockBody}
  </>,
);
export const IconUnlock = glyph(
  "unlock",
  <>
    <path {...line} className="shackle" strokeWidth="2.5" d="M8 10V7.5a4 4 0 0 1 7.8-1.3" />
    {lockBody}
  </>,
);
export const IconImage = glyph(
  "image",
  <>
    <rect {...line} x="3" y="4" width="18" height="16" />
    <path d="M6 17.5 10 11.5l3 4 2.2-2.8 3 4.8z" />
    <circle className="sun" cx="15.5" cy="8.5" r="1.8" />
  </>,
);
export const IconBack = glyph("back", <path {...line} strokeWidth="2.5" d="M15 5l-7 7 7 7" />);
export const IconFolder = glyph(
  "folder",
  <>
    {folderBack}
    <path className="front" d="M2.5 9h19v10.5h-19z" />
  </>,
);
export const IconNewFolder = glyph(
  "new-folder",
  <>
    {folderBack}
    <path
      className="front"
      fillRule="evenodd"
      d="M2.5 9h19v10.5h-19zM11.25 11v2.25H9v1.5h2.25V17h1.5v-2.25H15v-1.5h-2.25V11z"
    />
  </>,
);
/** Campaign backups: save one to a file, bring one in, keep one in a folder. */
export const IconExport = glyph(
  "export",
  <>
    <g className="arrow">
      <path {...line} d="M12 3v7" />
      <path d="M7.5 9.5 12 14.5l4.5-5z" />
    </g>
    {tray}
  </>,
);
export const IconImport = glyph(
  "import",
  <>
    <g className="arrow">
      <path {...line} d="M12 8v7" />
      <path d="M7.5 8.5 12 3.5l4.5 5z" />
    </g>
    {tray}
  </>,
);
export const IconBackupFolder = glyph(
  "backup-folder",
  <>
    {folderBack}
    <path
      className="front"
      fillRule="evenodd"
      d="M2.5 9h19v10.5h-19zM12 10.5l3.5 1.2v2.3c0 2-1.4 3.4-3.5 4.1-2.1-.7-3.5-2.1-3.5-4.1v-2.3z"
    />
  </>,
);
export const IconGrid = glyph(
  "grid",
  <>
    <rect {...line} x="3" y="3" width="18" height="18" />
    <path {...line} className="lines" strokeWidth="1.5" d="M9 3v18M15 3v18M3 9h18M3 15h18" />
  </>,
);
export const IconToFront = glyph(
  "to-front",
  <>
    <path {...faint} d="M3 3h11v5H8v6H3z" />
    <rect className="front" x="9.5" y="9.5" width="11.5" height="11.5" />
  </>,
);
export const IconToBack = glyph(
  "to-back",
  <>
    <path className="back" d="M3 3h11v5H8v6H3z" />
    <rect {...line} x="10.5" y="10.5" width="10" height="10" />
  </>,
);
export const IconDuplicate = glyph(
  "duplicate",
  <>
    <path {...line} d="M15 3H4v13" />
    <rect className="copy" x="8" y="7" width="12" height="14.5" />
  </>,
);
/** A gift resting in an open hand. */
export const IconGive = glyph(
  "give",
  <>
    <g className="gift">
      <path d="M11.5 7.6C10.3 5.2 7.8 4.8 7.8 6.5c0 1 1.6 1.4 3.7 1.4zm0 0c1.2-2.4 3.7-2.8 3.7-1.1 0 1-1.6 1.4-3.7 1.4z" />
      <path d="M6.5 8.4h4.4v2.6H6.5zm5.6 0h4.4v2.6h-4.4zM7.2 11.8h3.7v4.4H7.2zm4.9 0h3.7v4.4h-3.7z" />
    </g>
    <path d="M2 15.5h3.5l3 1.5h5a1.75 1.75 0 0 1 0 3.5h-4.2v.4h4.9l5.3-3.6a1.7 1.7 0 0 1 2.2 2.6L15.6 23H6.8L4 21.5H2z" />
  </>,
);
export const IconRename = glyph(
  "rename",
  <g className="pencil">
    <path d="m16.2 2.8 5 5-1.8 1.8-5-5z" />
    <path d="m13.2 5.8 5 5L8.5 20.5H3.5v-5z" />
  </g>,
);
export const IconShortcut = glyph(
  "shortcut",
  <>
    <rect {...line} x="2" y="5.5" width="20" height="13" />
    <path
      className="keys"
      d="M5 8.5h2v2H5zm3.5 0h2v2h-2zm3.5 0h2v2h-2zm3.5 0h2v2h-2zM6.5 12h2v2h-2zm3.5 0h2v2h-2zm3.5 0h2v2h-2zM7 15h10v1.5H7z"
    />
  </>,
);
export const IconFit = glyph(
  "fit",
  <>
    <path {...line} className="corners" d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
    <rect {...faint} x="7" y="7" width="10" height="10" />
  </>,
);
const undoArrow = (
  <>
    <path {...line} d="M7 9h8a5 5 0 0 1 0 10H9" />
    <path d="M2.5 9 8 4v10z" />
  </>
);
export const IconUndo = glyph("undo", undoArrow);
export const IconRedo = glyph("redo", <g transform="matrix(-1 0 0 1 24 0)">{undoArrow}</g>);

// Sidebar panels
export const IconChat = glyph(
  "chat",
  <>
    <path {...faint} className="p1" d="M8 2.5h13.5v9H19v3l-3-3H8z" />
    <path className="p2" d="M2.5 8h13v9.5H8.5l-3.5 3.5v-3.5H2.5z" />
  </>,
);
/** A figure with a raised sword. */
export const IconCharacters = glyph(
  "characters",
  <>
    <circle cx="8.5" cy="4.5" r="3" />
    <path d="M4.5 8.5h8l-.6 8H5.1z" />
    <path d="M5.2 16h2.8v6.5H5.2zm3.9 0h2.8v6.5H9.1z" />
    <path {...line} strokeWidth="2.5" d="M4.8 9.8 3.4 15" />
    <g className="sword">
      <path {...line} strokeWidth="2.5" d="M12 9.8l4 4" />
      <path d="M16.2 12.5V3.2l.9-1.8.9 1.8v9.3zM14.3 12.5h5.6v1.6h-5.6zm2.1 1.6h1.4v3h-1.4z" />
    </g>
  </>,
);
/** The same figure, chest up, in a cameo. */
export const IconPlayerCharacter = glyph(
  "player-character",
  <>
    <circle cx="10.5" cy="8.5" r="3" />
    <path d="M3 24c0-6 3.4-10 7.5-10s7.5 4 7.5 10z" />
    <path
      className="sword"
      d="M16.3 14V5l.7-1.7.7 1.7v9zM14.6 14h4.8v1.4h-4.8zm1.8 1.4h1.2v2.6h-1.2z"
    />
    {outsideCircle(8.6)}
    <circle {...line} strokeWidth="1.75" cx="12" cy="12" r="9.5" />
  </>,
);
/** A shelf of books. */
export const IconLibraries = glyph(
  "libraries",
  <>
    <rect x="3" y="5" width="3" height="15" />
    <rect x="7" y="3" width="3" height="17" />
    <rect {...faint} x="11" y="6.5" width="3" height="13.5" />
    <path className="lean" d="m15.2 7.4 2.9-.8 3.6 13.4-2.9.8z" />
    <path {...line} d="M2 21.5h20" />
  </>,
);
/** A scroll. */
export const IconReference = glyph(
  "reference",
  <>
    <g className="sheet">
      <rect {...faint} x="6.5" y="5.5" width="11" height="13" />
      <path {...line} strokeWidth="1.5" d="M9 9.5h6M9 12.5h6M9 15.5h3.5" />
    </g>
    <rect x="4.5" y="2.5" width="15" height="3.5" />
    <rect x="4.5" y="18" width="15" height="3.5" />
  </>,
);
/**
 * One half of an open book. It erases what lies beneath before drawing, so
 * a page laid over another covers it rather than adding to its brightness.
 */
const halfPage = "M12 7c-2.7-1.8-6-2.5-9.5-2v14c3.5-.5 6.8.2 9.5 2z";
const page = (
  <>
    <path fill="black" d={halfPage} />
    <path {...faint} d={halfPage} />
    <path {...line} strokeWidth="1.75" d={halfPage} />
    <path {...line} strokeWidth="1.5" d="M5.5 9.5c1.4 0 2.6.3 3.8.8M5.5 13c1.4 0 2.6.3 3.8.8" />
  </>
);
const rightPage = <g transform="matrix(-1 0 0 1 24 0)">{page}</g>;
/** An open book; when it plays, its right-hand page turns over onto the left. */
export const IconNotes = glyph(
  "notes",
  <>
    {page}
    {rightPage}
    <g className="leaf">{rightPage}</g>
    <path {...line} strokeWidth="1.5" d="M12 7v13.5" />
  </>,
);
/** A GM-only page: a closed book with a watching eye. */
export const IconSecret = glyph(
  "secret",
  <>
    <rect x="5" y="2.5" width="14" height="19" />
    <g className="eye">
      <path
        fill="black"
        d="M12 9c-2.4 0-4 1.6-4.8 3 .8 1.4 2.4 3 4.8 3s4-1.6 4.8-3c-.8-1.4-2.4-3-4.8-3z"
      />
      <circle cx="12" cy="12" r="1.4" />
    </g>
  </>,
);
const eye = "M2 12c2.5-4.5 6-6.5 10-6.5s7.5 2 10 6.5c-2.5 4.5-6 6.5-10 6.5S4.5 16.5 2 12z";
export const IconReveal = glyph(
  "reveal",
  <>
    <path {...line} d={eye} />
    <circle className="iris" cx="12" cy="12" r="3.5" />
  </>,
);
export const IconObscure = glyph(
  "obscure",
  <>
    <path {...line} {...faint} d={eye} />
    <circle {...faint} cx="12" cy="12" r="3.5" />
    <path {...line} className="slash" strokeWidth="2.5" pathLength={1} d="M4 20 20 4" />
  </>,
);
export const IconMembers = glyph(
  "members",
  <>
    <g {...faint} className="p1">
      <circle cx="5" cy="9.5" r="2.3" />
      <path d="M1 19c0-2.6 1.7-4.5 4-4.5 1 0 1.9.3 2.5.9-1 1-1.6 2.3-1.8 3.6z" />
    </g>
    <g {...faint} className="p3">
      <circle cx="19" cy="9.5" r="2.3" />
      <path d="M23 19c0-2.6-1.7-4.5-4-4.5-1 0-1.9.3-2.5.9 1 1 1.6 2.3 1.8 3.6z" />
    </g>
    <g className="p2">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M6.2 20c0-3.6 2.6-6.2 5.8-6.2s5.8 2.6 5.8 6.2z" />
    </g>
  </>,
);

// Game actions
export const IconDice = glyph(
  "dice",
  <>
    <rect {...faint} x="10.5" y="2.5" width="10" height="10" transform="rotate(15 15.5 7.5)" />
    <path
      fillRule="evenodd"
      d="M3 9.5h12v12H3zM6.3 11.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm2.7 3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm2.7 3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"
    />
  </>,
);
/** Rolling: the same dice. */
export const IconRoll = IconDice;
const sword = (
  <>
    <path d="M21 3l-.7 3.2-9.6 9.6-2.5-2.5 9.6-9.6z" />
    <path {...line} d="m5 14.5 4.5 4.5M7.3 16.7 4 20" />
  </>
);
export const IconCombat = glyph(
  "combat",
  <>
    <g className="p1">{sword}</g>
    <g className="p2">
      <g transform="matrix(-1 0 0 1 24 0)">{sword}</g>
    </g>
  </>,
);
/** An anvil. */
export const IconItems = glyph(
  "items",
  <path d="M2 7 6 6h14v4h-4.5v1.5c0 1.5.6 2.6 1.8 3.5H19v3.5H5V15h2.2c1.2-.9 1.8-2 1.8-3.5V10H7.5C5 10 3.5 8.8 2 7z" />,
);
/** A rucksack. */
export const IconNewGear = glyph(
  "new-gear",
  <>
    <path {...line} strokeWidth="1.75" d="M9 5V2.5h6V5" />
    <path
      fillRule="evenodd"
      d="M4 10c0-3 2.2-5 5-5h6c2.8 0 5 2 5 5v11.5H4zm1.5 1.5v1.5h13v-1.5zM8 15.5v3.5h8v-3.5z"
    />
  </>,
);
export const IconNewMove = glyph("new-move", <path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.5z" />);
export const IconStartCombat = glyph("start-combat", <path d="M7 4v16l13-8z" />);
export const IconEndCombat = glyph("end-combat", <rect x="5" y="5" width="14" height="14" />);
const skip = (
  <>
    <path d="M4.5 4v16l11-8z" />
    <rect x="16.5" y="4" width="3" height="16" />
  </>
);
export const IconNextTurn = glyph("next-turn", skip);
export const IconPreviousTurn = glyph(
  "previous-turn",
  <g transform="matrix(-1 0 0 1 24 0)">{skip}</g>,
);
/** Two people, each to the other. */
export const IconRelationships = glyph(
  "relationships",
  <>
    <g className="p1">
      <circle cx="5" cy="8.5" r="2.7" />
      <path d="M.5 19c0-3.2 2-5.5 4.5-5.5s4.5 2.3 4.5 5.5z" />
    </g>
    <g className="p3">
      <circle cx="19" cy="8.5" r="2.7" />
      <path d="M14.5 19c0-3.2 2-5.5 4.5-5.5s4.5 2.3 4.5 5.5z" />
    </g>
    <g className="arrow">
      <path {...line} d="M10.5 9.5h3" />
      <path d="M8.3 9.5 11 7v5zm7.4 0L13 7v5z" />
    </g>
  </>,
);
export const IconPin = glyph(
  "pin",
  <>
    <path d="m14.5 2.5 7 7-1.6 1.1-2.9-.9-4 4 .4 4.1-1.4 1.4-8.2-8.2 1.4-1.4 4.1.4 4-4-.9-2.9z" />
    <path {...line} d="m8.2 15.8-4.7 4.7" />
  </>,
);

// Members
export const IconRemoveMember = glyph(
  "remove-member",
  <>
    {bust}
    <path {...line} className="sign" d="M17 10.5h5" />
  </>,
);
export const IconAllowBack = glyph(
  "allow-back",
  <>
    {bust}
    <path {...line} className="sign" d="M19.5 8v5M17 10.5h5" />
  </>,
);

// Interface
export const IconSettings = glyph(
  "settings",
  <path fillRule="evenodd" d={cogPath(8, 10, 7.4, 3)} />,
);
export const IconHelp = glyph(
  "help",
  <>
    <circle {...faint} cx="12" cy="12" r="10" />
    <path {...line} className="mark" d="M9.2 9.2a2.8 2.8 0 1 1 3.9 2.6c-.7.3-1.1.9-1.1 1.6v.8" />
    <circle cx="12" cy="17.5" r="1.3" />
  </>,
);
/** An arched door swung open in its doorway. */
export const IconLeave = glyph(
  "leave",
  <>
    <path {...faint} d="M5 21.5V10a7 7 0 0 1 14 0v11.5z" />
    <path
      className="door"
      fillRule="evenodd"
      d="M5 21.5V10a3.85 7 0 0 1 7.7 0v11.5zM11 13.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"
    />
  </>,
);
export const IconDelete = glyph(
  "delete",
  <>
    <g className="lid">
      <rect x="9" y="1.5" width="6" height="2.5" />
      <rect x="3" y="4.5" width="18" height="2.5" />
    </g>
    <path fillRule="evenodd" d="M5 8.5h14l-1.2 13H6.2zM9 11v8h1.5v-8zm4.5 0v8H15v-8z" />
  </>,
);
export const IconAdd = glyph("add", <path {...line} strokeWidth="2.5" d="M12 4.5v15M4.5 12h15" />);
export const IconRemove = glyph("remove", <path {...line} strokeWidth="2.5" d="M4.5 12h15" />);
export const IconSearch = glyph("search", (ref) => (
  <>
    {/* Light catching the lens from the top left. */}
    {fade(ref("sheen"), [5, 5, 14, 14], [0.65, 0.05])}
    <circle fill={`url(#${ref("sheen")})`} cx="10" cy="10" r="6.5" />
    <circle {...line} cx="10" cy="10" r="6.5" />
    <path d="m14.6 16.7 2.1-2.1 5.3 5.3-2.1 2.1z" />
  </>
));
export const IconClose = glyph(
  "close",
  <path {...line} strokeWidth="2.5" d="M6 6l12 12M18 6 6 18" />,
);
export const IconMenu = glyph(
  "menu",
  <path {...line} strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />,
);
export const IconExpand = glyph("expand", <path {...line} strokeWidth="2.5" d="M5 9l7 7 7-7" />);
const pane = <rect {...line} x="3" y="4" width="18" height="16" />;
/** Two panes side by side, and one pane at a time. */
export const IconLayoutSplit = glyph(
  "layout-split",
  <>
    {pane}
    <path {...line} className="divider" d="M12 4v16" />
  </>,
);
export const IconLayoutSingle = glyph("layout-single", pane);
export const IconSidebarHide = glyph(
  "sidebar-hide",
  <>
    {pane}
    <path {...line} d="M14 4v16" />
    <path {...line} className="chevron" strokeWidth="1.75" d="m16 9.5 2.5 2.5-2.5 2.5" />
  </>,
);
/** Open something in its panel, or in a window of its own. */
export const IconSidebar = glyph(
  "sidebar",
  <>
    {pane}
    <rect {...faint} className="panel" x="14" y="4" width="7" height="16" />
  </>,
);
export const IconOpenWindow = glyph(
  "open-window",
  <>
    <path {...line} d="M10 4H4v16h16v-6" />
    <path {...line} className="arrow" d="M14 4h6v6M20 4l-9 9" />
  </>,
);
/** A ticked menu item. */
export const IconCheck = glyph(
  "check",
  <path {...line} strokeWidth="2.5" pathLength={1} d="M4.5 12.5l5 5 10-11" />,
);
