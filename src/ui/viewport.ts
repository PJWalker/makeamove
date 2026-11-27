/**
 * Phones and other small screens, where windows fill the screen and only one
 * sidebar opens at a time. The CSS uses the same `(max-width: 600px)`.
 */
export const isPhone = () => matchMedia("(max-width: 600px)").matches;
