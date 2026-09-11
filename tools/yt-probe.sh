#!/bin/bash
# 背景動画の検索を、アプリと同じ段取り (D-45) で試す。
#   ./tools/yt-probe.sh <APIキー>             全シーンを、当たった段まで試す
#   ./tools/yt-probe.sh <APIキー> jubilee     1シーンだけ、各段の件数と題名を出す
#   ./tools/yt-probe.sh --dry-run [シーン]    叩かずに段取りだけ出す
set -u
KEY="${1:-}"
ONLY="${2:-}"
HTML="$(cd "$(dirname "$0")/.." && pwd)/index.html"

# 検索語は index.html の SCENE_QUERY と ytLadder() から起こす。二重管理にしない
LADDER=$(python3 - "$HTML" <<'PY'
import re,sys
s=open(sys.argv[1],encoding='utf-8').read()
body=re.search(r'const SCENE_QUERY=\{(.*?)\};', s, re.S).group(1)
en=s.split("en:{")[1]
names=dict(re.findall(r"'scene\.(\w+)\.name':'([a-z ]+)'", en))
common=re.search(r"const YT_COMMON='([^']*)'", s).group(1)
for k,v in re.findall(r"(\w+):\s*'([^']*)'", body):
    name=names.get(k,k)
    extra=v.split()
    full=' '.join([name]+extra+[common])
    steps=[(full,'long'),(full,'any'),
           (' '.join([name]+extra[:2]+[common]),'any'),
           (' '.join([name,common]),'any'),
           (name,'any')]
    for i,(q,long) in enumerate(steps,1):
        print(f"{k}\t{i}\t{long}\t{q}")
PY
)

url() {
  local q="$1" long="$2"
  local dur=""
  [ "$long" = "long" ] && dur="&videoDuration=long"
  printf 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&safeSearch=moderate&videoEmbeddable=true&videoLicense=creativeCommon&order=viewCount%s&q=%s&key=%s' \
    "$dur" "$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$q")" "$KEY"
}

prev=""
hit=0
while IFS=$'\t' read -r id step long q; do
  [ -n "$ONLY" ] && [ "$ONLY" != "$id" ] && continue
  if [ "$id" != "$prev" ]; then prev="$id"; hit=0; fi
  [ "$hit" = "1" ] && continue        # そのシーンは当たり済み
  lbl="$long"
  if [ "$KEY" = "--dry-run" ]; then
    printf '%-10s 段%s %-4s %s\n' "$id" "$step" "$lbl" "$q"
    continue
  fi
  res=$(curl -s "$(url "$q" "$long")")
  n=$(printf '%s' "$res" | python3 -c 'import json,sys
d=json.load(sys.stdin)
print("ERR:"+d["error"]["errors"][0]["reason"] if "error" in d else len(d.get("items",[])))')
  printf '%-10s 段%s %-4s %-2s件  %s\n' "$id" "$step" "$lbl" "$n" "$q"
  case "$n" in ERR*) hit=1;; 0) ;; *) hit=1;; esac
  if [ -n "$ONLY" ] && [ "$hit" = "1" ]; then
    printf '%s' "$res" | python3 -c '
import json,sys
for it in json.load(sys.stdin).get("items",[]):
    s=it["snippet"]
    print(f"   {it[\"id\"][\"videoId\"]}  {s[\"channelTitle\"][:22]:22}  {s[\"title\"][:58]}")'
  fi
  sleep 0.2
done <<< "$LADDER"
