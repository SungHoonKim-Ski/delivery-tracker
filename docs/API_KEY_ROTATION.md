# tracker.delivery API 키 갱신 Runbook

`TRACKER_API_KEY`(tracker.delivery 발급)는 만료 주기가 짧다. 만료되면 모든 배송조회가
carrier dispatch 직후 인증 에러로 실패하므로, 만료 전 갱신이 필요하다.

> 실제 키 값은 이 문서·repo에 절대 기록하지 않는다. 운영 값은 Lambda 환경변수에만 존재한다.

## 빠른 경로 — `scripts/rotate-api-key.sh`

키만 재발급하면(아래 § 갱신 절차 1) 나머지는 스크립트 한 줄이 처리한다:

```bash
./scripts/rotate-api-key.sh "CLIENT_ID:CLIENT_SECRET"
```

스크립트가 키 판정 → dev env 갱신 → dev invoke 배선 검증 → (통과 시에만) prod env 갱신 → 발급일 기록까지 수행한다.
- **env 유실 방지**: 현재 Lambda 환경변수 전체를 읽어 `TRACKER_API_KEY`만 교체한다. 아래 § 2의 수동 절차처럼
  `RESULT_API_URL`을 손으로 다시 넣을 필요가 없고, `RESULT_QUEUE_URL` 등 다른 값도 보존된다.
- **키 판정 게이트**: 어느 env를 건드리기 전에 `https://apis.tracker.delivery/graphql`로 직접 1회 호출해
  GraphQL 에러 코드로 가른다. `UNAUTHENTICATED`면 키가 죽은 것이라 **dev에조차 쓰지 않고** 멈춘다.
  인증이 통과하면 테스트 운송장이 가짜라 `BAD_REQUEST`가 나는데, 이것이 정상 신호다.
- **배선 검증 게이트**: dev 검증이 통과해야 prod에 반영한다. 여기서 보는 것은 키가 아니라 **갱신한 env가
  실제로 반영됐는가**다. 검증이 불명확(UNKNOWN)하면 로그를 출력하고 멈추며, 직접 확인 후 확신하면
  `--force-prod`로 재실행한다. dev만 확인하려면 `--dev-only`.

> 판정을 CloudWatch 로그 문자열로 하지 않는 이유: 만료 응답은 `Invalid or expired token.`(code
> `UNAUTHENTICATED`)으로 오는데, 이 문구는 `unauthorized`·`401`·`invalid key`·`authentication` 어느
> 패턴에도 걸리지 않는다. 반면 PASS 신호로 쓰이던 `Dispatching to`는 외부 호출 **직전**에 우리 핸들러가
> 찍는 줄이라 키가 죽어도 항상 뜬다. 그래서 옛 게이트는 만료된 키를 PASS로 통과시켜 prod에 반영했다
> (2026-08-31 발견). 지금은 응답을 받은 뒤에만 나오는 신호로만 판정한다.
- **발급일 자동 기록**: prod 반영 후 `api-key-issued-at`에 오늘 날짜를 쓴다. 이 파일이 만료 환기의 SoT다(§ 4).

수동으로 하려면 아래 절차를 그대로 따라도 된다(스크립트는 이 절차의 자동화다).

## 만료 주기

약 **21일** (1년 단위 아님). 키 형식은 `client_id:client_secret`.

실측 사례:
- 2026-04-22 발급 → 2026-05-13 만료
- 2026-05-12 갱신 → 2026-06-02 만료
- 2026-06-01 갱신 → 2026-06-22 전후 만료 예상

## 대상 리소스

| 구분 | Lambda 함수명 | 리전 | RESULT_API_URL |
|------|---------------|------|----------------|
| dev  | `dev-onuljang-courier-tracker` | `ap-northeast-2` | `https://dev.api.fruit-matjip.store/api/internal/tracking/result` |
| prod | `onuljang-courier-tracker`     | `ap-northeast-2` | `https://api.fruit-matjip.store/api/internal/tracking/result` |

## 갱신 절차

### 1. 키 재발급 (수동, 웹 로그인 필요)

tracker.delivery 로그인 → API 키 재발급 → `CLIENT_ID:CLIENT_SECRET` 확보.

