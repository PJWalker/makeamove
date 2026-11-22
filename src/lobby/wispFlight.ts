/* eslint-disable @typescript-eslint/no-magic-numbers */
import { seededRandom } from "../lib/seededRandom";
import { add, scale  } from "./splat";
import type {Vec3} from "./splat";

/*
 * The wizard's wisp doesn't stay put: every so often it flies off down the
 * cave to scout, hangs about deep in the dark looking around, then comes back
 * to the wizard's hand. Where it is follows from the time alone, so the same
 * moment always finds it in the same place.
 */

interface Trip {
  /** When it sets off, gets there, starts back, and is home again, in seconds. */
  leave: number;
  arrive: number;
  turn: number;
  home: number;
  /** Where it scouts, from where it started. */
  to: Vec3;
}

/** Seconds it takes to fly there, or back. */
const FLIGHT = 4.5;

const ease = (t: number) => t * t * (3 - 2 * t);

/** A point along a cubic Bézier curve. */
function bezier(a: Vec3, b: Vec3, c: Vec3, d: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return add(
    add(scale(a, u * u * u), scale(b, 3 * u * u * t)),
    add(scale(c, 3 * u * t * t), scale(d, t * t * t)),
  );
}

/** The path out, `t` of the way along: up over the party, then down the middle of the cave. */
const out = (to: Vec3, t: number) =>
  bezier([0, 0, 0], [-0.6, 1.1, -1.2], add(to, [0, 1, 5]), to, ease(t));

/** Where the wisp goes, as an offset from its home, for any moment: `pick` chooses each place it scouts. */
export default function flightPlan(seed: string, pick: (random: () => number) => Vec3) {
  const random = seededRandom(seed);
  const trips: Trip[] = [];
  const plan = (index: number): Trip => {
    while (trips.length <= index) {
      const last = trips.at(-1);
      const leave = (last ? last.home + 9 : 5) + random() * 10;
      const arrive = leave + FLIGHT;
      const turn = arrive + 3 + random() * 3;
      trips.push({ leave, arrive, turn, home: turn + FLIGHT, to: pick(random) });
    }
    return trips[index] ?? plan(index);
  };

  return (seconds: number): Vec3 => {
    let index = 0;
    while (plan(index).home < seconds) index++;
    const trip = plan(index);
    if (seconds < trip.leave) return [0, 0, 0];
    if (seconds < trip.arrive) return out(trip.to, (seconds - trip.leave) / FLIGHT);
    if (seconds < trip.turn) {
      // Looking about: a wandering loop that starts and ends where it arrived.
      const t = seconds - trip.arrive;
      const swing = Math.sin((Math.PI * t) / (trip.turn - trip.arrive));
      return add(
        trip.to,
        scale([Math.sin(t * 1.3) * 1.1, Math.sin(t * 2.1) * 0.4, -Math.sin(t * 0.9) * 1.6], swing),
      );
    }
    return out(trip.to, 1 - (seconds - trip.turn) / FLIGHT);
  };
}
