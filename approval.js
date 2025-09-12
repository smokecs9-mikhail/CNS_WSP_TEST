// 승인관리 페이지 JavaScript
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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

document.addEventListener('DOMContentLoaded', function() {
    const adminName = document.getElementById('adminName');
    const adminDept = document.getElementById('adminDept');
    const logoutBtn = document.getElementById('logoutBtn');
    const approvalTableBody = document.getElementById('approvalTableBody');
    const noDataMessage = document.getElementById('noDataMessage');
    const refreshBtn = document.getElementById('refreshBtn');
    
    // 통계 요소들
    const pendingCount = document.getElementById('pendingCount');
    const approvedCount = document.getElementById('approvedCount');
    const rejectedCount = document.getElementById('rejectedCount');
    
    // 필터 버튼들
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // 모달 요소들
    const approvalModal = new bootstrap.Modal(document.getElementById('approvalModal'));
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalUserName = document.getElementById('modalUserName');
    const modalUserId = document.getElementById('modalUserId');
    const modalUserRole = document.getElementById('modalUserRole');
    const confirmApproval = document.getElementById('confirmApproval');
    const confirmRejection = document.getElementById('confirmRejection');
    
    let currentFilter = 'all';
    let currentUserId = null;

    // 관리자 권한 확인
    checkAdminStatus();
    
    // 초기 데이터 로드
    loadApprovalData();
    updateStats();

    // 이벤트 리스너
    refreshBtn.addEventListener('click', () => {
        loadApprovalData();
        updateStats();
    });
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentFilter = e.target.dataset.filter;
            updateFilterButtons();
            loadApprovalData();
        });
    });
    
    confirmApproval.addEventListener('click', () => {
        updateUserStatus(currentUserId, 'approved');
        approvalModal.hide();
    });
    
    confirmRejection.addEventListener('click', () => {
        updateUserStatus(currentUserId, 'rejected');
        approvalModal.hide();
    });

    // 관리자 권한 확인 함수
    function checkAdminStatus() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') || sessionStorage.getItem('isLoggedIn');
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        const userRole = localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
        
        if (isLoggedIn !== 'true' || userRole !== 'admin') {
            window.location.href = 'index.html';
            return;
        }

        if (userId) {
            const storedUserName = localStorage.getItem('userName') || sessionStorage.getItem('userName');
            if (storedUserName) {
                adminName.textContent = `${storedUserName}님`;
            } else {
                adminName.textContent = `${userId}님`;
            }
            adminDept.textContent = '관리자';
        }
    }
    
    // 승인 데이터 로드 (users 사용)
    async function loadApprovalData() {
        try {
            console.log('승인 데이터 로드 시작...');
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const usersData = snapshot.val() || {};
            
            console.log('Firebase에서 받은 사용자 데이터:', usersData);
            
            // 객체를 배열로 변환
            const users = Object.values(usersData);
            console.log('사용자 배열:', users);
            
            let filteredUsers = users;
            
            // 필터 적용
            if (currentFilter !== 'all') {
                filteredUsers = users.filter(user => user.status === currentFilter);
                console.log(`필터 적용 (${currentFilter}):`, filteredUsers);
            }
            
            // 테이블 업데이트
            updateApprovalTable(filteredUsers);
        } catch (error) {
            console.error('데이터 로드 오류:', error);
            showNotification('데이터를 불러오는 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 승인 테이블 업데이트 (XSS 방지: DOM 조립)
    function updateApprovalTable(users) {
        approvalTableBody.textContent = '';
        
        if (users.length === 0) {
            noDataMessage.style.display = 'block';
            return;
        }
        
        noDataMessage.style.display = 'none';
        
        users.forEach((user, index) => {
            const row = document.createElement('tr');

            const tdIndex = document.createElement('td');
            tdIndex.textContent = String(index + 1);

            const tdName = document.createElement('td');
            tdName.textContent = user.name || '';

            const tdId = document.createElement('td');
            tdId.textContent = user.id || '';

            const tdRole = document.createElement('td');
            const roleSpan = document.createElement('span');
            roleSpan.className = `role-badge ${user.role}`;
            roleSpan.textContent = user.role === 'admin' ? '관리자' : '사용자';
            tdRole.appendChild(roleSpan);

            const tdCreated = document.createElement('td');
            tdCreated.textContent = user.createdAt ? formatDate(user.createdAt) : '-';

            const tdStatus = document.createElement('td');
            const statusSpan = document.createElement('span');
            statusSpan.className = `status-badge ${user.status}`;
            statusSpan.textContent = getStatusText(user.status);
            tdStatus.appendChild(statusSpan);

            const tdActions = document.createElement('td');
            if (user.status === 'pending') {
                const approveBtn = document.createElement('button');
                approveBtn.className = 'btn btn-success btn-sm';
                approveBtn.innerHTML = '<i class="fas fa-check"></i> 승인';
                approveBtn.addEventListener('click', () => window.showApprovalModal(user.id, 'approve'));

                const rejectBtn = document.createElement('button');
                rejectBtn.className = 'btn btn-danger btn-sm';
                rejectBtn.style.marginLeft = '6px';
                rejectBtn.innerHTML = '<i class="fas fa-times"></i> 거부';
                rejectBtn.addEventListener('click', () => window.showApprovalModal(user.id, 'reject'));

                tdActions.appendChild(approveBtn);
                tdActions.appendChild(rejectBtn);
            } else {
                const doneSpan = document.createElement('span');
                doneSpan.className = 'text-muted';
                doneSpan.textContent = '처리완료';
                tdActions.appendChild(doneSpan);
            }

            row.appendChild(tdIndex);
            row.appendChild(tdName);
            row.appendChild(tdId);
            row.appendChild(tdRole);
            row.appendChild(tdCreated);
            row.appendChild(tdStatus);
            row.appendChild(tdActions);

            approvalTableBody.appendChild(row);
        });
    }
    
    // 승인 모달 표시
    window.showApprovalModal = async function(userId, action) {
        try {
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const usersData = snapshot.val() || {};
            const users = Object.values(usersData);
            const user = users.find(u => u.id === userId);
            
            if (!user) return;
            
            currentUserId = userId;
            modalUserName.textContent = user.name;
            modalUserId.textContent = user.id;
            modalUserRole.textContent = user.role === 'admin' ? '관리자' : '사용자';
            
            if (action === 'approve') {
                modalTitle.textContent = '승인 확인';
                modalMessage.textContent = '정말로 이 사용자를 승인하시겠습니까?';
                confirmApproval.style.display = 'inline-block';
                confirmRejection.style.display = 'none';
            } else {
                modalTitle.textContent = '거부 확인';
                modalMessage.textContent = '정말로 이 사용자를 거부하시겠습니까?';
                confirmApproval.style.display = 'none';
                confirmRejection.style.display = 'inline-block';
            }
            
            approvalModal.show();
        } catch (error) {
            console.error('사용자 정보 로드 오류:', error);
            showNotification('사용자 정보를 불러오는 중 오류가 발생했습니다.', 'error');
        }
    };
    
    // 사용자 상태 업데이트
    async function updateUserStatus(userId, newStatus) {
        try {
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const usersData = snapshot.val() || {};
            
            // 사용자 찾기
            let userKey = null;
            for (const key in usersData) {
                if (usersData[key].id === userId) {
                    userKey = key;
                    break;
                }
            }
            
            if (userKey) {
                // 사용자 상태 업데이트
                const userRef = ref(database, `users/${userKey}`);
                const updatedUser = {
                    ...usersData[userKey],
                    status: newStatus,
                    processedAt: new Date().toISOString()
                };
                await set(userRef, updatedUser);

                // migratedUsers 동기화 제거: 이제 users만 사용
                
                // 데이터 새로고침
                loadApprovalData();
                updateStats();
                
                // 성공 메시지
                showNotification(`${newStatus === 'approved' ? '승인' : '거부'} 처리되었습니다.`, 'success');
            }
        } catch (error) {
            console.error('상태 업데이트 오류:', error);
            showNotification('상태 업데이트 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 통계 업데이트 (users 사용)
    async function updateStats() {
        try {
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const usersData = snapshot.val() || {};
            const users = Object.values(usersData);
            
            const pending = users.filter(user => user.status === 'pending').length;
            const approved = users.filter(user => user.status === 'approved').length;
            const rejected = users.filter(user => user.status === 'rejected').length;
            
            pendingCount.textContent = pending;
            approvedCount.textContent = approved;
            rejectedCount.textContent = rejected;
        } catch (error) {
            console.error('통계 업데이트 오류:', error);
        }
    }
    
    // 필터 버튼 업데이트
    function updateFilterButtons() {
        filterBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === currentFilter) {
                btn.classList.add('active');
            }
        });
    }
    
    // 날짜 포맷팅
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // 상태 텍스트 변환
    function getStatusText(status) {
        switch (status) {
            case 'pending': return '승인 대기';
            case 'approved': return '승인 완료';
            case 'rejected': return '승인 거부';
            default: return '알 수 없음';
        }
    }
    
    // 알림 표시
    function showNotification(message, type = 'info') {
        // 간단한 알림 구현
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;
        
        if (type === 'success') {
            notification.style.backgroundColor = '#28a745';
        } else if (type === 'error') {
            notification.style.backgroundColor = '#dc3545';
        } else {
            notification.style.backgroundColor = '#007bff';
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // 로그아웃 함수
    function logout() {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userId');
        localStorage.removeItem('userRole');
        localStorage.removeItem('keepLogin');
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('userId');
        sessionStorage.removeItem('userRole');
        window.location.href = 'index.html';
    }
    
    logoutBtn.addEventListener('click', logout);
});
