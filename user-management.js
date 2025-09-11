// 사용자 관리 페이지 JavaScript
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, set, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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
    const userTableBody = document.getElementById('userTableBody');
    const noUserMessage = document.getElementById('noUserMessage');
    const refreshUsersBtn = document.getElementById('refreshUsersBtn');
    
    // 통계 요소들
    const totalUserCount = document.getElementById('totalUserCount');
    const activeUserCount = document.getElementById('activeUserCount');
    const adminUserCount = document.getElementById('adminUserCount');
    const inactiveUserCount = document.getElementById('inactiveUserCount');
    
    // 필터 및 검색 요소들
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const roleFilter = document.getElementById('roleFilter');
    
    // 모달 요소들
    const userDetailModal = new bootstrap.Modal(document.getElementById('userDetailModal'));
    const editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
    
    // 사용자 상세 정보 모달 요소들
    const detailName = document.getElementById('detailName');
    const detailId = document.getElementById('detailId');
    const detailRole = document.getElementById('detailRole');
    const detailStatus = document.getElementById('detailStatus');
    const detailCreatedAt = document.getElementById('detailCreatedAt');
    const detailProcessedAt = document.getElementById('detailProcessedAt');
    
    // 사용자 수정 모달 요소들
    const editUserName = document.getElementById('editUserName');
    const editUserId = document.getElementById('editUserId');
    const editUserRole = document.getElementById('editUserRole');
    const editUserStatus = document.getElementById('editUserStatus');
    
    let allUsers = [];
    let currentUserKey = null;

    // 관리자 권한 확인
    checkAdminStatus();
    
    // 초기 데이터 로드
    loadUsers();
    updateUserStats();

    // 이벤트 리스너
    refreshUsersBtn.addEventListener('click', () => {
        loadUsers();
        updateUserStats();
    });
    
    searchInput.addEventListener('input', filterUsers);
    statusFilter.addEventListener('change', filterUsers);
    roleFilter.addEventListener('change', filterUsers);
    
    // 모달 이벤트 리스너
    document.getElementById('editUserBtn').addEventListener('click', () => {
        userDetailModal.hide();
        editUserModal.show();
        populateEditForm();
    });
    
    document.getElementById('saveUserBtn').addEventListener('click', saveUserChanges);
    document.getElementById('deleteUserBtn').addEventListener('click', deleteUser);

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
    
    // 사용자 데이터 로드
    async function loadUsers() {
        try {
            console.log('사용자 데이터 로드 시작...');
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);
            const usersData = snapshot.val() || {};
            
            console.log('Firebase에서 받은 사용자 데이터:', usersData);
            
            // 객체를 배열로 변환하고 키 정보 추가
            allUsers = Object.entries(usersData).map(([key, user]) => ({
                key: key,
                ...user
            }));
            
            console.log('사용자 배열:', allUsers);
            
            // 테이블 업데이트
            filterUsers();
            
        } catch (error) {
            console.error('사용자 데이터 로드 오류:', error);
            showNotification('사용자 데이터를 불러오는 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 사용자 필터링
    function filterUsers() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusFilterValue = statusFilter.value;
        const roleFilterValue = roleFilter.value;
        
        let filteredUsers = allUsers.filter(user => {
            const matchesSearch = user.name.toLowerCase().includes(searchTerm) || 
                                 user.id.toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilterValue === 'all' || user.status === statusFilterValue;
            const matchesRole = roleFilterValue === 'all' || user.role === roleFilterValue;
            
            return matchesSearch && matchesStatus && matchesRole;
        });
        
        updateUserTable(filteredUsers);
    }
    
    // 사용자 테이블 업데이트
    function updateUserTable(users) {
        userTableBody.innerHTML = '';
        
        if (users.length === 0) {
            noUserMessage.style.display = 'block';
            return;
        }
        
        noUserMessage.style.display = 'none';
        
        users.forEach((user, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${user.name}</td>
                <td>${user.id}</td>
                <td>
                    <span class="role-badge ${user.role}">
                        ${user.role === 'admin' ? '관리자' : '사용자'}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${user.status}">
                        ${getStatusText(user.status)}
                    </span>
                </td>
                <td>${formatDate(user.createdAt)}</td>
                <td>${user.processedAt ? formatDate(user.processedAt) : '-'}</td>
                <td>
                    <button class="btn btn-info btn-sm" onclick="showUserDetail('${user.key}')">
                        <i class="fas fa-eye"></i> 보기
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="editUser('${user.key}')">
                        <i class="fas fa-edit"></i> 수정
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteUserConfirm('${user.key}')">
                        <i class="fas fa-trash"></i> 삭제
                    </button>
                </td>
            `;
            userTableBody.appendChild(row);
        });
    }
    
    // 사용자 상세 정보 표시
    window.showUserDetail = function(userKey) {
        const user = allUsers.find(u => u.key === userKey);
        if (!user) return;
        
        currentUserKey = userKey;
        detailName.textContent = user.name;
        detailId.textContent = user.id;
        detailRole.textContent = user.role === 'admin' ? '관리자' : '사용자';
        detailStatus.textContent = getStatusText(user.status);
        detailCreatedAt.textContent = formatDate(user.createdAt);
        detailProcessedAt.textContent = user.processedAt ? formatDate(user.processedAt) : '-';
        
        userDetailModal.show();
    };
    
    // 사용자 수정
    window.editUser = function(userKey) {
        const user = allUsers.find(u => u.key === userKey);
        if (!user) return;
        
        currentUserKey = userKey;
        editUserName.value = user.name;
        editUserId.value = user.id;
        editUserRole.value = user.role;
        editUserStatus.value = user.status;
        
        userDetailModal.hide();
        editUserModal.show();
    };
    
    // 수정 폼 데이터 채우기
    function populateEditForm() {
        const user = allUsers.find(u => u.key === currentUserKey);
        if (!user) return;
        
        editUserName.value = user.name;
        editUserId.value = user.id;
        editUserRole.value = user.role;
        editUserStatus.value = user.status;
    }
    
    // 사용자 정보 저장
    async function saveUserChanges() {
        try {
            const user = allUsers.find(u => u.key === currentUserKey);
            if (!user) return;
            
            const updatedUser = {
                ...user,
                name: editUserName.value,
                id: editUserId.value,
                role: editUserRole.value,
                status: editUserStatus.value,
                processedAt: new Date().toISOString()
            };
            
            const userRef = ref(database, `users/${currentUserKey}`);
            await set(userRef, updatedUser);
            
            editUserModal.hide();
            loadUsers();
            updateUserStats();
            showNotification('사용자 정보가 성공적으로 수정되었습니다.', 'success');
            
        } catch (error) {
            console.error('사용자 정보 수정 오류:', error);
            showNotification('사용자 정보 수정 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 사용자 삭제 확인
    window.deleteUserConfirm = function(userKey) {
        const user = allUsers.find(u => u.key === userKey);
        if (!user) return;
        
        if (confirm(`정말로 사용자 "${user.name} (${user.id})"를 삭제하시겠습니까?`)) {
            deleteUser(userKey);
        }
    };
    
    // 사용자 삭제
    async function deleteUser(userKey) {
        try {
            const userRef = ref(database, `users/${userKey}`);
            await remove(userRef);
            
            userDetailModal.hide();
            loadUsers();
            updateUserStats();
            showNotification('사용자가 성공적으로 삭제되었습니다.', 'success');
            
        } catch (error) {
            console.error('사용자 삭제 오류:', error);
            showNotification('사용자 삭제 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 사용자 통계 업데이트
    function updateUserStats() {
        const total = allUsers.length;
        const active = allUsers.filter(user => user.status === 'approved').length;
        const admin = allUsers.filter(user => user.role === 'admin').length;
        const inactive = allUsers.filter(user => user.status === 'rejected').length;
        
        totalUserCount.textContent = total;
        activeUserCount.textContent = active;
        adminUserCount.textContent = admin;
        inactiveUserCount.textContent = inactive;
    }
    
    // 날짜 포맷팅
    function formatDate(dateString) {
        if (!dateString) return '-';
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
