import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, set, push } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// Firebase 서비스를 저장할 전역 변수
let auth, database;

// 서버에서 Firebase 설정을 가져와 초기화하는 함수
async function initializeFirebase() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }
        const firebaseConfig = await response.json();

        if (!firebaseConfig || !firebaseConfig.apiKey) {
            throw new Error('수신된 Firebase 설정이 유효하지 않습니다.');
        }

        const app = initializeApp(firebaseConfig);
        database = getDatabase(app);
        auth = getAuth(app);

        console.log('Firebase가 성공적으로 초기화되었습니다.');

    } catch (error) {
        console.error('Firebase 초기화 실패:', error);
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            errorMessage.textContent = '애플리케이션을 초기화하는 데 실패했습니다. 관리자에게 문의하세요.';
        }
    }
}

// 클라이언트 캐싱 시스템 (기존 코드와 동일)
class ClientCache {
    constructor() {
        this.cachePrefix = 'cns_cache_';
        this.defaultTTL = 5 * 60 * 1000; // 5분 기본 TTL
        this.maxCacheSize = 50; // 최대 캐시 항목 수
    }

    getCacheKey(type, identifier) {
        return `${this.cachePrefix}${type}_${identifier}`;
    }

    get(type, identifier) {
        try {
            const cacheKey = this.getCacheKey(type, identifier);
            const cached = localStorage.getItem(cacheKey);
            if (!cached) return null;
            const parsed = JSON.parse(cached);
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

    set(type, identifier, data, ttl = this.defaultTTL) {
        try {
            const cacheKey = this.getCacheKey(type, identifier);
            const cacheData = { data, cachedAt: Date.now(), expires: Date.now() + ttl };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            console.log(`클라이언트 캐시 저장: ${type}_${identifier}`);
            this.cleanup();
        } catch (error) {
            console.error('캐시 저장 오류:', error);
        }
    }

    remove(type, identifier) {
        try {
            const cacheKey = this.getCacheKey(type, identifier);
            localStorage.removeItem(cacheKey);
            console.log(`클라이언트 캐시 제거: ${type}_${identifier}`);
        } catch (error) {
            console.error('캐시 제거 오류:', error);
        }
    }

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

    cleanup() {
        try {
            const keys = Object.keys(localStorage);
            const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
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
                    localStorage.removeItem(key);
                    cleaned++;
                }
            });
            if (cacheKeys.length - cleaned > this.maxCacheSize) this.evictOldest();
            if (cleaned > 0) console.log(`클라이언트 캐시 정리: ${cleaned}개 항목 제거`);
        } catch (error) {
            console.error('캐시 정리 오류:', error);
        }
    }

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
                    if (!oldestKey) oldestKey = key;
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
}

const clientCache = new ClientCache();

