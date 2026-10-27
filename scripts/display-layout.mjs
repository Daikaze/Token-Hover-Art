import { MODULE_ID, SETTINGS, POSITIONS } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { getBaseActor } from "./hover-art-data.mjs";

/*
 * The layout of the hover display: where it is and how large its image is.
 * The default is a screen corner (world setting) and the world maximum height. Each user can move and resize the
 * display while they hold Ctrl (see hover-display.mjs). Position remains per viewer; image size
 * is saved separately per PC Actor or per NPC token (and per viewer). Unmodified tokens use the world default.
 * "Use my dragged position and size" controls the customized position and per-character sizes.
 */

/**
 * A dragged position. The display keeps its distance to the nearest horizontal and vertical screen edge, so
 * a taller or wider image grows away from that edge, toward the screen center. The distances are fractions of
 * the screen size, so the position stays in the same place relative to the screen after a window resize.
 * @typedef {object} CustomPosition
 * @property {"left"|"right"} anchorX  The horizontal screen edge that the display keeps its distance to.
 * @property {number} x                The distance to that edge, as a fraction of the screen width (0 to 1).
 * @property {"top"|"bottom"} anchorY  The vertical screen edge that the display keeps its distance to.
 * @property {number} y                The distance to that edge, as a fraction of the screen height (0 to 1).
 */

/**
 * A dragged size: the image height as a fraction of the screen height. The width follows the aspect ratio of
 * each image, so images of different shapes keep their shape at the same height.
 * @typedef {object} CustomSize
 * @property {number} height
 */

/** A pointer move below this distance in pixels is a click, not a drag. A click saves nothing. */
const DRAG_THRESHOLD = 4;

/** The smallest image height in pixels that a resize can make. */
const MIN_IMAGE_HEIGHT = 48;

/** With a dragged size, the display can use this part of the screen width, instead of the default 40vw. */
const CUSTOM_MAX_WIDTH = "95vw";

/** Is a move or a resize in progress now? */
let dragging = false;

/**
 * @returns {boolean}  Is the user moving or resizing the display now?
 */
export function isDragging() {
  return dragging;
}

/**
 * Apply the position and the size: the dragged values of this user, or else the defaults.
 * @param {HTMLElement} display
 * @param {Token} token  Character whose size should be applied.
 */
export function applyDisplayLayout(display, token) {
  applyPosition(display);
  applySize(display, token);
}

/**
 * Let the user move the display, or resize it with a corner handle, while it has the "moving" class.
 * When the drag ends, save the new layout for this user and switch the user to the dragged layout.
 * @param {HTMLElement} display
 * @param {function(): void} onDragEnd  Called after each drag, also when the drag was only a click.
 * @param {function(): Token|null} getToken  Token shown at pointerdown.
 */
export function makeDisplayInteractive(display, onDragEnd, getToken) {
  display.addEventListener("pointerdown", event => {
    if ( (event.button !== 0) || !display.classList.contains("moving") ) return;
    event.preventDefault();
    const corner = event.target.closest(".tha-resize-handle")?.dataset.corner;
    // Bind the resize to its original character, even if hover changes mid-drag.
    const token = getToken();
    if ( !token ) return;
    const handler = corner ? createResizeHandler(display, corner, token) : createMoveHandler(display);
    runDrag(display, event, handler, onDragEnd);
  });
}

/* -------------------------------------------- */
/*  Applying the layout                         */
/* -------------------------------------------- */

/**
 * @param {HTMLElement} display
 */
function applyPosition(display) {
  clearPosition(display);
  const custom = getCustomPosition();
  if ( custom ) {
    display.style[custom.anchorX] = `${custom.x * 100}vw`;
    display.style[custom.anchorY] = `${custom.y * 100}vh`;
    return;
  }
  const corner = getSetting(SETTINGS.POSITION);
  const isTop = [POSITIONS.TOP_LEFT, POSITIONS.TOP_RIGHT].includes(corner);
  const isLeft = [POSITIONS.TOP_LEFT, POSITIONS.BOTTOM_LEFT].includes(corner);
  display.style[isTop ? "top" : "bottom"] = "0";
  display.style[isLeft ? "left" : "right"] = "0";
}

/**
 * A dragged size sets the image height. Without it, the image keeps its natural size, limited by the world
 * maximum height. The CSS reads the three variables (see token-hover-art.css).
 * @param {HTMLElement} display
 * @param {Token} token
 */
