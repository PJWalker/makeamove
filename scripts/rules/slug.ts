/** An id made from a name: "Mordenkainen's Sword" -> "mordenkainen-s-sword". */
export const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
