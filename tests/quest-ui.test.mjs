import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

async function bootGame() {
  const html = fs.readFileSync("content/index.html", "utf8");
  const season = fs.readFileSync("public/season-1-v2.json", "utf8");
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const fills = [];
  const context2d = {
    fillRect(...args) { fills.push(args); }, strokeRect() {}, drawImage() {}, clearRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  class Element {
    constructor(id = "") {
      this.id = id;
      this.textContent = "";
      this.html = "";
      this.children = [];
      this.dataset = {};
      this.style = {};
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    set innerHTML(value) { this.html = value; this.children = []; }
    get innerHTML() { return this.html; }
    appendChild(child) { this.children.push(child); }
    setAttribute() {}
    getContext() { return context2d; }
  }
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const storage = new Map();
  class Image {
    set src(value) { this.value = value; }
    get complete() { return false; }
    get naturalWidth() { return 0; }
  }
  const sandbox = {
    document: {
      getElementById: get,
      createElement: () => new Element(),
      querySelectorAll: () => [],
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    Image, console, Date, Math, Set, Array, Object, JSON, Uint8Array, Response,
    URLSearchParams,
    fetch: async (url) => String(url).includes("season-1-v2.json")
      ? new Response(season, { status: 200, headers: { "content-type": "application/json" } })
      : new Response("", { status: 404 }),
    navigator: {},
    location: { search: "", pathname: "/", reload() {}, replace() {} },
    addEventListener() {},
    setInterval() {},
    setTimeout() {},
    clearTimeout() {},
    window: { AudioContext: class {}, webkitAudioContext: class {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  await vm.runInContext("loadCalendar()", sandbox);
  return { sandbox, get, fills };
}

test("opening lead names the authored quest giver", async () => {
  const { sandbox, get } = await bootGame();
  assert.equal(get("check").textContent, "1/5");
  const giver = vm.runInContext("npcName(dailyChain.stages[0].giver)", sandbox);
  assert.match(get("quest").textContent, new RegExp(`^FIND ${giver}`));
});

test("the village only shows today's five-person cast", async () => {
  const { sandbox } = await bootGame();
  const result = vm.runInContext(`({
    castSize: currentDay.cast.length,
    visible: npcs.filter(n => npcAt(n.x, n.y)).map(n => n.id),
    outsiders: npcs.filter(n => !currentDay.cast.includes(n.id) && npcAt(n.x, n.y)).map(n => n.id)
  })`, sandbox);
  assert.equal(result.castSize, 5);
  assert.deepEqual([...result.visible].sort(), [...vm.runInContext("currentDay.cast", sandbox)].sort());
  assert.deepEqual([...result.outsiders], []);
});

test("a named environment frame replaces its procedural tile", async () => {
  const { sandbox, fills } = await bootGame();
  fills.length = 0;
  vm.runInContext(`{
    const environmentFrame = Array(256).fill(0);
    environmentFrame[17] = 1;
    spriteRecord = {
      order: [...RESERVED_ORDER, 'grass'],
      frames: [...RESERVED_ORDER.map(() => Array(256).fill(0)), environmentFrame]
    };
    tile('.', 0, 0, 10, 10);
  }`, sandbox);
  assert.deepEqual(fills.at(-1), [1, 1, 1, 1]);
});

test("bumping the named giver offers and accepts the opening quest", async () => {
  const { sandbox, get } = await bootGame();
  vm.runInContext("bumpNPC(npcs.find(n => n.id === dailyChain.stages[0].giver))", sandbox);
  assert.equal(get("choices").children[0].textContent, "Follow lead 1/5");
  get("choices").children[0].onclick();
  assert.equal(get("check").textContent, "1/5");
  const title = vm.runInContext("dailyChain.stages[0].title", sandbox);
  assert.equal(get("quest").textContent, title);
  get("bag").onclick();
  assert.match(get("dtext").innerHTML, new RegExp(title));
  assert.doesNotMatch(get("dtext").innerHTML, /No leads followed/);
});

test("the biome gate is opened by one independent NPC quest", async () => {
  const { sandbox, get } = await bootGame();
  vm.runInContext("activateQuest(dailyChain.stages[1])", sandbox);
  assert.equal(vm.runInContext("p.gates.has(currentDay.biome)", sandbox), false);
  vm.runInContext("bumpNPC(npcs.find(n => n.id === dailyChain.stages[1].graph[0].key))", sandbox);
  if (get("choices").children[0]?.textContent?.startsWith("Follow lead")) get("choices").children[0].onclick();
  vm.runInContext("bumpNPC(npcs.find(n => n.id === dailyChain.stages[1].graph[0].key))", sandbox);
  assert.equal(vm.runInContext("dailyChain.stages[1].graph[0].done", sandbox), true);
  vm.runInContext("bumpNPC(npcs.find(n => n.id === dailyChain.stages[1].giver))", sandbox);
  const result = vm.runInContext("({ status: dailyChain.stages[1].status, open: p.gates.has(currentDay.biome), other: dailyChain.stages[2].status })", sandbox);
  assert.equal(result.status, "done");
  assert.equal(result.open, vm.runInContext("currentDay.biome !== 'village'", sandbox));
  assert.equal(result.other, "new");
});

test("all 31 authored days compile to five distinct supported quest graphs", async () => {
  const { sandbox } = await bootGame();
  const result = vm.runInContext(`seasonData.days.map(day => {
    const chain = buildSeasonChain({ ...day, fantasyMonth: 'TEST MONTH' });
    return {
      count: chain.stages.length,
      unique: new Set(chain.stages.map(q => q.signature)).size,
      valid: chain.stages.every(q => q.graph.length && q.graph.every(n => ['npc','clue','item','enemy','site'].includes(n.type)))
    };
  })`, sandbox);
  assert.equal(result.length, 31);
  assert.deepEqual(result.map((day, index) => ({ day: index + 1, ...day })).filter(day => day.count !== 5 || day.unique !== 5 || !day.valid), []);
});

test("clues and world sites advance graph nodes through movement", async () => {
  const { sandbox } = await bootGame();
  const result = vm.runInContext(`{
    const clueQuest = dailyChain.stages[0]; activateQuest(clueQuest);
    const clue = clues[0]; p.x = clue.x; p.y = clue.y; resolveWorldInteraction();
    const siteQuest = dailyChain.stages[4]; activateQuest(siteQuest);
    const site = questSites[0]; p.x = site.x; p.y = site.y; resolveWorldInteraction();
    ({ clueFound: clue.found, clueNode: clueQuest.graph[0].done, siteActive: site.active, siteFlag: worldFlags.has(site.id + '_secured') });
  }`, sandbox);
  assert.deepEqual({ ...result }, { clueFound: true, clueNode: true, siteActive: true, siteFlag: true });
});

test("killing a quest foe clearly directs the player back to the giver", async () => {
  const { sandbox, get } = await bootGame();
  vm.runInContext(`{
    const q = dailyChain.stages[3];
    activateQuest(q);
    const foe = enemies.find(e => e.key === q.graph.find(n => n.type === 'enemy').key);
    mode = 'dungeon'; p.x = 2; p.y = 3; foe.x = 3; foe.y = 3; foe.hp = 1; foe.alive = true;
    d20 = () => 20;
    bonk();
  }`, sandbox);
  const giver = vm.runInContext("npcName(dailyChain.stages[3].giver)", sandbox);
  assert.equal(get("quest").textContent, `RETURN TO ${giver}`);
  assert.match(get("toast").innerHTML, new RegExp(`OBJECTIVE COMPLETE:</b> Return to ${giver}`));
  vm.runInContext("paused=false; document.getElementById('bag').onclick()", sandbox);
  assert.match(get("dtext").innerHTML, new RegExp(`OBJECTIVE COMPLETE — RETURN TO ${giver}`));
  vm.runInContext("bumpNPC(npcs.find(n => n.id === dailyChain.stages[3].giver))", sandbox);
  assert.equal(vm.runInContext("dailyChain.stages[3].status", sandbox), "done");
});

test("dungeon food waits for an injury, then restores two hearts", async () => {
  const { sandbox, get } = await bootGame();
  let result = vm.runInContext(`{
    activateQuest(dailyChain.stages[3]); mode = 'dungeon';
    const ration = foods.find(f => f.realm === 'dungeon');
    p.x = ration.x; p.y = ration.y; p.hp = p.maxHp; takeTurn();
    ({ taken: ration.taken, hp: p.hp, count: foods.filter(f => f.realm === 'dungeon').length });
  }`, sandbox);
  assert.deepEqual({ ...result }, { taken: false, hp: 6, count: 2 });
  result = vm.runInContext(`{
    const ration = foods.find(f => f.realm === 'dungeon');
    p.hp = 3; takeTurn(); ({ taken: ration.taken, hp: p.hp });
  }`, sandbox);
  assert.deepEqual({ ...result }, { taken: true, hp: 5 });
  assert.match(get("toast").innerHTML, /\+2 ♥/);
});

test("retreat preserves boss damage and the recovered relic grants bonus damage", async () => {
  const { sandbox } = await bootGame();
  const result = vm.runInContext(`{
    const foe = enemies.find(e => e.key === 'season_enemy');
    mode = 'dungeon'; p.x = 2; p.y = 3; foe.x = 3; foe.y = 3; foe.hp = 4; foe.alive = true;
    inventory.add(currentDay.item.toLowerCase()); d20 = () => 10; bonk();
    const afterHit = foe.hp; leaveDungeon(); enterDungeon();
    ({ afterHit, afterReturn: foe.hp, mode, alive: foe.alive });
  }`, sandbox);
  assert.deepEqual({ ...result }, { afterHit: 2, afterReturn: 2, mode: "dungeon", alive: true });
});

test("the daily nemesis is available before any preparation is accepted", async () => {
  const { sandbox } = await bootGame();
  const result = vm.runInContext(`({
    dungeonActive,
    bossAlive: enemies.find(e => e.key === 'season_enemy').alive,
    omenDoor: map[13][18],
    questStates: dailyChain.stages.map(q => q.status)
  })`, sandbox);
  assert.equal(result.dungeonActive, "season_enemy");
  assert.equal(result.bossAlive, true);
  assert.equal(result.omenDoor, "O");
  assert.deepEqual([...result.questStates], ["new", "new", "new", "new", "new"]);
});

test("defeating the nemesis ends the day without completing all preparations", async () => {
  const { sandbox, get } = await bootGame();
  vm.runInContext(`{
    const foe = enemies.find(e => e.key === 'season_enemy');
    mode = 'dungeon'; p.x = 2; p.y = 3; foe.x = 3; foe.y = 3; foe.hp = 1; foe.alive = true;
    d20 = () => 20; bonk();
  }`, sandbox);
  assert.equal(vm.runInContext("runOver", sandbox), true);
  assert.equal(vm.runInContext("dailyChain.stages.every(q => q.status === 'new')", sandbox), true);
  assert.equal(get("dtitle").textContent, "LUNCHTIME LEGEND");
  assert.match(get("dtext").innerHTML, /NEMESIS DEFEATED/);
});


test("WOE BETIDE framing makes leads optional preparation for today's woe", async () => {
  const html = fs.readFileSync("content/index.html", "utf8");
  assert.match(html, /<title>Woe Betide<\/title>/);
  assert.match(html, /WOE BETIDE/);
  assert.match(html, /TODAY&#39;S WOE/);
  assert.match(html, /LEAD <span id="check">0<\/span>/);
  assert.doesNotMatch(html, /DAILY BULLSHIT/);
});
