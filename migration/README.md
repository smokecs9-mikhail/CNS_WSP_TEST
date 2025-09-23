# Firebase 데이터 모델 마이그레이션 가이드

## 개요
기존 Firebase Realtime Database의 데이터 모델을 개선된 구조로 마이그레이션합니다.

### 변경 사항
- **기존**: `users/{key}` → `firebaseUid` 필드로 매칭
- **신규**: `users/{uid}` → 직접 UID 사용
- **추가**: `meta/roles/{uid}` → 역할 정보 별도 인덱스

## 마이그레이션 실행 전 준비사항

### 1. Firebase Admin SDK 설정
```bash
# Firebase Admin SDK 키 파일이 있는지 확인
ls migration/firebase-admin-config.js
```

### 2. 백업 확인
현재 Firebase 데이터베이스의 백업이 있는지 확인하세요.

### 3. 서비스 중단
마이그레이션 중에는 서비스 사용을 중단하는 것을 권장합니다.

## 마이그레이션 실행

### 1. 마이그레이션 스크립트 실행
```bash
cd migration
node migrate-to-new-data-model.js
```

### 2. 마이그레이션 결과 확인
스크립트 실행 후 다음 정보를 확인하세요:
- 총 사용자 수
- 마이그레이션 성공 수
- 건너뜀 수
- 백업 위치
- 마이그레이션 로그 위치

### 3. Firebase 규칙 업데이트
마이그레이션 완료 후 `firebase-rules.json`을 Firebase Console에 배포하세요.

## 롤백 (필요시)

### 1. 롤백 스크립트 실행
```bash
node -e "
const { rollbackMigration } = require('./migrate-to-new-data-model.js');
rollbackMigration('백업키').then(() => console.log('롤백 완료'));
"
```

### 2. 기존 규칙 복원
롤백 시 기존 `firebase-rules.json`도 함께 복원하세요.

## 마이그레이션 후 확인사항

### 1. 로그인 테스트
- 관리자 로그인
- 일반 사용자 로그인
- 승인 대기 사용자 로그인

### 2. 권한 테스트
- 관리자 기능 접근
- 일반 사용자 기능 접근
- 승인/거부 기능

### 3. 데이터 무결성 확인
- 사용자 정보 정확성
- 역할 정보 정확성
- 권한 설정 정확성

## 새로운 데이터 구조

### users/{uid}
```json
{
  "name": "사용자명",
  "email": "이메일",
  "status": "approved|pending|rejected",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### meta/roles/{uid}
```json
{
  "role": "admin|user",
  "permissions": {},
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## 주의사항

1. **백업 필수**: 마이그레이션 전 반드시 데이터 백업
2. **테스트 환경**: 가능하면 테스트 환경에서 먼저 실행
3. **모니터링**: 마이그레이션 후 사용자 피드백 모니터링
4. **롤백 준비**: 문제 발생 시 빠른 롤백 계획 수립

## 문제 해결

### 마이그레이션 실패 시
1. 에러 로그 확인
2. Firebase 연결 상태 확인
3. 권한 설정 확인
4. 필요시 롤백 실행

### 데이터 불일치 시
1. 백업 데이터와 비교
2. 마이그레이션 로그 확인
3. 수동 데이터 수정
4. 재마이그레이션 고려

## 지원

문제 발생 시 다음 정보와 함께 문의하세요:
- 마이그레이션 로그
- 에러 메시지
- Firebase Console 스크린샷
- 사용자 수 및 데이터 크기
