/** An id made from a name: "Mordenkainen's Sword" -> "mordenkainen-s-sword". */
const slug = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/^-|-$/g, "");

export default slug;
