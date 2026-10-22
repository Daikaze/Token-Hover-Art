import { MODULE_ID, SETTINGS, TEMPLATES } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import {
  getBaseActor, canManageGallery, getManualImages, setManualImages, getFolderSources, getDefaultArt, setDefaultArt,
  clearDefaultArt, isDefaultSecret, setDefaultSecret, isVideo
} from "./hover-art-data.mjs";
import {
  canScanFolders, addFolderSource, setFolderFilter, removeFolderSource, rescanFolderSources
} from "./folder-sources.mjs";
import { getDocumentSheetClass, getFilePickerClass } from "./compat.mjs";

/**
 * The window where owners and GMs manage the hover art gallery of an Actor.
 * It is a DocumentSheet, so Foundry registers it in actor.apps and renders it again after each Actor update.
 * Each action writes to the Actor at once. The form is never submitted (see _updateObject).
 *
 * The window uses Application V1, because ApplicationV2 does not exist in v11. Application V1 is deprecated
 * since v13. When a future core version removes it, this window must move to ApplicationV2.
 */
export class HoverArtGallery extends getDocumentSheetClass() {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", MODULE_ID],
      template: TEMPLATES.GALLERY_SHEET,
      width: 560,
      height: "auto",
      resizable: true,
      viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
      sheetConfig: false,
      submitOnChange: false,
      closeOnSubmit: false,
      scrollY: [".tha-gallery-scroll"]
    });
  }

  /**
   * Open the gallery of an Actor. An open window for the same Actor comes to the front.
   * A user who can scan folders also scans them again, so new files in a folder show up.
   * @param {Actor} actor  A base or a synthetic Actor.
   * @returns {HoverArtGallery|null}
   */
  static open(actor) {
    if ( !canManageGallery(actor) ) return null;
    const baseActor = getBaseActor(actor);
    const app = Object.values(baseActor.apps).find(a => a instanceof HoverArtGallery) ?? new HoverArtGallery(baseActor);
    app.render(true, {focus: true});
    if ( canScanFolders() ) {
      rescanFolderSources(baseActor).catch(err => console.warn("token-hover-art | Folder rescan failed", err));
    }
    return app;
  }

  /**
   * Only users who may manage the gallery can view this window (see canManageGallery). The core check of the
   * viewPermission option (OWNER) runs first.
   * @override
   */
  _canUserView(user) {
    return super._canUserView(user) && canManageGallery(this.document);
  }

  /** @override */
  get title() {
    return `${game.i18n.localize("TOKEN_HOVER_ART.Gallery.Title")}: ${this.document.name}`;
  }

  /** @override */
  getData(options = {}) {
    const actor = this.document;
    const defaultArt = getDefaultArt(actor);
    const toImage = path => ({path, isVideo: isVideo(path), isDefault: path === defaultArt});
    const manual = getManualImages(actor);
    return {
      editable: this.isEditable,
      canBrowse: game.user.can("FILES_BROWSE"),
      canUpload: game.user.can("FILES_UPLOAD"),
      canScan: this.isEditable && canScanFolders(),
      defaultFilter: getSetting(SETTINGS.DEFAULT_FILTER),
      defaultSecret: isDefaultSecret(actor),
      manualImages: manual.map((path, index) => ({
        ...toImage(path),
        index,
        isFirst: index === 0,
        isLast: index === manual.length - 1
      })),
      folders: getFolderSources(actor).map((folder, index) => ({
        index,
        folder: folder.folder,
        source: folder.source,
        filter: folder.filter,
        count: folder.files.length,
        images: folder.files.map(toImage)
      }))
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if ( !this.isEditable ) return;
    html.on("click", "[data-action]", event => this.#runAction(event, this.#onAction));
    html.find('input[name="defaultSecret"]').on("change", event => {
      this.#runAction(event, () => setDefaultSecret(this.document, event.currentTarget.checked));
    });
    html.find("input.tha-folder-filter").on("change", event => this.#runAction(event, this.#onChangeFolderFilter));

    // Enter in an add field runs the add action of that field. Enter in a folder filter applies the filter.
    html.find('input[name="path"]').on("keydown", event => this.#onEnter(event, this.#addImageFromField));
    html.find('input[name="folderPath"], input[name="folderFilter"]').on("keydown", event => {
      this.#onEnter(event, this.#addFolderFromFields);
    });
    html.find("input.tha-folder-filter").on("keydown", event => {
      this.#onEnter(event, () => event.currentTarget.blur());
    });

    // Each Add button is enabled only while its field has a value.
    html.find('input[name="path"], input[name="folderPath"]').on("input", () => this.#updateAddButtons());
    this.#updateAddButtons();
  }

  /**
   * The storage of the folder that the folder picker last put into the folder field. A typed path has no storage,
   * so the Add action uses this storage only while the field still shows the picked folder.
   * @type {{folder: string, source: string, bucket: string|null}|null}
   */
  #pickedFolder = null;

  /**
   * Enable each Add button only while its field has a value, so an Add click never does nothing.
   */
  #updateAddButtons() {
    const {path, folderPath} = this.form.elements;
    const addImage = this.form.querySelector('[data-action="add-path"]');
    const addFolder = this.form.querySelector('[data-action="add-folder"]');
    if ( addImage ) addImage.disabled = !path.value.trim();
    if ( addFolder && folderPath ) addFolder.disabled = !folderPath.value.trim();
  }

  /**
   * Put a picked path into a field, as the core file picker fields do. The user then confirms it with Add.
   * @param {HTMLInputElement} input
   * @param {string} value
   */
  #fillField(input, value) {
    input.value = value;
    this.#updateAddButtons();
    input.focus();
  }

  /**
   * Each action saves its change at once, so the form has no data to submit. This override replaces the
   * DocumentSheet default, which would write the form fields into the Actor.
   * @override
   */
  async _updateObject(event, formData) {}

  /* -------------------------------------------- */

  /**
   * Run an event handler and show its error as a notification.
   * @param {Event} event
   * @param {function(Event): Promise<*>|*} handler
   */
  async #runAction(event, handler) {
    event.preventDefault();
    try {
      await handler.call(this, event);
    } catch(err) {
      ui.notifications.error(err.message);
    }
  }

  /**
   * Run an action when the Enter key is pressed.
   * @param {KeyboardEvent} event
   * @param {function(Event): Promise<*>|*} handler
   */
  #onEnter(event, handler) {
    if ( event.key !== "Enter" ) return;
    this.#runAction(event, handler);
  }

  /**
   * @param {PointerEvent} event
   */
  async #onAction(event) {
    const button = event.currentTarget;
    const index = Number(button.closest("[data-index]")?.dataset.index);
    switch ( button.dataset.action ) {
      case "browse": return this.#browseImage();
      case "add-path": return this.#addImageFromField();
      case "remove": return this.#removeImage(index);
      case "move-left": return this.#moveImage(index, -1);
      case "move-right": return this.#moveImage(index, 1);
      case "default": return this.#toggleDefault(button.closest("[data-path]").dataset.path);
      case "browse-folder": return this.#browseFolder();
      case "add-folder": return this.#addFolderFromFields();
      case "rescan-folders": return this.#rescanFolders();
      case "remove-folder": return removeFolderSource(this.document, index);
    }
  }

  /**
   * @param {Event} event  The change event of a folder filter input.
   */
  #onChangeFolderFilter(event) {
    const input = event.currentTarget;
    return setFolderFilter(this.document, Number(input.closest("[data-index]").dataset.index), input.value);
  }

  /* -------------------------------------------- */
  /*  Manual images                               */
  /* -------------------------------------------- */

  /**
   * Open the core FilePicker. The picked file goes into the path field; Add then adds it to the gallery.
   * Users with the FILES_UPLOAD permission can also upload new files in the picker.
   */
  #browseImage() {
    const input = this.form.elements.path;
    const FilePickerClass = getFilePickerClass();
    const picker = new FilePickerClass({
      type: "imagevideo",
      current: input.value.trim() || (getManualImages(this.document).at(-1) ?? ""),
      callback: path => this.#fillField(input, path)
    });
    return picker.render(true);
  }

  /**
   * Add the image that is typed in the path field.
   */
  async #addImageFromField() {
    const path = this.form.elements.path.value.trim();
    if ( path ) await this.#addImage(path);
  }

  /**
   * @param {string} path
   */
  async #addImage(path) {
    const images = getManualImages(this.document);
    if ( images.includes(path) ) {
      ui.notifications.info("TOKEN_HOVER_ART.Gallery.AlreadyAdded", {localize: true});
      return;
    }
    return setManualImages(this.document, [...images, path]);
  }

  /**
   * Remove an image from the gallery. Tokens that selected the image keep it, because the file still exists.
   * The prototype default is removed, so new tokens do not start with an image that is not in the gallery.
   * @param {number} index
   */
  async #removeImage(index) {
    const images = getManualImages(this.document);
    const path = images[index];
    if ( path === undefined ) return;
    if ( path === getDefaultArt(this.document) ) await clearDefaultArt(this.document);
    return setManualImages(this.document, images.filter((_, i) => i !== index));
  }

  /**
   * @param {number} index
   * @param {number} offset  -1 to move the image left, 1 to move it right.
   */
  #moveImage(index, offset) {
    const images = [...getManualImages(this.document)];
    const target = index + offset;
    if ( (target < 0) || (target >= images.length) ) return;
    [images[index], images[target]] = [images[target], images[index]];
    return setManualImages(this.document, images);
  }

  /**
   * Make the image the default of new tokens, or remove the default if the image is the default now.
   * @param {string} path  A manual image or a folder file.
   */
  #toggleDefault(path) {
    if ( path === getDefaultArt(this.document) ) return clearDefaultArt(this.document);
    return setDefaultArt(this.document, path);
  }

  /* -------------------------------------------- */
  /*  Folders                                     */
  /* -------------------------------------------- */

  /**
   * Open the core FilePicker in folder mode. The picked folder goes into the folder field; Add then adds it
   * with the filter of the filter field. The storage comes from the picker instance, not from a callback
   * argument, because the callback arguments are documented only for some core versions.
   */
  #browseFolder() {
    const input = this.form.elements.folderPath;
    const FilePickerClass = getFilePickerClass();
    const picker = new FilePickerClass({
      type: "folder",
      current: input.value.trim() || (getFolderSources(this.document).at(-1)?.folder ?? ""),
      callback: folder => {
        this.#pickedFolder = {folder, source: picker.activeSource, bucket: picker.source?.bucket ?? null};
        this.#fillField(input, folder);
      }
    });
    return picker.render(true);
  }

  /**
   * Add the folder in the folder field, with the filter in the filter field.
   */
  async #addFolderFromFields() {
    const {folderPath, folderFilter} = this.form.elements;
    const folder = folderPath.value.trim();
    if ( !folder ) return;
    const picked = (this.#pickedFolder?.folder === folder) ? this.#pickedFolder : null;
    await this.#addFolder({folder, filter: folderFilter.value, source: picked?.source, bucket: picked?.bucket});
    this.#pickedFolder = null;
  }

  /**
   * @param {object} data  See addFolderSource.
   */
  async #addFolder(data) {
    await addFolderSource(this.document, data);
    const added = getFolderSources(this.document).at(-1);
    ui.notifications.info(game.i18n.format("TOKEN_HOVER_ART.Folders.Added", {count: added.files.length}));
  }

  async #rescanFolders() {
    const changed = await rescanFolderSources(this.document);
    const key = changed ? "TOKEN_HOVER_ART.Folders.RescanChanged" : "TOKEN_HOVER_ART.Folders.RescanUnchanged";
    ui.notifications.info(key, {localize: true});
  }
}
