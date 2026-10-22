import { SETTINGS } from "./constants.mjs";
import { getSetting, getColorSetting } from "./settings.mjs";
import { getSelectedArt, canViewArt, isVideo } from "./hover-art-data.mjs";
import { applyDisplayLayout, makeDisplayInteractive, isDragging } from "./display-layout.mjs";

/*
 * The hover display is local to each client. Foundry fires the hoverToken hook only on the client of the user
 * who moves the mouse, and each client already has the token flags, because Foundry sends every document update
 * to all clients. So the display needs no socket messages.
 *
 * Move mode: while the user holds Ctrl, the display stays open, and the user can drag it to a new position or
 * resize it with its corner handles (see display-layout.mjs). Without move mode, the display would hide when the
 * pointer leaves the token on its way to the display.
 */

/** The key that turns on move mode while it is held. */
const MOVE_KEY = "Control";

/** @type {HTMLElement|null} */
let element = null;

/** The token that the display shows now. @type {Token|null} */
let shownToken = null;

/** The timer that hides the display after the hide delay. @type {number|null} */
let hideTimer = null;

/** Is the move key held now? */
let moveMode = false;

/** Paths that are already preloaded. @type {Set<string>} */
const preloaded = new Set();

/* -------------------------------------------- */

/**
 * Listen for the move key. Call this once, at init.
 */
export function activateMoveKey() {
  window.addEventListener("keydown", event => {
    if ( event.key === MOVE_KEY ) setMoveMode(true);
  });
  window.addEventListener("keyup", event => {
    if ( event.key === MOVE_KEY ) setMoveMode(false);
  });
  // The browser sends no keyup when the window loses focus while the key is held.
  window.addEventListener("blur", () => setMoveMode(false));
}

/**
 * Handle the hoverToken hook. The display shows at once when the pointer enters a token.
 * It hides after the hide delay when the pointer leaves, so a short exit does not make it flicker.
 * In move mode it stays open, so the user can reach it with the pointer.
 * @param {Token} token
 * @param {boolean} hovered
 */
export function onHoverToken(token, hovered) {
  if ( !hovered ) {
    if ( (shownToken === token) && !moveMode ) scheduleHide();
    return;
  }
  cancelHide();
  const path = resolveArt(token);
  if ( path ) showDisplay(token, path);
  else hideDisplay();
}

/**
 * Apply a change of the token's art or secret state. Preload the new art, and update the display if it shows
 * this token now.
 * @param {TokenDocument} tokenDoc
 */
export function refreshTokenDisplay(tokenDoc) {
  const path = getSelectedArt(tokenDoc);
  if ( path ) preload(path);
  if ( shownToken?.document !== tokenDoc ) return;
  const shownPath = resolveArt(shownToken);
  if ( shownPath ) showDisplay(shownToken, shownPath);
  else hideDisplay();
}

/**
 * Handle the deleteToken hook.
 * @param {TokenDocument} tokenDoc
 */
export function onDeleteToken(tokenDoc) {
  if ( shownToken?.document === tokenDoc ) hideDisplay();
}

/**
 * Preload the selected art of all tokens on the viewed scene, so the first hover shows the image at once.
 */
export function preloadSceneArt() {
  for ( const token of canvas.tokens?.placeables ?? [] ) {
    const path = getSelectedArt(token.document);
    if ( path ) preload(path);
  }
}

/**
 * Apply changed settings to the display that is visible now.
 */
export function refreshDisplay() {
  if ( !shownToken ) return;
  const path = resolveArt(shownToken);
  if ( path ) showDisplay(shownToken, path);
  else hideDisplay();
}

/**
 * Hide the display at once.
 */
export function hideDisplay() {
  cancelHide();
  shownToken = null;
  if ( !element ) return;
  element.classList.remove("visible", "moving");
  element.querySelector("video")?.pause();
}

/* -------------------------------------------- */

/**
 * Turn move mode on or off. When it turns off, the display hides after the hide delay, unless the pointer is
 * on the shown token again or a drag still runs (the drag end checks again).
 * @param {boolean} active
 */
function setMoveMode(active) {
  if ( moveMode === active ) return;
  moveMode = active;
  element?.classList.toggle("moving", active && !!shownToken);
  if ( active ) cancelHide();
  else hideIfNotHovered();
}

/**
 * Hide the display after the hide delay if the pointer is not on the shown token and no drag runs.
 */
