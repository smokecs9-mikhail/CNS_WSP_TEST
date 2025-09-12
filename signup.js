// 회원가입 페이지 JavaScript
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, push, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

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
    const signupForm = document.getElementById('signupForm');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const errorMessage = document.getElementById('errorMessage');
    
    // 비밀번호 확인 검증
    const password = document.getElementById('signupPassword');
    const confirmPassword = document.getElementById('confirmPassword');

    // 비밀번호 보기: 마우스 오버 시 표시, 마우스 아웃 시 숨김
    // (사용자 경험 향상을 위해 툴팁 제공)
    password.title = '마우스를 올리면 비밀번호가 표시됩니다';
    confirmPassword.title = '마우스를 올리면 비밀번호가 표시됩니다';
    function showPasswordOnHover(inputEl) {
        inputEl.addEventListener('mouseenter', () => {
            // 보안상 위험을 줄이기 위해 포커스된 경우에만 표시하도록 할 수도 있으나,
            // 요청에 따라 단순 마우스 오버로 표시 처리
            inputEl.type = 'text';
        });
        inputEl.addEventListener('mouseleave', () => {
            inputEl.type = 'password';
        });
        inputEl.addEventListener('blur', () => {
            // 포커스가 사라질 때는 항상 숨김
            inputEl.type = 'password';
        });
    }
    showPasswordOnHover(password);
    showPasswordOnHover(confirmPassword);
    
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
            // 1) RTDB에서 기존 사용자 중복 확인
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const users = snapshot.val() || {};

            const existingUser = Object.values(users).find(user => user.id === userId);
            if (existingUser) {
                // 승인 대기 중인 경우와 사용 중인 경우를 구분하여 안내
                if (existingUser.status === 'pending') {
                    showInfoPopup('이미 승인요청 중인 ID 입니다');
                } else {
                    showInfoPopup('이미 사용중인 ID 입니다');
                }
                return;
            }

            // 2) Firebase Auth 계정 생성 (이메일: {id}@cnsinc.co.kr)
            const email = `${userId}@cnsinc.co.kr`;
            let createdUid = null;
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, userPassword);
                createdUid = cred.user.uid;
            } catch (err) {
                if (err && err.code === 'auth/email-already-in-use') {
                    // Auth 상에서도 이미 사용 중이면 동일 팝업
                    showInfoPopup('이미 사용중인 ID 입니다');
                } else if (err && err.code === 'auth/weak-password') {
                    showError('비밀번호가 너무 약합니다. 더 복잡한 비밀번호를 사용해주세요.');
                } else {
                    showError('계정 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
                }
                return;
            }

            // 3) RTDB에 사용자 정보 저장 (비밀번호는 저장하지 않음)
            const newUser = {
                id: userId,
                name: userName,
                role: userRole,
                status: 'pending',
                createdAt: new Date().toISOString(),
                firebaseUid: createdUid,
                email: email
            };

            const newUserRef = push(ref(database, 'users'));
            await set(newUserRef, newUser);

            console.log('Auth/RTDB 사용자 등록 완료:', newUser);

            // 4) 아직 미승인 상태이므로 자동 로그인 방지 위해 로그아웃
            try { await signOut(auth); } catch (_) {}
            
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

    // 간단 안내 팝업 (모달 형태)
    function showInfoPopup(message) {
        // 오버레이 생성
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            display: flex; justify-content: center; align-items: center;
            z-index: 9999; animation: fadeIn 0.2s ease;
        `;

        // 팝업 컨테이너
        const popup = document.createElement('div');
        popup.style.cssText = `
            background: #fff;
            border-radius: 12px;
            padding: 28px 24px;
            max-width: 360px; width: 90%;
            text-align: center; box-shadow: 0 12px 28px rgba(0,0,0,0.25);
        `;

        popup.innerHTML = `
            <div style="margin-bottom: 14px;">
                <i class="fas fa-exclamation-circle" style="font-size: 36px; color: #d97706;"></i>
            </div>
            <div style="font-size: 16px; color: #333; margin-bottom: 18px;">${message}</div>
            <button id="popupOkBtn" style="
                background: #2B4A3A; color: #fff; border: none;
                padding: 10px 20px; border-radius: 8px; cursor: pointer;
                font-weight: 600; font-size: 14px;">
                확인
            </button>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const okBtn = popup.querySelector('#popupOkBtn');
        okBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
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
