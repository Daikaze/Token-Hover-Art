import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

globalThis.CONST = {
  IMAGE_FILE_EXTENSIONS: {png: true, webp: true},
  VIDEO_FILE_EXTENSIONS: {webm: true}
};
class FakeApplicationV2 {
  constructor(options) { this.options=options; this.rendered=false; this.renderCount=0; }
  async _prepareContext() { return {core: true}; }
  _canRender() {}
  _onRender() {}
  _onClose() { this.rendered=false; }
  async render() { this.rendered=true; this.renderCount++; return this; }
  bringToFront() { this.broughtForward=true; }
}
globalThis.foundry = {
  applications: {api: {
    ApplicationV2: FakeApplicationV2,
    HandlebarsApplicationMixin: Base => Base
  }},
  helpers: {media: {VideoHelper: {hasVideoExtension: path => /[.]webm$/i.test(path)}}},
  utils: {getProperty: (obj,path) => path.split(".").reduce((v,key)=>v?.[key],obj)}
};
globalThis.game = {
  user: {isGM:true,can:()=>false},
  i18n: {localize: value=>value},
  settings: {get:(_namespace,key)=>key==="defaultFilter"?"*.png":false}
};
const {HoverArtGallery} = await import("../scripts/native-gallery.mjs");
const actor = {
  id:"npc1",name:"Goblin",isToken:false,isOwner:true,pack:null,
  prototypeToken:{flags:{}},
  getFlag(_mod,key) {
    if (key==="images") return ["art/goblin.png","art/goblin-alt.webp"];
    if (key==="folders") return [];
    return null;
  }
};

test("native V14 editor uses core frame, resizing and minimization", ()=>{
  const o=HoverArtGallery.DEFAULT_OPTIONS;
  assert.equal(o.window.frame,true);
  assert.equal(o.window.resizable,true);
  assert.equal(o.window.minimizable,true);
  assert.ok(o.position.height>0 && o.position.width>0);
  assert.equal(o.classes[0],"token-hover-art");
  assert.equal(o.actions["browse"] instanceof Function,true);
  assert.equal(o.actions["remove-folder"] instanceof Function,true);
});
test("gallery opens once per Actor and returns the same native ApplicationV2 window", async()=>{
  const app=HoverArtGallery.open(actor);
  assert.ok(app instanceof HoverArtGallery);
  assert.equal(app.options.id,"token-hover-art-gallery-npc1");
  assert.equal(HoverArtGallery.open(actor),app);
  assert.equal(app.rendered,true);
  assert.equal(app.broughtForward,true);
  const data=await app._prepareContext({});
  assert.equal(data.core,true);
  assert.equal(data.editable,true);
  assert.equal(data.manualImages.length,2);
  assert.equal(data.manualImages[1].isLast,true);
  HoverArtGallery.refreshIfOpen(actor);
  assert.ok(app.renderCount>=2);
  app._onClose({});
  const reopened=HoverArtGallery.open(actor);
  assert.notEqual(reopened,app);
});
test("gallery rights block users without GM or gallery-owner access", ()=>{
  game.user.isGM=false;
  assert.equal(HoverArtGallery.open(actor),null);
  assert.throws(()=>new HoverArtGallery(actor),/permission denied/);
  game.user.isGM=true;
});
test("manifest + CSS isolate native application, preserving token HUD and individual size code", ()=>{
  const manifest=JSON.parse(readFileSync(new URL("../module.json",import.meta.url),"utf8"));
  assert.equal(manifest.version,"0.5.3");
  assert.equal(manifest.download,"https://github.com/Daikaze/Token-Hover-Art/releases/download/v0.5.3/module.zip");
  const main=readFileSync(new URL("../scripts/main.mjs",import.meta.url),"utf8");
  const hud=readFileSync(new URL("../scripts/token-hud.mjs",import.meta.url),"utf8");
  assert.ok(main.includes('from "./native-gallery.mjs"'));
  assert.ok(hud.includes('from "./native-gallery.mjs"'));
  assert.ok(main.includes('Hooks.on("updateActor"'));
  const css=readFileSync(new URL("../styles/token-hover-art.css",import.meta.url),"utf8");
  assert.ok(css.includes(".application.token-hover-art .window-content"));
  assert.ok(css.includes("@container tha-gallery-window"));
  const appV2=readFileSync(new URL("../scripts/native-gallery.mjs",import.meta.url),"utf8");
  assert.ok(!appV2.includes("getDocumentSheetClass()"));
  const display=readFileSync(new URL("../scripts/display-layout.mjs",import.meta.url),"utf8");
  assert.ok(display.includes("getCharacterKey(token)"));
});