function hideIfNotHovered() {
  if ( shownToken && !shownToken.hover && !moveMode && !isDragging() ) scheduleHide();
}

/**
 * @param {Token} token
 * @returns {string|null}  The art path that the current user may see for this token, or null.
 */
function resolveArt(token) {
  if ( !getSetting(SETTINGS.ENABLED) ) return null;
  if ( !token?.visible ) return null;
  const tokenDoc = token.document;
  const path = getSelectedArt(tokenDoc);
  if ( !path || !canViewArt(tokenDoc) ) return null;
  return path;
}

/**
 * Show the art of a token. A pending hide stays pending: only a new hover cancels it.
 * @param {Token} token
 * @param {string} path
 */
function showDisplay(token, path) {
  const display = getElement();
  const media = display.querySelector(".tha-media");
  if ( media.dataset.src !== path ) media.replaceChildren(createMedia(path));
  media.dataset.src = path;

  const caption = display.querySelector(".tha-caption");
  const showName = getSetting(SETTINGS.SHOW_NAME) && token._canViewMode(token.document.displayName);
  caption.textContent = showName ? token.document.name : "";
  caption.hidden = !showName;

  if ( !isDragging() ) applyDisplayLayout(display, token);
  applyAppearance(display);
  shownToken = token;
  display.classList.add("visible");
  display.classList.toggle("moving", moveMode);
  display.querySelector("video")?.play().catch(() => {});
}

/**
 * Apply the background and border settings to the display. The size is part of the layout (display-layout.mjs).
 * @param {HTMLElement} display
 */
function applyAppearance(display) {
  // The colors are "#rrggbb" or "#rrggbbaa"; CSS reads both forms, so the alpha needs no conversion.
  display.style.setProperty("--tha-display-background", getColorSetting(SETTINGS.BACKGROUND_COLOR));

  // Without a border, the display has no frame at all: no padding and no shadow, so only the image shows.
  const showBorder = getSetting(SETTINGS.SHOW_BORDER);
  const border = showBorder
    ? `${getSetting(SETTINGS.BORDER_WIDTH)}px solid ${getColorSetting(SETTINGS.BORDER_COLOR)}`
    : "none";
  display.style.setProperty("--tha-display-border", border);
  display.classList.toggle("frameless", !showBorder);
}

/**
 * @param {string} path
 * @returns {HTMLImageElement|HTMLVideoElement}
 */
function createMedia(path) {
  let media;
  if ( isVideo(path) ) {
    media = document.createElement("video");
    Object.assign(media, {autoplay: true, loop: true, muted: true, playsInline: true});
  }
  else {
    media = document.createElement("img");
    media.alt = "";
  }
  media.addEventListener("error", () => onMediaError(path), {once: true});
  media.src = path;
  return media;
}

/**
 * A selected file can be missing, for example after a folder scan removed it. Hide the display instead of
 * a broken image, and forget the element, so the next hover tries the file again.
 * @param {string} path
 */
function onMediaError(path) {
  const media = element?.querySelector(".tha-media");
  if ( media?.dataset.src !== path ) return;
  delete media.dataset.src;
  media.replaceChildren();
  hideDisplay();
}

/**
 * @returns {HTMLElement}  The display element. It is created on first use.
 */
function getElement() {
  if ( element ) return element;
  element = document.createElement("div");
  element.id = "token-hover-art-display";
  const handles = ["nw", "ne", "sw", "se"].map(c => `<div class="tha-resize-handle" data-corner="${c}"></div>`);
  element.innerHTML = `<div class="tha-media"></div><div class="tha-caption" hidden></div>${handles.join("")}`;
  document.body.append(element);
  makeDisplayInteractive(element, hideIfNotHovered, () => shownToken);
  return element;
}

/**
 * @param {string} path
 */
function preload(path) {
  if ( preloaded.has(path) || isVideo(path) ) return;
  preloaded.add(path);
  const img = new Image();
  img.src = path;
}

/**
 * Hide the display after the hide delay.
 */
function scheduleHide() {
  cancelHide();
  const delay = getSetting(SETTINGS.HIDE_DELAY);
  if ( delay > 0 ) hideTimer = window.setTimeout(hideDisplay, delay);
  else hideDisplay();
}

function cancelHide() {
  if ( hideTimer === null ) return;
  window.clearTimeout(hideTimer);
  hideTimer = null;
}
