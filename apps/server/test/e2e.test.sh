#!/usr/bin/env bash
# Curl-based e2e smoke test.
# Pre-req: server running on $BASE (default localhost:3000).
# Uses dev-mode wx login (code starts with "dev-").
# Run: bash test/e2e.test.sh
set -e
BASE="${BASE:-http://localhost:3000/api/v1}"
PASS=0
FAIL=0

assert() {
  local name=$1 actual=$2 expected=$3
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $name"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name (got [$actual] expected [$expected])"
    FAIL=$((FAIL+1))
  fi
}

login() {
  curl -sS -X POST "$BASE/auth/wx-login" \
    -H 'Content-Type: application/json' \
    -d "{\"code\":\"dev-$1\"}" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["token"]+"|"+d["user"]["id"]+"|"+d["team"]["id"])'
}

api() {
  local method=$1 path=$2 token=$3 body=$4
  if [[ -z "$body" ]]; then
    curl -sS -o /tmp/resp -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $token"
  else
    curl -sS -o /tmp/resp -w '%{http_code}' -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
      -d "$body"
  fi
}

echo "== Auth =="
A=$(login "alice-$RANDOM")
A_TOKEN="${A%%|*}"; A_REST="${A#*|}"; A_UID="${A_REST%%|*}"; A_TID="${A_REST#*|}"
assert "login returns token" "$(test -n "$A_TOKEN" && echo ok)" "ok"

echo "== Health =="
code=$(curl -sS -o /tmp/resp -w '%{http_code}' "$BASE/health")
assert "health 200" "$code" "200"
assert "health ok=true" "$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["ok"])')" "True"

echo "== Account quota =="
code=$(api POST /accounts "$A_TOKEN" '{"nickname":"小薯一号","vertical":"穿搭"}')
assert "create account 201/200" "$code" "201"
code=$(api POST /accounts "$A_TOKEN" '{"nickname":"小薯二号","vertical":"美妆"}')
assert "free plan rejects 2nd" "$code" "403"

echo "== Lint =="
code=$(api POST /lint "$A_TOKEN" '{"text":"全网最低 100% 保本"}')
assert "lint 201" "$code" "201"
hits=$(python3 -c 'import json;print(len(json.load(open("/tmp/resp"))["violations"]))')
assert "lint hits 3 violations" "$hits" "3"

echo "== Draft lifecycle =="
api GET /accounts "$A_TOKEN" > /dev/null
ACC=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))[0]["id"])')
code=$(api POST /drafts "$A_TOKEN" "{\"accountId\":\"$ACC\",\"kind\":\"image\",\"title\":\"t\",\"body\":\"b\"}")
assert "create draft 201" "$code" "201"
DID=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["id"])')

FUTURE=$(date -u -d '+1 hour' '+%Y-%m-%dT%H:%M:%SZ')
code=$(api POST "/drafts/$DID/schedule" "$A_TOKEN" "{\"scheduleAt\":\"$FUTURE\"}")
assert "schedule 201" "$code" "201"
status=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["status"])')
assert "status -> scheduled" "$status" "scheduled"

code=$(api POST "/drafts/$DID/handoff" "$A_TOKEN" "")
assert "handoff 201" "$code" "201"

code=$(api POST "/drafts/$DID/published" "$A_TOKEN" '{"publishedUrl":"https://evil.com/x"}')
assert "reject bad URL 400" "$code" "400"

code=$(api POST "/drafts/$DID/published" "$A_TOKEN" '{"publishedUrl":"https://www.xiaohongshu.com/explore/abc"}')
assert "accept XHS URL 201" "$code" "201"
status=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["status"])')
assert "status -> published" "$status" "published"

echo "== Team invite =="
api GET /teams/current "$A_TOKEN" > /dev/null
assert "team current" "$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["plan"])')" "free"

# free plan = 1 seat → invite is correctly rejected
code=$(api POST /teams/invites "$A_TOKEN" '{"role":"editor"}')
assert "free plan invite blocked 403" "$code" "403"

# upgrade to starter via direct DB to test happy path
PGPASSWORD=redmatrix psql -h localhost -U redmatrix -d redmatrix -c \
  "UPDATE team SET plan='starter', seats=5 WHERE id=$A_TID;" > /dev/null

code=$(api POST /teams/invites "$A_TOKEN" '{"role":"editor"}')
assert "starter plan invite 201" "$code" "201"
INVITE=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["code"])')

B=$(login "bob-$RANDOM")
B_TOKEN="${B%%|*}"
code=$(api POST /teams/invites/accept "$B_TOKEN" "{\"code\":\"$INVITE\"}")
assert "accept invite 201" "$code" "201"

# Bad invite
code=$(api POST /teams/invites/accept "$B_TOKEN" '{"code":"NOPE99"}')
assert "bad invite 404" "$code" "404"

# Members list now has 2
api GET /teams/members "$A_TOKEN" > /dev/null
count=$(python3 -c 'import json;print(len(json.load(open("/tmp/resp"))))')
assert "members count = 2" "$count" "2"

echo "== Team switching =="
api GET /auth/teams "$B_TOKEN" > /dev/null
teams=$(python3 -c 'import json;print(len(json.load(open("/tmp/resp"))))')
assert "bob has 2 teams" "$teams" "2"

# switch bob to alice's team
code=$(api POST /auth/switch-team "$B_TOKEN" "{\"teamId\":\"$A_TID\"}")
assert "switch team 201" "$code" "201"
B_TOKEN_IN_A=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["token"])')

# bob cannot switch to a team he's not in
code=$(api POST /auth/switch-team "$B_TOKEN" '{"teamId":"99999"}')
assert "switch to non-member team 403" "$code" "403"

echo "== Review workflow =="
api GET /accounts "$A_TOKEN" > /dev/null
ACC=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))[0]["id"])')
api POST /drafts "$A_TOKEN" "{\"accountId\":\"$ACC\",\"kind\":\"image\",\"title\":\"review me\",\"body\":\"...\"}" > /dev/null
DID2=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["id"])')

code=$(api POST "/drafts/$DID2/submit-review" "$A_TOKEN" "")
assert "submit-review 201" "$code" "201"
status=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["status"])')
assert "status -> in_review" "$status" "in_review"

# bob (editor) tries to approve from alice's team context → forbidden by role
code=$(api POST "/drafts/$DID2/review" "$B_TOKEN_IN_A" '{"decision":"approve"}')
assert "editor cannot approve 403" "$code" "403"

# alice (owner) approves
code=$(api POST "/drafts/$DID2/review" "$A_TOKEN" '{"decision":"approve","comment":"ok"}')
assert "owner approve 201" "$code" "201"

api GET "/drafts/$DID2" "$A_TOKEN" > /dev/null
status=$(python3 -c 'import json;print(json.load(open("/tmp/resp"))["status"])')
assert "status -> approved" "$status" "approved"

echo
echo "Summary: $PASS passed, $FAIL failed"
exit $FAIL
