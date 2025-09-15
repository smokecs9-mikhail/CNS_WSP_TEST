// 사용자 마이그레이션 스크립트
// 기존 사용자들을 Firebase Auth로 마이그레이션합니다.

import { auth, database, MIGRATION_CONFIG } from './firebase-admin-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

class UserMigrator {
    constructor() {
        this.migrationResults = [];
        this.errors = [];
        this.currentUser = null;
    }

    // 마이그레이션 실행
    async migrateUsers(backupData) {
        try {
            console.log('🚀 사용자 마이그레이션을 시작합니다...');
            
            // 1. 관리자 계정 먼저 생성
            await this.createAdminUser();
            
            // 2. 일반 사용자들 마이그레이션
            const users = backupData.users.filter(user => user.status === 'approved');
            console.log(`📊 ${users.length}명의 승인된 사용자를 마이그레이션합니다.`);
            
            for (const user of users) {
                try {
                    await this.migrateSingleUser(user);
                } catch (error) {
                    console.error(`❌ 사용자 ${user.name} 마이그레이션 실패:`, error);
                    this.errors.push({
                        user: user,
                        error: error.message
                    });
                }
            }
            
            // 3. 결과 요약
            this.printMigrationSummary();
            
            return {
                success: this.migrationResults,
                errors: this.errors
            };
            
        } catch (error) {
            console.error('❌ 마이그레이션 중 치명적 오류:', error);
            throw error;
        }
    }

    // 관리자 계정 생성
    async createAdminUser() {
        try {
            console.log('👑 관리자 계정을 생성합니다...');
            
            const adminEmail = MIGRATION_CONFIG.adminEmail;
            const adminPassword = MIGRATION_CONFIG.adminPassword;
            
            // Firebase Auth에 관리자 계정 생성
            const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
            const adminUser = userCredential.user;
            
            // Firebase Database에 관리자 정보 저장
            const adminData = {
                id: 'admin',
                name: '시스템 관리자',
                role: 'admin',
                status: 'approved',
                email: adminEmail,
                firebaseUid: adminUser.uid,
                migratedAt: new Date().toISOString(),
                originalData: {
                    id: 'admin',
                    password: '0000', // 원래 비밀번호
                    name: '관리자',
                    role: 'admin'
                }
            };
            
            await set(ref(database, `migratedUsers/${adminUser.uid}`), adminData);
            
            this.migrationResults.push({
                originalId: 'admin',
                newEmail: adminEmail,
                firebaseUid: adminUser.uid,
                status: 'success'
            });
            
            console.log('✅ 관리자 계정 생성 완료');
            
            // 로그아웃
            await signOut(auth);
            
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                console.log('ℹ️ 관리자 계정이 이미 존재합니다.');
            } else {
                throw error;
            }
        }
    }

    // 단일 사용자 마이그레이션
    async migrateSingleUser(user) {
        try {
            const email = `${user.id}${MIGRATION_CONFIG.emailDomain}`;
            const password = MIGRATION_CONFIG.defaultPassword;
            
            console.log(`🔄 ${user.name} (${user.id}) 마이그레이션 중...`);
            
            // Firebase Auth에 사용자 생성
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const firebaseUser = userCredential.user;
            
            // Firebase Database에 마이그레이션된 사용자 정보 저장
            const migratedUserData = {
                id: user.id,
                name: user.name,
                role: user.role,
                status: user.status,
                email: email,
                firebaseUid: firebaseUser.uid,
                migratedAt: new Date().toISOString(),
                originalData: {
                    firebaseKey: user.firebaseKey,
                    password: user.password,
                    createdAt: user.createdAt
                }
            };
            
            await set(ref(database, `migratedUsers/${firebaseUser.uid}`), migratedUserData);
            
            this.migrationResults.push({
                originalId: user.id,
                newEmail: email,
                firebaseUid: firebaseUser.uid,
                status: 'success'
            });
            
            console.log(`✅ ${user.name} 마이그레이션 완료`);
            
            // 로그아웃
            await signOut(auth);
            
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                console.log(`ℹ️ ${user.name}의 이메일이 이미 존재합니다: ${email}`);
                this.migrationResults.push({
                    originalId: user.id,
                    newEmail: email,
                    firebaseUid: 'already_exists',
                    status: 'skipped'
                });
            } else {
                throw error;
            }
        }
    }

    // 마이그레이션 결과 요약
    printMigrationSummary() {
        console.log('\n📊 마이그레이션 결과 요약');
        console.log('='.repeat(50));
        console.log(`✅ 성공: ${this.migrationResults.filter(r => r.status === 'success').length}명`);
        console.log(`⏭️ 건너뜀: ${this.migrationResults.filter(r => r.status === 'skipped').length}명`);
        console.log(`❌ 실패: ${this.errors.length}명`);
        console.log('='.repeat(50));
        
        if (this.errors.length > 0) {
            console.log('\n❌ 실패한 사용자들:');
            this.errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error.user.name} (${error.user.id}): ${error.error}`);
            });
        }
    }

    // 마이그레이션 결과 다운로드
    downloadMigrationReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.migrationResults.length,
                success: this.migrationResults.filter(r => r.status === 'success').length,
                skipped: this.migrationResults.filter(r => r.status === 'skipped').length,
                failed: this.errors.length
            },
            results: this.migrationResults,
            errors: this.errors
        };
        
        const dataStr = JSON.stringify(report, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `migration-report-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        console.log('📁 마이그레이션 보고서가 다운로드되었습니다.');
    }
}

// ES6 모듈로 export
export { UserMigrator };

// 전역 함수로도 등록 (호환성을 위해)
window.UserMigrator = UserMigrator;
