import assert from "node:assert/strict";
import test from "node:test";
import {applyDisplayLayout, getCharacterKey} from "../scripts/display-layout.mjs";

const characters = {actor:{type:"character",uuid:"Actor.rashira",isToken:false}};
const pc1 = {actor:characters.actor,document:{uuid:"Scene.first.Token.pc",id:"pc"}};
const pc2 = {actor:characters.actor,document:{uuid:"Scene.second.Token.pc",id:"pc"}};
const sharedNpcActor = {type:"npc",uuid:"Actor.goblin",isToken:false};
const goblin1 = {actor:sharedNpcActor,document:{uuid:"Scene.first.Token.g1",id:"g1"}};
const goblin2 = {actor:sharedNpcActor,document:{uuid:"Scene.first.Token.g2",id:"g2"}};
const goblin3 = {actor:sharedNpcActor,document:{uuid:"Scene.second.Token.g3",id:"g3"}};
const linkedNpc = {actor:{...sharedNpcActor},document:{uuid:"Scene.third.Token.g4",id:"g4",actorLink:true}};

function display() {
  const vars = new Map();
  const style = {
    setProperty(key, value) { vars.set(key,value); },
    removeProperty(key) { vars.delete(key); }
  };
  return {style, vars};
}
const settings = {
  position: "top-right",
  maxHeight: 40,
  useCustomPosition: true,
  customPosition: null,
  characterSizes: {
    "Actor.rashira": {height:0.35},
    "Scene.first.Token.g1": {height:0.6},
    "Scene.first.Token.g2": {height:0.2}
  }
};
globalThis.game = {settings:{get(_mod,key){return settings[key];}}};

test("existing PC character sizes stay shared for two tokens of the same PC", () => {
  assert.equal(getCharacterKey(pc1),"Actor.rashira");
  assert.equal(getCharacterKey(pc2),"Actor.rashira");
  for (const token of [pc1,pc2]) {
    const el=display();
    applyDisplayLayout(el,token);
    assert.equal(el.vars.get("--tha-image-height"),"35vh");
  }
});

test("each NPC token gets a unique key, even when based on the same NPC actor", () => {
  assert.equal(getCharacterKey(goblin1),"Scene.first.Token.g1");
  assert.equal(getCharacterKey(goblin2),"Scene.first.Token.g2");
  assert.equal(getCharacterKey(goblin3),"Scene.second.Token.g3");
  assert.equal(getCharacterKey(linkedNpc),"Scene.third.Token.g4");
  assert.notEqual(getCharacterKey(goblin1),getCharacterKey(goblin2));
});

test("different NPC sizes never leak into another NPC or PC", () => {
  for (const [token, expected] of [
    [goblin1,"60vh"],[goblin2,"20vh"],[goblin3,"auto"],
    [linkedNpc,"auto"],[pc1,"35vh"]
  ]) {
    const el=display();
    applyDisplayLayout(el,token);
    assert.equal(el.vars.get("--tha-image-height"),expected);
    if (expected === "auto") assert.equal(el.vars.get("--tha-max-height"),"40vh");
  }
});

test("NPC UUID fallback is scene-scoped, not actor-scoped", () => {
  const fallback={actor:sharedNpcActor,document:{id:"ogre",parent:{id:"market"}}};
  assert.equal(getCharacterKey(fallback),"Scene.market.Token.ogre");
});

test("null and unplaced tokens do not share accidental actor-wide keys", () => {
  assert.equal(getCharacterKey(null),null);
  assert.equal(getCharacterKey({actor:sharedNpcActor,document:{}}),null);
});
