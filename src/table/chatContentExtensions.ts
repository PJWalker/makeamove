import StarterKit from "@tiptap/starter-kit";
import type { CampaignContext } from "../workspace/campaignContext";
import { linkExtension } from "../workspace/richText";
import { trackerButtonExtension } from "../workspace/trackerButtons";

export function chatContentExtensions(ctx: CampaignContext) {
  const { campaign } = ctx;
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      },
    }),
    linkExtension(campaign, { shared: true }),
    trackerButtonExtension(ctx),
  ];
}
