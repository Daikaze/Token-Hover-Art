export const MODULE_ID = "token-hover-art";

/**
 * Flag keys. The gallery sources (manual images and folders) are on the base Actor.
 * The selection and the secret state are on each Token.
 */
export const FLAGS = Object.freeze({
  IMAGES: "images",
  FOLDERS: "folders",
  SELECTED: "selected",
  SECRET: "secret"
});

export const SETTINGS = Object.freeze({
  POSITION: "position",
  MAX_HEIGHT: "maxHeight",
  BACKGROUND_COLOR: "backgroundColor",
  SHOW_BORDER: "showBorder",
  BORDER_WIDTH: "borderWidth",
  BORDER_COLOR: "borderColor",
  HIDE_DELAY: "hideDelay",
  DEFAULT_FILTER: "defaultFilter",
  SHOW_NAME: "showName",
  ENABLED: "enabled",
  OWNERS_MANAGE_GALLERY: "ownersManageGallery",
  PALETTE_SIZE: "paletteSize",
  USE_CUSTOM_POSITION: "useCustomPosition",
  CUSTOM_POSITION: "customPosition",
  CUSTOM_SIZE: "customSize"
});

export const POSITIONS = Object.freeze({
  TOP_LEFT: "top-left",
  TOP_RIGHT: "top-right",
  BOTTOM_LEFT: "bottom-left",
  BOTTOM_RIGHT: "bottom-right"
});

export const TEMPLATES = Object.freeze({
  GALLERY_SHEET: `modules/${MODULE_ID}/templates/gallery-sheet.hbs`,
  HUD_PALETTE: `modules/${MODULE_ID}/templates/hud-palette.hbs`
});