### 2. Lambda 환경변수 업데이트 (dev + prod)

> ⚠️ `update-function-configuration --environment`는 **환경변수 전체를 덮어쓴다.**
> `RESULT_API_URL`을 반드시 함께 전달해야 한다. 누락 시 BE 콜백 URL이 사라진다.

```bash
NEWKEY="CLIENT_ID:CLIENT_SECRET"   # 재발급 받은 값

# dev
aws lambda update-function-configuration \
  --function-name dev-onuljang-courier-tracker --region ap-northeast-2 \
  --environment "Variables={RESULT_API_URL=https://dev.api.fruit-matjip.store/api/internal/tracking/result,TRACKER_API_KEY=$NEWKEY}"

# prod
aws lambda update-function-configuration \
  --function-name onuljang-courier-tracker --region ap-northeast-2 \
  --environment "Variables={RESULT_API_URL=https://api.fruit-matjip.store/api/internal/tracking/result,TRACKER_API_KEY=$NEWKEY}"
```

업데이트 전 기존 값 확인(특히 `RESULT_API_URL`):

```bash
aws lambda get-function-configuration --function-name dev-onuljang-courier-tracker \
  --region ap-northeast-2 --query 'Environment.Variables' --output json
```

### 3. 로컬 설정 반영 (불요)

과거에는 `config.local.yml`을 갱신했으나, **현재 코드는 이 파일을 읽지 않는다**(README 참고).
운영 진실은 Lambda 환경변수뿐이므로 이 단계는 없다.

### 4. 발급일 기록

발급일은 repo 내 `api-key-issued-at`(레포 루트, 1줄 `YYYY-MM-DD`)에 기록한다. 날짜 자체는 비밀이 아니므로 커밋한다.

```bash
echo "$(date +%Y-%m-%d)" > api-key-issued-at
```

이 파일이 워크스페이스 SessionStart 훅의 만료 환기 SoT다 — 발급일 + 21일이 만료 커트라인(D-7) 이내면
세션 시작 시 "🔑 배송조회 API 키 만료 D-N" 한 줄이 뜬다. `rotate-api-key.sh`는 이 파일을 자동으로 갱신하므로,
스크립트 사용 시 마지막에 안내되는 커밋·푸시만 수행하면 된다.

환기 채널은 이중이다: 위 로컬 훅(노트북 세션 시작 시)에 더해, `.github/workflows/api-key-expiry-slack.yml`이
매일 09:13 KST에 같은 SoT를 읽어 D-7 이내면 Slack으로 알린다(laptop-independent 백업). 두 채널은 발급일 SoT와
만료 상수(21일·D-7)를 공유하므로 이 파일만 갱신하면 양쪽이 함께 정확해진다.

## 검증

dev Lambda를 직접 invoke해 새 키가 외부 호출까지 통과하는지 확인한다.

```bash
cat > /tmp/payload.json <<'EOF'
[{"requestId":"verify-keytest-001","displayCode":"TEST","trackingNumber":"1234567890123","courierCompany":"LOGEN"}]
EOF

aws lambda invoke --function-name dev-onuljang-courier-tracker --region ap-northeast-2 \
  --payload fileb:///tmp/payload.json /tmp/out.json

aws logs tail /aws/lambda/dev-onuljang-courier-tracker --region ap-northeast-2 --since 3m --format short
```

### 로그 판별 기준

- **정상 (키 유효):** `[Carrier] Dispatching to LOGEN ...` 후 1~2초 외부 호출이 발생하고,
  가짜 운송장번호 때문에 `운송장번호를 확인해주세요` / `No tracking events found` 로 끝난다.
  외부 호출까지 도달했다는 것이 키가 유효하다는 신호다.
  (BE 콜백은 Nonce UUID 검증으로 가짜 requestId를 항상 거부하므로, 콜백 실패는 정상이다.)
- **비정상 (키 무효/만료):** carrier dispatch 직후 **즉시** 인증 에러가 뜨고 외부 호출 지연이 없다.

검증은 "외부 호출 도달 여부"만 본다. 가짜 운송장번호이므로 실제 추적 결과가 없는 것은 정상이다.
