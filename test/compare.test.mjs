import { test } from "node:test";
import assert from "node:assert/strict";
import { routeOf, compareRoutes, compareText } from "../src/compare.mjs";

const quests = { 1: { title: "One", level: 5, xp: 100 }, 2: { title: "Two", level: 6, xp: 250 }, 3: { title: "Three", level: 7, xp: 400 } };
const mine = routeOf("guide mine/h-test\ntitle Test\nfaction Horde\nlevels 1-10\nfolder RXP Horde 1-10\n\nstep\n  accept 1\n  turnin 1\n  turnin 1\n  turnin 2 optional\n");
const theirs = routeOf("guide forever/horde/01-test\ntitle Test\nfaction Horde\nlevels 1-12\n\nstep Bob\n  turnin 1   -- Bob\n  turnin 3\n");

test("routeOf: the header and each quest once", () => {
	assert.deepEqual(mine, { accept: [1], turnin: [1, 2], id: "mine/h-test", title: "Test", faction: "Horde", levels: "1-10", folder: "RXP Horde 1-10" });
});

test("compareRoutes: what each side hands in alone, with XP", () => {
	const r = compareRoutes({ routes: { "RXP Horde": [mine] }, polestar: [theirs, { ...theirs, id: "forever/professions/x", category: "Professions" }], quests });
	const c = r["RXP Horde"].Horde;
	assert.equal(r["RXP Horde"].Alliance, undefined);
	assert.deepEqual([c.source.quests, c.source.xp, c.polestar.quests, c.polestar.xp, c.both], [2, 350, 2, 500, 1]);
	assert.deepEqual(c.onlySource, [{ id: 2, title: "Two", level: 6, xp: 250, guide: "mine/h-test" }]);
	assert.deepEqual(c.onlyPolestar.map((q) => q.id), [3]);
	assert.deepEqual(c.guides[0], { id: "mine/h-test", title: "Test", levels: "1-10", quests: 2, xp: 350, polestar: "forever/horde/01-test", shared: 1, notInPolestar: 1, notInPolestarXp: 250 });
	assert.match(compareText(r), /== RXP Horde, Horde\nRXP Horde: 2 quests, 350 XP in 1 guides\nPolestar: 2 quests, 500 XP in 1 guides\n/);
});
