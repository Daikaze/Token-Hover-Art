import { MODULE_ID, FLAGS, SETTINGS } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { hasVideoExtension } from "./compat.mjs";

/*
 * All reads and writes of module data go through this file.
 *
 * Gallery:   the manual images plus the files of all folder sources. All tokens of the Actor share it.
 *            Manual images: flags.token-hover-art.images on the world (base) Actor.
 *            Folders:       flags.token-hover-art.folders on the world (base) Actor. Each entry stores the result
 *                           of its last scan, so users without the file browser permission can read the files.
 * Selection: flags.token-hover-art.selected on each TokenDocument. Each token can show a different image.
 * Secret:    flags.token-hover-art.secret on each TokenDocument. Only GMs and owners see secret art.
 * Defaults:  the same two token flags on Actor#prototypeToken. Foundry copies them into each new token.
 */

/**
 * Return the world Actor that holds the gallery.
 * An unlinked token has a synthetic Actor. A write to the synthetic Actor goes into the token's ActorDelta,
 * and then the other tokens of the Actor do not see it. So the gallery always uses the base Actor.
 * @param {Actor|null} actor
 * @returns {Actor|null}
 */
export function getBaseActor(actor) {
  if ( !actor ) return null;
  return actor.isToken ? (actor.token?.baseActor ?? null) : actor;
}

/* -------------------------------------------- */
/*  Gallery                                     */
/* -------------------------------------------- */

/**
 * Can the current user manage the gallery of this Actor (open the gallery window, add and remove images and
 * folders, set defaults)? GMs always can. Owners can if the world setting "Allow owners to manage galleries"
 * is on. Compendium Actors have no gallery. Selecting the hover art of a token is a separate right: the Token HUD
 * already limits it to GMs and owners.
 * @param {Actor|null} actor  A base or a synthetic Actor.
 * @returns {boolean}
 */
export function canManageGallery(actor) {
  const baseActor = getBaseActor(actor);
  if ( !baseActor || baseActor.pack ) return false;
  if ( game.user.isGM ) return true;
  return baseActor.isOwner && getSetting(SETTINGS.OWNERS_MANAGE_GALLERY);
}

/**
 * @typedef {object} FolderSource
 * @property {string} source       The file storage: "data", "public", or "s3".
 * @property {string|null} bucket  The S3 bucket, if the source is "s3".
 * @property {string} folder       The folder path in the storage, without a trailing slash.
 * @property {string} filter       A glob pattern for the file names, for example "*.png" or "{*.png,*.webp}".
 * @property {string[]} files      The files that the last scan found.
 */

/**
 * @param {Actor|null} actor  A base or a synthetic Actor.
 * @returns {string[]}        All paths in the gallery: the manual images first, then the files of each folder.
 */
export function getGallery(actor) {
  const folderFiles = getFolderSources(actor).flatMap(f => f.files);
  return [...new Set([...getManualImages(actor), ...folderFiles])];
}

/**
 * @param {Actor|null} actor  A base or a synthetic Actor.
 * @returns {string[]}        The images that were added one by one.
 */
export function getManualImages(actor) {
  const images = getBaseActor(actor)?.getFlag(MODULE_ID, FLAGS.IMAGES);
  return Array.isArray(images) ? images : [];
}

/**
 * Replace the manual images. Duplicate and empty paths are removed.
 * @param {Actor} actor
 * @param {string[]} paths
 * @returns {Promise<Actor>}
 */
export function setManualImages(actor, paths) {
  const unique = [...new Set(paths.filter(p => typeof p === "string" && p.trim()))];
  return getBaseActor(actor).setFlag(MODULE_ID, FLAGS.IMAGES, unique);
}

/**
 * @param {Actor|null} actor  A base or a synthetic Actor.
 * @returns {FolderSource[]}
 */
export function getFolderSources(actor) {
  const folders = getBaseActor(actor)?.getFlag(MODULE_ID, FLAGS.FOLDERS);
  return Array.isArray(folders) ? folders : [];
}

/**
 * Replace the folder sources.
 * @param {Actor} actor
 * @param {FolderSource[]} folders
 * @returns {Promise<Actor>}
 */
export function setFolderSources(actor, folders) {
  return getBaseActor(actor).setFlag(MODULE_ID, FLAGS.FOLDERS, folders);
}

