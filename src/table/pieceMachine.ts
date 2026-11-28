import { setup } from "xstate";

const pieceMachine = setup({
  types: {
    events: {} as
      | { type: "ENTER"; moving: boolean }
      | { type: "FLAT" }
      | { type: "LANDED" }
      | { type: "MOVING" }
      | { type: "RESET" },
  },
}).createMachine({
  initial: "pending",
  states: {
    pending: {
      on: {
        MOVING: "moving",
        LANDED: "landed",
        FLAT: "flat",
        ENTER: [
          { target: "moving", guard: ({ event }) => event.type === "ENTER" && event.moving },
          { target: "loading", guard: ({ event }) => event.type === "ENTER" && !event.moving },
        ],
      },
    },
    loading: {
      on: {
        MOVING: "moving",
        LANDED: "landed",
        FLAT: "flat",
        RESET: "pending",
      },
    },
    moving: {
      on: {
        LANDED: "landed",
        FLAT: "flat",
        RESET: "pending",
      },
    },
    landed: {
      on: {
        MOVING: "moving",
        FLAT: "flat",
        RESET: "pending",
      },
    },
    flat: {
      on: { RESET: "pending" },
    },
  },
});

export default pieceMachine;
