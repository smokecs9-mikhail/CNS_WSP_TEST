# CNS Corporation 업무지원 시스템 - 신입 개발자 가이드

## 📚 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [실행 환경 설정](#실행-환경-설정)
4. [주요 모듈 설명](#주요-모듈-설명)
5. [실행 흐름](#실행-흐름)
6. [사용 예시](#사용-예시)
7. [개발 가이드](#개발-가이드)
8. [트러블슈팅](#트러블슈팅)

---

## 🎯 프로젝트 개요

CNS Corporation의 통합 업무지원 시스템으로, 다음과 같은 기능을 제공합니다:

### 주요 기능
- 🔐 **사용자 인증 시스템**: Firebase Authentication 기반
- 📊 **부동산 가치 평가**: 상업용 부동산 NOI, Cap Rate 계산
- 📅 **일정 관리**: 소송일정표, 영업현황표
- 📄 **PDF 편집기**: PDF 병합, 압축, 편집 기능
- 👥 **사용자 관리**: 회원가입 승인, 권한 관리
- 🗑️ **데이터 복구**: 30일 휴지통 시스템

### 기술 스택
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js + Express (비밀번호 변경 API)
- **Database**: Firebase Realtime Database
- **Authentication**: Firebase Authentication
- **Libraries**: 
  - Bootstrap 5.3.0
  - Font Awesome 6.0.0
  - html2pdf.js (PDF 생성)
  - PDF.js (PDF 뷰어)

---

## 🏗️ 시스템 아키텍처

### 디렉토리 구조
```
CNS_WSP/
├── index.html              # 로그인 페이지 (진입점)
├── main.html               # 일반 사용자 대시보드
├── admin.html              # 관리자 대시보드
├── approval.html           # 회원가입 승인 관리
├── user-management.html    # 사용자 관리
├── data-recovery.html      # 데이터 복구 (휴지통)
├── signup.html             # 회원가입
│
├── prop2/                  # 부동산 평가 모듈
│   ├── prop.html           # 부동산 평가 UI
│   ├── script.js           # 계산 로직 & Firebase 연동
│   ├── styles.css          # 스타일
│   └── property_V103.py    # Python 버전 (레거시)
│
├── Court_sche/             # 소송일정표 모듈
│   ├── Court_sche.html     # 달력 UI
│   ├── script.js           # 일정 관리 로직
│   └── style.css
│
├── Sales_sche/             # 영업현황표 모듈
│   ├── Salse_sche.html     # 영업 현황 UI
│   ├── script.js           # 데이터 관리
│   └── style.css
│
├── PDF_Editor/             # PDF 편집 모듈
│   ├── PDFeditor.html      # PDF 편집 UI
│   └── js/
│       ├── pdf-viewer.js   # PDF 뷰어
│       ├── pdf-merger.js   # PDF 병합
│       ├── pdf-compressor.js # PDF 압축
│       └── pdf-editor.js   # PDF 편집
│
├── server/                 # 백엔드 API 서버
│   ├── server.js           # Express 서버
│   ├── package.json        # 의존성 관리
│   └── env-example.txt     # 환경변수 예시
│
├── config/                 # 설정 파일
│   └── firebase-config.js  # Firebase 설정
│
├── utils/                  # 유틸리티
│   └── security.js         # 보안 관련 함수
│
└── migration/              # 데이터 마이그레이션 도구
    ├── migrate-users.js
    └── README.md
```

### Firebase 데이터 구조
```
firebase-database/
├── users/
│   └── {uid}/
│       ├── name: "사용자명"
│       ├── email: "user@example.com"
│       ├── role: "admin" | "user"
│       ├── status: "pending" | "approved" | "rejected"
│       └── department: "부서명"
│
├── meta/
│   ├── admins/{uid}: true
│   └── roles/{uid}/
│       ├── role: "admin"
│       └── permissions: {...}
│
├── propertyCalculator/
│   ├── history/          # 계산 결과 히스토리
│   ├── inputs/           # 입력값 및 상세정보
│   └── trash/            # 휴지통 (30일 보관)
│
└── scheduleData/         # 일정 데이터
    ├── court/            # 소송일정
    └── sales/            # 영업현황
```

---

## 🚀 실행 환경 설정

### 1. 필수 요구사항
- **Node.js**: v14 이상 (백엔드 서버용)
- **Modern Browser**: Chrome, Firefox, Edge (최신 버전)
- **Firebase 프로젝트**: Realtime Database + Authentication 활성화

### 2. 초기 설정

#### Step 1: Firebase 설정
1. Firebase 콘솔 접속: https://console.firebase.google.com/
2. 프로젝트: `csy-todo-test` 확인
3. Realtime Database 규칙 배포:
   ```bash
   # firebase-rules.json 적용
   ```

#### Step 2: 백엔드 서버 설치 (선택사항)
```bash
cd server
npm install
```

#### Step 3: 환경변수 설정
```bash
# server/.env 파일 생성
cp env-example.txt .env
# Firebase Admin SDK 키 설정
```

#### Step 4: 서버 실행
```bash
npm start
# 또는 개발 모드
npm run dev
```

### 3. 로컬 개발 환경

#### 방법 1: Live Server (VS Code)
1. Live Server 확장 설치
2. `index.html` 우클릭 → "Open with Live Server"
3. http://localhost:5500 접속

#### 방법 2: Python Simple Server
```bash
python -m http.server 8000
# http://localhost:8000 접속
```

---

## 📖 주요 모듈 설명

### 1. 인증 시스템 (index.html, script.js)

#### 파일 구성
- `index.html`: 로그인 UI
- `script.js`: 로그인 로직
- `signup.html`: 회원가입 UI

#### 주요 기능
```javascript
// 로그인 흐름
사용자 입력 → Firebase Authentication
           ↓
      ID 토큰 발급
           ↓
  localStorage/sessionStorage 저장
           ↓
   main.html 또는 admin.html 리다이렉트
```

#### 사용 예시
```javascript
// script.js에서 로그인 처리
const userCredential = await signInWithEmailAndPassword(auth, email, password);
const user = userCredential.user;
const idToken = await user.getIdToken();

// 세션 저장
if (keepLogin) {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userId', userId);
} else {
    sessionStorage.setItem('isLoggedIn', 'true');
    sessionStorage.setItem('userId', userId);
}
```

---

### 2. 부동산 평가 시스템 (prop2/)

#### 파일 구성
- `prop.html`: 평가 입력 UI
- `script.js`: 계산 엔진 & Firebase 연동
- `styles.css`: 스타일링

#### 계산 로직 (NOI 기반)
```javascript
// 1. NOI (Net Operating Income) 계산
const annualRentIncome = (monthlyRent + adIncome + parkingIncome + otherIncome) * 12 
                       + (deposit * capRate / 100);
const annualFacilityIncome = facilityCosts * (managementReturnRate / 100) * 12;
const noi = annualRentIncome + annualFacilityIncome;

// 2. 기본가치 계산
const baseValue = noi / (capRate / 100);

// 3. 등급별 계수 적용
const totalFactor = locationFactor + stabilityFactor + accessFactor + facilityFactor;
const marketValue = baseValue * (1.0 + totalFactor);

// 4. 잠재가치 계산
const potentialValue = (noi * 0.88) * ((currentVacancy - regionalVacancy) / 100) / (capRate / 100);

// 5. 성장가치
const hbuValue = marketValue + potentialValue;
```

#### 사용 예시
```javascript
// 1. 입력값 설정
물건명: "CNS 비지니스센터"
월간 임대료: 5,000,000원
보증금: 100,000,000원
입지등급: 1등급
매매기준 수익률: 4.3%

// 2. 계산하기 버튼 클릭

// 3. 결과 확인
Market Value: 1,500백만원
NOI: 64.5백만원
Cap Rate: 4.3%

// 4. 상세 정보 입력 및 저장
조사담당자: "홍길동"
조사일자: 2025년 1월 15일
확인시설: 실외환경, 주차/접근로
검토의견: "우수한 입지, 투자 가치 높음"

// 5. PDF 저장 또는 CSV 다운로드
```

#### 데이터 저장 구조
```javascript
// Firebase에 저장되는 데이터
propertyCalculator/
├── history/{id}
│   └── {
│       id: 1759204927829,
│       timestamp: "2025-01-15 14:30:00",
│       propertyName: "CNS 비지니스센터",
│       currentValue: 1500000000,
│       noi: 64500000,
│       capRate: 4.3,
│       // ... 기타 계산 결과
│   }
│
├── inputs/{id}
│   └── {
│       inputs: {
│           propertyName: "CNS 비지니스센터",
│           monthlyRent: "5000000",
│           // ... 모든 입력값
│       },
│       detailedInfo: {
│           investigatorName: "홍길동",
│           investigationYear: "2025",
│           // ... 상세 정보
│       }
│   }
│
└── trash/{id}           # 삭제된 항목 (30일 보관)
    └── {
        id: 1759204927829,
        deletedAt: 1759210000000,
        expiresAt: 1761802000000,
        historyItem: {...},
        inputData: {...}
    }
```

---

### 3. 관리자 시스템

#### 페이지 구성
1. **admin.html**: 대시보드
   - 전체 사용자 통계
   - 승인 대기 현황
   - 시스템 상태

2. **user-management.html**: 사용자 관리
   - 사용자 목록 조회
   - 비밀번호 변경
   - 권한 수정

3. **approval.html**: 승인 관리
   - 회원가입 요청 조회
   - 승인/거부 처리
   - 상태별 필터링

4. **data-recovery.html**: 데이터 관리 (휴지통)
   - 삭제된 데이터 복구
   - 30일 자동 정리
   - 영구 삭제

#### 권한 체크 방식
```javascript
// localStorage 기반 빠른 체크
const isLoggedIn = localStorage.getItem('isLoggedIn');
const userRole = localStorage.getItem('userRole');

if (isLoggedIn !== 'true' || userRole !== 'admin') {
    window.location.href = 'index.html';
    return;
}
```

---

### 4. 일정 관리 시스템

#### Court_sche (소송일정표)
```javascript
// 일정 추가 예시
{
    date: "2025-01-15",
    title: "민사소송 1심",
    description: "서울중앙지방법원",
    type: "court",
    timestamp: 1759204927829
}
```

#### Sales_sche (영업현황표)
- Excel 업로드 기능
- 데이터 시각화
- Firebase 실시간 동기화

---

## 🔄 실행 흐름

### 1. 로그인 프로세스

```
[index.html] 사용자 접속
      ↓
Firebase Auth 체크
      ↓
   로그인 여부?
   ┌─────┴─────┐
  YES          NO
   ↓            ↓
자동 리다이렉트  로그인 폼 표시
   ↓
Firebase DB에서 role 확인
   ┌─────┴─────┐
 admin       user
   ↓            ↓
admin.html  main.html
```

### 2. 부동산 평가 프로세스

```
[prop.html] 폼 입력
      ↓
입력값 수집 (collectFormData)
      ↓
계산 실행 (calculateValue)
  ├─ NOI 계산
  ├─ 기본가치 계산
  ├─ 등급 계수 적용
  └─ 잠재가치 계산
      ↓
히스토리 추가 (addToHistory)
  ├─ 로컬 메모리 저장
  ├─ localStorage 백업
  └─ Firebase 동기화
      ↓
테이블 렌더링 + 모달 표시
      ↓
[선택사항] 상세 정보 입력
      ↓
"상세 정보 저장" 클릭
      ↓
Firebase에 detailedInfo 저장
      ↓
PDF 저장 또는 CSV 다운로드
```

### 3. 휴지통 시스템 프로세스

```
사용자가 '선택 삭제' 클릭
      ↓
확인 대화상자
      ↓
moveToTrash() 실행
  ├─ Firebase trash/ 경로에 저장
  ├─ deletedAt: 현재시간
  └─ expiresAt: 30일 후
      ↓
원본 데이터에서 제거
  ├─ Firebase history/inputs 삭제
  └─ 로컬 메모리 제거
      ↓
테이블 자동 새로고침
      ↓
[30일 후] cleanupExpiredTrash()
      ↓
만료된 항목 영구 삭제
```

---

## 💡 사용 예시

### 예시 1: 일반 사용자 워크플로우

#### 단계별 설명
```
1️⃣ 회원가입
   index.html → "회원가입" 버튼
   ↓
   signup.html에서 정보 입력
   ├─ 이름: 홍길동
   ├─ 아이디: hong123
   ├─ 비밀번호: Hong123!@#
   ├─ 이메일: hong@cns.com
   └─ 부서: 영업팀
   ↓
   "가입 신청" 클릭
   ↓
   Firebase에 status: "pending" 저장
   ↓
   관리자 승인 대기

2️⃣ 관리자 승인 (admin00 계정)
   approval.html 접속
   ↓
   "승인 대기" 필터 클릭
   ↓
   hong123 선택 → "승인" 버튼
   ↓
   status: "approved" 업데이트

3️⃣ 로그인 및 사용
   index.html
   ↓
   hong123 / Hong123!@# 입력
   ↓
   main.html로 이동
   ↓
   "부동산 가치 계산기" 메뉴 클릭
   ↓
   prop2/prop.html에서 평가 수행
```

---

### 예시 2: 부동산 평가 전체 프로세스

```javascript
// 1. 입력 단계
물건명: "강남 오피스빌딩"
주소: "서울시 강남구 테헤란로 123"
월간 임대료: 10,000,000원
보증금: 200,000,000원
광고수익: 500,000원
입지등급: 1등급 (핵심입지)
임대안정성: 2등급 (공기업 위주)
매매기준 수익률: 4.3%

// 2. 계산 결과
NOI: 138백만원/년
Market Value: 3,209백만원
Value-Add Potential: 50백만원
HBU Value: 3,259백만원

// 3. 상세 정보 입력
조사담당자: "김철수"
조사일자: 2025년 1월 15일
확인시설: ✓ 실외환경, ✓ 주차/접근로, ✓ 실내환경
확인자: "이영희"
검토의견: "
- 입지 우수: 지하철역 도보 5분
- 주차시설 양호: 200대 수용
- 시설 노후: 5년 내 리모델링 권장
- 투자 가치: 중장기 보유 추천
"

// 4. 저장 및 다운로드
"상세 정보 저장" → Firebase 저장
"PDF 저장" → PDF 파일 다운로드
"모든자료 내려받기" → CSV 파일 다운로드
```

---

### 예시 3: 데이터 복구 시나리오

```
❌ 실수로 데이터 삭제
   prop2/prop.html
   ↓
   "강남 오피스빌딩" 선택
   ↓
   "선택 삭제" 클릭
   ↓
   "선택한 결과를 삭제하시겠습니까?" → 확인
   ↓
   휴지통으로 이동 (30일 보관)

✅ 데이터 복구
   data-recovery.html 접속
   ↓
   삭제된 항목 목록 확인
   ├─ 물건명: 강남 오피스빌딩
   ├─ 삭제일: 2025-01-15 14:30
   ├─ 만료일: 2025-02-14 (29일 남음)
   └─ Market Value: 3,209백만원
   ↓
   체크박스 선택 → "선택 복구" 클릭
   ↓
   "1개 항목을 복구하시겠습니까?" → 확인
   ↓
   prop2/prop.html에서 데이터 복원됨!
```

---

## 👨‍💻 개발 가이드

### 1. 새로운 기능 추가하기

#### 예: 새로운 평가 항목 추가

**Step 1: HTML에 입력 필드 추가**
```html
<!-- prop2/prop.html -->
<div class="form-group">
    <label for="buildingAge">건물 연한(년):</label>
    <input type="number" id="buildingAge" name="buildingAge" 
           value="0" min="0" max="100">
    <div class="help-text">신축 후 경과 연수</div>
</div>
```

**Step 2: JavaScript에서 데이터 수집**
```javascript
// prop2/script.js - collectFormData()
collectFormData() {
    return {
        // 기존 필드들...
        buildingAge: document.getElementById('buildingAge').value || '0',
    };
}
```

**Step 3: 계산 로직에 적용**
```javascript
// calculateValue()
const buildingAge = parseInt(formData.buildingAge) || 0;
const ageFactor = buildingAge > 20 ? -0.01 : 0;
const totalFactor = locFactor + stabFactor + accFactor + facFactor + ageFactor;
```

**Step 4: CSV 다운로드에 추가**
```javascript
// exportAllData()
csv += '건물 연한(년),' + // 헤더
csv += `${inputs.buildingAge || ''},` + // 데이터
```

---

### 2. Firebase 데이터 읽기/쓰기

#### 데이터 읽기 (실시간)
```javascript
import { getDatabase, ref, onValue } from "firebase/database";

const db = getDatabase();
const historyRef = ref(db, 'propertyCalculator/history');

onValue(historyRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        this.history = Object.values(data);
        renderTable();
    }
});
```

#### 데이터 쓰기
```javascript
import { ref, set, push } from "firebase/database";

// 새 항목 추가
const historyRef = ref(db, 'propertyCalculator/history');
const newItemRef = push(historyRef);
await set(newItemRef, {
    id: Date.now(),
    propertyName: "테스트",
    // ... 기타 데이터
});
```

#### 데이터 삭제
```javascript
import { ref, remove } from "firebase/database";

const itemRef = ref(db, `propertyCalculator/history/${itemId}`);
await remove(itemRef);
```

---

### 3. 디버깅 팁

#### 콘솔 로그 활용
```javascript
// 데이터 구조 확인
console.log('InputsStore:', calculator.inputsStore);
console.log('History:', calculator.getHistory());

// Firebase 연결 상태 확인
console.log('Firebase 연결:', calculator.isFirebaseConnected);
```

#### Chrome DevTools 활용
```
F12 → Application 탭
├── Local Storage
│   ├── isLoggedIn
│   ├── userId
│   ├── userRole
│   ├── propertyHistory
│   └── propertyInputs
│
└── Session Storage
    └── (로그인 유지 체크 안 한 경우)
```

#### Firebase 콘솔 직접 확인
```
1. https://console.firebase.google.com/
2. 프로젝트: csy-todo-test
3. Realtime Database → 데이터 탭
4. 경로 탐색:
   - users/ (사용자 정보)
   - propertyCalculator/ (부동산 평가)
   - scheduleData/ (일정)
```

---

## 🔒 보안 정책

### 1. 인증 흐름
```
사용자 로그인 시도
      ↓
Firebase Authentication 검증
      ↓
ID 토큰 발급 (1시간 유효)
      ↓
5분마다 자동 갱신 (admin.js)
      ↓
만료 시 자동 로그아웃
```

### 2. 권한 레벨
- **admin**: 모든 기능 접근 가능
- **user**: 일반 기능만 접근 (부동산 평가, 일정 조회)
- **pending**: 승인 대기 (로그인 불가)
- **rejected**: 승인 거부 (로그인 불가)

### 3. Firebase Security Rules
```json
{
  "users": {
    "$uid": {
      // 본인 데이터 또는 관리자만 읽기
      ".read": "auth.uid === $uid || root.child('meta/admins').child(auth.uid).val() === true",
      // 신규 생성은 본인, 수정은 관리자만
      ".write": "!data.exists() || root.child('meta/admins').child(auth.uid).val() === true"
    }
  },
  "propertyCalculator": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

---

## 📝 주요 코드 패턴

### 1. Firebase 초기화 (모든 페이지 공통)
```javascript
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBIaa_uz9PaofNXZjHpgkm-wjT4qhaN-vM",
    authDomain: "csy-todo-test.firebaseapp.com",
    databaseURL: "https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "csy-todo-test",
    storageBucket: "csy-todo-test.firebasestorage.app",
    messagingSenderId: "841236508097",
    appId: "1:841236508097:web:18fadfa64353a25a61d340"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
```

### 2. 에러 처리 패턴
```javascript
try {
    // Firebase 작업
    await set(ref(database, 'path'), data);
    console.log('저장 성공');
} catch (error) {
    console.error('저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
}
```

### 3. 데이터 마이그레이션 패턴
```javascript
// 기존 구조와 새 구조 모두 지원
migrateInputsData(data) {
    const migratedData = {};
    for (const [id, item] of Object.entries(data)) {
        if (item.inputs) {
            // 새 구조: 그대로 사용
            migratedData[id] = item;
        } else {
            // 기존 구조: 변환
            migratedData[id] = {
                inputs: item,
                detailedInfo: {...}
            };
        }
    }
    return migratedData;
}
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 신규 사용자 등록부터 평가까지

```
1. 회원가입
   URL: signup.html
   입력:
   - 이름: 테스트사용자
   - 아이디: test001
   - 비밀번호: Test123!@#
   - 이메일: test001@cns.com
   - 부서: 투자팀
   
   결과: "승인 대기중" 메시지

2. 관리자 승인
   admin00 로그인
   ↓
   approval.html
   ↓
   test001 선택 → "승인"
   
   결과: status = "approved"

3. 사용자 로그인
   test001 / Test123!@# 로그인
   ↓
   main.html 진입

4. 부동산 평가
   "부동산 가치 계산기" 클릭
   ↓
   prop2/prop.html
   ↓
   데이터 입력 및 계산
   ↓
   결과 저장

5. 데이터 확인
   히스토리 테이블에서 확인
   더블클릭 → 상세 결과 모달
```

### 시나리오 2: 데이터 백업 및 복구

```
1. 정기 백업
   prop2/prop.html
   ↓
   "모든자료 내려받기" 클릭
   ↓
   부동산_전체자료_2025-01-15.csv 다운로드
   ↓
   안전한 위치에 보관

2. 실수로 삭제
   중요 데이터 선택
   ↓
   "선택 삭제" 클릭
   ↓
   휴지통으로 이동

3. 복구
   data-recovery.html 접속
   ↓
   삭제된 항목 확인
   ↓
   "선택 복구" 클릭
   ↓
   원본 위치로 복원
```

---

## 🛠️ 트러블슈팅

### 문제 1: Firebase 연결 안 됨
```
증상: "Firebase 연결되지 않음" 경고 표시

해결:
1. 네트워크 연결 확인
2. F12 → Console에서 에러 확인
3. Firebase 프로젝트 상태 확인
4. "재연결" 버튼 클릭
```

### 문제 2: 로그인 후 바로 로그아웃됨
```
원인: Firebase Auth 토큰 만료 또는 권한 부족

해결:
1. F12 → Console에서 에러 로그 확인
2. localStorage 확인:
   - isLoggedIn
   - userRole
   - userId
3. Firebase 콘솔에서 users/{uid} 확인:
   - role: "admin" 또는 "user"
   - status: "approved"
```

### 문제 3: CSV 다운로드 시 데이터 누락
```
원인: 상세 정보를 저장하지 않음

해결:
1. 결과 모달 열기 (더블클릭 또는 "결과 불러오기")
2. 상세 정보 입력
3. "상세 정보 저장" 버튼 클릭 ⚠️ (중요!)
4. 다시 CSV 다운로드
```

### 문제 4: 테이블에 삭제한 데이터가 남아있음
```
원인: Firebase 삭제 실패 또는 실시간 동기화 지연

해결:
1. 페이지 새로고침 (F5)
2. Firebase 연결 상태 확인
3. 콘솔에서 에러 로그 확인
4. 다시 삭제 시도
```

### 문제 5: PDF 생성 시 한글 깨짐
```
원인: 시스템 폰트 부족

해결:
1. "폰트 선택(TTF/OTF 임베드)" 버튼 클릭
2. 한글 폰트 파일 업로드 (예: 나눔고딕.ttf)
3. "폰트 적용" 클릭
4. PDF 저장
```

---

## 📊 데이터 흐름도

```
┌─────────────┐
│  사용자 입력  │
└──────┬──────┘
       ↓
┌─────────────┐
│ 로컬 메모리  │ ← PropertyCalculator 클래스
│ (this.history)│
└──────┬──────┘
       ↓
┌─────────────┐
│localStorage │ ← 백업용 (브라우저 캐시)
└──────┬──────┘
       ↓
┌─────────────┐
│  Firebase   │ ← 영구 저장 (클라우드)
│  Realtime   │
│  Database   │
└──────┬──────┘
       ↓
┌─────────────┐
│실시간 동기화 │ ← onValue 리스너
│  (모든 기기) │
└─────────────┘
```

---

## 🎓 학습 순서 (신입 개발자 추천)

### Week 1: 기본 구조 파악
1. `index.html` + `script.js` → 로그인 흐름 이해
2. `main.html` + `main.js` → 사용자 대시보드
3. Firebase 콘솔 탐색 → 데이터 구조 확인

### Week 2: 핵심 모듈 학습
1. `prop2/script.js` → 계산 로직 이해
2. `admin.js` → 권한 체크 방식
3. `data-recovery.js` → 휴지통 시스템

### Week 3: 고급 기능
1. PDF 생성 (`html2pdf.js` 사용법)
2. CSV 다운로드 (인코딩 처리)
3. 데이터 마이그레이션 패턴

### Week 4: 실습 프로젝트
1. 새로운 평가 항목 추가해보기
2. 사용자 정의 리포트 기능 만들기
3. 데이터 검색 기능 추가해보기

---

## 🔑 주요 계정 정보

### 관리자 계정
- **ID**: admin00
- **Firebase**: meta/admins/{uid} = true
- **권한**: 모든 기능 접근 가능

### 일반 사용자 계정
- **가입**: signup.html에서 신청
- **승인**: 관리자가 approval.html에서 승인
- **권한**: 부동산 평가, 일정 조회 가능

---

## 📞 추가 리소스

### 문서
- `README.md`: 프로젝트 개요
- `SECURITY_IMPROVEMENTS.md`: 보안 개선사항
- `firebase-functions-setup.md`: Firebase Functions 설정
- `migration/README.md`: 데이터 마이그레이션 가이드
- `PDF_Editor/README.md`: PDF 편집기 사용법

### 외부 문서
- [Firebase 공식 문서](https://firebase.google.com/docs)
- [html2pdf.js 문서](https://github.com/eKoopmans/html2pdf.js)
- [Bootstrap 5 문서](https://getbootstrap.com/docs/5.3/)

---

## 🎉 시작하기

### 빠른 시작 (5분 안에)
```bash
# 1. 저장소 클론
git clone https://github.com/smokecs9-mikhail/CNS_WSP_TEST.git
cd CNS_WSP_TEST

# 2. 백엔드 서버 실행 (선택사항)
cd server
npm install
npm start

# 3. 프론트엔드 실행
# Live Server로 index.html 열기
# 또는
python -m http.server 8000

# 4. 브라우저에서 접속
# http://localhost:8000

# 5. 관리자로 로그인
# ID: admin00
# (비밀번호는 관리자에게 문의)
```

### 첫 작업 추천
1. ✅ 로그인 테스트 (admin00)
2. ✅ 부동산 평가 테스트 데이터 입력
3. ✅ CSV 다운로드 확인
4. ✅ 데이터 삭제 및 복구 테스트
5. ✅ 사용자 추가 및 승인 테스트

---

## 📈 개발 로드맵

### 현재 구현된 기능 ✅
- 사용자 인증 및 권한 관리
- 부동산 가치 평가 (NOI, Cap Rate)
- 상세 정보 저장 및 PDF/CSV 다운로드
- 휴지통 시스템 (30일 보관)
- 데이터 복구 관리 페이지
- 일정 관리 (소송, 영업)
- PDF 편집기

### 개발 중 🚧
- 시스템 설정 페이지
- 로그 관리 페이지
- KOSIS API 연동 (실제 API)

### 향후 계획 💡
- 대시보드 차트 및 통계
- 이메일 알림 기능
- 모바일 앱 연동
- 다국어 지원

---

## 🤝 기여 가이드

### Git 워크플로우
```bash
# 1. 브랜치 생성
git checkout -b feature/new-feature

# 2. 작업 수행
# 코드 수정...

# 3. 커밋 (영문 권장)
git add .
git commit -m "feat: Add new feature description"

# 4. 푸시
git push origin feature/new-feature

# 5. Pull Request 생성
# GitHub에서 PR 생성
```

### 커밋 메시지 규칙
```
feat: 새로운 기능 추가
fix: 버그 수정
refactor: 코드 리팩토링
docs: 문서 수정
style: 코드 스타일 변경
test: 테스트 코드
chore: 빌드/설정 변경
```

---

## 🆘 도움말

### 질문이 있을 때
1. 이 문서의 트러블슈팅 섹션 확인
2. 각 모듈의 README.md 확인
3. Console 로그 확인
4. Firebase 콘솔에서 데이터 직접 확인
5. 팀 리더에게 문의

### 긴급 상황
- **데이터 손실**: data-recovery.html에서 복구 시도
- **로그인 불가**: Firebase Auth 상태 확인
- **서버 다운**: server/ 디렉토리에서 재시작

---

## 📌 중요 체크리스트

### 개발 시작 전
- [ ] Firebase 프로젝트 접근 권한 확인
- [ ] Node.js 설치 확인 (v14+)
- [ ] Git 설정 확인
- [ ] 테스트 계정 받기

### 배포 전
- [ ] Firebase Security Rules 업데이트
- [ ] API 키 도메인 제한 설정
- [ ] 환경변수 설정 (.env)
- [ ] CORS Origin 화이트리스트 업데이트
- [ ] 프로덕션 빌드 테스트

### 코드 작성 시
- [ ] 한글 주석 작성
- [ ] 명확한 변수명 사용
- [ ] 에러 처리 추가
- [ ] 콘솔 로그로 디버깅
- [ ] Firebase 연결 상태 체크

---

## 🎯 마무리

이 문서는 CNS Corporation 업무지원 시스템의 전체적인 구조와 실행 흐름을 설명합니다. 
신입 개발자는 이 문서를 참고하여 시스템을 이해하고, 새로운 기능을 추가하거나 유지보수할 수 있습니다.

**Good Luck! 🚀**

---

**최종 수정일**: 2025-09-30  
**문서 버전**: 1.0.0  
**작성자**: CNS Development Team
