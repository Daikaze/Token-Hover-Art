import { SETTINGS } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import { getFolderSources, setFolderSources } from "./hover-art-data.mjs";
import { getFilePickerClass } from "./compat.mjs";

/*
 * Folder sources use the core wildcard browse, the same mechanism as "Randomize Wildcard Images" on tokens.
 * The server lists one folder (not recursive) and matches each file name with minimatch(name, filter).
 * So the filter is a glob on the file name: "*.png", "hero-*.webp", or "{*.png,*.webp}". The match is case-sensitive.
 *
 * The server answers only users with the FILES_BROWSE permission. So a scan stores its result in the
 * Actor flag, and all other users read that stored result.
 */

/** Only image and video files can be hover art. The server applies this list together with the filter. */
const MEDIA_EXTENSIONS = Object.keys(CONST.IMAGE_FILE_EXTENSIONS)
  .concat(Object.keys(CONST.VIDEO_FILE_EXTENSIONS))
  .map(ext => `.${ext}`);

/**
 * @returns {boolean}  Can the current user scan folders?
 */
export function canScanFolders() {
  return game.user.can("FILES_BROWSE");
}

/**
 * Normalize a filter. An empty filter becomes the default filter of the world.
 * @param {string} filter
 * @returns {string}
 * @throws {Error}     If the filter contains a "/". The filter matches file names, not paths.
 */
export function normalizeFilter(filter) {
  const value = (filter ?? "").trim() || getSetting(SETTINGS.DEFAULT_FILTER);
  if ( value.includes("/") ) throw new Error(game.i18n.localize("TOKEN_HOVER_ART.Folders.FilterHasSlash"));
  return value;
}

/**
 * Add a folder source to the Actor and scan it.
 * @param {Actor} actor
 * @param {object} data
 * @param {string} data.folder           The folder path.
 * @param {string} [data.filter]         The file name filter. Empty means the default filter.
 * @param {string} [data.source]         The storage. If it is missing, it comes from the path (see sourceOfPath).
 * @param {string|null} [data.bucket]    The S3 bucket. An empty value means no bucket.
 * @returns {Promise<Actor>}
 */
export async function addFolderSource(actor, {folder, filter, source, bucket}) {
  const path = normalizeFolder(folder);
  const entry = {
    source: source ?? sourceOfPath(path),
    bucket: bucket || null,
    folder: path,
    filter: normalizeFilter(filter),
    files: []
  };
  const folders = getFolderSources(actor);
  if ( folders.some(f => isSameFolder(f, entry)) ) {
    throw new Error(game.i18n.localize("TOKEN_HOVER_ART.Folders.AlreadyAdded"));
  }
  entry.files = await scanFolder(entry);
  return setFolderSources(actor, [...folders, entry]);
}

/**
 * Change the filter of a folder source and scan the folder again.
 * @param {Actor} actor
 * @param {number} index
 * @param {string} filter
 * @returns {Promise<Actor|undefined>}
 */
export async function setFolderFilter(actor, index, filter) {
  const folders = getFolderSources(actor).map(f => ({...f}));
  const entry = folders[index];
  if ( !entry ) return;
  entry.filter = normalizeFilter(filter);
  entry.files = await scanFolder(entry);
  return setFolderSources(actor, folders);
}

/**
 * Remove a folder source. Tokens that selected one of its files keep the selection.
 * @param {Actor} actor
 * @param {number} index
 * @returns {Promise<Actor>}
 */
export function removeFolderSource(actor, index) {
  return setFolderSources(actor, getFolderSources(actor).filter((_, i) => i !== index));
}

/**
 * Scan all folder sources again. Write to the Actor only if a file list changed, because each write
 * sends an update to all clients and renders the sheets and the HUD again.
 * A folder that cannot be scanned keeps its last result, and the error goes to the console.
 * @param {Actor} actor
 * @returns {Promise<boolean>}  Did a file list change?
 */
export async function rescanFolderSources(actor) {
  const folders = getFolderSources(actor);
  if ( !folders.length ) return false;
  let changed = false;
  const scanned = [];
  for ( const entry of folders ) {
    let files = entry.files;
    try {
      files = await scanFolder(entry);
    } catch(err) {
      console.warn(`token-hover-art | Cannot scan folder "${entry.folder}"`, err);
    }
    if ( !sameFiles(files, entry.files) ) changed = true;
    scanned.push({...entry, files});
  }
  if ( changed ) await setFolderSources(actor, scanned);
  return changed;
}

/* -------------------------------------------- */

/**
 * List the files in the folder that match the filter.
 * @param {FolderSource} entry
 * @returns {Promise<string[]>}  The file paths, sorted by name.
 */
async function scanFolder({source, bucket, folder, filter}) {
  const options = {wildcard: true, extensions: MEDIA_EXTENSIONS};
  if ( bucket ) options.bucket = bucket;
  const result = await getFilePickerClass().browse(source, `${folder}/${filter}`, options);
  return [...result.files].sort((a, b) => a.localeCompare(b));
}

/**
 * Compare two sorted file lists. foundry.utils.objectsEqual is not usable here: in v11 it compares arrays by
 * identity only.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function sameFiles(a, b) {
  return (a.length === b.length) && a.every((path, i) => path === b[i]);
}

/**
 * @param {string} folder
 * @returns {string}  The folder without a trailing slash.
 */
function normalizeFolder(folder) {
  const value = (folder ?? "").trim().replace(/\/+$/, "");
  if ( !value ) throw new Error(game.i18n.localize("TOKEN_HOVER_ART.Folders.NoFolder"));
  return value;
}

/**
 * Find the storage of a typed folder path. Core uses the same rule for wildcard token images
 * (Files.parseWildcardPath): paths in "icons/" are in the public storage, all other paths are in the data storage.
 * @param {string} folder
 * @returns {string}
 */
function sourceOfPath(folder) {
  return folder.startsWith("icons/") ? "public" : "data";
}

/**
 * @param {FolderSource} a
 * @param {FolderSource} b
 * @returns {boolean}  Do both entries scan the same folder with the same filter?
 */
function isSameFolder(a, b) {
  return (a.source === b.source) && (a.bucket === b.bucket) && (a.folder === b.folder) && (a.filter === b.filter);
}
