import { createContext } from "react";
import type { PeerBlobs } from "../media/images";

/** Where images missing from this device come from: the open campaign's peers. */
export const PeerBlobsContext = createContext<PeerBlobs | null>(null);
