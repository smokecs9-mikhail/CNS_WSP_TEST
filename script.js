import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, set, push } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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

    // 로그인 처리 함수
    async function handleLogin() {
        const userId = userIdInput.value.trim();
        const password = userPasswordInput.value;
        const keepLogin = keepLoginCheckbox.checked;

        try {
            // 관리자 계정 확인
            if (userId === 'admin' && password === '0000') {
                // 관리자 계정 로그인 성공
                errorMessage.textContent = '';
                
                // 로그인 정보 저장
                if (keepLogin) {
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('userId', userId);
                    localStorage.setItem('userRole', 'admin');
                    localStorage.setItem('keepLogin', 'true');
                } else {
                    sessionStorage.setItem('isLoggedIn', 'true');
                    sessionStorage.setItem('userId', userId);
                    sessionStorage.setItem('userRole', 'admin');
                }

                // 관리자 페이지로 이동
                window.location.href = 'admin.html';
                return;
            }

            // Firebase에서 사용자 확인
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const users = snapshot.val() || {};
            
            // 사용자 찾기
            const user = Object.values(users).find(u => u.id === userId && u.password === password);
            
            if (user && user.status === 'approved') {
                // 회원가입된 사용자 로그인 성공
                errorMessage.textContent = '';
                
                // 로그인 정보 저장
                if (keepLogin) {
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('userId', userId);
                    localStorage.setItem('userName', user.name);
                    localStorage.setItem('userRole', user.role);
                    localStorage.setItem('keepLogin', 'true');
                } else {
                    sessionStorage.setItem('isLoggedIn', 'true');
                    sessionStorage.setItem('userId', userId);
                    sessionStorage.setItem('userName', user.name);
                    sessionStorage.setItem('userRole', user.role);
                }

                // 권한에 따른 페이지 이동
                if (user.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'main.html';
                }
            } else if (user && user.status === 'pending') {
                // 승인 대기 중인 사용자
                errorMessage.textContent = '승인 대기 중입니다. 관리자의 승인을 기다려주세요.';
            } else {
                // 로그인 실패
                errorMessage.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
            }
        } catch (error) {
            console.error('로그인 오류:', error);
            errorMessage.textContent = '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
        }
    }

    // 로그인 상태 확인 함수
    function checkLoginStatus() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
        const userRole = localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
        
        if (isLoggedIn === 'true') {
            // 로그인 상태라면 계정 권한에 따라 적절한 페이지로 이동
            if (userRole === 'admin') {
                window.location.href = 'admin.html';
            } else if (userRole === 'user') {
                window.location.href = 'main.html';
            }
        }
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
