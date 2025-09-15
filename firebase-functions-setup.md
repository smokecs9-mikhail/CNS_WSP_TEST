# Firebase Functions 설정 가이드

## 1. Firebase CLI 설치
```bash
npm install -g firebase-tools
```

## 2. Firebase 프로젝트 초기화
```bash
firebase login
firebase init functions
```

## 3. Functions 디렉토리에서 의존성 설치
```bash
cd functions
npm install firebase-admin
```

## 4. index.js 파일 수정
```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.updateUserPassword = functions.https.onCall(async (data, context) => {
    // 관리자 권한 확인
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
    }

    const { uid, newPassword } = data;
    
    try {
        // Firebase Auth에서 비밀번호 업데이트
        await admin.auth().updateUser(uid, {
            password: newPassword
        });
        
        return { success: true, message: '비밀번호가 성공적으로 변경되었습니다.' };
    } catch (error) {
        console.error('비밀번호 변경 오류:', error);
        throw new functions.https.HttpsError('internal', '비밀번호 변경 중 오류가 발생했습니다.');
    }
});

exports.updateUserData = functions.https.onCall(async (data, context) => {
    // 관리자 권한 확인
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
    }

    const { uid, userData } = data;
    
    try {
        // Firebase Database 업데이트
        await admin.database().ref(`migratedUsers/${uid}`).update(userData);
        
        return { success: true, message: '사용자 정보가 성공적으로 업데이트되었습니다.' };
    } catch (error) {
        console.error('사용자 정보 업데이트 오류:', error);
        throw new functions.https.HttpsError('internal', '사용자 정보 업데이트 중 오류가 발생했습니다.');
    }
});
```

## 5. Functions 배포
```bash
firebase deploy --only functions
```
