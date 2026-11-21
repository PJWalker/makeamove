import { setup } from "xstate";

export const pieceMachine = setup({
  types: {},
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
