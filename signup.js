// 회원가입 페이지 JavaScript
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, push, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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
    const signupForm = document.getElementById('signupForm');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const errorMessage = document.getElementById('errorMessage');
    
    // 비밀번호 확인 검증
    const password = document.getElementById('signupPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    
    confirmPassword.addEventListener('input', function() {
        if (password.value !== confirmPassword.value) {
            confirmPassword.setCustomValidity('비밀번호가 일치하지 않습니다.');
        } else {
            confirmPassword.setCustomValidity('');
        }
    });
    
    // 회원가입 폼 제출 처리
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const userName = document.getElementById('userName').value;
        const userId = document.getElementById('signupUserId').value;
        const userPassword = document.getElementById('signupPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;
        const agreeTerms = document.getElementById('agreeTerms').checked;
        const userRole = document.querySelector('input[name="userRole"]:checked').value;
        
        // 입력값 검증
        if (!userName || !userId || !userPassword || !confirmPass) {
            showError('모든 필드를 입력해주세요.');
            return;
        }
        
        if (userPassword !== confirmPass) {
            showError('비밀번호가 일치하지 않습니다.');
            return;
        }
        
        if (userPassword.length < 6) {
            showError('비밀번호는 6자 이상이어야 합니다.');
            return;
        }
        
        if (!agreeTerms) {
            showError('이용약관에 동의해주세요.');
            return;
        }
        
        try {
            // Firebase에서 기존 사용자 확인
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const users = snapshot.val() || {};
            
            // 중복 아이디 확인
            const existingUser = Object.values(users).find(user => user.id === userId);
            
            if (existingUser) {
                showError('이미 존재하는 아이디입니다.');
                return;
            }
            
            // 새 사용자 정보 생성
            const newUser = {
                id: userId,
                password: userPassword,
                name: userName,
                role: userRole,
                status: 'pending', // 승인 대기 상태
                createdAt: new Date().toISOString()
            };
            
            // Firebase에 사용자 정보 저장
            const newUserRef = push(ref(database, 'users'));
            await set(newUserRef, newUser);
            
            console.log('Firebase에 사용자 저장 완료:', newUser);
            
            // 승인 요청 완료 팝업 표시
            showApprovalRequestPopup();
            
        } catch (error) {
            console.error('회원가입 오류:', error);
            showError('회원가입 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
    });
    
    // 로그인 페이지로 돌아가기
    backToLoginBtn.addEventListener('click', function() {
        window.location.href = 'index.html';
    });
    
    // 에러 메시지 표시
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.style.color = '#e74c3c';
        errorMessage.style.backgroundColor = '#fdf2f2';
        errorMessage.style.border = '1px solid #fecaca';
    }
    
    // 성공 메시지 표시
    function showSuccess(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.style.color = '#059669';
        errorMessage.style.backgroundColor = '#f0fdf4';
        errorMessage.style.border = '1px solid #bbf7d0';
    }
    
    // 승인 요청 완료 팝업 표시
    function showApprovalRequestPopup() {
        // 팝업 오버레이 생성
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            animation: fadeIn 0.3s ease;
        `;
        
        // 팝업 컨테이너 생성
        const popup = document.createElement('div');
        popup.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 90%;
            animation: slideIn 0.3s ease;
        `;
        
        // 팝업 내용 생성
        popup.innerHTML = `
            <div style="margin-bottom: 20px;">
                <i class="fas fa-check-circle" style="font-size: 48px; color: #28a745; margin-bottom: 15px;"></i>
            </div>
            <h2 style="color: #333; margin-bottom: 15px; font-size: 24px; font-weight: 600;">승인 요청이 되었습니다</h2>
            <p style="color: #666; margin-bottom: 25px; line-height: 1.5;">
                회원가입이 성공적으로 완료되었습니다.<br>
                관리자의 승인을 기다려주세요.
            </p>
            <button id="confirmBtn" style="
                background: #2B4A3A;
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            ">확인</button>
        `;
        
        // 팝업을 오버레이에 추가
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        
        // 확인 버튼 이벤트 리스너
        const confirmBtn = popup.querySelector('#confirmBtn');
        confirmBtn.addEventListener('click', function() {
            // 팝업 제거
            document.body.removeChild(overlay);
            // 로그인 페이지로 이동
            window.location.href = 'index.html';
        });
        
        // 확인 버튼 호버 효과
        confirmBtn.addEventListener('mouseenter', function() {
            this.style.background = '#1e3a2e';
            this.style.transform = 'translateY(-2px)';
        });
        
        confirmBtn.addEventListener('mouseleave', function() {
            this.style.background = '#2B4A3A';
            this.style.transform = 'translateY(0)';
        });
        
        // 3초 후 자동으로 팝업 닫기 및 페이지 이동
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
                window.location.href = 'index.html';
            }
        }, 3000);
    }
});
