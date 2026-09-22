import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const game = fs.readFileSync("content/index.html", "utf8");
const editor = fs.readFileSync("content/sprite-workshop.html", "utf8");
const currentRoute = fs.readFileSync("app/api/sprites/current/route.ts", "utf8");
const workshopRoute = fs.readFileSync("app/sprite-workshop.html/route.ts", "utf8");

test("publish survives sign-in and reports only a server revision as live", () => {
  assert.match(editor, /PENDING_KEY/);
  assert.match(editor, /resume-publish/);
  assert.match(editor, /PUBLISHED REVISION.*LIVE FOR ALL DEVICES/);
  assert.doesNotMatch(editor, /if\(!useInGame\(\)\)return;\$\('publish'\)/);
});

test("normal play prefers published sprites and local preview is explicit", () => {
  assert.match(game, /previewChecksum/);
  assert.match(game, /fetch\('\/api\/sprites\/current',\{cache:'no-store'\}\)/);
  assert.match(editor, /\.\/\?preview=/);
  assert.match(currentRoute, /"cache-control": "no-store"/);
});

test("sprite-table edits undo atomically and damaged name tables self-repair", () => {
  assert.match(editor, /history\.push\(\{frames:frames\.map\(f=>Array\.from\(f\)\),order:\[\.\.\.spriteOrder\],frame\}\)/);
  assert.match(editor, /spriteOrder=normaliseOrder\(saved\.order,frames\.length\)/);
  assert.match(editor, /function repairSpriteTable\(\)/);
  assert.match(editor, /let repaired=repairSpriteTable\(\),record=activeRecord\(\)/);
  assert.doesNotMatch(editor, /FIX SPRITE TABLE BEFORE PUBLISHING/);
});

test("legacy Chair slots migrate when drafts and published art are loaded", () => {
  assert.match(editor, /\['chair'\+'_seven'\]:'juniper'/);
  assert.match(editor, /\['numbered'\+'_chair'\]:'juniper_bow'/);
  assert.match(editor, /spriteOrder=normaliseOrder\(record\.order,frames\.length\)/);
});

test("the game stays public while the workshop requires publisher access", () => {
  assert.match(workshopRoute, /oai-authenticated-user-email/);
  assert.match(workshopRoute, /hasPublisherAccess/);
  assert.match(workshopRoute, /signin-with-chatgpt/);
  assert.match(workshopRoute, /status: 403/);
  assert.doesNotMatch(game, /Publisher access required/);
});

test("game exposes pause and the real-month replay calendar", () => {
  assert.match(game, /id="pause"/);
  assert.match(game, /if\(runOver\|\|paused\)return/);
  assert.match(game, /id="calendarGrid"/);
  assert.match(game, /locked=date>REAL_TODAY/);
  assert.match(game, /if\(!locked\)b\.onclick/);
  assert.match(game, /previewChecksum\?'&preview='/);
});

test("long dialogs remain usable inside a phone-height game shell", () => {
  assert.match(game, /\.modal \.card\{max-height:100%;overflow-y:auto/);
  assert.match(game, /\.card>\.choices:last-child\{position:sticky;bottom:0/);
  assert.match(game, /-webkit-overflow-scrolling:touch/);
});
