document.addEventListener('DOMContentLoaded', function() {
    const userDept = document.getElementById('userDept');
    const userName = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');
    const salesStatusMenu = document.getElementById('salesStatusMenu');
    const propertyCalculatorMenu = document.getElementById('propertyCalculatorMenu');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const contentFrame = document.getElementById('contentFrame');
    const workScheduleMenu = document.getElementById('workScheduleMenu');
    
    // 모바일 메뉴 관련 요소들
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.querySelector('.sidebar');

    // 로그인 상태 확인
    checkLoginStatus();

    // 로그아웃 버튼 이벤트
    logoutBtn.addEventListener('click', function() {
        logout();
    });

    // 영업현황표 메뉴 클릭 이벤트
    salesStatusMenu.addEventListener('click', function(e) {
        e.preventDefault();
        loadSalesStatus();
    });

    // 부동산가치계산기 메뉴 클릭 이벤트
    if (propertyCalculatorMenu) {
        propertyCalculatorMenu.addEventListener('click', function(e) {
            e.preventDefault();
            loadPropertyCalculator();
        });
    }

    // 업무일정표 메뉴 클릭 이벤트
    if (workScheduleMenu) {
        workScheduleMenu.addEventListener('click', function(e) {
            e.preventDefault();
            loadWorkSchedule();
        });
    }

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

    // 로그인 상태 확인 함수
    function checkLoginStatus() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const userRole = localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
        
        if (isLoggedIn !== 'true' || userRole !== 'user') {
            // 사용자가 아니거나 로그인되지 않은 상태라면 로그인 페이지로 리다이렉트
            window.location.href = 'index.html';
            return;
        }

        // 사용자 정보 표시
        if (userId) {
            const storedUserName = localStorage.getItem('userName') || sessionStorage.getItem('userName');
            if (storedUserName) {
                userName.textContent = `${storedUserName}님`;
            } else {
                userName.textContent = `${userId}님`;
            }
            userDept.textContent = '일반 사용자';
        }
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

    // 영업현황표 로드 함수
    function loadSalesStatus() {
        // 웰컴 메시지 숨기기
        welcomeMessage.style.display = 'none';
        
        // iframe에 test_sche.html 로드
        contentFrame.src = 'sche000/test_sche.html';
        contentFrame.style.display = 'block';
        
        // 메뉴 활성화 상태 업데이트
        updateMenuActiveState(salesStatusMenu);
    }

    // 부동산가치계산기 로드 함수
    function loadPropertyCalculator() {
        // 웰컴 메시지 숨기기
        welcomeMessage.style.display = 'none';
        
        // iframe에 prop.html 로드
        contentFrame.src = 'prop2/prop.html';
        contentFrame.style.display = 'block';
        
        // 메뉴 활성화 상태 업데이트
        updateMenuActiveState(propertyCalculatorMenu);
    }

    // 업무일정표 로드 함수
    function loadWorkSchedule() {
        // 웰컴 메시지 숨기기
        welcomeMessage.style.display = 'none';

        // iframe에 WSD/wsd.html 로드
        contentFrame.src = 'WSD/wsd.html';
        contentFrame.style.display = 'block';

        // 메뉴 활성화 상태 업데이트
        updateMenuActiveState(workScheduleMenu);
    }

    // 메뉴 활성화 상태 업데이트 함수
    function updateMenuActiveState(activeMenu) {
        // 모든 메뉴에서 active 클래스 제거
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // 클릭된 메뉴에 active 클래스 추가
        activeMenu.parentElement.classList.add('active');
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
