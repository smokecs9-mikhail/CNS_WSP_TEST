// 사용자 데이터 백업 스크립트
// Firebase에서 기존 사용자 데이터를 백업하고 분석합니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyBIaa_uz9PaofNXZjHpgkm-wjT4qhaN-vM",
    authDomain: "csy-todo-test.firebaseapp.com",
    databaseURL: "https://csy-todo-test-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "csy-todo-test",
    storageBucket: "csy-todo-test.firebasestorage.app",
    messagingSenderId: "841236508097",
    appId: "1:841236508097:web:18fadfa64353a25a61d340"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function backupUsers() {
    try {
        console.log('🔍 사용자 데이터 백업을 시작합니다...');
        
        // Firebase에서 사용자 데이터 가져오기
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);
        const usersData = snapshot.val() || {};
        
        console.log(`📊 총 ${Object.keys(usersData).length}명의 사용자를 발견했습니다.`);
        
        // 사용자 데이터 분석
        const users = Object.entries(usersData).map(([key, user]) => ({
            firebaseKey: key,
            ...user
        }));
        
        // 사용자 통계
        const stats = {
            total: users.length,
            byRole: {
                admin: users.filter(u => u.role === 'admin').length,
                user: users.filter(u => u.role === 'user').length
            },
            byStatus: {
                approved: users.filter(u => u.status === 'approved').length,
                pending: users.filter(u => u.status === 'pending').length,
                rejected: users.filter(u => u.status === 'rejected').length
            }
        };
        
        console.log('📈 사용자 통계:', stats);
        
        // 백업 데이터 생성
        const backupData = {
            timestamp: new Date().toISOString(),
            stats: stats,
            users: users,
            migrationPlan: {
                emailDomain: '@cns.com',
                passwordStrategy: 'keep_existing',
                uidMapping: 'firebase_key_based'
            }
        };
        
        // 백업 파일 다운로드
        const dataStr = JSON.stringify(backupData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `user-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        console.log('✅ 사용자 데이터 백업이 완료되었습니다.');
        console.log('📁 백업 파일이 다운로드되었습니다.');
        
        // 콘솔에 사용자 목록 출력
        console.log('👥 사용자 목록:');
        users.forEach((user, index) => {
            console.log(`${index + 1}. ${user.name} (${user.id}) - ${user.role} - ${user.status}`);
        });
        
        return backupData;
        
    } catch (error) {
        console.error('❌ 백업 중 오류가 발생했습니다:', error);
        throw error;
    }
}

// 페이지 로드 시 자동 실행
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 사용자 데이터 백업 도구가 준비되었습니다.');
    console.log('백업을 시작하려면 backupUsers() 함수를 호출하세요.');
    
    // 자동으로 백업 실행
    backupUsers().catch(console.error);
});

// 전역 함수로 등록
window.backupUsers = backupUsers;
