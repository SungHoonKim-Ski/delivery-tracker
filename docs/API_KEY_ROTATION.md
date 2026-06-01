# tracker.delivery API 키 갱신 Runbook

`TRACKER_API_KEY`(tracker.delivery 발급)는 만료 주기가 짧다. 만료되면 모든 배송조회가
carrier dispatch 직후 인증 에러로 실패하므로, 만료 전 갱신이 필요하다.

> 실제 키 값은 이 문서·repo에 절대 기록하지 않는다. `config.local.yml`은 gitignore 대상이며,
> 운영 값은 Lambda 환경변수에만 존재한다.

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

### 3. 로컬 설정 반영

`config.local.yml`의 `TRACKER_API_KEY`를 새 값으로 갱신 (gitignore 대상, 커밋되지 않음).

### 4. 발급일 기록 (선택)

만료 알림을 운영하는 경우 발급일을 로컬에 기록한다 (경로는 운영자 머신별로 다를 수 있음):

```bash
echo "$(date +%Y-%m-%d)" > <발급일-기록-파일-경로>
```

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
