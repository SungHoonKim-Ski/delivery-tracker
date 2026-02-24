# Delivery Tracker (KR)

한국 택배 운송장 번호로 배송 상태를 조회하고, 공통 상태로 정규화해 SQS로 전달하는 AWS Lambda 프로젝트입니다.

## 개요

- 입력: SQS 메시지 (`displayCode`, `trackingNumber`, `courierCompany`)
- 처리: 택배사별 API 조회 로직 실행
- 출력: 공통 포맷으로 정규화한 결과를 결과 SQS로 전송

## 지원 택배사

- `LOGEN` (로젠택배)
- `HANJIN` (한진택배)
- `CJ` (CJ대한통운)
- `LOTTE` (롯데택배)
- `EPOST` (우체국택배)

## 공통 상태 값

- `SHIPPED`: 접수/집하 단계
- `IN_TRANSIT`: 이동/간선/배송중 단계
- `DELIVERED`: 배송완료 단계

## 메시지 스펙

### 입력 (`TrackingRequest`)

```json
{
  "displayCode": "ORDER-20260224-001",
  "trackingNumber": "123456789012",
  "courierCompany": "CJ"
}
```

### 출력 (`TrackingResult`)

```json
{
  "displayCode": "ORDER-20260224-001",
  "status": "IN_TRANSIT",
  "location": "대전Hub",
  "timestamp": "2026-02-24 13:20:00"
}
```

## 동작 흐름

1. Lambda 핸들러가 SQS 이벤트를 수신합니다.
2. 메시지를 `TrackingRequest`로 파싱하고 필수값을 검증합니다.
3. `courierCompany`에 맞는 트래커로 조회를 위임합니다.
4. 조회 결과를 공통 상태로 매핑합니다.
5. `RESULT_QUEUE_URL`로 결과 메시지를 전송합니다.

## 로컬 빌드

### 요구사항

- Node.js 22+
- npm

### 설치 및 빌드

```bash
npm install
npm run build
```

빌드 결과물은 `dist/handler.js`에 생성됩니다.

## 환경 변수

- `RESULT_QUEUE_URL` (필수): 조회 결과를 발행할 SQS Queue URL
- `TRACKER_API_KEY` (선택): tracker.delivery 인증 키 (`client_id:client_secret` 형식)

## 프로젝트 구조

```text
src/
  handler.ts                 # Lambda 진입점 (SQS 이벤트 처리)
  types.ts                   # 공통 타입 정의
  carrier/
    index.ts                 # 택배사 레지스트리 / 라우팅
    register.ts              # 택배사 등록
    base-api-tracker.ts      # 공통 API 조회 레이어
    cj/
    epost/
    hanjin/
    logen/
    lotte/
  sqs/
    result-sender.ts         # 결과 SQS 발행
```

## 새 택배사 추가 방법

1. `src/carrier/<carrier>/status-map.ts` 작성
2. `src/carrier/<carrier>/api-tracker.ts`(API 방식) 또는 `crawler.ts`(HTML 파싱 방식) 구현
3. API 응답을 `TrackingResult`로 정규화
4. `src/carrier/register.ts`에 등록
5. `CourierCompany` 타입(`src/types.ts`)에 코드 추가

## 참고

- 각 택배사 API 스펙/인증 방식 변경 시 연동 로직이 깨질 수 있습니다.
- 현재 등록된 택배사는 `tracker.delivery` API(`https://apis.tracker.delivery/carriers/{carrier_id}/tracks/{track_id}`)를 사용합니다.
- `LOGEN`/`HANJIN`은 대안으로 `crawler.ts` 구현도 함께 유지합니다.
- 운영 전 실제 운송장으로 상태 매핑 정확도를 반드시 검증하세요.
