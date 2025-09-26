import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// Firebase 서비스를 저장할 전역 변수
let auth, database, app;

// 서버에서 Firebase 설정을 가져와 초기화하는 함수
async function initializeFirebase() {
    // 이미 초기화되었다면, 기존 인스턴스 사용
    if (getApps().length) {
        app = getApp();
    } else {
        try {
            const response = await fetch('/api/firebase-config');
            if (!response.ok) throw new Error(`서버 응답 오류: ${response.status}`);

            const firebaseConfig = await response.json();
            if (!firebaseConfig || !firebaseConfig.apiKey) throw new Error('수신된 Firebase 설정이 유효하지 않습니다.');

            app = initializeApp(firebaseConfig);
            console.log('Firebase가 성공적으로 초기화되었습니다.');
        } catch (error) {
            console.error('Firebase 초기화 실패:', error);
            // 사용자에게 오류 메시지 표시 (예: DOM 요소에)
            const welcomeMessage = document.getElementById('welcomeMessage');
            if(welcomeMessage) welcomeMessage.textContent = '애플리케이션 로딩에 실패했습니다. 새로고침하거나 관리자에게 문의하세요.';
            return false; // 초기화 실패
        }
    }

    auth = getAuth(app);
    database = getDatabase(app);
    return true; // 초기화 성공
}

// 클라이언트 캐싱 시스템 (기존 코드와 동일)
class ClientCache {
    constructor() {
        this.cachePrefix = 'cns_cache_';
        this.defaultTTL = 5 * 60 * 1000; // 5분 기본 TTL
        this.maxCacheSize = 50; // 최대 캐시 항목 수
    }
    getCacheKey(type, id) { return `${this.cachePrefix}${type}_${id}`; }
    get(type, id) {
        try {
            const item = localStorage.getItem(this.getCacheKey(type, id));
            if (!item) return null;
            const parsed = JSON.parse(item);
            if (parsed.expires && Date.now() > parsed.expires) {
                this.remove(type, id);
                return null;
            }
            console.log(`클라이언트 캐시 히트: ${type}_${id}`);
            return parsed.data;
        } catch (e) { console.error('캐시 조회 오류:', e); return null; }
    }
    set(type, id, data, ttl = this.defaultTTL) {
        try {
            const cacheData = { data, cachedAt: Date.now(), expires: Date.now() + ttl };
            localStorage.setItem(this.getCacheKey(type, id), JSON.stringify(cacheData));
            console.log(`클라이언트 캐시 저장: ${type}_${id}`);
            this.cleanup();
        } catch (e) { console.error('캐시 저장 오류:', e); }
    }
    remove(type, id) { try { localStorage.removeItem(this.getCacheKey(type, id)); console.log(`클라이언트 캐시 제거: ${type}_${id}`); } catch (e) { console.error('캐시 제거 오류:', e); } }
    removeByType(type) {
        try {
            Object.keys(localStorage).filter(k => k.startsWith(this.getCacheKey(type, ''))).forEach(k => localStorage.removeItem(k));
            console.log(`클라이언트 캐시 타입별 제거: ${type}`);
        } catch (e) { console.error('캐시 타입별 제거 오류:', e); }
    }
    cleanup() {
        try {
            const keys = Object.keys(localStorage).filter(k => k.startsWith(this.cachePrefix));
            let cleaned = 0;
            keys.forEach(key => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key));
                    if (parsed.expires && Date.now() > parsed.expires) {
                        localStorage.removeItem(key);
                        cleaned++;
                    }
                } catch { localStorage.removeItem(key); cleaned++; }
            });
            if (keys.length - cleaned > this.maxCacheSize) this.evictOldest();
            if (cleaned > 0) console.log(`클라이언트 캐시 정리: ${cleaned}개 항목 제거`);
        } catch (e) { console.error('캐시 정리 오류:', e); }
    }
    evictOldest() {
        try {
            const keys = Object.keys(localStorage).filter(k => k.startsWith(this.cachePrefix));
            let oldestKey = null, oldestTime = Date.now();
            keys.forEach(key => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(key));
                    if (parsed.cachedAt && parsed.cachedAt < oldestTime) {
                        oldestTime = parsed.cachedAt;
                        oldestKey = key;
                    }
                } catch { if (!oldestKey) oldestKey = key; }
            });
            if (oldestKey) { localStorage.removeItem(oldestKey); console.log(`클라이언트 캐시 제거: ${oldestKey}`); }
        } catch (e) { console.error('캐시 제거 오류:', e); }
    }
}
const clientCache = new ClientCache();

