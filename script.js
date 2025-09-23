import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, set, push } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBIaa_uz9PaofNXZjHpgkm-wjT4qhaN-vM",
  authDomain: "csy-todo-test.firebaseapp.com",
  databaseURL: "https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "csy-todo-test",
  storageBucket: "csy-todo-test.firebasestorage.app",
  messagingSenderId: "841236508097",
  appId: "1:841236508097:web:18fadfa64353a25a61d340"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const userIdInput = document.getElementById('userId');
    const userPasswordInput = document.getElementById('userPassword');
    const keepLoginCheckbox = document.getElementById('keepLogin');
    const errorMessage = document.getElementById('errorMessage');
    const signupBtn = document.getElementById('signupBtn');

    // 페이지 로드 시 로그인 상태 확인
    checkLoginStatus();

    // 폼 제출 이벤트 처리
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });

    // 회원가입 버튼 이벤트 처리
    signupBtn.addEventListener('click', function() {
        window.location.href = 'signup.html';
    });

    // 로그인 처리 함수 (Firebase Auth 사용)
    async function handleLogin() {
        const userId = userIdInput.value.trim();
        const password = userPasswordInput.value;
        const keepLogin = keepLoginCheckbox.checked;

        try {
            // 이메일 형식으로 변환 (Firebase Auth는 이메일을 요구함)
            const email = `${userId}@cnsinc.co.kr`;
            
            // Firebase Auth로 로그인 시도
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;
            
            // Firebase Database에서 사용자 정보 가져오기 (단일 경로 조회로 최적화)
            // firebaseUid로 인덱스된 쿼리 사용 (Firebase 규칙에서 인덱스 설정 필요)
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const users = snapshot.val() || {};
            
            // UID로 매칭되는 사용자 찾기 (최소한의 데이터만 처리)
            let userData = null;
            for (const key in users) {
                if (users[key] && users[key].firebaseUid === firebaseUser.uid) {
                    // 필요한 최소 정보만 추출 (민감한 정보 제외)
                    userData = {
                        uid: key,
                        name: users[key].name,
                        email: users[key].email,
                        role: users[key].role,
                        status: users[key].status,
                        firebaseUid: users[key].firebaseUid
                    };
                    break;
                }
            }
            
            if (userData && userData.status === 'approved') {
                // 로그인 성공
                errorMessage.textContent = '';
                
                // 로그인 정보 저장
                if (keepLogin) {
                    // 로컬스토리지는 최소 정보만 저장
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('firebaseUid', firebaseUser.uid);
                    localStorage.setItem('keepLogin', 'true');
                } else {
                    sessionStorage.setItem('isLoggedIn', 'true');
                    sessionStorage.setItem('userId', userData.id);
                    sessionStorage.setItem('userName', userData.name);
                    sessionStorage.setItem('userRole', userData.role);
                    sessionStorage.setItem('userEmail', email);
                    sessionStorage.setItem('firebaseUid', firebaseUser.uid);
                }

                // 권한에 따른 페이지 이동
                if (userData.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'main.html';
                }
            } else if (userData && userData.status === 'pending') {
                // 승인 대기 중인 사용자
                await signOut(auth); // Firebase Auth에서 로그아웃
                errorMessage.textContent = '승인 대기 중입니다. 관리자의 승인을 기다려주세요.';
            } else {
                // 사용자 정보가 없거나 승인되지 않음
                await signOut(auth); // Firebase Auth에서 로그아웃
                errorMessage.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
            }
        } catch (error) {
            console.error('로그인 오류:', error);
            if (error.code === 'auth/user-not-found') {
                errorMessage.textContent = '존재하지 않는 사용자입니다.';
            } else if (error.code === 'auth/wrong-password') {
                errorMessage.textContent = '비밀번호가 올바르지 않습니다.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage.textContent = '이메일 형식이 올바르지 않습니다.';
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage.textContent = '너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.';
            } else {
                errorMessage.textContent = '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
            }
        }
    }

    // 로그인 상태 확인 함수 (Firebase Auth 사용)
    function checkLoginStatus() {
        onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Firebase Auth에 로그인된 사용자가 있음
                try {
                    // 사용자 정보 가져오기 (단일 경로 조회로 최적화)
                    const usersRef = ref(database, 'users');
                    const snapshot = await get(usersRef);
                    const users = snapshot.val() || {};
                    let userData = null;
                    for (const key in users) {
                        if (users[key] && users[key].firebaseUid === firebaseUser.uid) {
                            // 필요한 최소 정보만 추출 (민감한 정보 제외)
                            userData = {
                                uid: key,
                                name: users[key].name,
                                email: users[key].email,
                                role: users[key].role,
                                status: users[key].status,
                                firebaseUid: users[key].firebaseUid
                            };
                            break;
                        }
                    }
                    
                    if (userData && userData.status === 'approved') {
                        // 로그인 정보 저장
                        const isKeepLogin = localStorage.getItem('keepLogin') === 'true';
                        if (isKeepLogin) {
                            // 로컬스토리지는 최소 정보만 유지
                            localStorage.setItem('isLoggedIn', 'true');
                            localStorage.setItem('firebaseUid', firebaseUser.uid);
                        } else {
                            sessionStorage.setItem('isLoggedIn', 'true');
                            sessionStorage.setItem('userId', userData.id);
                            sessionStorage.setItem('userName', userData.name);
                            sessionStorage.setItem('userRole', userData.role);
                            sessionStorage.setItem('userEmail', firebaseUser.email);
                            sessionStorage.setItem('firebaseUid', firebaseUser.uid);
                        }
                        
                        // 권한에 따른 페이지 이동
                        if (window.location.pathname !== '/index.html' && window.location.pathname !== '/' && !window.location.href.includes('index.html')) {
                            if (userData.role === 'admin') {
                                window.location.href = 'admin.html';
                            } else {
                                window.location.href = 'main.html';
                            }
                        }
                    } else {
                        // 사용자 정보가 없거나 승인되지 않음
                        await signOut(auth);
                    }
                } catch (error) {
                    console.error('사용자 정보 확인 오류:', error);
                    await signOut(auth);
                }
            }
        });
    }

    // 입력 필드 포커스 시 에러 메시지 초기화
    userIdInput.addEventListener('focus', function() {
        errorMessage.textContent = '';
    });

    userPasswordInput.addEventListener('focus', function() {
        errorMessage.textContent = '';
    });

    // Enter 키 이벤트 처리
    userPasswordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
});
