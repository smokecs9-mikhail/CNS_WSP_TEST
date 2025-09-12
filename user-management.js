// 사용자 관리 페이지 JavaScript
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, get, set, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
// import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";

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
// const functions = getFunctions(app);

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
    // 비밀번호 관련 요소 제거됨
    
    let allUsers = [];
    let currentUserKey = null;

    // 관리자 권한 확인
    checkAdminStatus();
    
    // 초기 데이터 로드
    loadUsers();

    // 이벤트 리스너
    refreshUsersBtn.addEventListener('click', () => {
        loadUsers();
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
    // 비밀번호 관련 버튼 제거됨
    
    // 비밀번호 토글 기능 제거됨
    
    // 비밀번호 확인 실시간 검증 제거됨

    // 비밀번호 일치 검증 함수 제거됨
    
    // 비밀번호 강도 검증 함수 제거됨

    // 관리자 권한 확인 함수
    function checkAdminStatus() {
        // 최소 정보로 로그인 여부 확인
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true' || sessionStorage.getItem('isLoggedIn') === 'true';
        const firebaseUid = localStorage.getItem('firebaseUid') || sessionStorage.getItem('firebaseUid');
        if (!isLoggedIn || !firebaseUid) {
            window.location.href = 'index.html';
            return;
        }

        // RTDB에서 관리자 확인
        get(ref(database, 'users')).then(snap => {
            const users = snap.val() || {};
            let me = null;
            for (const key in users) {
                if (users[key] && users[key].firebaseUid === firebaseUid) { me = users[key]; break; }
            }
            if (!me || me.role !== 'admin' || me.status !== 'approved') {
                window.location.href = 'index.html';
                return;
            }
            adminName.textContent = `${me.name || me.id}님`;
            adminDept.textContent = '관리자';
        }).catch(() => {
            window.location.href = 'index.html';
        });
    }
    
    // 사용자 데이터 로드 (users 사용)
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
            
            // 통계 업데이트
            updateUserStats();
            
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
    
    // 사용자 테이블 업데이트 (XSS 방지: DOM 조립)
    function updateUserTable(users) {
        userTableBody.textContent = '';
        
        if (users.length === 0) {
            noUserMessage.style.display = 'block';
            return;
        }
        
        noUserMessage.style.display = 'none';
        
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

            const tdStatus = document.createElement('td');
            const statusSpan = document.createElement('span');
            statusSpan.className = `status-badge ${user.status}`;
            statusSpan.textContent = getStatusText(user.status);
            tdStatus.appendChild(statusSpan);

            const tdCreated = document.createElement('td');
            tdCreated.textContent = user.createdAt ? formatDate(user.createdAt) : '-';

            const tdProcessed = document.createElement('td');
            tdProcessed.textContent = user.processedAt ? formatDate(user.processedAt) : '-';

            const tdActions = document.createElement('td');
            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn btn-info btn-sm';
            viewBtn.innerHTML = '<i class="fas fa-eye"></i> 보기';
            viewBtn.addEventListener('click', () => window.showUserDetail(user.key));

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-warning btn-sm';
            editBtn.style.marginLeft = '6px';
            editBtn.innerHTML = '<i class="fas fa-edit"></i> 수정';
            editBtn.addEventListener('click', () => window.editUser(user.key));

            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-sm';
            delBtn.style.marginLeft = '6px';
            delBtn.innerHTML = '<i class="fas fa-trash"></i> 삭제';
            delBtn.addEventListener('click', () => window.deleteUserConfirm(user.key));

            tdActions.appendChild(viewBtn);
            tdActions.appendChild(editBtn);
            tdActions.appendChild(delBtn);

            row.appendChild(tdIndex);
            row.appendChild(tdName);
            row.appendChild(tdId);
            row.appendChild(tdRole);
            row.appendChild(tdStatus);
            row.appendChild(tdCreated);
            row.appendChild(tdProcessed);
            row.appendChild(tdActions);

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
        
        // 비밀번호 필드 제거됨
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
            
            // users 경로에만 업데이트
            const userRef = ref(database, `users/${currentUserKey}`);
            await set(userRef, updatedUser);
            
            editUserModal.hide();
            loadUsers();
            
            showNotification('사용자 정보가 성공적으로 수정되었습니다.', 'success');
            
        } catch (error) {
            console.error('사용자 정보 수정 오류:', error);
            showNotification('사용자 정보 수정 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 비밀번호 재설정 기능 제거됨

    // 비밀번호 재설정 이메일 발송 기능 제거됨

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
            showNotification('사용자가 성공적으로 삭제되었습니다.', 'success');
            
        } catch (error) {
            console.error('사용자 삭제 오류:', error);
            showNotification('사용자 삭제 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 사용자 통계 업데이트
    function updateUserStats() {
        console.log('통계 업데이트 시작...');
        console.log('allUsers 배열:', allUsers);
        console.log('allUsers 길이:', allUsers.length);
        
        const total = allUsers.length;
        const active = allUsers.filter(user => user.status === 'approved').length;
        const admin = allUsers.filter(user => user.role === 'admin').length;
        const inactive = allUsers.filter(user => user.status === 'rejected').length;
        
        console.log('통계 계산 결과:', { total, active, admin, inactive });
        
        totalUserCount.textContent = total;
        activeUserCount.textContent = active;
        adminUserCount.textContent = admin;
        inactiveUserCount.textContent = inactive;
        
        console.log('통계 업데이트 완료');
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
