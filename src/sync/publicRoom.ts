import type { JoinRoom } from "./transport";

export const joinPublicRoom: JoinRoom = async (roomId, roomKey) =>
  (await import("./trystero")).trysteroTransport(roomId, roomKey);
