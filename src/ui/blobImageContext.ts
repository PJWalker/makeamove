import { createContext } from "react";
import type { PeerBlobs } from "../media/images";

/** Where images missing from this device come from: the open campaign's peers. */
const PeerBlobsContext = createContext<PeerBlobs | null>(null);
PeerBlobsContext.displayName = "PeerBlobsContext";

export default PeerBlobsContext;