/* -------------------------------------------- */
/*  Token selection                             */
/* -------------------------------------------- */

/**
 * @param {object} change  The change object of an updateToken hook.
 * @returns {boolean}      Did the update change a flag of this module?
 */
export function hasModuleFlagChange(change) {
  return foundry.utils.hasProperty(change, `flags.${MODULE_ID}`);
}

/**
 * @param {TokenDocument} tokenDoc
 * @returns {string|null}  The selected hover art path, or null if the token has no hover art.
 */
export function getSelectedArt(tokenDoc) {
  return tokenDoc?.getFlag(MODULE_ID, FLAGS.SELECTED) || null;
}

/**
 * @param {TokenDocument} tokenDoc
 * @param {string} path
 * @returns {Promise<TokenDocument>}
 */
export function selectArt(tokenDoc, path) {
  return tokenDoc.setFlag(MODULE_ID, FLAGS.SELECTED, path);
}

/**
 * Remove the hover art from the token. The token then shows nothing on hover.
 * @param {TokenDocument} tokenDoc
 * @returns {Promise<TokenDocument>}
 */
export function clearArt(tokenDoc) {
  return tokenDoc.unsetFlag(MODULE_ID, FLAGS.SELECTED);
}

/* -------------------------------------------- */
/*  Token secret state                          */
/* -------------------------------------------- */

/**
 * @param {TokenDocument} tokenDoc
 * @returns {boolean}
 */
export function isSecret(tokenDoc) {
  return tokenDoc?.getFlag(MODULE_ID, FLAGS.SECRET) === true;
}

/**
 * @param {TokenDocument} tokenDoc
 * @param {boolean} secret
 * @returns {Promise<TokenDocument>}
 */
export function setSecret(tokenDoc, secret) {
  return tokenDoc.setFlag(MODULE_ID, FLAGS.SECRET, secret);
}

/**
 * Can the current user see the hover art of this token?
 * GMs and owners always can. Other users can only if the art is not secret.
 * @param {TokenDocument} tokenDoc
 * @returns {boolean}
 */
export function canViewArt(tokenDoc) {
  return !isSecret(tokenDoc) || tokenDoc.isOwner;
}

/* -------------------------------------------- */
/*  Prototype token defaults                    */
/* -------------------------------------------- */

/**
 * @param {Actor} actor
 * @returns {string|null}  The hover art that new tokens of this Actor start with.
 */
export function getDefaultArt(actor) {
  const flags = getBaseActor(actor)?.prototypeToken.flags;
  return foundry.utils.getProperty(flags ?? {}, `${MODULE_ID}.${FLAGS.SELECTED}`) || null;
}

/**
 * @param {Actor} actor
 * @param {string} path
 * @returns {Promise<Actor>}
 */
export function setDefaultArt(actor, path) {
  return getBaseActor(actor).update({[`prototypeToken.flags.${MODULE_ID}.${FLAGS.SELECTED}`]: path});
}

/**
 * @param {Actor} actor
 * @returns {Promise<Actor>}
 */
export function clearDefaultArt(actor) {
  return getBaseActor(actor).update({[`prototypeToken.flags.${MODULE_ID}.-=${FLAGS.SELECTED}`]: null});
}

/**
 * @param {Actor} actor
 * @returns {boolean}  Do new tokens of this Actor start with secret hover art?
 */
export function isDefaultSecret(actor) {
  const flags = getBaseActor(actor)?.prototypeToken.flags;
  return foundry.utils.getProperty(flags ?? {}, `${MODULE_ID}.${FLAGS.SECRET}`) === true;
}

/**
 * @param {Actor} actor
 * @param {boolean} secret
 * @returns {Promise<Actor>}
 */
export function setDefaultSecret(actor, secret) {
  return getBaseActor(actor).update({[`prototypeToken.flags.${MODULE_ID}.${FLAGS.SECRET}`]: secret});
}

/* -------------------------------------------- */
/*  Media                                       */
/* -------------------------------------------- */

/**
 * @param {string} path
 * @returns {boolean}  Is the path a video file (webm, mp4, ...)?
 */
export function isVideo(path) {
  return hasVideoExtension(path);
}
