document.addEventListener('DOMContentLoaded', function() {
    const userDept = document.getElementById('userDept');
    const userName = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');
    const salesStatusMenu = document.getElementById('salesStatusMenu');
    const propertyCalculatorMenu = document.getElementById('propertyCalculatorMenu');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const contentFrame = document.getElementById('contentFrame');
    const workScheduleMenu = document.getElementById('workScheduleMenu');
    const pdfEditorMenu = document.getElementById('pdfEditorMenu');
    
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

    // PDF편집기 메뉴 클릭 이벤트
    if (pdfEditorMenu) {
        pdfEditorMenu.addEventListener('click', function(e) {
            e.preventDefault();
            loadPdfEditor();
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

    // 로그인 상태 확인 함수 - Firebase Auth 토큰 검증 강화
    function checkLoginStatus() {
        // Firebase Auth 상태 확인
        import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js').then(({ getAuth, onAuthStateChanged }) => {
            import('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js').then(({ initializeApp, getApp }) => {
                // Firebase 앱 초기화 (이미 초기화된 경우 getApp 사용)
                let app;
                try {
                    app = getApp();
                } catch (error) {
                    // 앱이 초기화되지 않은 경우 초기화
                    const firebaseConfig = {
                        apiKey: "AIzaSyBIaa_uz9PaofNXZjHpgkm-wjT4qhaN-vM",
                        authDomain: "csy-todo-test.firebaseapp.com",
                        databaseURL: "https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app",
                        projectId: "csy-todo-test",
                        storageBucket: "csy-todo-test.firebasestorage.app",
                        messagingSenderId: "841236508097",
                        appId: "1:841236508097:web:18fadfa64353a25a61d340"
                    };
                    app = initializeApp(firebaseConfig);
                }
                const auth = getAuth(app);
                
                onAuthStateChanged(auth, async (user) => {
                    if (!user) {
                        // Firebase Auth에 로그인되지 않은 경우
                        clearAuthData();
                        window.location.href = 'index.html';
                        return;
                    }
                    
                    try {
                        // ID 토큰 검증
                        const idToken = await user.getIdToken();
                        if (!idToken) {
                            throw new Error('유효하지 않은 토큰');
                        }
                        
                        // 토큰 만료 시간 확인 (5분 전에 갱신)
                        const tokenResult = await user.getIdTokenResult();
                        const expirationTime = new Date(tokenResult.expirationTime).getTime();
                        const currentTime = Date.now();
                        
                        if (expirationTime - currentTime < 5 * 60 * 1000) {
                            // 토큰이 5분 이내에 만료되면 갱신
                            await user.getIdToken(true);
                        }
                        
                        // 사용자 정보 표시
                        const storedUserName = localStorage.getItem('userName') || sessionStorage.getItem('userName');
                        if (storedUserName) {
                            userName.textContent = `${storedUserName}님`;
                        } else {
                            userName.textContent = `${user.email?.split('@')[0] || '사용자'}님`;
                        }
                        userDept.textContent = '일반 사용자';
                        
                    } catch (error) {
                        console.error('토큰 검증 실패:', error);
                        clearAuthData();
                        window.location.href = 'index.html';
                    }
                });
            });
        }).catch(error => {
            console.error('Firebase 모듈 로드 실패:', error);
            // 폴백: 기존 방식으로 검증
            const isLoggedIn = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
            if (isLoggedIn !== 'true') {
                window.location.href = 'index.html';
            }
        });
    }
    
    // 인증 데이터 정리 함수
    function clearAuthData() {
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
        
        // iframe에 sche.html 로드
        contentFrame.src = 'Sales_sche/Salse_sche.html';
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

        // iframe에 Court_sche/Court_sche.html 로드
        contentFrame.src = 'Court_sche/Court_sche.html';
        contentFrame.style.display = 'block';

        // 메뉴 활성화 상태 업데이트
        updateMenuActiveState(workScheduleMenu);
    }

    // PDF편집기 로드 함수
    function loadPdfEditor() {
        // 웰컴 메시지 숨기기
        welcomeMessage.style.display = 'none';

        // iframe에 PDF_Editor/PDFeditor.html 로드
        contentFrame.src = 'PDF_Editor/PDFeditor.html';
        contentFrame.style.display = 'block';

        // 메뉴 활성화 상태 업데이트
        updateMenuActiveState(pdfEditorMenu);
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
