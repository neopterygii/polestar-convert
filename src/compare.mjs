// The converted guides beside Polestar's own: which quests each route hands in, their
// quest XP, and what one has that the other lacks. Facts only (quest ids, levels, XP), read
// from the .guide texts; no file or process here.

const HEADERS = ["guide", "title", "faction", "race", "class", "levels", "category", "folder"];

// A .guide text -> { id, title, faction, race, class, levels, category, folder, accept: [ids],
// turnin: [ids] }: its header and the quests its steps take and hand in, each once, in order.
export function routeOf(text) {
	const r = { accept: [], turnin: [] };
	const seen = { accept: new Set(), turnin: new Set() };
	for (const raw of String(text).split("\n")) {
		const line = raw.trim();
		const h = /^([a-z]+)\s+(.*)$/.exec(line);
		if (!h) continue;
		if (HEADERS.includes(h[1]) && r[h[1] === "guide" ? "id" : h[1]] == null && !r.accept.length && !r.turnin.length) r[h[1] === "guide" ? "id" : h[1]] = h[2].replace(/\s+--\s.*$/, "").trim();
		const q = /^(accept|turnin)\s+(\d+)\b/.exec(line);
		if (q && !seen[q[1]].has(+q[2])) { seen[q[1]].add(+q[2]); r[q[1]].push(+q[2]); }
	}
	return r;
}

const isLeveling = (g) => !g.category || g.category === "Leveling";
const factionsOf = (g) => (/alliance/i.test(g.faction || "") ? ["Alliance"] : /horde/i.test(g.faction || "") ? ["Horde"] : ["Alliance", "Horde"]);
const xpOf = (quests, id) => Number(quests[id]?.xp) || 0;
const sum = (quests, ids) => ids.reduce((n, id) => n + xpOf(quests, id), 0);
const fact = (quests, id, guide) => ({ id, title: quests[id]?.title || null, level: quests[id]?.level ?? null, xp: xpOf(quests, id), guide });

// routes: { <source>: [routeOf of each converted guide to compare] }; polestar: [routeOf of each of
// Polestar's guides]; quests: Polestar's quests.json. -> per source and faction, over the
// leveling guides: the quests handed in and their XP on each side, the quests only one side
// hands in (most XP first, with the guide that does), and per converted guide the Polestar
// guide sharing most of its quests.
export function compareRoutes({ routes, polestar, quests }) {
	const out = {};
	const ours = polestar.filter(isLeveling);
	for (const [source, list] of Object.entries(routes)) {
		out[source] = {};
		for (const faction of ["Alliance", "Horde"]) {
			const mine = list.filter((g) => factionsOf(g).includes(faction) && g.turnin.length);
			const theirs = ours.filter((g) => factionsOf(g).includes(faction) && g.turnin.length);
			if (!mine.length || !theirs.length) continue;
			const where = (gs) => { const m = new Map(); for (const g of gs) for (const id of g.turnin) if (!m.has(id)) m.set(id, g.id); return m; };
			const a = where(mine), b = where(theirs);
			const onlySource = [...a.keys()].filter((id) => !b.has(id)).map((id) => fact(quests, id, a.get(id))).sort((x, y) => y.xp - x.xp || x.id - y.id);
			const onlyPolestar = [...b.keys()].filter((id) => !a.has(id)).map((id) => fact(quests, id, b.get(id))).sort((x, y) => y.xp - x.xp || x.id - y.id);
			const guides = mine.map((g) => {
				let best = null, shared = 0;
				for (const p of theirs) {
					const n = g.turnin.filter((id) => p.turnin.includes(id)).length;
					if (n > shared) { shared = n; best = p; }
				}
				const extra = g.turnin.filter((id) => !b.has(id));
				return { id: g.id, title: g.title, levels: g.levels || null, quests: g.turnin.length, xp: sum(quests, g.turnin), polestar: best && best.id, shared, notInPolestar: extra.length, notInPolestarXp: sum(quests, extra) };
			});
			out[source][faction] = {
				source: { guides: mine.length, quests: a.size, xp: sum(quests, [...a.keys()]) },
				polestar: { guides: theirs.length, quests: b.size, xp: sum(quests, [...b.keys()]) },
				both: [...a.keys()].filter((id) => b.has(id)).length,
				onlySource, onlyPolestar, guides,
			};
		}
	}
	return out;
}

const n = (x) => x.toLocaleString("en-US");

// The comparison as text: the totals, the `top` quests with most XP each side lacks, and a
// line per converted guide.
export function compareText(result, names = {}, top = 25) {
	const out = ["Converted leveling guides beside Polestar's own: quests handed in and their quest XP.", "A quest counts once per side, whichever guide hands it in; class and race quests are counted for everyone.", ""];
	for (const [source, factions] of Object.entries(result)) for (const [faction, r] of Object.entries(factions)) {
		out.push(`== ${names[source] || source}, ${faction}`);
		out.push(`${names[source] || source}: ${n(r.source.quests)} quests, ${n(r.source.xp)} XP in ${r.source.guides} guides`);
		out.push(`Polestar: ${n(r.polestar.quests)} quests, ${n(r.polestar.xp)} XP in ${r.polestar.guides} guides`);
		out.push(`in both: ${n(r.both)}; only ${names[source] || source}: ${n(r.onlySource.length)} (${n(r.onlySource.reduce((s, q) => s + q.xp, 0))} XP); only Polestar: ${n(r.onlyPolestar.length)} (${n(r.onlyPolestar.reduce((s, q) => s + q.xp, 0))} XP)`);
		for (const [label, list] of [[`Only ${names[source] || source}`, r.onlySource], ["Only Polestar", r.onlyPolestar]]) {
			out.push("", `${label}, most XP first${list.length > top ? ` (${top} of ${list.length}; all in compare.json)` : ""}:`);
			for (const q of list.slice(0, top)) out.push(`  ${String(q.xp).padStart(6)} XP  level ${String(q.level ?? "?").padStart(2)}  ${q.id} ${q.title || ""}  [${q.guide}]`);
		}
		out.push("", "Per guide: quests, XP, the Polestar guide sharing most quests (shared), quests Polestar hands in nowhere (XP):");
		for (const g of r.guides) out.push(`  ${g.id}: ${g.quests} quests, ${n(g.xp)} XP; ${g.polestar ? `${g.polestar} (${g.shared})` : "no Polestar guide shares a quest"}; ${g.notInPolestar} not in Polestar (${n(g.notInPolestarXp)} XP)`);
		out.push("");
	}
	return out.join("\n") + "\n";
}
