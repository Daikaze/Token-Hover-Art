import { MODULE_ID, SETTINGS, TEMPLATES } from "./constants.mjs";
import { getSetting } from "./settings.mjs";
import {
  getBaseActor, canManageGallery, getManualImages, setManualImages, getFolderSources, getDefaultArt, setDefaultArt,
  clearDefaultArt, isDefaultSecret, setDefaultSecret, isVideo
} from "./hover-art-data.mjs";
import {
  canScanFolders, addFolderSource, setFolderFilter, removeFolderSource, rescanFolderSources
} from "./folder-sources.mjs";
import { getFilePickerClass } from "./compat.mjs";


/** Native V14 gallery; actor flags and permissions are unchanged. */
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const ACTIONS = ["browse","add-path","remove","move-left","move-right","default","browse-folder","add-folder","rescan-folders","remove-folder"];
export class HoverArtGallery extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instances = new Map();
  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID],
    window: {title:"Token Hover Art",icon:"fa-solid fa-images",frame:true,minimizable:true,resizable:true},
    position: {width:670,height:700},
    actions: Object.fromEntries(ACTIONS.map(action=>[action,function(event,target) {
      if (!this.isEditable || target?.disabled || target?.classList?.contains("disabled")) return;
      return this.#runAction(event,()=>this.#onAction(target));
    }]))
  };
  static PARTS = {main:{template:TEMPLATES.GALLERY_SHEET}};
  constructor(actor,options={}) {
    if (!canManageGallery(actor)) throw new Error("Token Hover Art: permission denied");
    const baseActor=getBaseActor(actor);
    super({...options,id:`token-hover-art-gallery-${baseActor.id}`});
    this._actor=baseActor;
    this._scrollTop=0;
  }
  get document(){return this._actor;}
  get form(){return this.element?.querySelector(".tha-gallery")??null;}
  get isEditable(){return canManageGallery(this.document);}
  _canRender(options){if(!this.isEditable)return false;return super._canRender(options);}
  _onClose(options){
    if(HoverArtGallery.#instances.get(this.document.id)===this)HoverArtGallery.#instances.delete(this.document.id);
    return super._onClose(options);
  }
  static refreshIfOpen(actor){
    const baseActor=getBaseActor(actor);
    const app=baseActor&&this.#instances.get(baseActor.id);
    if(!app?.rendered)return;
    app._scrollTop=app.element?.querySelector(".tha-gallery-scroll")?.scrollTop??app._scrollTop;
    void app.render({force:true}).catch(error=>console.error("token-hover-art | Gallery refresh failed",error));
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

    let app=this.#instances.get(baseActor.id);
    if(!app){
      app=new HoverArtGallery(baseActor);
      this.#instances.set(baseActor.id,app);
    }
    if(app.rendered)app.bringToFront();
    else void app.render({force:true}).then(()=>app.bringToFront()).catch(error=>{
      this.#instances.delete(baseActor.id);
      console.error("token-hover-art | Could not open native gallery",error);
      ui.notifications.error("Token Hover Art: could not open the gallery. Check the browser console.");
    });
    if ( canScanFolders() ) {
      rescanFolderSources(baseActor).catch(err => console.warn("token-hover-art | Folder rescan failed", err));
    }
    return app;
  }

  /** @override */
  get title() {
    return `${game.i18n.localize("TOKEN_HOVER_ART.Gallery.Title")}: ${this.document.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context=await super._prepareContext(options);
    const actor = this.document;
    const defaultArt = getDefaultArt(actor);
    const toImage = path => ({path, isVideo: isVideo(path), isDefault: path === defaultArt});
    const manual = getManualImages(actor);
    return {
      ...context,
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


  _onRender(context,options){
    super._onRender(context,options);
    const form=this.form;
    if(!form)return;
    form.addEventListener("submit",event=>event.preventDefault());
    const scroll=form.querySelector(".tha-gallery-scroll");
    if(scroll){
      scroll.scrollTop=this._scrollTop;
      scroll.addEventListener("scroll",()=>{this._scrollTop=scroll.scrollTop;},{passive:true});
    }
    if(!this.isEditable)return;
    form.querySelector('input[name="defaultSecret"]')?.addEventListener("change",event=>{
      void this.#runAction(event,()=>setDefaultSecret(this.document,event.currentTarget.checked));
    });
    form.querySelectorAll("input.tha-folder-filter").forEach(input=>{
      input.addEventListener("change",event=>void this.#runAction(event,()=>this.#onChangeFolderFilter(event)));
      input.addEventListener("keydown",event=>this.#onEnter(event,()=>event.currentTarget.blur()));
    });
    form.querySelector('input[name="path"]')?.addEventListener("keydown",event=>this.#onEnter(event,this.#addImageFromField));
    for(const name of ["folderPath","folderFilter"]){
      form.querySelector(`input[name="${name}"]`)?.addEventListener("keydown",event=>this.#onEnter(event,this.#addFolderFromFields));
    }
    for(const name of ["path","folderPath"]){
      form.querySelector(`input[name="${name}"]`)?.addEventListener("input",()=>this.#updateAddButtons());
    }
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
    if (!this.form) return;
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
  async #onAction(button) {
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
    return picker.render({force:true});
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
    return picker.render({force:true});
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
