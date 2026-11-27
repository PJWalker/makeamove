import StarterKit from "@tiptap/starter-kit";
import type { CampaignContext } from "./campaignContext";
import { trackerButtonExtension } from "./trackerButtons";

/** What rules text can hold: StarterKit's formatting and tracker buttons. */
export const ruleTextExtensions = (context: CampaignContext) => [
  StarterKit.configure({ link: false }),
  trackerButtonExtension(context),
];
