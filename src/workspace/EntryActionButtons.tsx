import Button from "../ui/Button";
import type { EntryAction } from "./libraryActions";

/** An entry's actions as buttons, in its window. */
function EntryActionButtons({ actions }: { actions: EntryAction[] }) {
  return actions.map((a) => (
    <Button
      key={a.label}
      variant="primary"
      disabled={a.disabled}
      title={a.disabled ? a.reason : undefined}
      onClick={() => { a.onSelect(); }}
    >
      <a.Icon size={22} /> {a.label}
      {a.as ? ` as ${a.as}` : ""}
    </Button>
  ));
}

export default EntryActionButtons;
