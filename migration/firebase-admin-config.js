// Firebase Admin SDK 설정
// 주의: 실제 프로덕션에서는 서버 사이드에서 실행해야 합니다.

// Firebase Admin SDK는 브라우저에서 직접 사용할 수 없으므로
// 대신 Firebase Auth의 createUserWithEmailAndPassword를 사용합니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyBIaa_uz9PaofNXZjHpgkm-wjT4qhaN-vM",
    authDomain: "csy-todo-test.firebaseapp.com",
    databaseURL: "https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "csy-todo-test",
    storageBucket: "csy-todo-test.firebasestorage.app",
    messagingSenderId: "841236508097",
    appId: "1:841236508097:web:18fadfa64353a25a61d340"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// 마이그레이션 설정
const MIGRATION_CONFIG = {
    emailDomain: '@cnsinc.co.kr',
    defaultPassword: 'TempPassword123!', // 임시 비밀번호
    adminEmail: 'admin@cnsinc.co.kr',
    adminPassword: 'AdminPassword123!'
};

export { auth, database, MIGRATION_CONFIG };
