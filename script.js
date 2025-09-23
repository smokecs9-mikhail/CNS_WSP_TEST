import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, set, push } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

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

// 클라이언트 캐싱 시스템
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
            
            if (!cached) {
                return null;
            }

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
            const cacheData = {
                data: data,
                cachedAt: Date.now(),
                expires: Date.now() + ttl
            };

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
}

// 전역 클라이언트 캐시 인스턴스
const clientCache = new ClientCache();

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const userIdInput = document.getElementById('userId');
    const userPasswordInput = document.getElementById('userPassword');
    const keepLoginCheckbox = document.getElementById('keepLogin');
    const errorMessage = document.getElementById('errorMessage');
    const signupBtn = document.getElementById('signupBtn');

    // 페이지 로드 시 로그인 상태 확인
    checkLoginStatus();

    // 폼 제출 이벤트 처리
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });

    // 회원가입 버튼 이벤트 처리
    signupBtn.addEventListener('click', function() {
        window.location.href = 'signup.html';
    });

    // 로그인 처리 함수 (Firebase Auth 사용)
    async function handleLogin() {
        const userId = userIdInput.value.trim();
        const password = userPasswordInput.value;
        const keepLogin = keepLoginCheckbox.checked;

        try {
            // 이메일 형식으로 변환 (Firebase Auth는 이메일을 요구함)
            const email = `${userId}@cnsinc.co.kr`;
            
            // Firebase Auth로 로그인 시도
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;
            
            // 호환성: 새로운 데이터 모델과 기존 데이터 모델 모두 지원 (캐싱 적용)
            let combinedUserData = null;
            
            // 1. 캐시에서 먼저 확인
            const cachedUserData = clientCache.get('login_user', firebaseUser.uid);
            if (cachedUserData) {
                combinedUserData = cachedUserData;
            } else {
                // 2. 캐시 미스 - Firebase에서 조회
                console.log(`클라이언트 캐시 미스: login_user_${firebaseUser.uid}`);
                
                // 1. 새로운 데이터 모델 시도: users/{uid} 구조
                const userRef = ref(database, `users/${firebaseUser.uid}`);
                const userSnapshot = await get(userRef);
                const userData = userSnapshot.val();
                
                if (userData) {
                    // 새로운 구조에서 역할 정보 조회
                    const roleRef = ref(database, `meta/roles/${firebaseUser.uid}`);
                    const roleSnapshot = await get(roleRef);
                    const roleData = roleSnapshot.val();
                    
                    combinedUserData = {
                        uid: firebaseUser.uid,
                        name: userData.name,
                        email: userData.email,
                        status: userData.status,
                        role: roleData?.role || 'user',
                        permissions: roleData?.permissions || {},
                        firebaseUid: firebaseUser.uid
                    };
                } else {
                    // 2. 기존 데이터 모델 시도: users/{key} 구조 (firebaseUid로 매칭)
                    const usersRef = ref(database, 'users');
                    const snapshot = await get(usersRef);
                    const users = snapshot.val() || {};
                    
                    for (const key in users) {
                        if (users[key] && users[key].firebaseUid === firebaseUser.uid) {
                            combinedUserData = {
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
                if (combinedUserData) {
                    clientCache.set('login_user', firebaseUser.uid, combinedUserData, 10 * 60 * 1000);
                }
            }
            
            if (combinedUserData && combinedUserData.status === 'approved') {
                // 로그인 성공
                errorMessage.textContent = '';
                
                // 로그인 정보 저장
                if (keepLogin) {
                    // 로컬스토리지는 최소 정보만 저장
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('userId', combinedUserData.uid);
                    localStorage.setItem('userName', combinedUserData.name);
                    localStorage.setItem('userRole', combinedUserData.role);
                    localStorage.setItem('userEmail', email);
                    localStorage.setItem('firebaseUid', firebaseUser.uid);
                    localStorage.setItem('keepLogin', 'true');
                } else {
                    sessionStorage.setItem('isLoggedIn', 'true');
                    sessionStorage.setItem('userId', combinedUserData.uid);
                    sessionStorage.setItem('userName', combinedUserData.name);
                    sessionStorage.setItem('userRole', combinedUserData.role);
                    sessionStorage.setItem('userEmail', email);
                    sessionStorage.setItem('firebaseUid', firebaseUser.uid);
                }

                // 권한에 따른 페이지 이동
                if (combinedUserData.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'main.html';
                }
            } else if (combinedUserData && combinedUserData.status === 'pending') {
                // 승인 대기 중인 사용자
                await signOut(auth); // Firebase Auth에서 로그아웃
                errorMessage.textContent = '승인 대기 중입니다. 관리자의 승인을 기다려주세요.';
            } else {
                // 사용자 정보가 없거나 승인되지 않음
                await signOut(auth); // Firebase Auth에서 로그아웃
                errorMessage.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
            }
        } catch (error) {
            console.error('로그인 오류:', error);
            if (error.code === 'auth/user-not-found') {
                errorMessage.textContent = '존재하지 않는 사용자입니다.';
            } else if (error.code === 'auth/wrong-password') {
                errorMessage.textContent = '비밀번호가 올바르지 않습니다.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage.textContent = '이메일 형식이 올바르지 않습니다.';
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage.textContent = '너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.';
            } else {
                errorMessage.textContent = '로그인 중 오류가 발생했습니다. 다시 시도해주세요.';
            }
        }
    }

    // 로그인 상태 확인 함수 (Firebase Auth 사용)
    function checkLoginStatus() {
        onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Firebase Auth에 로그인된 사용자가 있음
                try {
                    // 사용자 정보 가져오기 (단일 경로 조회로 최적화)
                    const usersRef = ref(database, 'users');
                    const snapshot = await get(usersRef);
                    const users = snapshot.val() || {};
                    let userData = null;
                    for (const key in users) {
                        if (users[key] && users[key].firebaseUid === firebaseUser.uid) {
                            // 필요한 최소 정보만 추출 (민감한 정보 제외)
                            userData = {
                                uid: key,
                                name: users[key].name,
                                email: users[key].email,
                                role: users[key].role,
                                status: users[key].status,
                                firebaseUid: users[key].firebaseUid
                            };
                            break;
                        }
                    }
                    
                    if (userData && userData.status === 'approved') {
                        // 로그인 정보 저장
                        const isKeepLogin = localStorage.getItem('keepLogin') === 'true';
                        if (isKeepLogin) {
                            // 로컬스토리지는 최소 정보만 유지
                            localStorage.setItem('isLoggedIn', 'true');
                            localStorage.setItem('firebaseUid', firebaseUser.uid);
                        } else {
                            sessionStorage.setItem('isLoggedIn', 'true');
                            sessionStorage.setItem('userId', userData.id);
                            sessionStorage.setItem('userName', userData.name);
                            sessionStorage.setItem('userRole', userData.role);
                            sessionStorage.setItem('userEmail', firebaseUser.email);
                            sessionStorage.setItem('firebaseUid', firebaseUser.uid);
                        }
                        
                        // 권한에 따른 페이지 이동
                        if (window.location.pathname !== '/index.html' && window.location.pathname !== '/' && !window.location.href.includes('index.html')) {
                            if (userData.role === 'admin') {
                                window.location.href = 'admin.html';
                            } else {
                                window.location.href = 'main.html';
                            }
                        }
                    } else {
                        // 사용자 정보가 없거나 승인되지 않음
                        await signOut(auth);
                    }
                } catch (error) {
                    console.error('사용자 정보 확인 오류:', error);
                    await signOut(auth);
                }
            }
        });
    }

    // 입력 필드 포커스 시 에러 메시지 초기화
    userIdInput.addEventListener('focus', function() {
        errorMessage.textContent = '';
    });

    userPasswordInput.addEventListener('focus', function() {
        errorMessage.textContent = '';
    });

    // Enter 키 이벤트 처리
    userPasswordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
});