// DOM이 로드된 후 Firebase를 초기화하고 메인 로직을 실행
document.addEventListener('DOMContentLoaded', async function() {
    await initializeFirebase();

    // Firebase 초기화가 실패하면 더 이상 진행하지 않음
    if (!auth || !database) {
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const userIdInput = document.getElementById('userId');
    const userPasswordInput = document.getElementById('userPassword');
    const keepLoginCheckbox = document.getElementById('keepLogin');
    const errorMessage = document.getElementById('errorMessage');
    const signupBtn = document.getElementById('signupBtn');

    checkLoginStatus();

    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });

    signupBtn.addEventListener('click', function() {
        window.location.href = 'signup.html';
    });

    async function handleLogin() {
        const userId = userIdInput.value.trim();
        const password = userPasswordInput.value;
        const keepLogin = keepLoginCheckbox.checked;

        try {
            const email = `${userId}@cnsinc.co.kr`;
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;
            
            let combinedUserData = clientCache.get('login_user', firebaseUser.uid);
            if (!combinedUserData) {
                console.log(`클라이언트 캐시 미스: login_user_${firebaseUser.uid}`);
                const userRef = ref(database, `users/${firebaseUser.uid}`);
                const userSnapshot = await get(userRef);
                const userData = userSnapshot.val();

                if (userData) {
                    const roleRef = ref(database, `meta/roles/${firebaseUser.uid}`);
                    const roleSnapshot = await get(roleRef);
                    const roleData = roleSnapshot.val();
                    combinedUserData = {
                        uid: firebaseUser.uid, name: userData.name, email: userData.email,
                        status: userData.status, role: roleData?.role || 'user',
                        permissions: roleData?.permissions || {}, firebaseUid: firebaseUser.uid
                    };
                } else {
                    const usersRef = ref(database, 'users');
                    const snapshot = await get(usersRef);
                    const users = snapshot.val() || {};
                    for (const key in users) {
                        if (users[key] && users[key].firebaseUid === firebaseUser.uid) {
                            combinedUserData = {
                                uid: key, name: users[key].name, email: users[key].email,
                                status: users[key].status, role: users[key].role || 'user',
                                permissions: users[key].permissions || {}, firebaseUid: users[key].firebaseUid
                            };
                            break;
                        }
                    }
                }
                if (combinedUserData) {
                    clientCache.set('login_user', firebaseUser.uid, combinedUserData, 10 * 60 * 1000);
                }
            }

            if (combinedUserData && combinedUserData.status === 'approved') {
                errorMessage.textContent = '';
                const storage = keepLogin ? localStorage : sessionStorage;
                storage.setItem('isLoggedIn', 'true');
                storage.setItem('userId', combinedUserData.uid);
                storage.setItem('userName', combinedUserData.name);
                storage.setItem('userRole', combinedUserData.role);
                storage.setItem('userEmail', email);
                storage.setItem('firebaseUid', firebaseUser.uid);
                if (keepLogin) localStorage.setItem('keepLogin', 'true');

                window.location.href = combinedUserData.role === 'admin' ? 'admin.html' : 'main.html';
            } else if (combinedUserData && combinedUserData.status === 'pending') {
                await signOut(auth);
                errorMessage.textContent = '승인 대기 중입니다. 관리자의 승인을 기다려주세요.';
            } else {
                await signOut(auth);
                errorMessage.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
            }
        } catch (error) {
            console.error('로그인 오류:', error);
            const errorMessages = {
                'auth/user-not-found': '존재하지 않는 사용자입니다.',
                'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
                'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
                'auth/too-many-requests': '너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.'
            };
            errorMessage.textContent = errorMessages[error.code] || '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
        }
    }

    function checkLoginStatus() {
        onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    const usersRef = ref(database, 'users');
                    const snapshot = await get(usersRef);
                    const users = snapshot.val() || {};
                    let userData = null;
                    for (const key in users) {
                        if (users[key] && users[key].firebaseUid === firebaseUser.uid) {
                            userData = {
                                uid: key, name: users[key].name, email: users[key].email,
                                role: users[key].role, status: users[key].status,
                                firebaseUid: users[key].firebaseUid
                            };
                            break;
                        }
                    }
                    if (userData && userData.status === 'approved') {
                        const isKeepLogin = localStorage.getItem('keepLogin') === 'true';
                        const storage = isKeepLogin ? localStorage : sessionStorage;
                        storage.setItem('isLoggedIn', 'true');
                        storage.setItem('firebaseUid', firebaseUser.uid);
                        if (!isKeepLogin) {
                            storage.setItem('userId', userData.id);
                            storage.setItem('userName', userData.name);
                            storage.setItem('userRole', userData.role);
                            storage.setItem('userEmail', firebaseUser.email);
                        }
                        
                        const path = window.location.pathname;
                        if (path !== '/index.html' && path !== '/' && !path.includes('index.html')) {
                            window.location.href = userData.role === 'admin' ? 'admin.html' : 'main.html';
                        }
                    } else {
                        await signOut(auth);
                    }
                } catch (error) {
                    console.error('사용자 정보 확인 오류:', error);
                    await signOut(auth);
                }
            }
        });
    }

    userIdInput.addEventListener('focus', () => { errorMessage.textContent = ''; });
    userPasswordInput.addEventListener('focus', () => { errorMessage.textContent = ''; });
    userPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
});