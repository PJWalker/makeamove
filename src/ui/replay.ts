/**
 * Runs an animation keyed on a data attribute again from the start: drops
 * the attribute, flushes style so the browser notices, and sets it again.
 */
function replay(element: HTMLElement | SVGElement, key: string) {
  delete element.dataset[key];
  void element.getBoundingClientRect();
  element.dataset[key] = "";
}

export default replay;
