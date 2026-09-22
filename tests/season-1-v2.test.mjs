import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const season = JSON.parse(fs.readFileSync("public/season-1-v2.json", "utf8"));
const game = fs.readFileSync("content/index.html", "utf8");

test("Season 1 follows a replayable real-world month", () => {
  assert.equal(season.lengthDays, 31);
  assert.equal(season.days.length, 31);
  assert.equal(season.calendar.length, 31);
  assert.equal(season.weeks.length, 5);
  assert.equal(season.fantasyMonths.length, 12);
  assert.equal(season.sundayClimaxes.length, 5);
  assert.equal(season.calendarRules.weeklyClimax, "Sunday");
  assert.match(season.missedDayRule, /never expire/i);
  assert.match(season.missedDayRule, /replay/i);
});

test("all 25 named characters participate across the calendar", () => {
  assert.equal(season.assets.npcs.length, 25);
  const used = new Set(season.days.flatMap((day) => day.cast));
  for (const npc of season.assets.npcs) assert.ok(used.has(npc.id), npc.id);
});

test("every day is a coherent authored seed for five independent quests", () => {
  const types = new Set(season.questTypes.map((type) => type.id));
  for (const [index, day] of season.days.entries()) {
    assert.equal(day.day, index + 1);
    assert.equal(day.cast.length, 5);
    assert.ok(types.has(day.questType));
    for (const key of ["title", "biome", "item", "enemy", "plot", "hint", "precursor", "consequence"])
      assert.ok(day[key], `day ${day.day} ${key}`);
  }
  assert.equal(season.production.questStages, 155);
});

test("quest foundations exclude passive escorts and player administration", () => {
  assert.ok(!season.questTypes.some((type) => type.id === "escort"));
  assert.ok(!season.days.some((day) => day.questType === "escort"));
  assert.ok(!season.assets.npcs.some((npc) => npc.id === "chair_seven"));
  assert.ok(season.assets.npcs.some((npc) => npc.id === "juniper"));
  assert.ok(!season.assets.props.some((prop) => /chair/i.test(prop.id + prop.name)));
  assert.ok(season.assets.props.some((prop) => prop.id === "juniper_bow"));
  assert.doesNotMatch(game, /ADMINISTRATION|p\.admin|chair_seven/i);
});

test("quest generation uses validated graphs, NPC motives, flags, clues, sites and canonical history", () => {
  for (const term of ["graphNode", "validateQuestSet", "NPC_RULES", "worldFlags", "resolveWorldInteraction", "canonicalFlagsForDay"])
    assert.match(game, new RegExp(term));
  assert.match(game, /new Set\(signatures\)\.size!==5/);
  assert.match(game, /q\.sets\.forEach/);
});

test("the Ogre invasion is clearly foreshadowed before Day 21", () => {
  const omens = season.days.slice(14, 20).map((day) => `${day.plot} ${day.precursor}`).join(" ");
  assert.match(omens, /ogre/i);
  assert.match(season.days[20].title, /OGRE INVASION/);
  assert.equal(season.days[20].questType, "defence");
});

test("September 2026 maps the 19th to Day 19 and climaxes on Sundays", () => {
  assert.match(game, /dayNumber=1;dayNumber<=lastDay/);
  assert.match(game, /isSundayClimax/);
  assert.match(game, /isGreatEvent/);
  assert.match(game, /GREAT EVENT/);
});

test("the interface presents five independent quests and useful NPC rumours", () => {
  assert.match(game, /Accept quest.*\/5/);
  assert.match(game, /RUMOUR:/);
  assert.doesNotMatch(game, /NO QUEST HERE/);
  assert.match(game, /GATE OPEN/);
  assert.match(game, /opensGate/);
});

test("world plan includes central village gated biomes and environment sprites", () => {
  assert.match(game, /Central village/);
  assert.match(game, /const GATES=/);
  assert.match(game, /GATE LOCKED/);
  const ids = new Set(season.assets.environment.map((asset) => asset.id));
  for (const id of ["water_river", "water_lake", "bridge_wood", "gate_north", "barrow", "well"])
    assert.ok(ids.has(id), id);
});

test("interface language uses BAG and QUEST consistently", () => {
  assert.doesNotMatch(game, /SACK|ERRAND/);
  assert.match(game, /BAG & QUEST LEDGER/);
  assert.match(game, /ACCEPTED:/);
});

test("PixEd exposes all named Season 1 assets without replacing existing slots", () => {
  const html = fs.readFileSync("content/sprite-workshop.html", "utf8");
  assert.match(html, /ADD MISSING SLOTS/);
  assert.match(html, /function assetHasContent\(id\)/);
  assert.match(html, /frames\[i\]\?\.some\(Boolean\)/);
  assert.match(html, /assets\.filter\(a=>assetHasContent\(a\.id\)\)/);
  assert.match(html, /!spriteOrder\.includes\(a\.id\)/);
  assert.match(html, /fetch\('\/season-1-v2\.json'/);
  assert.match(html, /Object\.entries\(seasonManifest\.assets\)/);
  assert.doesNotMatch(html, /assets\.filter\(a=>!a\.existing\)/);
  for (const asset of season.assets.environment) assert.ok(asset.id, asset.name);
});

test("published environment sprites override procedural tiles with blank-safe fallback", () => {
  assert.match(game, /function environmentSpriteId/);
  assert.match(game, /function drawEnvironmentSprite/);
  assert.match(game, /frame\?\.some\(Boolean\)/);
  for (const id of season.assets.environment.map((asset) => asset.id))
    assert.ok(game.includes(`'${id}'`), `missing tile mapping for ${id}`);
});
