const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정 - Origin 화이트리스트 적용
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-domain.vercel.app', // 실제 배포 도메인으로 변경
  'https://cns-wsp.vercel.app' // 예시
];

app.use(cors({
  origin: function (origin, callback) {
    // 개발 환경에서는 origin이 undefined일 수 있음
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS 정책에 의해 차단되었습니다.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// CSRF 토큰 생성 및 검증 미들웨어
const crypto = require('crypto');
const csrfTokens = new Map(); // 실제 운영에서는 Redis 등 사용 권장

// CSRF 토큰 생성
app.get('/api/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 3600000; // 1시간
  csrfTokens.set(token, expires);
  
  res.cookie('csrf-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000
  });
  
  res.json({ csrfToken: token });
});

// CSRF 검증 미들웨어
const verifyCSRF = (req, res, next) => {
  if (req.method === 'GET') return next(); // GET 요청은 CSRF 검증 제외
  
  const token = req.headers['x-csrf-token'] || req.body.csrfToken;
  const cookieToken = req.cookies['csrf-token'];
  
  if (!token || !cookieToken || token !== cookieToken) {
    return res.status(403).json({ error: 'CSRF 토큰이 유효하지 않습니다.' });
  }
  
  // 토큰 만료 확인
  const expires = csrfTokens.get(token);
  if (!expires || Date.now() > expires) {
    csrfTokens.delete(token);
    return res.status(403).json({ error: 'CSRF 토큰이 만료되었습니다.' });
  }
  
  next();
};

// Firebase Admin SDK 초기화
const serviceAccount = {
  type: "service_account",
  project_id: "csy-todo-test",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

// 토큰 캐싱 시스템
class TokenCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 1000; // 최대 캐시 크기
    this.defaultTTL = 5 * 60 * 1000; // 5분 기본 TTL
    this.cleanupInterval = 60 * 1000; // 1분마다 정리
    
    // 통계 카운터
    this.hitCount = 0;
    this.missCount = 0;
    
    // 주기적 캐시 정리
    setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  // 토큰 검증 및 캐싱
  async verifyAndCache(token) {
    const cacheKey = this.getCacheKey(token);
    
    // 캐시에서 확인
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      this.hitCount++;
      console.log(`토큰 캐시 히트: ${cached.uid} (히트율: ${this.getHitRate()}%)`);
      return cached.data;
    }

    // 캐시 미스 - Firebase에서 검증
    this.missCount++;
    console.log(`토큰 캐시 미스: ${cacheKey} (히트율: ${this.getHitRate()}%)`);
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // TTL 계산 (토큰 만료 시간 기준)
    const ttl = Math.min(
      (decodedToken.exp * 1000) - Date.now(), // 토큰 만료까지 남은 시간
      this.defaultTTL
    );
    
    // 캐시에 저장
    this.cache.set(cacheKey, {
      data: decodedToken,
      uid: decodedToken.uid,
      expires: Date.now() + ttl,
      cachedAt: Date.now()
    });

    // 캐시 크기 제한
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }

    return decodedToken;
  }

  // 캐시 키 생성
  getCacheKey(token) {
    // 토큰의 일부를 해시로 사용 (보안상 전체 토큰은 저장하지 않음)
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token.substring(0, 20)).digest('hex');
  }

  // 만료된 캐시 정리
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (value.expires <= now) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`토큰 캐시 정리: ${cleaned}개 항목 제거`);
    }
  }

  // 가장 오래된 항목 제거
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, value] of this.cache.entries()) {
      if (value.cachedAt < oldestTime) {
        oldestTime = value.cachedAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`토큰 캐시 제거: ${oldestKey}`);
    }
  }

  // 히트율 계산
  getHitRate() {
    const total = this.hitCount + this.missCount;
    return total > 0 ? Math.round((this.hitCount / total) * 100) : 0;
  }

  // 캐시 통계
  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;
    
    for (const value of this.cache.values()) {
      if (value.expires > now) {
        valid++;
      } else {
        expired++;
      }
    }
    
    return {
      total: this.cache.size,
      valid,
      expired,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.getHitRate(),
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  // 메모리 사용량 추정 (바이트)
  estimateMemoryUsage() {
    let totalSize = 0;
    for (const [key, value] of this.cache.entries()) {
      totalSize += key.length * 2; // 문자열은 2바이트/문자
      totalSize += JSON.stringify(value).length * 2;
    }
    return totalSize;
  }

  // 캐시 무효화 (특정 사용자)
  invalidateUser(uid) {
    let removed = 0;
    for (const [key, value] of this.cache.entries()) {
      if (value.uid === uid) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`사용자 ${uid} 토큰 캐시 무효화: ${removed}개 항목 제거`);
    }
  }

  // 전체 캐시 클리어
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`토큰 캐시 전체 클리어: ${size}개 항목 제거`);
  }
}