function applySize(display, token) {
  const custom = getCustomSize(token);
  if ( custom ) {
    setSizeVariables(display, {imageHeight: `${custom.height * 100}vh`, maxHeight: "none", maxWidth: CUSTOM_MAX_WIDTH});
  }
  else setSizeVariables(display, {imageHeight: "auto", maxHeight: `${getSetting(SETTINGS.MAX_HEIGHT)}vh`});
}

/**
 * @param {HTMLElement} display
 * @param {{imageHeight: string, maxHeight: string, maxWidth?: string}} size  maxWidth undefined means the CSS default.
 */
function setSizeVariables(display, {imageHeight, maxHeight, maxWidth}) {
  display.style.setProperty("--tha-image-height", imageHeight);
  display.style.setProperty("--tha-max-height", maxHeight);
  if ( maxWidth ) display.style.setProperty("--tha-max-width", maxWidth);
  else display.style.removeProperty("--tha-max-width");
}

/* -------------------------------------------- */
/*  Dragging                                    */
/* -------------------------------------------- */

/**
 * @typedef {object} DragHandler
 * @property {function(number, number): void} onMove  Called with the pointer offset from the drag start, in pixels.
 * @property {function(): Promise<void>} save         Saves the result after a real drag.
 */

/**
 * Run a pointer drag on the display with a handler. A drag below DRAG_THRESHOLD is a click and saves nothing.
 * @param {HTMLElement} display
 * @param {PointerEvent} event      The pointerdown event.
 * @param {DragHandler} handler
 * @param {function(): void} onDragEnd
 */
function runDrag(display, event, handler, onDragEnd) {
  let moved = false;
  dragging = true;

  const onMove = moveEvent => {
    const dx = moveEvent.clientX - event.clientX;
    const dy = moveEvent.clientY - event.clientY;
    if ( !moved && (Math.hypot(dx, dy) < DRAG_THRESHOLD) ) return;
    moved = true;
    handler.onMove(dx, dy);
  };
  const onEnd = async () => {
    display.removeEventListener("pointermove", onMove);
    dragging = false;
    if ( moved ) await handler.save();
    onDragEnd();
  };

  display.setPointerCapture(event.pointerId);
  display.addEventListener("pointermove", onMove);
  display.addEventListener("lostpointercapture", onEnd, {once: true});
}

/**
 * Move the whole display. The display stays inside the screen.
 * @param {HTMLElement} display
 * @returns {DragHandler}
 */
function createMoveHandler(display) {
  const start = display.getBoundingClientRect();
  return {
    onMove(dx, dy) {
      clearPosition(display);
      display.style.left = `${clamp(start.left + dx, 0, window.innerWidth - start.width)}px`;
      display.style.top = `${clamp(start.top + dy, 0, window.innerHeight - start.height)}px`;
    },
    save: () => saveLayout({position: toCustomPosition(display.getBoundingClientRect())})
  };
}

/**
 * Resize the image from a corner. The opposite corner of the display stays in place, and the image keeps its
 * aspect ratio: the larger of the horizontal and the vertical pointer movement sets the new size. The display
 * stays inside the screen.
 * @param {HTMLElement} display
 * @param {"nw"|"ne"|"sw"|"se"} corner  The corner that the user drags.
 * @param {Token} token  Character whose image is being resized.
 * @returns {DragHandler}
 */
function createResizeHandler(display, corner, token) {
  const media = display.querySelector(".tha-media img, .tha-media video");
  const start = display.getBoundingClientRect();
  const image = media.getBoundingClientRect();
  const aspect = image.width / image.height;

  // The frame is the padding and the border around the image. It keeps its size during the resize.
  const frame = {width: start.width - image.width, height: start.height - image.height};

  // A drag away from the fixed corner makes the image larger. The sign gives that direction for each corner.
  const signX = corner.includes("w") ? -1 : 1;
  const signY = corner.includes("n") ? -1 : 1;
  const fixedX = (signX < 0) ? start.right : start.left;
  const fixedY = (signY < 0) ? start.bottom : start.top;

  // The largest image height that keeps the display inside the screen, seen from the fixed corner.
  const roomX = (signX < 0) ? fixedX : (window.innerWidth - fixedX);
  const roomY = (signY < 0) ? fixedY : (window.innerHeight - fixedY);
  const maxImageHeight = Math.min(roomY - frame.height, (roomX - frame.width) / aspect);

  return {
    onMove(dx, dy) {
      const scale = Math.max((image.width + (signX * dx)) / image.width, (image.height + (signY * dy)) / image.height);
      const height = clamp(image.height * scale, MIN_IMAGE_HEIGHT, Math.max(maxImageHeight, MIN_IMAGE_HEIGHT));
      setSizeVariables(display, {imageHeight: `${height}px`, maxHeight: "none", maxWidth: "none"});
      const width = (height * aspect) + frame.width;
      clearPosition(display);
      display.style.left = `${(signX < 0) ? (fixedX - width) : fixedX}px`;
      display.style.top = `${(signY < 0) ? (fixedY - (height + frame.height)) : fixedY}px`;
    },
    save: () => saveLayout({
      position: toCustomPosition(display.getBoundingClientRect()),
      size: {height: clamp(media.getBoundingClientRect().height / window.innerHeight, 0, 1)},
      token
    })
  };
}

