import { dataName } from "../platform/dataEpoch";

/** The IndexedDB database holding a campaign's root document on this device. */
export const campaignDbName = (id: string) => dataName("campaign", id);
