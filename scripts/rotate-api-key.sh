#!/usr/bin/env bash
#
# tracker.delivery API 키 갱신 원커맨드.
#
#   사용: ./scripts/rotate-api-key.sh <CLIENT_ID:CLIENT_SECRET> [--dev-only] [--force-prod]
#
# 절차 (docs/API_KEY_ROTATION.md 참고):
#   1. 키 유효성 판정 — tracker.delivery에 직접 호출해 GraphQL 에러 코드로 가른다 (어느 env도 건드리기 전)
#   2. dev Lambda env 갱신 — 현재 env 전체를 읽어 TRACKER_API_KEY만 교체(RESULT_API_URL 등 보존)
#   3. dev invoke 배선 검증 — 갱신된 env로 실제 외부 호출까지 도달하는지 확인
#   4. 검증 통과 시에만 prod Lambda env 갱신 (동일 방식)
#   5. 발급일(api-key-issued-at) 기록 → SessionStart 만료 환기의 SoT
#
# 키 값은 화면/로그에 출력하지 않는다. 재발급(웹 로그인)은 수동 단계이므로 이 스크립트 범위 밖.

set -euo pipefail

REGION="ap-northeast-2"
TRACKER_ENDPOINT="https://apis.tracker.delivery/graphql"
DEV_FN="dev-onuljang-courier-tracker"
PROD_FN="onuljang-courier-tracker"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISSUED_AT_FILE="${SCRIPT_DIR}/../api-key-issued-at"

# --- 인자 파싱 -------------------------------------------------------------
NEWKEY=""
DEV_ONLY=false
FORCE_PROD=false
for arg in "$@"; do
  case "$arg" in
    --dev-only)   DEV_ONLY=true ;;
    --force-prod) FORCE_PROD=true ;;
    --*)          echo "알 수 없는 옵션: $arg" >&2; exit 1 ;;
    *)            NEWKEY="$arg" ;;
  esac
done

if [[ -z "$NEWKEY" || "$NEWKEY" != *:* ]]; then
  echo "사용법: $0 <CLIENT_ID:CLIENT_SECRET> [--dev-only] [--force-prod]" >&2
  echo "  키는 tracker.delivery 웹 로그인 → API 키 재발급으로 먼저 확보한다." >&2
  exit 1
fi

command -v aws >/dev/null     || { echo "필요: aws CLI" >&2; exit 1; }
command -v python3 >/dev/null || { echo "필요: python3" >&2; exit 1; }
command -v curl >/dev/null    || { echo "필요: curl" >&2; exit 1; }

# --- env 갱신 (현재 env 전체 보존 + TRACKER_API_KEY만 교체) -----------------
update_env() {
  local fn="$1"
  local cur
  cur="$(aws lambda get-function-configuration --function-name "$fn" --region "$REGION" \
    --query 'Environment.Variables' --output json)"

  if [[ "$cur" == "null" || -z "$cur" ]]; then
    echo "  ✗ $fn: 현재 환경변수를 읽지 못함 — 중단 (덮어쓰기 방지)" >&2
    return 1
  fi
  # RESULT_API_URL 존재 확인 — 런북이 경고하는 콜백 URL 유실 방지 가드
  if ! printf '%s' "$cur" | python3 -c 'import json,sys; sys.exit(0 if "RESULT_API_URL" in json.load(sys.stdin) else 1)'; then
    echo "  ✗ $fn: RESULT_API_URL 부재 — 예상 밖 상태라 중단" >&2
    return 1
  fi

  local env_json
  env_json="$(printf '%s' "$cur" | NEWKEY="$NEWKEY" python3 -c \
    'import json,os,sys; v=json.load(sys.stdin); v["TRACKER_API_KEY"]=os.environ["NEWKEY"]; print(json.dumps({"Variables":v}))')"

  aws lambda update-function-configuration --function-name "$fn" --region "$REGION" \
    --environment "$env_json" --query 'LastUpdateStatus' --output text >/dev/null
  aws lambda wait function-updated --function-name "$fn" --region "$REGION"
  echo "  ✓ $fn: TRACKER_API_KEY 갱신 (그 외 환경변수 보존)"
}

# --- 키 유효성 판정 (tracker.delivery 직접 호출) ---------------------------
# 판정은 이 함수가 단독으로 한다. lambda 로그 문자열 매칭은 만료 응답
# ("Invalid or expired token." / code UNAUTHENTICATED)을 어느 FAIL 패턴으로도
# 잡지 못해 죽은 키를 PASS로 통과시킨 전례가 있다 (2026-08-31 발견).
#
#   인증 통과  → 에러가 없거나 BAD_REQUEST (테스트 운송장이 가짜라서 나는 것)
#   키 무효/만료 → extensions.code = UNAUTHENTICATED
#
# 어떤 env도 건드리기 전에 실행한다 — 죽은 키는 dev에도 쓰지 않는다.
verify_key() {
  local body resp codes
  body='{"query":"query Track($carrierId: ID!, $trackingNumber: String!) { track(carrierId: $carrierId, trackingNumber: $trackingNumber) { lastEvent { time } } }","variables":{"carrierId":"kr.logen","trackingNumber":"1234567890123"}}'

  if ! resp="$(curl -sS --max-time 20 -X POST "$TRACKER_ENDPOINT" \
      -H 'Content-Type: application/json' -H 'Accept: application/json' \
      -H "Authorization: TRACKQL-API-KEY ${NEWKEY}" \
      -d "$body" 2>/dev/null)"; then
    echo "판정: ? UNKNOWN — tracker.delivery 호출 실패 (네트워크/엔드포인트)"
    return 2
  fi

  if ! codes="$(printf '%s' "$resp" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(3)
errs = d.get("errors") or []
print(",".join((e.get("extensions") or {}).get("code", "") for e in errs))
' 2>/dev/null)"; then
    echo "판정: ? UNKNOWN — 응답이 JSON이 아님 (엔드포인트 변경 가능성)"
    return 2
  fi

  if [[ "$codes" == *UNAUTHENTICATED* ]]; then
    echo "판정: ✗ FAIL — UNAUTHENTICATED (키 무효/만료)"
    return 1
  fi

  if [[ -n "$codes" ]]; then
    echo "판정: ✓ PASS — 인증 통과 (에러코드 ${codes} — 테스트 운송장이 가짜라서 나는 것)"
  else
    echo "판정: ✓ PASS — 인증 통과"
  fi
  return 0
}

