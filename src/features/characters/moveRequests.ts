import { assign, createActor, setup } from "xstate";
import type { MoveTarget } from "../chat/types";

/** What a move asks for before it rolls, given when it is started (see moves.ts). */
export interface MoveChoiceExtra {
  extra?: number | undefined;
}

export interface AskRequest {
  moveId: string;
  characterId: string;
  targets?: MoveTarget[];
  choice?: MoveChoiceExtra;
}
export interface TargetRequest { moveId: string; characterId: string }

export const moveRequestMachine = setup({
  types: {
    context: {} as { ask: AskRequest | null; targets: TargetRequest | null },
    events: {} as
      | { type: "CLEAR" }
      | { type: "SET_ASK"; ask: AskRequest | null }
      | { type: "SET_TARGETS"; targets: TargetRequest | null },
  },
}).createMachine({
  initial: "idle",
  context: { ask: null, targets: null },
  on: {
    CLEAR: {
      target: ".idle",
      actions: assign({ ask: null, targets: null }),
    },
    SET_ASK: [
      {
        target: ".asking",
        guard: ({ event }) => event.type === "SET_ASK" && event.ask !== null,
        actions: assign({
          ask: ({ event }) => (event.type === "SET_ASK" ? event.ask : null),
          targets: null,
        }),
      },
      {
        target: ".idle",
        actions: assign({ ask: null, targets: null }),
      },
    ],
    SET_TARGETS: [
      {
        target: ".targeting",
        guard: ({ event }) => event.type === "SET_TARGETS" && event.targets !== null,
        actions: assign({
          ask: null,
          targets: ({ event }) => (event.type === "SET_TARGETS" ? event.targets : null),
        }),
      },
      {
        target: ".idle",
        actions: assign({ ask: null, targets: null }),
      },
    ],
  },
  states: {
    idle: {},
    targeting: {},
    asking: {},
  },
});

export class MoveRequests {
  readonly actor = createActor(moveRequestMachine);

  constructor() {
    this.actor.start();
  }

  ask(request: AskRequest | null) {
    this.actor.send({ type: "SET_ASK", ask: request });
  }

  targets(request: TargetRequest | null) {
    this.actor.send({ type: "SET_TARGETS", targets: request });
  }

  clear() {
    this.actor.send({ type: "CLEAR" });
  }
}
