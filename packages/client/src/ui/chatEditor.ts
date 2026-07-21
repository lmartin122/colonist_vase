import { getSpriteFrameInfo } from '../render/spritesheet';

/**
 * DOM helpers for the WYSIWYG chat editor. Completed `:ore:` tokens live in the
 * contenteditable field as atomic "chip" elements showing the card art, while
 * the plain-text value (with `:ore:` tokens) is reconstructed for sending.
 */

/** Build an atomic, non-editable card chip for the contenteditable field. */
export function buildCardChip(token: string, frame: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.dataset.token = token;
  span.contentEditable = 'false';
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', token);
  span.className = 'mx-px inline-block h-[1.5em] w-[1.05em] align-middle';
  const info = getSpriteFrameInfo(frame);
  if (!info) {
    span.textContent = `:${token}:`;
    return span;
  }
  const { frame: f, sourceSize, spriteSourceSize } = info.data;
  span.innerHTML =
    `<svg viewBox="0 0 ${sourceSize.w} ${sourceSize.h}" overflow="hidden" ` +
    `style="width:100%;height:100%;display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))">` +
    `<svg x="${spriteSourceSize.x}" y="${spriteSourceSize.y}" width="${spriteSourceSize.w}" height="${spriteSourceSize.h}" ` +
    `viewBox="${f.x} ${f.y} ${f.w} ${f.h}" preserveAspectRatio="none" overflow="hidden">` +
    `<image href="/assets/${info.image}" width="${info.atlasSize.w}" height="${info.atlasSize.h}"></image>` +
    `</svg></svg>`;
  return span;
}

/**
 * Reconstruct the plain-text message from the editor's DOM: text nodes verbatim,
 * chips as `:token:`. `<br>` (from an emptied field) contributes nothing.
 */
export function readEditorValue(editor: HTMLElement): string {
  let out = '';
  editor.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
    } else if (node instanceof HTMLElement) {
      if (node.dataset.token) out += `:${node.dataset.token}:`;
      else if (node.tagName !== 'BR') out += node.textContent ?? '';
    }
  });
  return out;
}
