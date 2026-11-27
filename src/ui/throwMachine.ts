import { setup } from "xstate";

export const throwMachine = setup({
  types: {
    events: {} as
      { type: "CANCEL" } | { type: "GRAB" } | { type: "MOVE"; away: boolean; moved: boolean } | { type: "UP" },
  },
}).createMachine({
  initial: "idle",
  on: { GRAB: ".grabbed" },
  states: {
    idle: { on: { GRAB: "grabbed" } },
    grabbed: {
      on: {
        MOVE: [
          { target: "away", guard: ({ event }) => event.type === "MOVE" && event.away },
          { target: "moved", guard: ({ event }) => event.type === "MOVE" && event.moved },
        ],
        UP: "idle",
        CANCEL: "idle",
      },
    },
    moved: {
      on: {
        MOVE: [
          { target: "away", guard: ({ event }) => event.type === "MOVE" && event.away },
          {
            target: "grabbed",
            guard: ({ event }) => event.type === "MOVE" && !event.away && !event.moved,
          },
        ],
        UP: "idle",
        CANCEL: "idle",
      },
    },
    away: {
      on: {
        MOVE: [
          {
            target: "grabbed",
            guard: ({ event }) => event.type === "MOVE" && !event.away && !event.moved,
          },
          { target: "moved", guard: ({ event }) => event.type === "MOVE" && !event.away },
        ],
        UP: "idle",
        CANCEL: "idle",
      },
    },
  },
});
