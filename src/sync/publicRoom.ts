import type { JoinRoom } from "./transport";

const joinPublicRoom: JoinRoom = async (roomId, roomKey) =>
  (await import("./trystero")).default(roomId, roomKey);

export default joinPublicRoom;
