const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정
app.use(cors());
app.use(express.json());

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

// 관리자 권한 확인 미들웨어
const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    const userRef = db.ref(`migratedUsers/${decodedToken.uid}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (!userData || userData.role !== 'admin' || userData.status !== 'approved') {
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
app.post('/api/update-password', verifyAdmin, async (req, res) => {
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

    // Firebase Auth에서 비밀번호 업데이트
    await admin.auth().updateUser(uid, {
      password: newPassword
    });

    // Firebase Database에서도 비밀번호 업데이트
    const userRef = db.ref(`migratedUsers/${uid}`);
    await userRef.update({
      password: newPassword,
      processedAt: new Date().toISOString()
    });

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
app.post('/api/update-user', verifyAdmin, async (req, res) => {
  try {
    const { uid, userData } = req.body;

    if (!uid || !userData) {
      return res.status(400).json({ error: 'UID와 사용자 데이터가 필요합니다.' });
    }

    // Firebase Database 업데이트
    const userRef = db.ref(`migratedUsers/${uid}`);
    await userRef.update({
      ...userData,
      processedAt: new Date().toISOString()
    });

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

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
