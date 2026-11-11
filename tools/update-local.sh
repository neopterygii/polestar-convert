#!/usr/bin/env bash
# Builds the converter's site (compiler and game data) for the newest Polestar release, on
# this machine, so `polestar-convert --path <WoW> --site <out>` converts for it without the
# published page. Run it again after a Polestar release; nothing is fetched twice.
#
#   tools/update-local.sh --polestar <clone> --out <site dir> [--tag vX.Y.Z] [--remote <name>]
#                         [--questie <AddOns or QuestieDB folder>] [--patched <checkout>]
#
# --polestar  a git clone of Polestar (a remote of it is fetched for tags; default: the one
#             whose URL names fitzforge/polestar, else origin). Its data/sources is the
#             source cache, shared with the checkout this makes beside it (<clone>-<tag>).
# --questie   QuestieDB's place, when the source cache has none (data/sources/addons).
# --patched   a checkout of Polestar's compiler with changes Polestar does not have yet: it is
#             rebased onto the tag and the converter's compiler is built from it
#             (wasm/.cargo/config.toml, not committed).
# Needs: git, cargo with the wasm32-unknown-unknown target, wasm-bindgen (mise, or on PATH),
# node 24.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
clone="" out="" tag="" remote="" questie="" patched=""
while [ $# -gt 0 ]; do
	case "$1" in
		--polestar) clone="$2" ;; --out) out="$2" ;; --tag) tag="$2" ;; --remote) remote="$2" ;;
		--questie) questie="$2" ;; --patched) patched="$2" ;;
		*) echo "unknown option $1" >&2; exit 2 ;;
	esac
	shift 2
done
[ -n "$clone" ] && [ -n "$out" ] || { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
clone="$(cd "$clone" && pwd)"
say() { printf '\n== %s\n' "$*"; }

if [ -z "$remote" ]; then
	remote="$(git -C "$clone" remote -v | awk '/fitzforge\/polestar/ { print $1; exit }')"
	remote="${remote:-origin}"
fi
say "Polestar's tags from $remote"
# The newest release tag that remote has: a clone may hold other remotes' tags (a fork's own).
[ -n "$tag" ] || tag="$(git -C "$clone" ls-remote --tags --refs "$remote" 'v[0-9]*' | sed 's#.*refs/tags/##' | sort -V | tail -n 1)"
[ -n "$tag" ] || { echo "$remote has no release tag" >&2; exit 1; }
git -C "$clone" fetch -q "$remote" "refs/tags/$tag:refs/tags/$tag"
sha="$(git -C "$clone" rev-parse "$tag^{commit}")"
checkout="$clone-$tag"
echo "$tag ($sha) -> $checkout"

if [ ! -d "$checkout" ]; then git -C "$clone" worktree add -q --detach "$checkout" "$sha"; fi
[ "$(git -C "$checkout" rev-parse HEAD)" = "$sha" ] || git -C "$checkout" checkout -q --detach "$sha"
# The source cache: the clone's own, shared (a cached file is never fetched again).
main="$(git -C "$clone" worktree list --porcelain | awk '/^worktree / { print $2; exit }')"
cache="$clone/data/sources"; [ -d "$cache" ] || cache="$main/data/sources"
if [ ! -e "$checkout/data/sources" ]; then mkdir -p "$cache"; ln -s "$cache" "$checkout/data/sources"; fi

say "forge $tag"
(cd "$checkout/rust" && cargo build --release -p forge 2>&1 | tail -n 1)
forge="$checkout/rust/target/release/forge"

say "game data"
"$forge" data sources --root "$checkout" --only wago,builders,pfquest --forever-tables wago | tail -n 1
q="${questie:-$checkout/data/sources/addons}"
[ -d "$q" ] || { echo "no QuestieDB at $q: pass --questie <AddOns folder> (without it Forever's own quests are missing)" >&2; exit 1; }
"$forge" data build --root "$checkout" --offline --no-web-xp --no-web-zones --questie "$q" --forever-tables wago --accept | tail -n 1
"$forge" data travel --root "$checkout" | tail -n 1
if ! "$forge" data professions --root "$checkout" >"$checkout/data/professions.log" 2>&1; then
	# Since 0.3.7 the profession data needs the Forever TrinityCore database's extract
	# (data/sources/forever-tdb/extract.json). Without it: the last profession data we built.
	last="$(ls -d "$clone"-v*/data/forever/professions.json 2>/dev/null | grep -v "^$checkout/" | sort -V | tail -n 1 || true)"
	if [ -n "$last" ]; then
		cp "$last" "$checkout/data/forever/professions.json"
		echo "WARNING: profession data not built ($(head -c 160 "$checkout/data/professions.log")…); kept $last"
	elif [ ! -f "$checkout/data/forever/professions.json" ]; then
		cat "$checkout/data/professions.log" >&2; exit 1
	fi
fi
"$forge" data codex --root "$checkout" | tail -n 1
# Journey's building names: one Classic Era table the builders do not fetch.
era="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).build)' "$checkout/data/forever/travel.json")"
wmo="$checkout/data/sources/wago/$era/WMOAreaTable.csv"
[ -f "$wmo" ] || curl -sfL "https://wago.tools/db2/WMOAreaTable/csv?build=$era" -o "$wmo"

say "the converter's compiler, pinned to $tag"
sed -i -E "s#(forge-guide = \{ git = \"https://github.com/fitzforge/polestar\", rev = \")[0-9a-f]+#\1$sha#" "$repo/wasm/Cargo.toml"
if [ -n "$patched" ]; then
	patched="$(cd "$patched" && pwd)"
	git -C "$patched" rebase -q "$sha" || { echo "$patched does not rebase onto $tag: resolve it there, then run again" >&2; exit 1; }
	mkdir -p "$repo/wasm/.cargo"
	printf '# Written by tools/update-local.sh: the compiler from a local checkout.\n[patch."https://github.com/fitzforge/polestar"]\nforge-guide = { path = "%s/rust/crates/forge-guide" }\n' "$patched" >"$repo/wasm/.cargo/config.toml"
fi
node "$repo/tools/pages.mjs" --polestar "$checkout" --out "$out" | tail -n 1

say "done"
echo "convert with: node $repo/bin/polestar-convert.mjs --path <WoW or AddOns> --site $out"
