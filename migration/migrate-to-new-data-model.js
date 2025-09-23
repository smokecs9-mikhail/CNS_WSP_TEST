/**
 * Firebase Realtime Database 데이터 모델 마이그레이션 스크립트
 * 
 * 기존 구조: users/{key} -> firebaseUid 필드로 매칭
 * 새로운 구조: users/{uid} -> 직접 UID 사용
 * 
 * 실행 방법:
 * 1. Firebase Admin SDK 설정 후
 * 2. node migration/migrate-to-new-data-model.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase-admin-config.js');

// Firebase Admin 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function migrateToNewDataModel() {
  console.log('🚀 Firebase 데이터 모델 마이그레이션 시작...');
  
  try {
    // 1. 기존 users 데이터 조회
    console.log('📋 기존 users 데이터 조회 중...');
    const usersSnapshot = await db.ref('users').once('value');
    const usersData = usersSnapshot.val();
    
    if (!usersData) {
      console.log('❌ 기존 users 데이터가 없습니다.');
      return;
    }
    
    console.log(`📊 총 ${Object.keys(usersData).length}개의 사용자 데이터 발견`);
    
    // 2. 새로운 구조로 데이터 변환
    const newUsersData = {};
    const newRolesData = {};
    const migrationLog = [];
    
    for (const [oldKey, userData] of Object.entries(usersData)) {
      if (!userData || !userData.firebaseUid) {
        console.log(`⚠️  사용자 ${oldKey}: firebaseUid가 없어 건너뜀`);
        migrationLog.push({
          oldKey,
          status: 'skipped',
          reason: 'firebaseUid 없음'
        });
        continue;
      }
      
      const uid = userData.firebaseUid;
      
      // 새로운 users/{uid} 구조로 데이터 복사
      newUsersData[uid] = {
        name: userData.name || '',
        email: userData.email || '',
        status: userData.status || 'pending',
        createdAt: userData.createdAt || new Date().toISOString(),
        updatedAt: userData.updatedAt || new Date().toISOString(),
        // firebaseUid 필드는 제거 (이제 키가 UID이므로)
        // role 필드는 별도 인덱스로 이동
      };
      
      // 새로운 meta/roles/{uid} 구조로 역할 정보 복사
      newRolesData[uid] = {
        role: userData.role || 'user',
        permissions: userData.permissions || {},
        createdAt: userData.createdAt || new Date().toISOString(),
        updatedAt: userData.updatedAt || new Date().toISOString()
      };
      
      migrationLog.push({
        oldKey,
        newKey: uid,
        name: userData.name,
        role: userData.role || 'user',
        status: 'migrated'
      });
      
      console.log(`✅ ${userData.name} (${oldKey} -> ${uid}) 마이그레이션 완료`);
    }
    
    // 3. 기존 admins 데이터도 새로운 구조로 마이그레이션
    console.log('👑 기존 admins 데이터 마이그레이션 중...');
    const adminsSnapshot = await db.ref('meta/admins').once('value');
    const adminsData = adminsSnapshot.val();
    
    if (adminsData) {
      for (const [uid, isAdmin] of Object.entries(adminsData)) {
        if (isAdmin === true && newRolesData[uid]) {
          newRolesData[uid].role = 'admin';
          console.log(`👑 ${uid}를 관리자로 설정`);
        }
      }
    }
    
    // 4. 백업 생성 (기존 데이터 보존)
    console.log('💾 기존 데이터 백업 생성 중...');
    const backupKey = `backup_${Date.now()}`;
    await db.ref(`backups/${backupKey}`).set({
      users: usersData,
      admins: adminsData,
      migratedAt: new Date().toISOString(),
      migrationVersion: '1.0'
    });
    console.log(`💾 백업 완료: backups/${backupKey}`);
    
    // 5. 새로운 데이터 구조로 저장
    console.log('💾 새로운 데이터 구조로 저장 중...');
    
    // 기존 데이터를 새로운 구조로 덮어쓰기
    await db.ref('users').set(newUsersData);
    console.log('✅ users 데이터 마이그레이션 완료');
    
    // meta/roles 데이터 저장
    await db.ref('meta/roles').set(newRolesData);
    console.log('✅ meta/roles 데이터 마이그레이션 완료');
    
    // 6. 마이그레이션 로그 저장
    await db.ref(`migration_logs/${backupKey}`).set({
      migrationLog,
      totalUsers: Object.keys(usersData).length,
      migratedUsers: migrationLog.filter(log => log.status === 'migrated').length,
      skippedUsers: migrationLog.filter(log => log.status === 'skipped').length,
      migratedAt: new Date().toISOString()
    });
    
    // 7. 결과 출력
    console.log('\n🎉 마이그레이션 완료!');
    console.log(`📊 총 사용자: ${Object.keys(usersData).length}명`);
    console.log(`✅ 마이그레이션 성공: ${migrationLog.filter(log => log.status === 'migrated').length}명`);
    console.log(`⚠️  건너뜀: ${migrationLog.filter(log => log.status === 'skipped').length}명`);
    console.log(`💾 백업 위치: backups/${backupKey}`);
    console.log(`📋 마이그레이션 로그: migration_logs/${backupKey}`);
    
    // 8. 검증
    console.log('\n🔍 마이그레이션 결과 검증 중...');
    const newUsersSnapshot = await db.ref('users').once('value');
    const newRolesSnapshot = await db.ref('meta/roles').once('value');
    
    console.log(`✅ 새로운 users 데이터: ${Object.keys(newUsersSnapshot.val() || {}).length}개`);
    console.log(`✅ 새로운 roles 데이터: ${Object.keys(newRolesSnapshot.val() || {}).length}개`);
    
    console.log('\n✨ 마이그레이션이 성공적으로 완료되었습니다!');
    console.log('⚠️  기존 firebase-rules.json을 새로운 버전으로 업데이트하세요.');
    
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    throw error;
  }
}

// 롤백 함수 (필요시 사용)
async function rollbackMigration(backupKey) {
  console.log(`🔄 마이그레이션 롤백 시작: ${backupKey}`);
  
  try {
    const backupSnapshot = await db.ref(`backups/${backupKey}`).once('value');
    const backupData = backupSnapshot.val();
    
    if (!backupData) {
      throw new Error(`백업 데이터를 찾을 수 없습니다: ${backupKey}`);
    }
    
    // 기존 데이터 복원
    await db.ref('users').set(backupData.users);
    await db.ref('meta/admins').set(backupData.admins);
    
    console.log('✅ 롤백 완료');
  } catch (error) {
    console.error('❌ 롤백 실패:', error);
    throw error;
  }
}

// 스크립트 실행
if (require.main === module) {
  migrateToNewDataModel()
    .then(() => {
      console.log('🎯 마이그레이션 스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 마이그레이션 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = {
  migrateToNewDataModel,
  rollbackMigration
};
