/**
 * 데이터 복구 관리 (휴지통) JavaScript
 * CNS Corporation - Data Recovery System
 */

// Firebase 설정 및 초기화
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    set, 
    onValue, 
    remove,
    get 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { 
    getAuth, 
    signOut 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

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
const auth = getAuth(app);

// ================== 전역 변수 ==================
let trashData = [];
let isFirebaseConnected = false;

// ================== 데이터 복구 관리자 클래스 ==================
class DataRecoveryManager {
    constructor() {
        this.trashData = [];
        this.isFirebaseConnected = false;
        this.initializeEventListeners();
        this.checkFirebaseConnection();
    }

    /**
     * 이벤트 리스너 초기화
     */
    initializeEventListeners() {
        // 새로고침 버튼
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadTrashData();
        });

        // 선택 복구 버튼
        document.getElementById('restoreSelectedBtn').addEventListener('click', () => {
            this.restoreSelected();
        });

        // 선택 영구삭제 버튼
        document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
            this.deleteSelected();
        });

        // 휴지통 비우기 버튼
        document.getElementById('emptyTrashBtn').addEventListener('click', () => {
            this.emptyTrash();
        });

        // 전체 선택 체크박스
        document.getElementById('selectAll').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.trash-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });

        // Firebase 재연결 버튼
        document.getElementById('retryFirebaseBtn').addEventListener('click', () => {
            this.checkFirebaseConnection();
        });

        // 로그아웃 버튼
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    /**
     * Firebase 연결 확인
     */
    async checkFirebaseConnection() {
        try {
            const testRef = ref(database, 'propertyCalculator/connectionTest');
            await set(testRef, { timestamp: Date.now() });
            
            this.isFirebaseConnected = true;
            this.updateFirebaseStatus();
            
            // 데이터 로드
            this.loadTrashData();
            
            console.log('Firebase 연결 성공');
        } catch (error) {
            console.error('Firebase 연결 실패:', error);
            this.isFirebaseConnected = false;
            this.updateFirebaseStatus();
        }
    }

    /**
     * Firebase 연결 상태 업데이트
     */
    updateFirebaseStatus() {
        const warningElement = document.getElementById('firebaseWarning');
        if (this.isFirebaseConnected) {
            warningElement.style.display = 'none';
        } else {
            warningElement.style.display = 'block';
        }
    }

    /**
     * 휴지통 데이터 로드
     */
    async loadTrashData() {
        if (!this.isFirebaseConnected) {
            console.log('Firebase 연결되지 않음');
            return;
        }

        try {
            const trashRef = ref(database, 'propertyCalculator/trash');
            onValue(trashRef, (snapshot) => {
                const data = snapshot.val();
                
                if (data) {
                    this.trashData = Object.values(data);
                    console.log('휴지통 데이터 로드:', this.trashData.length, '개 항목');
                } else {
                    this.trashData = [];
                    console.log('휴지통이 비어있습니다');
                }
                
                this.renderTrashTable();
                this.updateStatistics();
            });
        } catch (error) {
            console.error('휴지통 데이터 로드 실패:', error);
        }
    }

    /**
     * 휴지통 테이블 렌더링
     */
    renderTrashTable() {
        const tbody = document.getElementById('trashTableBody');
        const noDataMessage = document.getElementById('noDataMessage');
        
        tbody.innerHTML = '';
        
        if (this.trashData.length === 0) {
            noDataMessage.style.display = 'block';
            document.querySelector('.trash-table').style.display = 'none';
            return;
        }
        
        noDataMessage.style.display = 'none';
        document.querySelector('.trash-table').style.display = 'table';
        
        // 만료일 기준으로 정렬 (가장 빨리 만료되는 것부터)
        const sortedData = [...this.trashData].sort((a, b) => a.expiresAt - b.expiresAt);
        
        sortedData.forEach(item => {
            const row = this.createTrashRow(item);
            tbody.appendChild(row);
        });
    }

    /**
     * 휴지통 행 생성
     */
    createTrashRow(item) {
        const row = document.createElement('tr');
        
        const historyItem = item.historyItem || {};
        const deletedDate = new Date(item.deletedAt);
        const expiresDate = new Date(item.expiresAt);
        const now = Date.now();
        const daysUntilExpire = Math.ceil((item.expiresAt - now) / (1000 * 60 * 60 * 24));
        
        // 만료 임박 스타일
        const expiresClass = daysUntilExpire <= 7 ? 'expires-soon' : 'expires-normal';
        
        row.innerHTML = `
            <td class="checkbox-cell">
                <input type="checkbox" class="trash-checkbox" data-id="${item.id}">
            </td>
            <td>${historyItem.propertyName || '-'}</td>
            <td>${historyItem.propertyAddress || '-'}</td>
            <td>${this.formatMillionWon(historyItem.currentValue)}</td>
            <td>${deletedDate.toLocaleString('ko-KR')}</td>
            <td class="${expiresClass}">
                ${expiresDate.toLocaleDateString('ko-KR')}
                <br><small>(${daysUntilExpire}일 남음)</small>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-success btn-sm restore-btn" data-id="${item.id}">
                        <i class="fas fa-undo"></i> 복구
                    </button>
                    <button class="btn btn-danger btn-sm delete-btn" data-id="${item.id}">
                        <i class="fas fa-trash"></i> 삭제
                    </button>
                </div>
            </td>
        `;
        
        // 버튼 이벤트 리스너 추가
        row.querySelector('.restore-btn').addEventListener('click', () => {
            this.restoreItem(item.id);
        });
        
        row.querySelector('.delete-btn').addEventListener('click', () => {
            this.deleteItem(item.id);
        });
        
        return row;
    }

    /**
     * 백만원 단위로 포맷팅
     */
    formatMillionWon(value) {
        if (!value || value === '') return '0 백만원';
        const num = parseFloat(value.toString().replace(/,/g, ''));
        if (isNaN(num)) return '0 백만원';
        const millionValue = (num / 1000000).toFixed(0);
        return `${parseInt(millionValue).toLocaleString('ko-KR')} 백만원`;
    }

    /**
     * 통계 업데이트
     */
    updateStatistics() {
        const totalCount = this.trashData.length;
        const now = Date.now();
        const sevenDaysFromNow = now + (7 * 24 * 60 * 60 * 1000);
        
        const expiringSoonCount = this.trashData.filter(item => 
            item.expiresAt <= sevenDaysFromNow && item.expiresAt > now
        ).length;
        
        // 대략적인 용량 계산 (KB)
        const storageSize = Math.ceil(JSON.stringify(this.trashData).length / 1024);
        
        document.getElementById('totalTrashCount').textContent = totalCount;
        document.getElementById('expiringSoonCount').textContent = expiringSoonCount;
        document.getElementById('storageSize').textContent = `${storageSize} KB`;
    }

    /**
     * 단일 항목 복구
     */
    async restoreItem(itemId) {
        if (!confirm('이 항목을 복구하시겠습니까?')) {
            return;
        }

        try {
            const trashItem = this.trashData.find(item => item.id === itemId);
            if (!trashItem) {
                alert('항목을 찾을 수 없습니다.');
                return;
            }

            // 원본 데이터로 복구
            const historyRef = ref(database, `propertyCalculator/history/${itemId}`);
            await set(historyRef, trashItem.historyItem);
            
            if (trashItem.inputData) {
                const inputsRef = ref(database, `propertyCalculator/inputs/${itemId}`);
                await set(inputsRef, trashItem.inputData);
            }
            
            // 휴지통에서 삭제
            const trashRef = ref(database, `propertyCalculator/trash/${itemId}`);
            await remove(trashRef);
            
            alert('항목이 성공적으로 복구되었습니다.');
            
        } catch (error) {
            console.error('복구 실패:', error);
            alert('복구 중 오류가 발생했습니다.');
        }
    }

    /**
     * 선택된 항목들 복구
     */
    async restoreSelected() {
        const checkboxes = document.querySelectorAll('.trash-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('복구할 항목을 선택해주세요.');
            return;
        }

        if (!confirm(`선택한 ${checkboxes.length}개 항목을 복구하시겠습니까?`)) {
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const checkbox of checkboxes) {
            const itemId = parseInt(checkbox.dataset.id);
            try {
                const trashItem = this.trashData.find(item => item.id === itemId);
                if (!trashItem) continue;

                // 원본 데이터로 복구
                const historyRef = ref(database, `propertyCalculator/history/${itemId}`);
                await set(historyRef, trashItem.historyItem);
                
                if (trashItem.inputData) {
                    const inputsRef = ref(database, `propertyCalculator/inputs/${itemId}`);
                    await set(inputsRef, trashItem.inputData);
                }
                
                // 휴지통에서 삭제
                const trashRef = ref(database, `propertyCalculator/trash/${itemId}`);
                await remove(trashRef);
                
                successCount++;
            } catch (error) {
                console.error('복구 실패:', itemId, error);
                failCount++;
            }
        }

        alert(`복구 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
    }

    /**
     * 단일 항목 영구 삭제
     */
    async deleteItem(itemId) {
        if (!confirm('이 항목을 영구 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.')) {
            return;
        }

        try {
            const trashRef = ref(database, `propertyCalculator/trash/${itemId}`);
            await remove(trashRef);
            
            alert('항목이 영구 삭제되었습니다.');
            
        } catch (error) {
            console.error('삭제 실패:', error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    }

    /**
     * 선택된 항목들 영구 삭제
     */
    async deleteSelected() {
        const checkboxes = document.querySelectorAll('.trash-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('삭제할 항목을 선택해주세요.');
            return;
        }

        if (!confirm(`선택한 ${checkboxes.length}개 항목을 영구 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const checkbox of checkboxes) {
            const itemId = parseInt(checkbox.dataset.id);
            try {
                const trashRef = ref(database, `propertyCalculator/trash/${itemId}`);
                await remove(trashRef);
                successCount++;
            } catch (error) {
                console.error('삭제 실패:', itemId, error);
                failCount++;
            }
        }

        alert(`삭제 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
    }

    /**
     * 휴지통 비우기
     */
    async emptyTrash() {
        if (this.trashData.length === 0) {
            alert('휴지통이 비어있습니다.');
            return;
        }

        if (!confirm(`휴지통의 모든 항목(${this.trashData.length}개)을 영구 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
            return;
        }

        try {
            const trashRef = ref(database, 'propertyCalculator/trash');
            await remove(trashRef);
            
            alert('휴지통이 비워졌습니다.');
            
        } catch (error) {
            console.error('휴지통 비우기 실패:', error);
            alert('휴지통 비우기 중 오류가 발생했습니다.');
        }
    }

    /**
     * 로그아웃
     */
    async logout() {
        try {
            await signOut(auth);
            window.location.href = 'index.html';
        } catch (error) {
            console.error('로그아웃 실패:', error);
            alert('로그아웃 중 오류가 발생했습니다.');
        }
    }
}

// ================== 초기화 ==================
let recoveryManager;

// 페이지 로드 시 권한 확인
document.addEventListener('DOMContentLoaded', function() {
    // 관리자 권한 확인
    const isLoggedIn = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
    const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
    const userRole = localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
    
    if (isLoggedIn !== 'true' || userRole !== 'admin') {
        alert('관리자 권한이 필요합니다.');
        window.location.href = 'index.html';
        return;
    }

    // 사용자 정보 표시
    const storedUserName = localStorage.getItem('userName') || sessionStorage.getItem('userName');
    if (storedUserName) {
        document.getElementById('adminName').textContent = `${storedUserName}님`;
    } else if (userId) {
        document.getElementById('adminName').textContent = `${userId}님`;
    }
    document.getElementById('adminDept').textContent = '관리자';
    
    // 복구 관리자 초기화
    recoveryManager = new DataRecoveryManager();
});
