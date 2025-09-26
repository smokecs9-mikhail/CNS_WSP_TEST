import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// Firebase 서비스를 저장할 전역 변수
let auth, database, app;

// 서버에서 Firebase 설정을 가져와 초기화하는 함수
async function initializeFirebase() {
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
            // 관리자 페이지에서는 alert로 즉각적인 피드백을 줄 수 있음
            alert('애플리케이션 초기화에 실패했습니다. 새로고침하거나 관리자에게 문의하세요.');
            return false;
        }
    }

    auth = getAuth(app);
    database = getDatabase(app);
    return true;
}

// 클라이언트 캐싱 시스템 (기존 코드와 동일)
class ClientCache {
    constructor() {
        this.cachePrefix = 'cns_cache_';
        this.defaultTTL = 5 * 60 * 1000;
        this.maxCacheSize = 50;
    }
    getCacheKey(type, id) { return `${this.cachePrefix}${type}_${id}`; }
    get(type, id) {
        try {
            const item = localStorage.getItem(this.getCacheKey(type, id));
            if (!item) return null;
            const p = JSON.parse(item);
            if (p.expires && Date.now() > p.expires) { this.remove(type, id); return null; }
            console.log(`클라이언트 캐시 히트: ${type}_${id}`);
            return p.data;
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
                    if (JSON.parse(localStorage.getItem(key)).expires < Date.now()) {
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
                    const ts = JSON.parse(localStorage.getItem(key)).cachedAt;
                    if (ts && ts < oldestTime) { oldestTime = ts; oldestKey = key; }
                } catch { if (!oldestKey) oldestKey = key; }
            });
            if (oldestKey) { localStorage.removeItem(oldestKey); console.log(`클라이언트 캐시 제거: ${oldestKey}`); }
        } catch (e) { console.error('캐시 제거 오류:', e); }
    }
}
const clientCache = new ClientCache();

document.addEventListener('DOMContentLoaded', async function() {
    const isInitialized = await initializeFirebase();
    if (!isInitialized) return;

    // DOM 요소
    const adminName = document.getElementById('adminName');
    const adminDept = document.getElementById('adminDept');
    const logoutBtn = document.getElementById('logoutBtn');
    const totalUsers = document.getElementById('totalUsers');
    const pendingUsers = document.getElementById('pendingUsers');
    const approvedUsers = document.getElementById('approvedUsers');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.querySelector('.sidebar');
    let isLoggingOut = false;

    // 초기화 함수 호출
    checkAdminStatus();
    updateStats();

    // 이벤트 리스너
    logoutBtn.addEventListener('click', logout);
    if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

    // 관리자 권한 확인
    function checkAdminStatus() {
        onAuthStateChanged(auth, async (firebaseUser) => {
            if (isLoggingOut) return;
            if (!firebaseUser) {
                clearAdminAuthData();
                window.location.href = 'index.html';
                return;
            }
            try {
                await firebaseUser.getIdToken(true);
                const cachedData = clientCache.get('admin_user', firebaseUser.uid);
                let userData, userRole;

                if (cachedData) {
                    ({ userData, userRole } = cachedData);
                } else {
                    console.log(`클라이언트 캐시 미스: admin_user_${firebaseUser.uid}`);
                    const userRef = ref(database, `users/${firebaseUser.uid}`);
                    const userSnapshot = await get(userRef);
                    userData = userSnapshot.val();

                    if (userData) {
                        const roleRef = ref(database, `meta/roles/${firebaseUser.uid}`);
                        const roleSnapshot = await get(roleRef);
                        userRole = roleSnapshot.val()?.role || 'user';
                    } else {
                        // Fallback for old data model
                        const usersRef = ref(database, 'users');
                        const snapshot = await get(usersRef);
                        const users = snapshot.val() || {};
                        for (const key in users) {
                            if (users[key]?.firebaseUid === firebaseUser.uid) {
                                userData = users[key];
                                userRole = users[key].role || 'user';
                                break;
                            }
                        }
                    }
                    if (userData) {
                        clientCache.set('admin_user', firebaseUser.uid, { userData, userRole }, 5 * 60 * 1000);
                    }
                }
                
                if (!userData || userRole !== 'admin' || userData.status !== 'approved') {
                    await signOut(auth);
                    clearAdminAuthData();
                    window.location.href = 'index.html';
                } else {
                    adminName.textContent = `${userData.name}님`;
                    adminDept.textContent = '관리자';
                }
            } catch (error) {
                console.error('관리자 권한 확인 오류:', error);
                await signOut(auth);
                clearAdminAuthData();
                window.location.href = 'index.html';
            }
        });
    }
    
    // 통계 업데이트
    async function updateStats() {
        try {
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const usersData = snapshot.val() || {};
            const users = Object.values(usersData);
            
            totalUsers.textContent = users.length;
            pendingUsers.textContent = users.filter(u => u.status === 'pending').length;
            approvedUsers.textContent = users.filter(u => u.status === 'approved').length;
        } catch (error) {
            console.error('통계 업데이트 오류:', error);
            [totalUsers, pendingUsers, approvedUsers].forEach(el => { if(el) el.textContent = '0'; });
        }
    }
    
    // 로그아웃
    async function logout() {
        isLoggingOut = true;
        try {
            await signOut(auth);
        } catch(e) {
            console.error("로그아웃 오류:", e);
        } finally {
            clearAdminAuthData();
            window.location.href = 'index.html';
        }
    }

    // 인증 정보 클리어
    function clearAdminAuthData() {
        ['isLoggedIn', 'userId', 'userRole', 'userName', 'firebaseUid', 'keepLogin'].forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
        clientCache.removeByType('admin_user');
    }

    // 모바일 메뉴 제어
    function toggleMobileMenu() { sidebar.classList.contains('show') ? closeMobileMenu() : openMobileMenu(); }
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