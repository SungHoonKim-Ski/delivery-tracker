#!/usr/bin/env bash
#
# tracker.delivery API 키 갱신 원커맨드.
#
#   사용: ./scripts/rotate-api-key.sh <CLIENT_ID:CLIENT_SECRET> [--dev-only] [--force-prod]
#
# 절차 (docs/API_KEY_ROTATION.md 참고):
#   1. dev Lambda env 갱신 — 현재 env 전체를 읽어 TRACKER_API_KEY만 교체(RESULT_API_URL 등 보존)
#   2. dev invoke 검증 — 외부 호출 도달 여부로 키 유효성 판정
#   3. 검증 통과 시에만 prod Lambda env 갱신 (동일 방식)
#   4. 발급일(api-key-issued-at) 기록 → SessionStart 만료 환기의 SoT
#
# 키 값은 화면/로그에 출력하지 않는다. 재발급(웹 로그인)은 수동 단계이므로 이 스크립트 범위 밖.

set -euo pipefail

REGION="ap-northeast-2"
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

# --- dev invoke 검증 -------------------------------------------------------
# 가짜 운송장번호로 dev를 invoke하고, 로그에서 "외부 호출 도달" 신호를 찾는다.
# 실제 추적 결과가 없는 것은 정상 — 외부 호출까지 갔는지만 본다 (docs 검증 기준).
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
    printf '%s' "$logs" | grep -qiE 'Dispatching to|운송장번호를 확인|No tracking events|unauthorized|401|403|invalid|authentication|인증' && break
  done

  echo "── dev 로그 (최근 2분) ─────────────────────────────"
  printf '%s\n' "$logs" | tail -25
  echo "───────────────────────────────────────────────────"

  if printf '%s' "$logs" | grep -qiE 'unauthorized|401|403|invalid.?key|authentication|인증 (실패|오류)'; then
    echo "판정: ✗ FAIL — 인증 에러 감지 (키 무효/만료 가능성)"
    return 1
  fi
  if printf '%s' "$logs" | grep -qiE 'Dispatching to|운송장번호를 확인|No tracking events'; then
    echo "판정: ✓ PASS — 외부 호출 도달 (키 유효)"
    return 0
  fi
  echo "판정: ? UNKNOWN — 신호 불명확. 위 로그를 직접 확인하라."
  return 2
}

# --- 실행 ------------------------------------------------------------------
echo "▶ dev env 갱신"
update_env "$DEV_FN"

echo "▶ dev 검증 (invoke + 로그)"
set +e
verify_dev
verdict=$?
set -e

if [[ "$DEV_ONLY" == true ]]; then
  echo "▶ --dev-only: prod 미반영·발급일 미기록으로 종료 (dev 검증만)."
  exit 0
fi

if [[ "$verdict" -eq 1 ]]; then
  echo "✗ 검증 FAIL — prod 미반영. 재발급 키를 확인하고 다시 시도하라." >&2
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
