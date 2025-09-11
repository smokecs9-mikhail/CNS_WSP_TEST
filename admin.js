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

    // 관리자 권한 확인
    checkAdminStatus();
    
    // 통계 업데이트
    updateStats();

    // 메뉴 이벤트 리스너
    userManagementMenu.addEventListener('click', () => loadUserManagement());
    approvalMenu.addEventListener('click', () => loadApprovalManagement());

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

    // 관리자 권한 확인 함수
    function checkAdminStatus() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const userRole = localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
        
        if (isLoggedIn !== 'true' || userRole !== 'admin') {
            // 관리자가 아니거나 로그인되지 않은 상태라면 로그인 페이지로 리다이렉트
            window.location.href = 'index.html';
            return;
        }

        // 관리자 정보 표시
        if (userId) {
            adminName.textContent = `${userId}님`;
            adminDept.textContent = '관리자';
        }
    }
    
    // 통계 업데이트 함수
    async function updateStats() {
        try {
            console.log('통계 업데이트 시작...');
            
            // Firebase에서 사용자 데이터 가져오기
            const response = await fetch('https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app/users.json');
            const usersData = await response.json() || {};
            
            console.log('Firebase에서 받은 데이터:', usersData);
            
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
    
    // 사용자 관리 페이지 로드
    function loadUserManagement() {
        // 사용자 관리 페이지로 이동
        window.location.href = 'user-management.html';
    }
    
    // 승인 관리 페이지 로드
    function loadApprovalManagement() {
        // 승인관리 페이지로 이동
        window.location.href = 'approval.html';
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

    // 로그아웃 함수
    function logout() {
        // 모든 로그인 정보 삭제
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userId');
        localStorage.removeItem('userRole');
        localStorage.removeItem('keepLogin');
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('userId');
        sessionStorage.removeItem('userRole');

        // 로그인 페이지로 리다이렉트
        window.location.href = 'index.html';
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
