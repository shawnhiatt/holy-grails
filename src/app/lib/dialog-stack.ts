/**
 * Module-level stack of open dialogs, so stacked overlays (e.g. the image
 * lightbox over the album detail sheet, or a confirm sheet over the desktop
 * side panel) each handle Escape without one keypress closing every layer.
 *
 * Every Escape-closable overlay pushes a token on mount and pops it on
 * unmount; its keydown handler acts only when its token is on top.
 */

const stack: symbol[] = [];

export function pushDialog(): symbol {
  const token = Symbol("dialog");
  stack.push(token);
  return token;
}

export function popDialog(token: symbol): void {
  const i = stack.indexOf(token);
  if (i !== -1) stack.splice(i, 1);
}

export function isTopDialog(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === token;
}

/** True while any registered dialog is open — non-modal Escape handlers
 *  (the desktop side panel) defer to open dialogs. */
export function hasOpenDialogs(): boolean {
  return stack.length > 0;
}
