import { dataName } from "../platform/dataEpoch";

/** The IndexedDB database holding a campaign's root document on this device. */
export const campaignDbName = (id: string) => dataName("campaign", id);

/** The IndexedDB database holding this device's UI state for a campaign (see data/localDoc.ts). */
export const campaignUiDbName = (id: string) => dataName("ui", id);
