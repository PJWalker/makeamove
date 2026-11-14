import type { ReactNode } from "react";

/*
 * The adventuring party, seen from behind. Each figure is drawn a hundred
 * units tall with the feet at the origin. Its `shape` is the whole outline,
 * which the backdrop paints twice (in the light's colour, then in dark cloth)
 * to leave a lit rim; its `detail` is painted over that: armour, packs, hair,
 * hands and the places the light catches.
 */

export const TORCHLIGHT = "#f2a04e";
export const WISPLIGHT = "#a8d2ff";

export interface PartyMember {
  name: "ranger" | "dwarf" | "warrior" | "wizard";
  /** Where the feet stand in the picture, and how tall the figure is there. */
  x: number;
  feet: number;
  height: number;
  cloth: string;
  /** The colour of the light that falls on the figure, and which way its rim is nudged towards it. */
  light: string;
  rim: [number, number];
  shape: ReactNode;
  detail: ReactNode;
}

const limb = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Small round studs: rivets, beads, embroidered stars. */
function Studs({
  at,
  r,
  fill,
  opacity,
}: {
  at: number[][];
  r: number;
  fill: string;
  opacity?: number;
}) {
  return (
    <g fill={fill} opacity={opacity}>
      {at.map(([cx, cy]) => (
        <circle key={`${cx} ${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
}

/* The warrior: plate and a red cloak, a round shield and a greatsword slung behind, torch held high. */

const HELM = "M-6.4-91C-6.8-97.5-3.6-101 0-101S6.8-97.5 6.4-91L7.4-84.5-7.4-84.5Z";
const CREST = "M-1-102.6L1-102.6 1.2-89.5-1.2-89.5Z";

const warriorShape = (
  <>
    <path d="M-16-79C-17-84-9-86-5-87L5-87C9-86 17-84 16-79C19-58 21-32 23-4L-22-4C-21-32-19-58-16-79Z" />
    <ellipse cx="-14.5" cy="-81" rx="7.2" ry="5" />
    <ellipse cx="14.5" cy="-81" rx="7.2" ry="5" />
    <path d={HELM} />
    <path d={CREST} />
    <path d="M-6.5-85L-13.5-101.5" strokeWidth="2" {...limb} />
    <path d="M-13.8-90.4L-4.7-94.4" strokeWidth="1.8" {...limb} />
    <circle cx="-14.2" cy="-103.2" r="1.9" />
    <path d="M15-80L24-85 27-96" strokeWidth="6.8" {...limb} />
    <ellipse cx="27.2" cy="-97.5" rx="3.6" ry="3.3" />
    <path d="M26.4-92L28.6-108" strokeWidth="2.3" {...limb} />
    <ellipse cx="28.8" cy="-109.6" rx="2.5" ry="3" />
  </>
);

const warriorDetail = (
  <>
    {/* Cloak: folds, and the side the torch lights. */}
    <path
      d="M16-78C19-58 21-32 23-4L18.5-4C18-30 16-56 13.5-76Z"
      fill={TORCHLIGHT}
      opacity="0.13"
    />
    <path d="M-12-44C-13-30-14-18-15-6" stroke="#0e080a" strokeWidth="1.2" opacity="0.6" />
    <path d="M-17-70C-18.5-52-19.5-30-20-6" stroke="#0e080a" strokeWidth="0.9" opacity="0.5" />
    <path d="M13-46C14.5-32 16.5-18 17.5-6" stroke="#7a3a2a" strokeWidth="1" opacity="0.6" />
    <path d="M6-44C7-32 8-18 8.5-6" stroke="#0e080a" strokeWidth="1" opacity="0.5" />

    {/* The greatsword's hilt over the left shoulder. */}
    <path d="M-6.5-85L-13.5-101.5" stroke="#4a3324" strokeWidth="1.5" />
    <path
      d="M-8.2-88.6L-7.2-89.4M-9.6-91.8L-8.5-92.6M-11-95.2L-9.9-96M-12.3-98.4L-11.2-99.2"
      stroke="#1c120c"
      strokeWidth="0.5"
    />
    <path d="M-13.8-90.4L-4.7-94.4" stroke="#7d7468" strokeWidth="1.3" />
    <circle cx="-14.2" cy="-103.2" r="1.5" fill="#8a8072" />
    <path d="M-13.4-104.4A1.5 1.5 0 0 1-12.8-102.6" stroke={TORCHLIGHT} strokeWidth="0.5" />

    {/* Baldric, then the shield it carries. */}
    <path d="M-14-78C-4-71 8-63 16-50" stroke="#3b2a1e" strokeWidth="2.4" />
    <circle cx="-2" cy="-60" r="13.5" fill="#3a2a22" />
    <path
      d="M-10.5-70.4L-10.5-49.6M-6.2-72.8L-6.2-47.2M-2-73.5L-2-46.5M2.2-72.8L2.2-47.2M6.5-70.4L6.5-49.6"
      stroke="#1f1512"
      strokeWidth="0.6"
    />
    <path
      d="M-10-55.5L-2-63.5 6-55.5M-10-50.5L-2-58.5 6-50.5"
      stroke="#a8792e"
      strokeWidth="1.7"
      opacity="0.6"
      strokeLinejoin="round"
    />
    <circle cx="-2" cy="-60" r="12.8" stroke="#56483e" strokeWidth="1.8" />
    <Studs
      r={0.55}
      fill="#9a8a78"
      at={[
        [-2, -72.8],
        [7, -69],
        [10.8, -60],
        [7, -51],
        [-2, -47.2],
        [-11, -51],
        [-14.8, -60],
        [-11, -69],
      ]}
    />
    <path d="M-2-73.6A13.6 13.6 0 0 1 11.6-60" stroke="#e39a52" strokeWidth="1.1" opacity="0.85" />
    <circle cx="-2" cy="-60" r="3.6" fill="#6a5a4c" />
    <path d="M-2-63A3 3 0 0 1 1-60" stroke="#e8c79a" strokeWidth="0.7" opacity="0.8" />

    {/* Plate at the shoulders. */}
    <ellipse cx="-14.5" cy="-81" rx="6.6" ry="4.4" fill="#2c272c" />
    <ellipse cx="14.5" cy="-81" rx="6.6" ry="4.4" fill="#3d3539" />
    <path
      d="M-20.5-80C-18-84.5-11-84.5-8.5-80M-19.5-78C-17-80.5-12-80.5-9.5-78"
      stroke="#0f0a0c"
      strokeWidth="0.7"
    />
    <path d="M9.5-78C12-80.5 17.5-80.5 20-78" stroke="#0f0a0c" strokeWidth="0.7" />
    <path
      d="M8.5-81C10.5-85.4 18.5-85.4 21-81"
      stroke={TORCHLIGHT}
      strokeWidth="0.8"
      opacity="0.75"
    />

    {/* Helm: a crest, a riveted band, and lames down the neck. */}
    <path d={HELM} fill="#2e2a30" />
    <path
      d="M-6.9-88C-3-86.6 3-86.6 6.9-88M-7.2-86C-3-84.7 3-84.7 7.2-86"
      stroke="#0f0a0c"
      strokeWidth="0.6"
    />
    <path d="M-6.5-90.6C-3-89.2 3-89.2 6.5-90.6" stroke="#6a5638" strokeWidth="1.1" />
    <Studs
      r={0.4}
      fill="#c9a86a"
      at={[
        [-4.5, -90],
        [-1.5, -89.6],
        [1.5, -89.6],
        [4.5, -90],
      ]}
    />
    <path d={CREST} fill="#7a2420" />
    <path d="M2.4-100C5-98.4 6.2-95 6-91" stroke={TORCHLIGHT} strokeWidth="0.8" opacity="0.8" />

    {/* The torch arm: couter, vambrace and gauntlet. */}
    <path d="M24.7-87.5L26.7-94.5" stroke="#3d3539" strokeWidth="5.6" />
    <path d="M22.6-88.6L27-87.4M23.4-91.6L27.8-90.4" stroke="#0f0a0c" strokeWidth="0.6" />
    <circle cx="24" cy="-85" r="2.7" fill="#4a4044" />
    <path
      d="M27.3-85.4C29-88.6 30-92.6 30-96"
      stroke={TORCHLIGHT}
      strokeWidth="0.8"
      opacity="0.7"
    />
    <ellipse cx="27.2" cy="-97.5" rx="3.1" ry="2.8" fill="#4a3a30" />
    <path d="M24.8-98.4L29.6-97.6M24.9-96.8L29.5-96" stroke="#1c120c" strokeWidth="0.5" />
    <ellipse cx="28.8" cy="-109.6" rx="2.1" ry="2.6" fill="#2a1c12" />
    <path d="M26.9-108.6L30.7-108M27-110.4L30.8-109.8" stroke="#7a5630" strokeWidth="0.6" />
  </>
);

/* The dwarf: horned helm, braids, an axe on the shoulder and a pack hung with everything the party owns. */

const DOME = "M-9.2-84C-9.5-92-5-96 0-96S9.5-92 9.2-84L9.6-79-9.6-79Z";
const HORNS =
  "M-8-90C-14-90-18-95-16.5-102.5C-14-98-11.5-95.5-7.5-94ZM8-90C14-90 18-95 16.5-102.5C14-98 11.5-95.5 7.5-94Z";
const BRAIDS =
  "M-9-80C-13-76-16-68-17-58L-20.5-59C-19.5-69-16-78-11.5-83ZM9-80C13-76 16-68 17-58L20.5-59C19.5-69 16-78 11.5-83Z";
const AXE_HEAD = "M23-97C30-108 41-105 43-90C37-94 32-93.5 28-89Z";

const dwarfShape = (
  <>
    <path d="M-22-68C-23-75-12-80 0-80S23-75 22-68C25-50 25-25 23-5L-23-5C-25-25-25-50-22-68Z" />
    <ellipse cx="-23" cy="-56" rx="5" ry="11" />
    <ellipse cx="23" cy="-56" rx="5" ry="11" />
    <path d={DOME} />
    <path d={HORNS} />
    <path d={BRAIDS} />
    <path d="M14-50L27.5-103" strokeWidth="2.6" {...limb} />
    <path d={AXE_HEAD} />
    <path d="M24-98.5L19.5-101.5 21.5-96Z" />
  </>
);

const dwarfDetail = (
  <>
    {/* Mailed arms either side of the pack. */}
    <ellipse cx="-23" cy="-56" rx="4.2" ry="10" fill="#2e2924" />
    <ellipse cx="23" cy="-56" rx="4.2" ry="10" fill="#211d1a" />
    <path
      d="M-26.6-62C-27.4-56-27-50-25.6-46"
      stroke={TORCHLIGHT}
      strokeWidth="0.9"
      opacity="0.6"
    />
    <path
      d="M-25-60L-20.5-59M-25.6-55L-20.5-54M-25.4-50L-20.6-49"
      stroke="#120e0c"
      strokeWidth="0.6"
    />

    {/* The axe: bound haft, bearded blade. */}
    <path d="M14-50L27.5-103" stroke="#4a3626" strokeWidth="1.9" />
    <path
      d="M17.6-66.4L19.9-65.8M18.4-69.4L20.7-68.8M19.2-72.4L21.5-71.8"
      stroke="#a8875a"
      strokeWidth="0.6"
    />
    <path d={AXE_HEAD} fill="#4b4a52" />
    <path d="M28-90.5C32-95 37.5-95.6 42.4-91.4" stroke="#17161a" strokeWidth="0.8" />
    <path
      d="M23.6-96.6C29-106.4 37-106.8 41-103.4"
      stroke={TORCHLIGHT}
      strokeWidth="0.9"
      opacity="0.75"
    />
    <path
      d="M41.4-103C43.4-99 43.8-94.4 43-90.4"
      stroke="#d8d2c8"
      strokeWidth="0.7"
      opacity="0.7"
    />

    {/* Braids, bound with a gold ring. */}
    <path d={BRAIDS} fill="#8a431c" />
    <path
      d="M-12.6-78L-10.4-76.4M-15-73L-12.4-71.6M-16.8-67.4L-14-66.4M-18-62L-15.2-61.2M12.6-78L10.4-76.4M15-73L12.4-71.6M16.8-67.4L14-66.4M18-62L15.2-61.2"
      stroke="#431c08"
      strokeWidth="0.7"
    />
    <path d="M-20.6-60L-17-59M17-59L20.6-60" stroke="#d2a84e" strokeWidth="1.5" />
    <path
      d="M-11.6-82.4C-15.6-77.6-19-69.6-20-60"
      stroke="#e08a4a"
      strokeWidth="0.6"
      opacity="0.7"
    />

    {/* The pack: flap, buckled straps, bedroll on top. */}
    <rect x="-15" y="-71" width="30" height="42" rx="5" fill="#3a2a1c" />
    <path
      d="M-15-66C-15-70-12-71-10-71L10-71C12-71 15-70 15-66L15-54C5-49.5-5-49.5-15-54Z"
      fill="#4a3622"
    />
    <path d="M-15-54C-5-49.5 5-49.5 15-54" stroke="#1a110a" strokeWidth="0.8" />
    <path d="M-7.5-71L-7.5-47M7.5-71L7.5-47" stroke="#1f150d" strokeWidth="1.8" />
    <path
      d="M-9.1-53.6H-5.9V-50.4H-9.1ZM5.9-53.6H9.1V-50.4H5.9Z"
      stroke="#c09a52"
      strokeWidth="0.6"
    />
    <path d="M-10-41H10V-33H-10Z" stroke="#21170e" strokeWidth="0.7" fill="#33251a" />
    <path d="M-14.6-67L-14.6-33" stroke={TORCHLIGHT} strokeWidth="1" opacity="0.55" />
    <ellipse cx="0" cy="-74" rx="18.5" ry="5.4" fill="#5a4630" />
    <path d="M-8-78.6L-8-69.4M8-78.6L8-69.4" stroke="#1a130d" strokeWidth="1.5" />
    <path d="M-17.6-75C-9-79 6-79.4 16-77" stroke="#d2955a" strokeWidth="1" opacity="0.6" />
    <path
      d="M-18.4-74A2.6 2.6 0 1 1-13.2-74A1.4 1.4 0 1 1-16-74"
      stroke="#2a1e14"
      strokeWidth="0.6"
    />

    {/* A coil of rope on one side, a pan on the other. */}
    <ellipse cx="-17.5" cy="-45" rx="3.6" ry="5.6" stroke="#8a7350" strokeWidth="1.1" />
    <ellipse cx="-16.6" cy="-44.4" rx="3" ry="5" stroke="#6a573c" strokeWidth="0.9" />
    <path d="M17.4-45L17-54" stroke="#3a3638" strokeWidth="1.3" />
    <circle cx="17.5" cy="-40" r="5" fill="#1b1a1c" stroke="#4a4648" strokeWidth="0.8" />
    <path d="M13.4-42.6A5 5 0 0 1 17-45" stroke={TORCHLIGHT} strokeWidth="0.6" opacity="0.6" />

    {/* Helm and horns. */}
    <path d={DOME} fill="#33302f" />
    <path d="M0-96L0-83" stroke="#1a1716" strokeWidth="0.8" />
    <path d="M-9.4-83C-4-81 4-81 9.4-83" stroke="#6a5638" strokeWidth="1.6" />
    <Studs
      r={0.5}
      fill="#c9a86a"
      at={[
        [-6.5, -82.6],
        [-2.2, -81.6],
        [2.2, -81.6],
        [6.5, -82.6],
      ]}
    />
    <path
      d="M-8.7-86C-8.5-91-5.5-94.6-1.5-95.6"
      stroke={TORCHLIGHT}
      strokeWidth="0.8"
      opacity="0.7"
    />
    <path d={HORNS} fill="#8f8068" />
    <path
      d="M-9.4-90.6L-8.4-94M-11.6-91.4L-10.6-95M9.4-90.6L8.4-94M11.6-91.4L10.6-95"
      stroke="#3a3026"
      strokeWidth="0.7"
    />
    <path
      d="M-9-90.4C-14.4-90.8-17.4-95.6-16.5-101"
      stroke="#e8d2a8"
      strokeWidth="0.6"
      opacity="0.7"
    />
  </>
);

/* The ranger: scouting ahead under a hooded cloak, bow and quiver on the back, the second torch in hand. */

const QUIVER = "M2.5-86L8.5-84 12-62 6.5-61Z";
const BOOTS = "M-9.6-1.5C-9.6-5.4-3-5.4-2.8-1.5ZM2.8-1.5C3-5.4 9.6-5.4 9.6-1.5Z";

const rangerShape = (
  <>
    <path d="M-11-80C-12-84-6-86 0-86S12-84 11-80C14-62 16-46 18-31L13-27 9-31 4-26 0-31-5-26-9-31-13-27-17-31C-15-46-13-62-11-80Z" />
    <path d="M-7.2-88C-7.4-96.5-4-101.5 0-101.5S7.4-96.5 7.2-88C7.2-84 4-81.5 0-81.5S-7.2-84-7.2-88Z" />
    <path d="M-5-31L-6-4M5-31L6-4" strokeWidth="5.6" {...limb} />
    <path d={BOOTS} />
    <path d="M-11-78L-19-72-22-82" strokeWidth="4.6" {...limb} />
    <ellipse cx="-22.1" cy="-83" rx="2.5" ry="2.4" />
    <path d="M-21.6-79L-23.5-95" strokeWidth="1.8" {...limb} />
    <ellipse cx="-23.6" cy="-96.5" rx="2" ry="2.4" />
    <path d="M-10-36C9-50 13-82 4-102" strokeWidth="1.5" {...limb} />
    <path d={QUIVER} />
    <path d="M3.4-86L2-93.4M5.4-85.6L5.2-94M7.6-85L9-92.4" strokeWidth="1" {...limb} />
  </>
);

const rangerDetail = (
  <>
    {/* Legs and boots under the cloak's ragged hem. */}
    <path d="M-5-30L-6-12M5-30L6-12" stroke="#1d1814" strokeWidth="4.6" />
    <path d="M-6-13L-6.1-4M6-13L6.1-4" stroke="#2c2118" strokeWidth="5.2" />
    <path d="M-8.6-13L-3.4-13M3.4-13L8.6-13" stroke="#57432c" strokeWidth="1.3" />
    <path d={BOOTS} fill="#2c2118" />
    <path d="M-8.4-28C-8.8-20-8.8-12-8.6-5" stroke={TORCHLIGHT} strokeWidth="0.7" opacity="0.5" />

    {/* The cloak: lit down the torch side, folds, a belt with a pouch. */}
    <path
      d="M-11-80C-13-62-15-46-17-31L-13-27-11.4-31C-10-48-9-64-8-79Z"
      fill={TORCHLIGHT}
      opacity="0.16"
    />
    <path
      d="M-3-78C-4-62-6-46-7-31M4-76C5-60 7-46 8-31"
      stroke="#070b09"
      strokeWidth="1"
      opacity="0.7"
    />
    <path d="M12-70C13.5-56 15-44 16-33" stroke="#070b09" strokeWidth="0.8" opacity="0.6" />
    <path d="M-13.6-52C-5-49.6 6-49.6 15-52" stroke="#33261a" strokeWidth="1.7" />
    <path d="M-12-51.4H-7.4V-45.6H-12Z" fill="#3f2f20" stroke="#1c140d" strokeWidth="0.5" />
    <path d="M12.4-51L14.4-41" stroke="#6b5a48" strokeWidth="1.2" />

    {/* Bow, string, and a quiver of arrows. */}
    <path d="M-10-36C9-50 13-82 4-102" stroke="#6b5236" strokeWidth="1.1" />
    <path d="M-9.8-36.4L4.1-101.6" stroke="#cfc6b4" strokeWidth="0.3" opacity="0.55" />
    <path d={QUIVER} fill="#3b2a1c" />
    <path d="M2.9-83.4L9-81.4M5.8-65L11.4-66" stroke="#8a6a40" strokeWidth="0.7" />
    <path d="M3.4-86L2-93.4M5.4-85.6L5.2-94M7.6-85L9-92.4" stroke="#b9a37c" strokeWidth="0.5" />
    <path
      d="M2.6-90.4L1-93.6 3-93ZM5.3-90.6L4.2-94.2 6.2-94ZM8.2-89.6L8-92.8 10-92.2Z"
      fill="#a84a34"
    />

    {/* Hood, with its seam and the lit side. */}
    <path d="M0-101.4C0.7-95 0.6-88 0-82" stroke="#070b09" strokeWidth="0.7" opacity="0.7" />
    <path d="M-6.4-84C-3-81.8 3-81.8 6.4-84" stroke="#070b09" strokeWidth="0.9" />
    <path
      d="M-7-88C-7.2-95.4-4.4-100-0.8-101.2"
      stroke={TORCHLIGHT}
      strokeWidth="0.7"
      opacity="0.6"
    />

    {/* The torch hand: bracer and glove. */}
    <path d="M-19.6-74.4L-21.6-80.6" stroke="#3a2a1c" strokeWidth="3.8" />
    <ellipse cx="-22.1" cy="-83" rx="2.1" ry="2" fill="#4a382a" />
    <ellipse cx="-23.6" cy="-96.5" rx="1.6" ry="2" fill="#2a1c12" />
  </>
);

/*
 * The wizard: a bent hat, a star-stitched robe and a staff. The left arm is
 * held out with the hand open and turned up, the wisp hovering over its palm.
 */

const HAT =
  "M-9-97C-7.5-106-4.5-114-0.5-120C3-125 8-129.5 13.5-127C10.5-125.5 8.5-122.5 8-118.5C7.3-111 8-104 9.2-97Z";
const HAIR = "M-6-96C-7.6-89-6.6-80-1.5-70C-0.5-68.6 0.5-68.6 1.5-70C6.6-80 7.6-89 6-96Z";
const SLEEVE = "M-9-85C-14-88-20-91-25-94.5L-29-89C-28.5-80-24-70-17.5-62C-15.5-68-12.5-72-9.5-73Z";
const PALM = "M-25.5-94C-27.5-96.2-30.6-95.6-31.2-93C-31.5-90.8-29-89.4-26.8-90.6Z";
const FINGERS = "M-30.4-94L-33.6-97.2M-29.6-95L-31.8-99.2M-28.2-95.4L-29-99.8M-26.9-95L-26.4-98.8";
const THUMB = "M-25.9-92.8L-23.4-95.6";
const STAFF = "M21.8-18C21-50 20.6-84 19.5-116";
const STAFF_HEAD = "M19.5-116C18.5-124 27.5-126 27.5-119C27.5-114.5 22.5-114 22.6-117.5";

const wizardShape = (
  <>
    <path d="M-12-81C-13-86-6-88 0-88S13-86 12-81C16-62 21-42 25-18L-24-18C-20-42-15-62-12-81Z" />
    <path d={HAIR} />
    <ellipse cx="0" cy="-96" rx="16.5" ry="3.8" transform="rotate(-4 0 -96)" />
    <path d={HAT} />
    <path d={SLEEVE} />
    <path d={PALM} />
    <path d={`${FINGERS}${THUMB}`} strokeWidth="1.3" {...limb} />
    <path d="M9-85C15-84 20-80 22.5-74C23.5-71 23.5-68 23-65L17-63.5C16-68 13-72 9.5-74Z" />
    <ellipse cx="20.6" cy="-66" rx="2.7" ry="2.3" />
    <path d={STAFF} strokeWidth="2.1" {...limb} />
    <path d={STAFF_HEAD} strokeWidth="1.9" {...limb} />
  </>
);

const wizardDetail = (
  <>
    {/* The robe: folds, a rope belt, and constellations stitched across the back. */}
    <path d="M-9-66C-11-52-14-38-17-22" stroke="#7fa6d8" strokeWidth="0.9" opacity="0.45" />
    <path
      d="M3-66C4-52 6-38 8-22M12-62C14-48 17-34 20-22"
      stroke="#0b0d1c"
      strokeWidth="1.1"
      opacity="0.7"
    />
    <path
      d="M-6-58L-1-52 5-56 8-46M-1-52L-3-42-9-47"
      stroke="#cfe2ff"
      strokeWidth="0.25"
      opacity="0.4"
    />
    <Studs
      r={0.5}
      fill="#dbe9ff"
      opacity={0.7}
      at={[
        [-6, -58],
        [-1, -52],
        [5, -56],
        [8, -46],
        [-3, -42],
        [-9, -47],
        [13, -38],
        [-13, -36],
      ]}
    />
    <path d="M-10-80C-2-66 8-55 17-45" stroke="#3a2c26" strokeWidth="1.6" />
    <path d="M12-48H22V-39H12Z" fill="#3b2d24" stroke="#15100d" strokeWidth="0.5" />
    <path d="M12-45C15.4-43.4 18.6-43.4 22-45" stroke="#15100d" strokeWidth="0.6" />
    <circle cx="17" cy="-43.6" r="0.7" fill="#c9b06a" />

    {/* A short cape over the shoulders, and grey hair down it. */}
    <path
      d="M-12.5-81C-8-77-3-75.5 0-75.5S8-77 12.5-81C10.4-71 5-67 0-66.5C-5-67-10.4-71-12.5-81Z"
      fill="#1e2342"
    />
    <path
      d="M-11.6-78C-9.6-71.4-5-67.6 0-67.2C5-67.6 9.6-71.4 11.6-78"
      stroke="#6d5fa3"
      strokeWidth="0.7"
    />
    <path d={HAIR} fill="#343a52" />
    <path
      d="M-3-93C-4-86-3-79-0.8-72M0.6-93C1-86 0.8-79 0.4-72M3.6-93C4.6-87 3.6-80 1.4-73"
      stroke="#7c88a8"
      strokeWidth="0.4"
      opacity="0.5"
    />
    <path d="M-5.8-93C-7.2-87-6.2-79.6-2-71" stroke={WISPLIGHT} strokeWidth="0.7" opacity="0.7" />

    {/* The hat: band and buckle, a crease, a patch, the lit edge. */}
    <path d="M-12-95.4C-5-93.2 6-93.6 13-96.6" stroke="#090b18" strokeWidth="1" opacity="0.7" />
    <path d="M-9-98.6C-3-96.4 3-96.6 9.2-99.2" stroke="#7a6aa0" strokeWidth="1.7" />
    <path d="M-1.6-99.4H1.6V-96.4H-1.6Z" stroke="#d2b872" strokeWidth="0.6" />
    <path
      d="M-2.6-112C0.4-113.4 4.4-112.6 7.4-110.4"
      stroke="#090b18"
      strokeWidth="0.8"
      opacity="0.7"
    />
    <path
      d="M1.4-108H5V-104.4H1.4Z"
      fill="#2a3058"
      stroke="#8a78b8"
      strokeWidth="0.3"
      strokeDasharray="0.6 0.5"
    />
    <path
      d="M-8.5-98C-6.6-107-3.6-115 0.4-121"
      stroke={WISPLIGHT}
      strokeWidth="0.7"
      opacity="0.6"
    />

    {/* The staff arm, and the staff: bound grip, a charm tied at its head. */}
    <path d="M10.6-82C15-80.4 19-77 21-72" stroke="#0b0d1c" strokeWidth="0.9" opacity="0.7" />
    <path d={STAFF} stroke="#3a2e2a" strokeWidth="1.5" />
    <path d={STAFF_HEAD} stroke="#3a2e2a" strokeWidth="1.3" />
    <path d="M18.9-112C19.8-84 20.3-56 21-28" stroke="#8fb4de" strokeWidth="0.5" opacity="0.6" />
    <path
      d="M19.3-73L21.9-72.4M19.4-70.6L22-70M19.6-61.6L22.2-61M19.6-59.2L22.2-58.6"
      stroke="#8a7658"
      strokeWidth="0.6"
    />
    <ellipse cx="20.6" cy="-66" rx="2.3" ry="1.9" fill="#7c8498" />
    <path d="M18.6-66.6L22.6-66.2M18.7-65.2L22.5-64.8" stroke="#2a2e3c" strokeWidth="0.4" />
    <path d="M22.4-114.6C24.2-110.6 23.4-107 24.6-103.6" stroke="#a89878" strokeWidth="0.4" />
    <circle cx="24.6" cy="-102.8" r="0.9" fill="#5fc0d8" />
    <path
      d="M24.6-101.8C26.2-98.4 25.8-95.4 24.2-93C23.6-96 23.6-99 24.6-101.8Z"
      fill="#c8d4e8"
      opacity="0.75"
    />

    {/* The outstretched arm: a hanging bell sleeve, its dark mouth, and the open hand under the wisp. */}
    <path d={SLEEVE} fill="#1b2040" />
    <path
      d="M-10-84C-15-86.6-20.4-89.6-25-92.8"
      stroke={WISPLIGHT}
      strokeWidth="0.8"
      opacity="0.65"
    />
    <path
      d="M-11.6-78C-16-78-21.4-80-24.6-84M-12.4-74C-16-73-19.6-70-19-65"
      stroke="#090b18"
      strokeWidth="0.9"
      opacity="0.7"
    />
    <ellipse
      cx="-27"
      cy="-91.6"
      rx="3.4"
      ry="1.9"
      transform="rotate(54 -27 -91.6)"
      fill="#070812"
    />
    <path d="M-25-94.5L-29-89" stroke="#8a78b8" strokeWidth="1.1" />
    <path d="M-28.6-88.6C-28-80-24-70.6-17.8-62.6" stroke="#4a4478" strokeWidth="0.7" />
    <path d={PALM} fill="#9fb0cc" />
    <path d={`${FINGERS}${THUMB}`} stroke="#9fb0cc" strokeWidth="1" />
    <path d={FINGERS} stroke="#f2f8ff" strokeWidth="0.35" opacity="0.9" />
    <path
      d="M-30.6-93.4C-29.4-95-27.4-95.2-26-94"
      stroke="#f2f8ff"
      strokeWidth="0.4"
      opacity="0.8"
    />
  </>
);

/** The party, furthest from the viewer first. */
export const PARTY: PartyMember[] = [
  {
    name: "ranger",
    x: 1075,
    feet: 882,
    height: 396,
    cloth: "#16211b",
    light: TORCHLIGHT,
    rim: [-0.9, -0.5],
    shape: rangerShape,
    detail: rangerDetail,
  },
  {
    name: "dwarf",
    x: 480,
    feet: 1113,
    height: 416,
    cloth: "#1c1712",
    light: TORCHLIGHT,
    rim: [-0.9, -0.8],
    shape: dwarfShape,
    detail: dwarfDetail,
  },
  {
    name: "warrior",
    x: 170,
    feet: 1302,
    height: 756,
    cloth: "#2a1216",
    light: TORCHLIGHT,
    rim: [0.7, -0.6],
    shape: warriorShape,
    detail: warriorDetail,
  },
  {
    name: "wizard",
    x: 1410,
    feet: 1260,
    height: 720,
    cloth: "#161a30",
    light: WISPLIGHT,
    rim: [-0.8, -0.4],
    shape: wizardShape,
    detail: wizardDetail,
  },
];
