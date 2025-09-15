// Firebase 설정 파일 (보안 강화)
// 실제 프로덕션에서는 환경변수나 서버에서 설정을 가져와야 함

export const firebaseConfig = {
    // ⚠️ 주의: 실제 프로덕션에서는 환경변수 사용 권장
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBIaa_uz9PaofNXZjHpgkm-wjT4qhaN-vM",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "csy-todo-test.firebaseapp.com",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: process.env.FIREBASE_PROJECT_ID || "csy-todo-test",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "csy-todo-test.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "841236508097",
    appId: process.env.FIREBASE_APP_ID || "1:841236508097:web:18fadfa64353a25a61d340"
};

// KOSIS API 설정
export const kosisConfig = {
    apiKey: process.env.KOSIS_API_KEY || "MDM1MGMwN2NmYjc2NDgyMGI0M2Y5YmE0NWJhYzllMDQ=",
    baseUrl: "https://kosis.kr/openapi/statisticsList.do"
};

// 관리자 계정 설정 (프로덕션에서는 더 강력한 비밀번호 사용)
export const adminConfig = {
    id: process.env.ADMIN_ID || "admin",
    password: process.env.ADMIN_PASSWORD || "0000" // ⚠️ 프로덕션에서는 변경 필요
};