# --- dev invoke 배선 검증 --------------------------------------------------
# 키 자체는 verify_key가 이미 판정했다. 여기서 보는 것은 **갱신한 env가 실제로
# 반영되어** 배포된 lambda가 외부까지 도달하는가다. 실제 추적 결과가 없는 것은
# 정상 — 가짜 운송장이므로.
verify_dev() {
  local payload out
  payload="$(mktemp)"; out="$(mktemp)"
  cat >"$payload" <<'JSON'
[{"requestId":"verify-keytest-001","displayCode":"TEST","trackingNumber":"1234567890123","courierCompany":"LOGEN"}]
JSON

  aws lambda invoke --function-name "$DEV_FN" --region "$REGION" \
    --payload "fileb://$payload" "$out" >/dev/null
  rm -f "$payload" "$out"

  # 로그 전파 지연 → 최대 ~24초 폴링
  local logs="" i
  for i in 1 2 3 4 5 6 7 8; do
    sleep 3
    logs="$(aws logs tail "/aws/lambda/${DEV_FN}" --region "$REGION" --since 2m --format short 2>/dev/null || true)"
    printf '%s' "$logs" | grep -qiE '운송장번호를 확인|No tracking events|UNAUTHENTICATED|expired token|unauthorized|401|403|invalid|authentication|인증' && break
  done

  echo "── dev 로그 (최근 2분) ─────────────────────────────"
  printf '%s\n' "$logs" | tail -25
  echo "───────────────────────────────────────────────────"

  if printf '%s' "$logs" | grep -qiE 'UNAUTHENTICATED|expired token|unauthorized|401|403|invalid.?key|authentication|인증 (실패|오류)'; then
    echo "판정: ✗ FAIL — 인증 에러 감지 (env 반영 실패 또는 키 무효)"
    return 1
  fi
  # 'Dispatching to'는 외부 호출 **직전**에 우리 핸들러가 찍는 줄이라 응답의 증거가
  # 아니다 — 키가 죽어도 항상 뜬다. 응답을 받은 뒤에만 나오는 신호로만 판정한다.
  if printf '%s' "$logs" | grep -qiE '운송장번호를 확인|No tracking events'; then
    echo "판정: ✓ PASS — 외부 응답 수신 (env 반영 확인)"
    return 0
  fi
  echo "판정: ? UNKNOWN — 신호 불명확. 위 로그를 직접 확인하라."
  return 2
}

# --- 실행 ------------------------------------------------------------------
# 죽은 키를 dev에조차 쓰지 않기 위해, 어느 env보다 먼저 키를 판정한다.
echo "▶ 키 유효성 판정 (tracker.delivery 직접 호출)"
set +e
verify_key
key_verdict=$?
set -e

if [[ "$key_verdict" -eq 1 ]]; then
  echo "✗ 키 무효 — dev/prod 모두 미반영. 재발급 키를 확인하고 다시 시도하라." >&2
  exit 2
fi
if [[ "$key_verdict" -eq 2 && "$FORCE_PROD" != true ]]; then
  echo "? 키 판정 UNKNOWN — dev/prod 모두 미반영. 위 응답을 확인하고 확신하면 --force-prod로 재실행하라." >&2
  exit 3
fi

echo "▶ dev env 갱신"
update_env "$DEV_FN"

echo "▶ dev 배선 검증 (invoke + 로그)"
set +e
verify_dev
verdict=$?
set -e

if [[ "$DEV_ONLY" == true ]]; then
  echo "▶ --dev-only: prod 미반영·발급일 미기록으로 종료 (dev 검증만)."
  exit 0
fi

if [[ "$verdict" -eq 1 ]]; then
  echo "✗ 배선 검증 FAIL — prod 미반영. dev env 반영 상태를 확인하라." >&2
  exit 2
fi
if [[ "$verdict" -eq 2 && "$FORCE_PROD" != true ]]; then
  echo "? 검증 UNKNOWN — prod 미반영. 로그 확인 후 확신하면 --force-prod로 재실행하라." >&2
  exit 3
fi

echo "▶ prod env 갱신"
update_env "$PROD_FN"

echo "▶ 발급일 기록"
date +%Y-%m-%d > "$ISSUED_AT_FILE"
echo "  ✓ ${ISSUED_AT_FILE} = $(cat "$ISSUED_AT_FILE")"

echo
echo "✅ 완료. 만료 환기 SoT 반영을 위해 발급일을 커밋·푸시하라:"
echo "   git -C \"${SCRIPT_DIR}/..\" add api-key-issued-at && git -C \"${SCRIPT_DIR}/..\" commit -m \"chore: API 키 갱신 발급일 기록\" && git -C \"${SCRIPT_DIR}/..\" push"
