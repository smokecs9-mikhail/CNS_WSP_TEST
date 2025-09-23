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
                        
                        // Firebase Database에서 사용자 정보 재조회 (Auth 상태 기준)
                        const userData = await fetchUserDataFromDatabase(user.uid);
                        
                        if (userData && userData.status === 'approved') {
                            // 사용자 정보를 스토리지에 일관되게 저장
                            const isKeepLogin = localStorage.getItem('keepLogin') === 'true';
                            if (isKeepLogin) {
                                localStorage.setItem('isLoggedIn', 'true');
                                localStorage.setItem('userId', userData.uid);
                                localStorage.setItem('userRole', userData.role);
                                localStorage.setItem('userName', userData.name);
                                localStorage.setItem('firebaseUid', user.uid);
                            } else {
                                sessionStorage.setItem('isLoggedIn', 'true');
                                sessionStorage.setItem('userId', userData.uid);
                                sessionStorage.setItem('userRole', userData.role);
                                sessionStorage.setItem('userName', userData.name);
                                sessionStorage.setItem('firebaseUid', user.uid);
                            }
                            
                            // UI 업데이트
                            userName.textContent = `${userData.name}님`;
                            userDept.textContent = userData.role === 'admin' ? '관리자' : '일반 사용자';
                        } else {
                            // 승인되지 않은 사용자 또는 데이터 없음
                            clearAuthData();
                            await signOut(auth);
                            window.location.href = 'index.html';
                            return;
                        }
                        
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
    
    // 클라이언트 캐싱 시스템
    class ClientCache {
        constructor() {
            this.cachePrefix = 'cns_cache_';
            this.defaultTTL = 5 * 60 * 1000; // 5분 기본 TTL
            this.maxCacheSize = 50; // 최대 캐시 항목 수
        }

        // 캐시 키 생성
        getCacheKey(type, identifier) {
            return `${this.cachePrefix}${type}_${identifier}`;
        }

        // 캐시에서 데이터 조회
        get(type, identifier) {
            try {
                const cacheKey = this.getCacheKey(type, identifier);
                const cached = localStorage.getItem(cacheKey);
                
                if (!cached) {
                    return null;
                }

                const parsed = JSON.parse(cached);
                
                // 만료 시간 확인
                if (parsed.expires && Date.now() > parsed.expires) {
                    this.remove(type, identifier);
                    return null;
                }

                console.log(`클라이언트 캐시 히트: ${type}_${identifier}`);
                return parsed.data;
            } catch (error) {
                console.error('캐시 조회 오류:', error);
                return null;
            }
        }

        // 캐시에 데이터 저장
        set(type, identifier, data, ttl = this.defaultTTL) {
            try {
                const cacheKey = this.getCacheKey(type, identifier);
                const cacheData = {
                    data: data,
                    cachedAt: Date.now(),
                    expires: Date.now() + ttl
                };

                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                console.log(`클라이언트 캐시 저장: ${type}_${identifier}`);
                
                // 캐시 크기 관리
                this.cleanup();
            } catch (error) {
                console.error('캐시 저장 오류:', error);
            }
        }

        // 캐시에서 데이터 제거
        remove(type, identifier) {
            try {
                const cacheKey = this.getCacheKey(type, identifier);
                localStorage.removeItem(cacheKey);
                console.log(`클라이언트 캐시 제거: ${type}_${identifier}`);
            } catch (error) {
                console.error('캐시 제거 오류:', error);
            }
        }

        // 특정 타입의 모든 캐시 제거
        removeByType(type) {
            try {
                const keys = Object.keys(localStorage);
                const typePrefix = this.getCacheKey(type, '');
                
                keys.forEach(key => {
                    if (key.startsWith(typePrefix)) {
                        localStorage.removeItem(key);
                    }
                });
                console.log(`클라이언트 캐시 타입별 제거: ${type}`);
            } catch (error) {
                console.error('캐시 타입별 제거 오류:', error);
            }
        }

        // 만료된 캐시 정리
        cleanup() {
            try {
                const keys = Object.keys(localStorage);
                const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
                
                // 만료된 항목 제거
                let cleaned = 0;
                cacheKeys.forEach(key => {
                    try {
                        const cached = localStorage.getItem(key);
                        if (cached) {
                            const parsed = JSON.parse(cached);
                            if (parsed.expires && Date.now() > parsed.expires) {
                                localStorage.removeItem(key);
                                cleaned++;
                            }
                        }
                    } catch (error) {
                        // 손상된 캐시 항목 제거
                        localStorage.removeItem(key);
                        cleaned++;
                    }
                });

                // 캐시 크기 제한
                if (cacheKeys.length - cleaned > this.maxCacheSize) {
                    this.evictOldest();
                }

                if (cleaned > 0) {
                    console.log(`클라이언트 캐시 정리: ${cleaned}개 항목 제거`);
                }
            } catch (error) {
                console.error('캐시 정리 오류:', error);
            }
        }

        // 가장 오래된 캐시 항목 제거
        evictOldest() {
            try {
                const keys = Object.keys(localStorage);
                const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
                
                let oldestKey = null;
                let oldestTime = Date.now();
                
                cacheKeys.forEach(key => {
                    try {
                        const cached = localStorage.getItem(key);
                        if (cached) {
                            const parsed = JSON.parse(cached);
                            if (parsed.cachedAt && parsed.cachedAt < oldestTime) {
                                oldestTime = parsed.cachedAt;
                                oldestKey = key;
                            }
                        }
                    } catch (error) {
                        // 손상된 항목은 우선 제거 대상
                        if (!oldestKey) {
                            oldestKey = key;
                        }
                    }
                });
                
                if (oldestKey) {
                    localStorage.removeItem(oldestKey);
                    console.log(`클라이언트 캐시 제거: ${oldestKey}`);
                }
            } catch (error) {
                console.error('캐시 제거 오류:', error);
            }
        }

        // 캐시 통계
        getStats() {
            try {
                const keys = Object.keys(localStorage);
                const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
                
                let valid = 0;
                let expired = 0;
                let totalSize = 0;
                
                cacheKeys.forEach(key => {
                    try {
                        const cached = localStorage.getItem(key);
                        if (cached) {
                            totalSize += cached.length;
                            const parsed = JSON.parse(cached);
                            if (parsed.expires && Date.now() > parsed.expires) {
                                expired++;
                            } else {
                                valid++;
                            }
                        }
                    } catch (error) {
                        expired++;
                    }
                });
                
                return {
                    total: cacheKeys.length,
                    valid,
                    expired,
                    totalSize,
                    maxSize: this.maxCacheSize
                };
            } catch (error) {
                console.error('캐시 통계 오류:', error);
                return { total: 0, valid: 0, expired: 0, totalSize: 0, maxSize: this.maxCacheSize };
            }
        }

        // 전체 캐시 클리어
        clear() {
            try {
                const keys = Object.keys(localStorage);
                const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
                
                cacheKeys.forEach(key => {
                    localStorage.removeItem(key);
                });
                
                console.log(`클라이언트 캐시 전체 클리어: ${cacheKeys.length}개 항목 제거`);
            } catch (error) {
                console.error('캐시 클리어 오류:', error);
            }
        }
    }

    // 전역 클라이언트 캐시 인스턴스
    const clientCache = new ClientCache();

    // Firebase Database에서 사용자 데이터 조회 함수 (캐싱 적용)
    async function fetchUserDataFromDatabase(firebaseUid) {
        try {
            // 1. 캐시에서 먼저 확인
            const cachedData = clientCache.get('user', firebaseUid);
            if (cachedData) {
                return cachedData;
            }

            // 2. 캐시 미스 - Firebase에서 조회
            console.log(`클라이언트 캐시 미스: user_${firebaseUid}`);
            
            // Firebase Database 모듈 동적 import
            const { getDatabase, ref, get } = await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js');
            const { getApp } = await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js');
            
            const app = getApp();
            const database = getDatabase(app);
            
            // 호환성: 새로운 데이터 모델과 기존 데이터 모델 모두 지원
            let userData = null;
            
            // 1. 새로운 데이터 모델 시도: users/{uid} 구조
            const userRef = ref(database, `users/${firebaseUid}`);
            const userSnapshot = await get(userRef);
            const userDataFromDB = userSnapshot.val();
            
            if (userDataFromDB) {
                // 새로운 구조에서 역할 정보 조회
                const roleRef = ref(database, `meta/roles/${firebaseUid}`);
                const roleSnapshot = await get(roleRef);
                const roleData = roleSnapshot.val();
                
                userData = {
                    uid: firebaseUid,
                    name: userDataFromDB.name,
                    email: userDataFromDB.email,
                    status: userDataFromDB.status,
                    role: roleData?.role || 'user',
                    permissions: roleData?.permissions || {},
                    firebaseUid: firebaseUid
                };
            } else {
                // 2. 기존 데이터 모델 시도: users/{key} 구조 (firebaseUid로 매칭)
                const usersRef = ref(database, 'users');
                const snapshot = await get(usersRef);
                const users = snapshot.val() || {};
                
                for (const key in users) {
                    if (users[key] && users[key].firebaseUid === firebaseUid) {
                        userData = {
                            uid: key,
                            name: users[key].name,
                            email: users[key].email,
                            status: users[key].status,
                            role: users[key].role || 'user',
                            permissions: users[key].permissions || {},
                            firebaseUid: users[key].firebaseUid
                        };
                        break;
                    }
                }
            }
            
            // 3. 조회된 데이터를 캐시에 저장 (10분 TTL)
            if (userData) {
                clientCache.set('user', firebaseUid, userData, 10 * 60 * 1000);
            }
            
            return userData;
        } catch (error) {
            console.error('사용자 데이터 조회 실패:', error);
            return null;
        }
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
        
        // 사용자 관련 캐시도 정리
        clientCache.removeByType('user');
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
        
        // iframe에 sche.html 로드 (캐시 버스터 추가)
        const timestamp = new Date().getTime();
        contentFrame.src = `Sales_sche/Salse_sche.html?v=${timestamp}`;
        contentFrame.style.display = 'block';
        
        // 메뉴 활성화 상태 업데이트
        updateMenuActiveState(salesStatusMenu);
    }

    // 부동산가치계산기 로드 함수
    function loadPropertyCalculator() {
        // 웰컴 메시지 숨기기
        welcomeMessage.style.display = 'none';
        
        // iframe에 prop.html 로드 (캐시 버스터 추가)
        const timestamp = new Date().getTime();
        contentFrame.src = `prop2/prop.html?v=${timestamp}`;
        contentFrame.style.display = 'block';
        
        // 메뉴 활성화 상태 업데이트
        updateMenuActiveState(propertyCalculatorMenu);
    }

    // 업무일정표 로드 함수
    function loadWorkSchedule() {
        // 웰컴 메시지 숨기기
        welcomeMessage.style.display = 'none';

        // iframe에 Court_sche/Court_sche.html 로드 (캐시 버스터 추가)
        const timestamp = new Date().getTime();
        contentFrame.src = `Court_sche/Court_sche.html?v=${timestamp}`;
        contentFrame.style.display = 'block';

        // 메뉴 활성화 상태 업데이트
        updateMenuActiveState(workScheduleMenu);
    }

    // PDF편집기 로드 함수
    function loadPdfEditor() {
        // 웰컴 메시지 숨기기
        welcomeMessage.style.display = 'none';

        // iframe에 PDF_Editor/PDFeditor.html 로드 (캐시 버스터 추가)
        const timestamp = new Date().getTime();
        contentFrame.src = `PDF_Editor/PDFeditor.html?v=${timestamp}`;
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

