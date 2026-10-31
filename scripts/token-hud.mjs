import { MODULE_ID, SETTINGS, TEMPLATES } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import {
  getBaseActor, canManageGallery, getGallery, getSelectedArt, selectArt, clearArt, isSecret, setSecret, isVideo
} from "./hover-art-data.mjs";
import { HoverArtGallery } from "./native-gallery.mjs";
import { getCompiledTemplate, getHookElement } from "./compat.mjs";

/**
 * Foundry scales the Token HUD with the canvas. Leave the button in the HUD,
 * but put the image palette in document.body so zoom never shrinks its images.
 */
const LIMITS = Object.freeze({minWidth: 260, maxWidth: 700, minHeight: 160, maxHeight: 640});
const GAP = 10, EDGE = 8;
let paletteTemplate = null, tokenHUD = null, openToken = null;
let panel = null, trigger = null, warned = false, pendingFrame = 0;

export async function loadPaletteTemplate() {
  paletteTemplate = await getCompiledTemplate(TEMPLATES.HUD_PALETTE);
}

export function onRenderTokenHUD(hud, html) {
  tokenHUD = hud;
  const token = hud.object;
  const actor = getBaseActor(token?.actor);
  if (!token || !actor || !paletteTemplate) return closePalette();

  const root = getHookElement(html);
  const column = root?.querySelector(".col.left") ?? root?.querySelector(".col-left");
  if (!column) {
    if (!warned) console.warn(MODULE_ID + " | Token HUD left column was not found");
    warned = true;
    return closePalette();
  }
  if (openToken && openToken !== token) closePalette();

  const selected = getSelectedArt(token.document);
  const markup = paletteTemplate({
    open: openToken === token,
    isGM: game.user.isGM,
    canManage: canManageGallery(actor),
    secret: isSecret(token.document),
    hasSelection: !!selected,
    size: sizeSetting(),
    images: getGallery(actor).map(path => ({path, isVideo: isVideo(path), active: path === selected}))
  });
  const holder = document.createElement("template");
  holder.innerHTML = markup.trim();
  const control = holder.content.firstElementChild;
  const floating = control?.querySelector(".tha-palette");
  if (!floating) return;

  cleanupPanel();
  column.append(control);
  floating.remove();
  floating.classList.add("tha-floating-palette");
  floating.setAttribute("role", "group");
  floating.setAttribute("aria-label", game.i18n.localize("TOKEN_HOVER_ART.HUD.Title"));
  document.body.append(floating);
  trigger = control;
  panel = floating;

  control.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (openToken === token) closePalette();
    else openPalette(token);
  });
  floating.addEventListener("pointerdown", event => event.stopPropagation());
  floating.addEventListener("click", event => {
    event.stopPropagation();
    const action = event.target.closest("[data-tha-action]");
    if (action && floating.contains(action)) void runAction(token, actor, action);
  });
  enableResize(floating);
  if (openToken === token) {
    control.classList.add("active");
    floating.classList.add("active");
    positionPalette();
  }
}

/** Rebuild after a token art/secret flag changes, keeping the picker open. */
export function refreshTokenHUD(tokenDoc) {
  if (tokenHUD?.object?.document === tokenDoc) tokenHUD.render();
}

/** Prevent floating DOM elements from surviving canvas teardown. */
export function closeHoverArtPalette() {
  closePalette();
  cleanupPanel();
  tokenHUD = null;
}

function sizeSetting() {
  const raw = getSetting(SETTINGS.PALETTE_SIZE);
  const bound = (value, fallback, min, max) => {
    const number = Number(value);
    return Math.round(Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback)));
  };
  return {
    width: bound(raw?.width, 350, LIMITS.minWidth, LIMITS.maxWidth),
    height: bound(raw?.height, 320, LIMITS.minHeight, LIMITS.maxHeight)
  };
}
function clampSize(size) {
  return {
    width: Math.round(Math.max(LIMITS.minWidth, Math.min(LIMITS.maxWidth, size.width))),
    height: Math.round(Math.max(LIMITS.minHeight, Math.min(LIMITS.maxHeight, size.height)))
  };
}
function openPalette(token) {
  openToken = token;
  if (!panel || !trigger) return;
  panel.classList.add("active");
  trigger.classList.add("active");
  positionPalette();
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", queuePosition);
  window.addEventListener("scroll", queuePosition, true);
}
function closePalette() {
  openToken = null;
  panel?.classList.remove("active");
  trigger?.classList.remove("active");
  document.removeEventListener("pointerdown", onOutside, true);
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", queuePosition);
  window.removeEventListener("scroll", queuePosition, true);
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
}
function cleanupPanel() {
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
  panel?.remove();
  panel = null;
  trigger = null;
}
function onOutside(event) {
  if (panel?.contains(event.target) || trigger?.contains(event.target)) return;
  closePalette();
}
function onKey(event) {
  if (event.key === "Escape") closePalette();
}
function queuePosition() {
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    positionPalette();
  });
}
function positionPalette() {
  if (!panel?.classList.contains("active")) return;
  if (!trigger?.isConnected) return closePalette();
  const rect = trigger.getBoundingClientRect();
  const size = sizeSetting();
  const availableWidth = Math.max(180, window.innerWidth - 2 * EDGE);
  const availableHeight = Math.max(160, window.innerHeight - 2 * EDGE);
  const width = Math.min(size.width, availableWidth);
  const menuHeight = Math.min(size.height + 58, availableHeight);
  panel.style.setProperty("--tha-palette-width", width + "px");
  panel.style.setProperty("--tha-palette-height", Math.min(size.height, availableHeight - 58) + "px");
  const leftSpace = rect.left - GAP - EDGE;
  const rightSpace = window.innerWidth - rect.right - GAP - EDGE;
  const x = leftSpace >= width || leftSpace >= rightSpace
    ? rect.left - width - GAP : rect.right + GAP;
  panel.style.left = Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)) + "px";
  panel.style.top = Math.max(EDGE, Math.min(rect.top, window.innerHeight - menuHeight - EDGE)) + "px";
}
function enableResize(target) {
  const grip = target.querySelector(".tha-palette-resize");
  if (!grip) return;
  grip.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    const start = {...sizeSetting(), x: event.clientX, y: event.clientY};
    let size = {width:start.width, height:start.height};
    const move = e => {
      size = clampSize({
        width: start.width + e.clientX - start.x,
        height: start.height + e.clientY - start.y
      });
      target.style.setProperty("--tha-palette-width", size.width + "px");
      target.style.setProperty("--tha-palette-height", size.height + "px");
      target.style.left = Math.max(EDGE, Math.min(
        parseFloat(target.style.left) || EDGE, window.innerWidth - size.width - EDGE
      )) + "px";
    };
    const done = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("lostpointercapture", done);
      void game.settings.set(MODULE_ID, SETTINGS.PALETTE_SIZE, size).then(queuePosition);
    };
    grip.setPointerCapture(event.pointerId);
    grip.addEventListener("pointermove", move);
    grip.addEventListener("lostpointercapture", done, {once: true});
  });
}
async function runAction(token, actor, element) {
  const tokenDoc = token.document;
  try {
    switch (element.dataset.thaAction) {
      case "select": await selectArt(tokenDoc, element.dataset.path); break;
      case "clear": await clearArt(tokenDoc); break;
      case "secret": await setSecret(tokenDoc, !isSecret(tokenDoc)); break;
      case "manage": closePalette(); HoverArtGallery.open(actor); break;
    }
  } catch (error) {
    ui.notifications.error(error.message);
  }
}
