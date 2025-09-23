// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// Firebase 설정 (script.js와 동일)
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

document.addEventListener('DOMContentLoaded', function() {
    const adminName = document.getElementById('adminName');
    const adminDept = document.getElementById('adminDept');
    const logoutBtn = document.getElementById('logoutBtn');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const contentFrame = document.getElementById('contentFrame');
    
    // 메뉴 요소들
    const userManagementMenu = document.getElementById('userManagementMenu');
    const approvalMenu = document.getElementById('approvalMenu');
    
    // 통계 요소들
    const totalUsers = document.getElementById('totalUsers');
    const pendingUsers = document.getElementById('pendingUsers');
    const approvedUsers = document.getElementById('approvedUsers');
    
    // 모바일 메뉴 관련 요소들
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.querySelector('.sidebar');
    
    // 로그아웃 상태 플래그
    let isLoggingOut = false;

    // 관리자 권한 확인 - Firebase Auth 토큰 검증 강화
    checkAdminStatus();
    
    // 통계 업데이트
    updateStats();

    // 메뉴는 이제 직접 링크로 처리되므로 이벤트 리스너 불필요
    // 필요시 추가 기능을 위한 이벤트 리스너만 유지

    // 로그아웃 버튼 이벤트
    logoutBtn.addEventListener('click', function() {
        logout();
    });

    // 모바일 메뉴 토글 이벤트
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function() {
            toggleMobileMenu();
        });
    }

    // 모바일 오버레이 클릭 이벤트
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', function() {
            closeMobileMenu();
        });
    }

    // 관리자 권한 확인 함수 (Firebase Auth 사용)
    function checkAdminStatus() {
        onAuthStateChanged(auth, async (firebaseUser) => {
            // 로그아웃 중이면 리다이렉트하지 않음
            if (isLoggingOut) {
                return;
            }
            
            if (!firebaseUser) {
                // Firebase Auth에 로그인된 사용자가 없음
                clearAdminAuthData();
                window.location.href = 'index.html';
                return;
            }

            try {
                // ID 토큰 검증 및 갱신
                const idToken = await firebaseUser.getIdToken();
                if (!idToken) {
                    throw new Error('유효하지 않은 토큰');
                }
                
                // 토큰 만료 시간 확인 (5분 전에 갱신)
                const tokenResult = await firebaseUser.getIdTokenResult();
                const expirationTime = new Date(tokenResult.expirationTime).getTime();
                const currentTime = Date.now();
                
                if (expirationTime - currentTime < 5 * 60 * 1000) {
                    // 토큰이 5분 이내에 만료되면 갱신
                    await firebaseUser.getIdToken(true);
                }
                
                // 사용자 정보 가져오기 (users 기준, firebaseUid로 매칭)
                const usersRef = ref(database, 'users');
                const snapshot = await get(usersRef);
                const users = snapshot.val() || {};
                let userData = null;
                for (const key in users) {
                    if (users[key] && users[key].firebaseUid === firebaseUser.uid) {
                        userData = users[key];
                        break;
                    }
                }
                
                if (!userData || userData.role !== 'admin' || userData.status !== 'approved') {
                    // 관리자가 아니거나 승인되지 않은 사용자
                    await signOut(auth);
                    window.location.href = 'index.html';
                    return;
                }

                // 관리자 정보 표시
                adminName.textContent = `${userData.name}님`;
                adminDept.textContent = '관리자';
                
            } catch (error) {
                console.error('관리자 권한 확인 오류:', error);
                clearAdminAuthData();
                await signOut(auth);
                window.location.href = 'index.html';
            }
        });
    }
    
    // 관리자 인증 데이터 정리 함수
    function clearAdminAuthData() {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userId');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        localStorage.removeItem('firebaseUid');
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('userId');
        sessionStorage.removeItem('userRole');
        sessionStorage.removeItem('userName');
        sessionStorage.removeItem('firebaseUid');
    }
    
    // 통계 업데이트 함수 (users 기준)
    async function updateStats() {
        try {
            console.log('통계 업데이트 시작...');
            
            // users 데이터 가져오기
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const usersData = snapshot.val() || {};
            
            console.log('Firebase에서 받은 데이터(users):', usersData);
            
            const users = Object.values(usersData);
            console.log('사용자 배열:', users);
            
            const total = users.length;
            const pending = users.filter(user => user.status === 'pending').length;
            const approved = users.filter(user => user.status === 'approved').length;
            
            console.log('통계:', { total, pending, approved });
            
            totalUsers.textContent = total;
            pendingUsers.textContent = pending;
            approvedUsers.textContent = approved;
        } catch (error) {
            console.error('통계 업데이트 오류:', error);
            // 오류 시 기본값 표시
            totalUsers.textContent = '0';
            pendingUsers.textContent = '0';
            approvedUsers.textContent = '0';
        }
    }
    
    // migratedUsers 정리 로직은 더 이상 사용하지 않음
    
    // 사용자 관리 페이지 로드
    function loadUserManagement() {
        try {
            console.log('사용자 관리 페이지로 이동 중...');
            console.log('현재 URL:', window.location.href);
            console.log('이동할 URL:', 'user-management.html');
            
            // 여러 방법으로 페이지 이동 시도
            try {
                // 방법 1: window.location.href
                window.location.href = 'user-management.html';
            } catch (hrefError) {
                console.log('href 방법 실패, assign 시도:', hrefError);
                try {
                    // 방법 2: window.location.assign
                    window.location.assign('user-management.html');
                } catch (assignError) {
                    console.log('assign 방법 실패, replace 시도:', assignError);
                    // 방법 3: window.location.replace
                    window.location.replace('user-management.html');
                }
            }
            
            // 이동 확인을 위한 추가 로그
            setTimeout(() => {
                console.log('페이지 이동 후 URL:', window.location.href);
            }, 100);
            
        } catch (error) {
            console.error('사용자 관리 페이지 이동 오류:', error);
            alert('사용자 관리 페이지로 이동할 수 없습니다: ' + error.message);
        }
    }
    
    // 승인 관리 페이지 로드
    function loadApprovalManagement() {
        try {
            console.log('승인 관리 페이지로 이동 중...');
            // 승인관리 페이지로 이동
            window.location.href = 'approval.html';
        } catch (error) {
            console.error('승인 관리 페이지 이동 오류:', error);
            alert('승인 관리 페이지로 이동할 수 없습니다.');
        }
    }
    
    
    // 메뉴 활성 상태 업데이트
    function updateMenuActiveState(activeMenu) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        activeMenu.classList.add('active');
    }
    
    // 환영 메시지 숨기기
    function hideWelcomeMessage() {
        welcomeMessage.style.display = 'none';
    }

    // 로그아웃 함수 (리다이렉트 방지)
    async function logout() {
        try {
            console.log('로그아웃 시작...');
            
            // 로그아웃 상태 플래그 설정
            isLoggingOut = true;
            
            // 모든 로그인 정보 삭제 (Firebase Auth 로그아웃 전에)
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userId');
            localStorage.removeItem('userName');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('firebaseUid');
            localStorage.removeItem('keepLogin');
            sessionStorage.removeItem('isLoggedIn');
            sessionStorage.removeItem('userId');
            sessionStorage.removeItem('userName');
            sessionStorage.removeItem('userRole');
            sessionStorage.removeItem('userEmail');
            sessionStorage.removeItem('firebaseUid');

            console.log('로컬 스토리지 삭제 완료');

            // Firebase Auth에서 로그아웃
            await signOut(auth);
            console.log('Firebase Auth 로그아웃 완료');
            
            // 로그인 페이지로 리다이렉트 (즉시)
            console.log('index.html로 리다이렉트 중...');
            window.location.href = 'index.html';
            
        } catch (error) {
            console.error('로그아웃 오류:', error);
            // 오류가 발생해도 로그인 페이지로 이동
            window.location.href = 'index.html';
        }
    }

    // 모바일 메뉴 토글 함수
    function toggleMobileMenu() {
        if (sidebar && mobileOverlay) {
            const isOpen = sidebar.classList.contains('show');
            if (isOpen) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        }
    }

    // 모바일 메뉴 열기
    function openMobileMenu() {
        if (sidebar && mobileOverlay) {
            sidebar.classList.add('show');
            mobileOverlay.style.display = 'block';
            setTimeout(() => {
                mobileOverlay.classList.add('show');
            }, 10);
        }
    }

    // 모바일 메뉴 닫기
    function closeMobileMenu() {
        if (sidebar && mobileOverlay) {
            sidebar.classList.remove('show');
            mobileOverlay.classList.remove('show');
            setTimeout(() => {
                mobileOverlay.style.display = 'none';
            }, 300);
        }
    }

    // 페이지 새로고침 시에도 로그인 상태 유지
    window.addEventListener('beforeunload', function() {
        // 페이지를 떠날 때는 아무것도 하지 않음 (로그인 상태 유지)
    });
});