// DOM이 로드된 후 Firebase를 초기화하고 메인 로직을 실행
document.addEventListener('DOMContentLoaded', async function() {
    const isInitialized = await initializeFirebase();
    if (!isInitialized) return;

    // DOM 요소 가져오기
    const userDept = document.getElementById('userDept');
    const userNameElem = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const contentFrame = document.getElementById('contentFrame');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.querySelector('.sidebar');
    const menuItems = {
        salesStatusMenu: 'Sales_sche/Salse_sche.html',
        propertyCalculatorMenu: 'prop2/prop.html',
        workScheduleMenu: 'Court_sche/Court_sche.html',
        pdfEditorMenu: 'PDF_Editor/PDFeditor.html'
    };

    // 로그인 상태 확인
    checkLoginStatus();

    // 이벤트 리스너 설정
    logoutBtn.addEventListener('click', logout);
    if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

    Object.entries(menuItems).forEach(([menuId, url]) => {
        const menuItem = document.getElementById(menuId);
        if (menuItem) {
            menuItem.addEventListener('click', (e) => {
                e.preventDefault();
                loadContent(url, menuItem);
            });
        }
    });

    // 로그인 상태 확인 함수
    function checkLoginStatus() {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                clearAuthData();
                window.location.href = 'index.html';
                return;
            }
            try {
                const idToken = await user.getIdToken(true); // 토큰 강제 갱신
                if (!idToken) throw new Error('유효하지 않은 토큰');
                
                const userData = await fetchUserDataFromDatabase(user.uid);
                if (userData && userData.status === 'approved') {
                    updateUserInfo(userData, user.uid);
                } else {
                    await signOut(auth);
                    clearAuthData();
                    window.location.href = 'index.html';
                }
            } catch (error) {
                console.error('토큰 검증 실패:', error);
                clearAuthData();
                window.location.href = 'index.html';
            }
        });
    }

    // 사용자 정보 UI 업데이트 및 스토리지 저장
    function updateUserInfo(userData, firebaseUid) {
        const isKeepLogin = localStorage.getItem('keepLogin') === 'true';
        const storage = isKeepLogin ? localStorage : sessionStorage;
        storage.setItem('isLoggedIn', 'true');
        storage.setItem('userId', userData.uid);
        storage.setItem('userRole', userData.role);
        storage.setItem('userName', userData.name);
        storage.setItem('firebaseUid', firebaseUid);

        userNameElem.textContent = `${userData.name}님`;
        userDept.textContent = userData.role === 'admin' ? '관리자' : '일반 사용자';
    }

    // Firebase DB에서 사용자 데이터 가져오기 (캐싱 적용)
    async function fetchUserDataFromDatabase(firebaseUid) {
        const cachedData = clientCache.get('user', firebaseUid);
        if (cachedData) return cachedData;

        console.log(`클라이언트 캐시 미스: user_${firebaseUid}`);
        let userData = null;

        // 새로운 모델 우선 조회
        const userRef = ref(database, `users/${firebaseUid}`);
        const userSnapshot = await get(userRef);
        const userDataFromDB = userSnapshot.val();

        if (userDataFromDB) {
            const roleRef = ref(database, `meta/roles/${firebaseUid}`);
            const roleSnapshot = await get(roleRef);
            const roleData = roleSnapshot.val();
            userData = {
                uid: firebaseUid, name: userDataFromDB.name, email: userDataFromDB.email,
                status: userDataFromDB.status, role: roleData?.role || 'user',
                permissions: roleData?.permissions || {}, firebaseUid: firebaseUid
            };
        } else {
            // 호환성을 위한 기존 모델 조회
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const users = snapshot.val() || {};
            for (const key in users) {
                if (users[key] && users[key].firebaseUid === firebaseUid) {
                    userData = {
                        uid: key, name: users[key].name, email: users[key].email,
                        status: users[key].status, role: users[key].role || 'user',
                        permissions: users[key].permissions || {}, firebaseUid: users[key].firebaseUid
                    };
                    break;
                }
            }
        }

        if (userData) clientCache.set('user', firebaseUid, userData, 10 * 60 * 1000);
        return userData;
    }

    // 인증 데이터 모두 삭제
    function clearAuthData() {
        ['isLoggedIn', 'userId', 'userRole', 'userName', 'firebaseUid', 'keepLogin'].forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
        clientCache.removeByType('user');
    }

    // 로그아웃
    async function logout() {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("로그아웃 오류:", error);
        } finally {
            clearAuthData();
            window.location.href = 'index.html';
        }
    }

    // iframe 콘텐츠 로드
    function loadContent(url, activeMenu) {
        if (welcomeMessage) welcomeMessage.style.display = 'none';
        if (contentFrame) {
            contentFrame.src = `${url}?v=${new Date().getTime()}`;
            contentFrame.style.display = 'block';
        }
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        if (activeMenu) activeMenu.parentElement.classList.add('active');
    }

    // 모바일 메뉴 제어
    function toggleMobileMenu() {
        if (sidebar && mobileOverlay) {
            sidebar.classList.contains('show') ? closeMobileMenu() : openMobileMenu();
        }
    }
    function openMobileMenu() {
        sidebar.classList.add('show');
        mobileOverlay.style.display = 'block';
        setTimeout(() => mobileOverlay.classList.add('show'), 10);
    }
    function closeMobileMenu() {
        sidebar.classList.remove('show');
        mobileOverlay.classList.remove('show');
        setTimeout(() => { mobileOverlay.style.display = 'none'; }, 300);
    }
});