// 전역 토큰 캐시 인스턴스
const tokenCache = new TokenCache();

// 관리자 권한 확인 미들웨어 (토큰 캐싱 적용)
const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
    }

    // 토큰 캐싱을 통한 검증
    const decodedToken = await tokenCache.verifyAndCache(token);
    
    // 호환성: 새로운 데이터 모델과 기존 데이터 모델 모두 지원
    let userData = null;
    let userRole = 'user';
    
    // 1. 새로운 데이터 모델 시도: users/{uid} 구조
    const userRef = db.ref(`users/${decodedToken.uid}`);
    const userSnapshot = await userRef.once('value');
    userData = userSnapshot.val();
    
    if (userData) {
      // 새로운 구조에서 역할 정보 조회
      const roleRef = db.ref(`meta/roles/${decodedToken.uid}`);
      const roleSnapshot = await roleRef.once('value');
      const roleData = roleSnapshot.val();
      userRole = roleData?.role || 'user';
    } else {
      // 2. 기존 데이터 모델 시도: users/{key} 구조 (firebaseUid로 매칭)
      const usersRef = db.ref('users');
      const snapshot = await usersRef.once('value');
      const users = snapshot.val() || {};
      
      for (const key in users) {
        if (users[key] && users[key].firebaseUid === decodedToken.uid) {
          userData = users[key];
          userRole = users[key].role || 'user';
          break;
        }
      }
    }

    if (!userData || userRole !== 'admin' || userData.status !== 'approved') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('인증 오류:', error);
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
};

