# This fork

A fork of [aronjanosch/polestar-convert](https://github.com/aronjanosch/polestar-convert) for
our own use. It follows Polestar's releases itself instead of waiting for the published page,
and adds what a pack of whole guide addons needs. Converted guides and reports stay on the
machine that made them: nothing here ships guide content.

## What differs

| | Upstream | Here |
|---|---|---|
| Polestar version | the published page's pin | the newest release tag, built locally (`tools/update-local.sh`) |
| Loading | one addon, every guide in memory | `pack.json` `"load": "on-demand"`: a small core addon, each faction's guides in a part Polestar loads for that faction, a guide's steps read when it is opened |
| Guide menu | RestedXP under `RXP …`, Zygor by Zygor's subfolders | every guide under its source: `RXP …`, `Zygor Leveling`, `Zygor Dungeons`, `Zygor Professions · …` |
| Reports | per source, what was dropped or softened | also `compare.txt` and `compare.json`: each route beside Polestar's own leveling guides |
| `npm test` | `node --test test/` (fails on Node 24.22) | `node --test "test/*.test.mjs"` |

On-demand loading needs a compiler that knows `load`. Polestar's addon (0.3.7) already loads
faction parts and deferred steps for any pack; its compiler writes them only for Polestar's
own pack. Until Polestar takes the change, `tools/update-local.sh --patched <checkout>` builds
the converter's compiler from a checkout that has it. A compiler without it ignores the key,
and the pack is one addon as before.

## Updating to a Polestar release

```sh
tools/update-local.sh --polestar <Polestar clone> --out <site dir> [--patched <checkout>]
node bin/polestar-convert.mjs --path "<WoW>" --site <site dir> [--install]
```

The first command fetches Polestar's tags, checks the newest out beside the clone, builds
`forge`, the game data (offline from the clone's source cache, with QuestieDB) and the
converter's compiler pinned to that tag, and writes the site. The second converts with it.
Run both again after a Polestar release or a guide addon update.

Since Polestar 0.3.7 the profession data needs the Forever TrinityCore database's extract
(`data/sources/forever-tdb/extract.json`), which Polestar does not ship. Without it the
script keeps the profession data of the last build and says so.

## The comparison

`reports/compare.txt` sets each route (a source's menu folder without its level range: `RXP
Alliance`, `Zygor Leveling`) beside Polestar's leveling guides of the same faction: the
quests each hands in and their quest XP, the quests only one side hands in (most XP first,
with the guide that does), and per converted guide the Polestar guide sharing most quests.
`compare.json` has every row. A quest counts once per side, and class and race quests count
for everyone, so the totals are an upper bound for one character.
