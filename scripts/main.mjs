import { TEMPLATES } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { addColorFields } from "./color-fields.mjs";
import { getBaseActor, canManageGallery, hasModuleFlagChange } from "./hover-art-data.mjs";
import { HoverArtGallery } from "./gallery-sheet.mjs";
import { loadPaletteTemplate, onRenderTokenHUD, refreshTokenHUD, closeHoverArtPalette } from "./token-hud.mjs";
import {
  activateMoveKey, onHoverToken, refreshTokenDisplay, onDeleteToken, preloadSceneArt, refreshDisplay, hideDisplay
} from "./hover-display.mjs";
import { preloadTemplates } from "./compat.mjs";

Hooks.once("init", () => {
  registerSettings(refreshDisplay);
  preloadTemplates([TEMPLATES.GALLERY_SHEET]);
  loadPaletteTemplate();
  activateMoveKey();
});

Hooks.on("renderSettingsConfig", addColorFields);

/* -------------------------------------------- */
/*  Actor sheet button                          */
/* -------------------------------------------- */

/**
 * @param {Actor} sheetActor  The Actor of an actor sheet.
 * @returns {Actor|null}      The base Actor, if the current user may manage its gallery.
 */
function getGalleryActor(sheetActor) {
  return canManageGallery(sheetActor) ? getBaseActor(sheetActor) : null;
}

/**
 * Add a "Hover Art" button to the header of Application V1 actor sheets (all sheets in v11 and v12, and the V1
 * sheets that some systems still use in v13). Only users who may manage the gallery see it (see
 * canManageGallery). For an unlinked token, it opens the gallery of the base Actor.
 */
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = getGalleryActor(sheet.actor);
  if ( !actor ) return;
  buttons.unshift({
    label: "TOKEN_HOVER_ART.Gallery.Button",
    class: "token-hover-art",
    icon: "fas fa-images",
    onclick: () => HoverArtGallery.open(actor)
  });
});

/**
 * The same button for ApplicationV2 actor sheets. Core fires this hook from v13; v12 ApplicationV2 has no
 * header controls hook, so the hook does nothing there.
 */
Hooks.on("getHeaderControlsActorSheetV2", (sheet, controls) => {
  const actor = getGalleryActor(sheet.actor);
  if ( !actor ) return;
  controls.push({
    action: "tokenHoverArtGallery",
    icon: "fas fa-images",
    label: "TOKEN_HOVER_ART.Gallery.Button",
    onClick: () => HoverArtGallery.open(actor)
  });
});

/* -------------------------------------------- */
/*  Token HUD and hover display                 */
/* -------------------------------------------- */

/** A change of the token's art or secret state, by any user, updates the HUD palette and the hover display. */
Hooks.on("updateToken", (tokenDoc, change) => {
  if ( !hasModuleFlagChange(change) ) return;
  refreshTokenHUD(tokenDoc);
  refreshTokenDisplay(tokenDoc);
});

Hooks.on("renderTokenHUD", onRenderTokenHUD);
Hooks.on("hoverToken", onHoverToken);
Hooks.on("deleteToken", onDeleteToken);
Hooks.on("canvasReady", preloadSceneArt);
Hooks.on("canvasTearDown", () => { hideDisplay(); closeHoverArtPalette(); });