// 사용자 비밀번호 변경 API
app.post('/api/update-password', verifyCSRF, verifyAdmin, async (req, res) => {
  try {
    const { uid, newPassword } = req.body;

    if (!uid || !newPassword) {
      return res.status(400).json({ error: 'UID와 새 비밀번호가 필요합니다.' });
    }

    // 비밀번호 강도 검증
    if (newPassword.length < 8 || 
        !/[A-Z]/.test(newPassword) || 
        !/[a-z]/.test(newPassword) || 
        !/\d/.test(newPassword) || 
        !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      return res.status(400).json({ 
        error: '비밀번호는 8자 이상, 대소문자, 숫자, 특수문자를 포함해야 합니다.' 
      });
    }

    // Firebase Auth에서만 비밀번호 업데이트 (DB에는 평문 저장하지 않음)
    await admin.auth().updateUser(uid, {
      password: newPassword
    });

    // Firebase Database에는 메타 정보만 업데이트 (비밀번호는 저장하지 않음)
    const userRef = db.ref(`users/${uid}`);
    await userRef.update({
      passwordUpdatedAt: new Date().toISOString(),
      passwordUpdatedBy: req.user.uid,
      updatedAt: new Date().toISOString()
    });

    // 비밀번호 변경 시 토큰 캐시 무효화 (보안상 중요)
    tokenCache.invalidateUser(uid);

    res.json({ 
      success: true, 
      message: '비밀번호가 성공적으로 변경되었습니다.' 
    });

  } catch (error) {
    console.error('비밀번호 변경 오류:', error);
    res.status(500).json({ 
      error: '비밀번호 변경 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 사용자 정보 업데이트 API
app.post('/api/update-user', verifyCSRF, verifyAdmin, async (req, res) => {
  try {
    const { uid, userData } = req.body;

    if (!uid || !userData) {
      return res.status(400).json({ error: 'UID와 사용자 데이터가 필요합니다.' });
    }

    // 새로운 데이터 모델: users/{uid} 구조로 업데이트
    const userRef = db.ref(`users/${uid}`);
    await userRef.update({
      ...userData,
      updatedAt: new Date().toISOString()
    });
    
    // 역할 정보가 포함된 경우 별도 인덱스도 업데이트
    if (userData.role) {
      const roleRef = db.ref(`meta/roles/${uid}`);
      await roleRef.update({
        role: userData.role,
        updatedAt: new Date().toISOString()
      });
    }

    // 사용자 정보 변경 시 토큰 캐시 무효화
    tokenCache.invalidateUser(uid);

    res.json({ 
      success: true, 
      message: '사용자 정보가 성공적으로 업데이트되었습니다.' 
    });

  } catch (error) {
    console.error('사용자 정보 업데이트 오류:', error);
    res.status(500).json({ 
      error: '사용자 정보 업데이트 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// KOSIS 프록시 라우트 (서버에서만 API 키 관리)
// 허용 파라미터 화이트리스트(필요 시 확장)
const ALLOWED_KOSIS_PARAMS = new Set([
  'orgId', 'tblId', 'itmId', 'objL1', 'objL2', 'objL3', 'objL4', 'objL5',
  'format', 'jsonVD', 'prdSe', 'prdInterval', 'newEstPrdCnt'
]);

app.get('/api/kosis', async (req, res) => {
  try {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (ALLOWED_KOSIS_PARAMS.has(key) && typeof value === 'string') {
        queryParams.set(key, value);
      }
    }

    // 환경변수 필수: fallback 제거
    const serverKosisKey = process.env.KOSIS_API_KEY;
    if (!serverKosisKey) {
      return res.status(500).json({ error: 'KOSIS_API_KEY 환경변수가 설정되지 않았습니다.' });
    }
    queryParams.set('apiKey', serverKosisKey);

    const endpoint = 'https://kosis.kr/openapi/Param/statisticsParameterData.do';
    const url = `${endpoint}?${queryParams.toString()}`;

    const resp = await fetch(url, { timeout: 15000 });
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok) {
      const details = await resp.text().catch(() => '');
      return res.status(resp.status).json({ error: 'KOSIS 응답 오류', status: resp.status, details });
    }
    if (contentType.includes('application/json')) {
      const data = await resp.json();
      return res.json(data);
    }
    const text = await resp.text();
    res.setHeader('content-type', contentType || 'text/plain; charset=utf-8');
    return res.send(text);
  } catch (error) {
    console.error('KOSIS 프록시 오류:', error);
    return res.status(500).json({ error: 'KOSIS 프록시 처리 중 오류가 발생했습니다.' });
  }
});

// 토큰 캐시 관리 API (관리자 전용)
app.get('/api/cache/stats', verifyAdmin, (req, res) => {
  try {
    const stats = tokenCache.getStats();
    res.json({
      success: true,
      cache: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('캐시 통계 조회 오류:', error);
    res.status(500).json({ 
      error: '캐시 통계 조회 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 토큰 캐시 무효화 API (관리자 전용)
app.post('/api/cache/invalidate', verifyCSRF, verifyAdmin, (req, res) => {
  try {
    const { uid, clearAll } = req.body;
    
    if (clearAll) {
      tokenCache.clear();
      res.json({ 
        success: true, 
        message: '전체 토큰 캐시가 무효화되었습니다.' 
      });
    } else if (uid) {
      tokenCache.invalidateUser(uid);
      res.json({ 
        success: true, 
        message: `사용자 ${uid}의 토큰 캐시가 무효화되었습니다.` 
      });
    } else {
      res.status(400).json({ error: 'uid 또는 clearAll 파라미터가 필요합니다.' });
    }
  } catch (error) {
    console.error('캐시 무효화 오류:', error);
    res.status(500).json({ 
      error: '캐시 무효화 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log('토큰 캐싱 시스템이 활성화되었습니다.');
});
