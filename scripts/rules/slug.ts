/** An id made from a name: "Mordenkainen's Sword" -> "mordenkainen-s-sword". */
export const slug = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/^-|-$/g, "");
