/** A repeatable stream of numbers in [0, 1), the same for the same seed. */
function seededRandom(seed: string) {
  let state = 2_166_136_261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16_777_619);
  return () => {
    state += 0x6d_2b_79_f5;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export default seededRandom;