/* -------------------------------------------- */
/*  Saved layout                                */
/* -------------------------------------------- */

/**
 * @returns {CustomPosition|null}  The dragged position, if the user uses the dragged layout and it is valid.
 */
function getCustomPosition() {
  if ( !getSetting(SETTINGS.USE_CUSTOM_POSITION) ) return null;
  const position = getSetting(SETTINGS.CUSTOM_POSITION);
  const valid = ["left", "right"].includes(position?.anchorX) && ["top", "bottom"].includes(position?.anchorY)
    && Number.isFinite(position.x) && Number.isFinite(position.y);
  return valid ? position : null;
}

/**
 * Stable key for the individual hover-art size.
 * PCs stay grouped by their world Actor to preserve their existing saved sizes.
 * NPCs use the Scene TokenDocument UUID so two goblins based on the same NPC
 * Actor can have different-sized art. This also works for linked NPC tokens.
 * Never key NPCs by their base Actor, or changing one token changes all copies.
 * @param {Token|null} token
 * @returns {string|null}
 */
export function getCharacterKey(token) {
  const doc = token?.document;
  if ( !doc ) return null;
  const baseActor = getBaseActor(token.actor ?? doc.actor);
  if ( baseActor?.type === "character" && baseActor.uuid ) return baseActor.uuid;
  if ( typeof doc.uuid === "string" && doc.uuid ) return doc.uuid;

  // Defensive fallback for synthetic or older TokenDocuments without a UUID.
  const scene = doc.parent?.uuid ?? (doc.parent?.id ? `Scene.${doc.parent.id}` : null);
  return scene && doc.id ? `${scene}.Token.${doc.id}` : null;
}

function getCustomSize(token) {
  if ( !getSetting(SETTINGS.USE_CUSTOM_POSITION) ) return null;
  const key = getCharacterKey(token);
  if ( !key ) return null;
  const size = getSetting(SETTINGS.CHARACTER_SIZES)?.[key];
  return (Number.isFinite(size?.height) && size.height > 0 && size.height <= 1) ? size : null;
}

/**
 * Save a dragged layout, and switch this user to the dragged layout. A move saves only the position; a resize
 * saves the position and the size.
 * @param {{position: CustomPosition, size?: CustomSize, token?: Token}} layout
 */
async function saveLayout({position, size, token}) {
  await game.settings.set(MODULE_ID, SETTINGS.CUSTOM_POSITION, position);
  if ( size ) {
    const key = getCharacterKey(token);
    if ( key ) {
      const sizes = getSetting(SETTINGS.CHARACTER_SIZES) ?? {};
      await game.settings.set(MODULE_ID, SETTINGS.CHARACTER_SIZES, {...sizes, [key]: size});
    }
  }
  await game.settings.set(MODULE_ID, SETTINGS.USE_CUSTOM_POSITION, true);
}

/**
 * @param {DOMRect} rect  The screen rectangle of the display after the drag.
 * @returns {CustomPosition}
 */
function toCustomPosition(rect) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const anchorX = ((rect.left + (rect.width / 2)) < (width / 2)) ? "left" : "right";
  const anchorY = ((rect.top + (rect.height / 2)) < (height / 2)) ? "top" : "bottom";
  const x = (anchorX === "left") ? rect.left : (width - rect.right);
  const y = (anchorY === "top") ? rect.top : (height - rect.bottom);
  return {anchorX, x: clamp(x / width, 0, 1), anchorY, y: clamp(y / height, 0, 1)};
}

/* -------------------------------------------- */

/**
 * @param {HTMLElement} display
 */
function clearPosition(display) {
  for ( const side of ["top", "right", "bottom", "left"] ) display.style[side] = "";
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
