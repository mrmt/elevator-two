#!/bin/bash
# 背景動画の検索を、アプリと同じ条件で試す。
#   ./yt-probe.sh <APIキー>            全シーンの件数を出す
#   ./yt-probe.sh <APIキー> submerge   1シーンだけ、題名も出す
#   ./yt-probe.sh --dry-run            叩かずにURLだけ出す
set -u
KEY="${1:-}"
ONLY="${2:-}"
HTML="$(cd "$(dirname "$0")/.." && pwd)/index.html"

# 検索語は index.html の SCENE_QUERY から取る。二重管理にしない
QUERIES=$(python3 - "$HTML" <<'PY'
import re,sys
s=open(sys.argv[1],encoding='utf-8').read()
body=re.search(r'const SCENE_QUERY=\{(.*?)\};', s, re.S).group(1)
en=s.split("en:{")[1]
names=dict(re.findall(r"'scene\.(\w+)\.name':'([a-z ]+)'", en))
common=re.search(r"const YT_COMMON='([^']*)'", s).group(1)
for k,v in re.findall(r"(\w+):\s*'([^']*)'", body):
    print(f"{k}\t{names.get(k,k)} {v} {common}")
PY
)

url() {
  printf 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&safeSearch=moderate&videoEmbeddable=true&videoLicense=creativeCommon&order=viewCount%s&q=%s&key=%s' \
    "${2:-&videoDuration=long}" "$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$1")" "$KEY"
}

while IFS=$'\t' read -r id q; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$id" ] && continue
  if [ "$KEY" = "--dry-run" ]; then
    printf '%-10s %s\n' "$id" "$(url "$q" | sed 's/&key=.*//')"
    continue
  fi
  long=$(curl -s "$(url "$q")")
  n=$(printf '%s' "$long" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d.get("items",[])) if "error" not in d else "ERR:"+d["error"]["errors"][0]["reason"])')
  # 0件なら、アプリと同じく長さの条件を外して引き直す
  extra=""
  if [ "$n" = "0" ]; then
    m=$(curl -s "$(url "$q" "")" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d.get("items",[])))')
    extra="  (長さ条件なしなら $m 件)"
  fi
  printf '%-10s %-2s件  %s%s\n' "$id" "$n" "$q" "$extra"
  if [ -n "$ONLY" ] && [ "$n" != "0" ]; then
    printf '%s' "$long" | python3 -c '
import json,sys
for it in json.load(sys.stdin).get("items",[]):
    s=it["snippet"]
    print(f"   {it[\"id\"][\"videoId\"]}  {s[\"channelTitle\"][:22]:22}  {s[\"title\"][:60]}")'
  fi
  sleep 0.2
done <<< "$QUERIES"
