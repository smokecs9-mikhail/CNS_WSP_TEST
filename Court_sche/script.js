// 소송일정표 JavaScript 기능
let currentDate = new Date();
let events = JSON.parse(localStorage.getItem('calendarEvents')) || [];
let editingEventId = null;
let viewingEventId = null; // 일정보기에서 사용
let pendingCloseTarget = null; // 어떤 모달을 닫으려는지 임시 저장

const monthNames = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월'
];

// 고유 ID 생성 함수
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 보안 유틸리티 함수들
function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return '';
    }
    
    // HTML 태그 제거 및 특수문자 이스케이프
    return input
        .replace(/<[^>]*>/g, '') // HTML 태그 제거
        .replace(/[<>]/g, '') // 남은 꺾쇠 괄호 제거
        .replace(/javascript:/gi, '') // javascript: 프로토콜 제거
        .replace(/on\w+\s*=/gi, '') // 이벤트 핸들러 제거
        .trim();
}

// 이벤트 저장 함수 (입력 검증 강화)
function saveEvents() {
    // 저장 전 모든 이벤트 데이터 검증 및 정리
    const sanitizedEvents = events.map(event => ({
        ...event,
        title: sanitizeInput(event.title || ''),
        description: sanitizeInput(event.description || ''),
        type: sanitizeInput(event.type || ''),
        authorName: sanitizeInput(event.authorName || ''),
        comments: (event.comments || []).map(comment => ({
            ...comment,
            text: sanitizeInput(comment.text || ''),
            commenter: sanitizeInput(comment.commenter || '')
        }))
    }));
    
    localStorage.setItem('calendarEvents', JSON.stringify(sanitizedEvents));
}

// 캘린더 렌더링 함수
function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('monthYear').textContent = `${year}년 ${monthNames[month]}`;
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const calendarGrid = document.getElementById('calendarGrid');
    calendarGrid.innerHTML = '';
    
    const today = new Date();
    
    for (let i = 0; i < 42; i++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        if (cellDate.getMonth() !== month) {
            dayElement.classList.add('other-month');
        }
        
        if (cellDate.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }
        
        dayElement.innerHTML = `<div class="day-number">${cellDate.getDate()}</div>`;
        dayElement.onclick = () => openAddEventModal(cellDate);
        
        // 해당 날짜의 이벤트 표시
        const dayEvents = events.filter(event => {
            const eventDate = new Date(event.date);
            return eventDate.toDateString() === cellDate.toDateString();
        });
        
        dayEvents.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = 'event';
            eventElement.textContent = event.title;
            eventElement.onclick = (e) => {
                e.stopPropagation();
                openViewEventModal(event);
            };
            dayElement.appendChild(eventElement);
        });
        
        calendarGrid.appendChild(dayElement);
    }
}

// 이전 달로 이동
function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

// 다음 달로 이동
function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

// 오늘 날짜로 이동
function goToToday() {
    currentDate = new Date();
    renderCalendar();
}

// 일정 추가 모달 열기
function openAddEventModal(date = null) {
    editingEventId = null;
    document.getElementById('modalTitle').textContent = '일정 추가';
    document.getElementById('eventForm').reset();
    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('saveBtn').textContent = '저장';
    
    if (date) {
        document.getElementById('eventDate').value = date.toISOString().split('T')[0];
    }
    
    document.getElementById('eventModal').style.display = 'block';
}

// 일정 수정 함수
function editEvent(event) {
    editingEventId = event.id;
    document.getElementById('modalTitle').textContent = '일정 수정';
    document.getElementById('eventTitle').value = event.title;
    document.getElementById('eventDate').value = event.date;
    document.getElementById('eventTime').value = event.time || '';
    document.getElementById('eventDescription').value = event.description || '';
    // 유형 드롭다운에 기존 값 반영 (없으면 기본 공백)
    const typeSelect = document.getElementById('eventType');
    if (typeSelect) {
        typeSelect.value = event.type || typeSelect.options[0]?.value || '';
    }
    document.getElementById('deleteBtn').style.display = 'inline-block';
    document.getElementById('saveBtn').textContent = '수정';
    
    document.getElementById('eventModal').style.display = 'block';
}

// 모달 닫기
function closeModal() {
    document.getElementById('eventModal').style.display = 'none';
    editingEventId = null;
}

// 일정보기 모달 열기
function openViewEventModal(event) {
    viewingEventId = event.id;
    document.getElementById('viewTitle').textContent = event.title || '';
    document.getElementById('viewType').textContent = event.type || '';
    document.getElementById('viewDate').textContent = event.date || '';
    document.getElementById('viewTime').textContent = event.time || '';
    document.getElementById('viewDescription').textContent = event.description || '';
    document.getElementById('viewAuthor').textContent = event.authorName || '';
    document.getElementById('viewCreatedAt').textContent = formatDateTime(event.createdAt) || '';
    document.getElementById('viewUpdatedAt').textContent = formatDateTime(event.updatedAt) || '';
    renderCommentsTable(event);
    document.getElementById('viewModal').style.display = 'block';

    // 작성자 여부에 따라 수정/삭제 버튼 노출 제어
    const currentUserName = sessionStorage.getItem('userName') || '';
    const isOwner = (event.authorName || '') === currentUserName;
    const editBtn = document.getElementById('viewEditBtn');
    const deleteBtn = document.getElementById('viewDeleteBtn');
    if (editBtn) editBtn.style.display = isOwner ? 'inline-block' : 'none';
    if (deleteBtn) deleteBtn.style.display = isOwner ? 'inline-block' : 'none';
}

// 일정보기 모달 닫기
function closeViewModal() {
    document.getElementById('viewModal').style.display = 'none';
    viewingEventId = null;
}

// 보기에서 수정 버튼 클릭 -> 수정 모달로 이동
function openEditFromView() {
    if (!viewingEventId) return;
    const found = events.find(ev => ev.id === viewingEventId);
    if (!found) return;
    closeViewModal();
    editEvent(found);
}

// 일정 삭제
function deleteEvent() {
    if (editingEventId && confirm('이 일정을 삭제하시겠습니까?')) {
        events = events.filter(event => event.id !== editingEventId);
        saveEvents();
        renderCalendar();
        closeModal();
    }
    // 보기 모달에서 삭제 지원
    if (viewingEventId && confirm('이 일정을 삭제하시겠습니까?')) {
        events = events.filter(event => event.id !== viewingEventId);
        saveEvents();
        renderCalendar();
        closeViewModal();
    }
}

// 폼 제출 이벤트 처리
document.getElementById('eventForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    // 입력값 가져오기 및 검증
    const title = sanitizeInput(document.getElementById('eventTitle').value);
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const description = sanitizeInput(document.getElementById('eventDescription').value);
    const typeSelect = document.getElementById('eventType');
    const eventType = typeSelect ? sanitizeInput(typeSelect.value) : '';
    
    // 필수 입력값 검증
    if (!title.trim()) {
        alert('제목을 입력해주세요.');
        return;
    }
    
    if (!date) {
        alert('날짜를 선택해주세요.');
        return;
    }
    
    if (editingEventId) {
        // 수정
        const eventIndex = events.findIndex(event => event.id === editingEventId);
        if (eventIndex !== -1) {
            events[eventIndex] = {
                ...events[eventIndex],
                title,
                date,
                time,
                description,
                // 유형 갱신 (선택값이 있을 때만 반영)
                type: eventType || events[eventIndex].type,
                // 작성자 이름은 최초 생성 시 저장된 값을 유지
                authorName: events[eventIndex].authorName || null,
                // 수정일시 갱신
                updatedAt: new Date().toISOString()
            };
        }
    } else {
        // 추가
        // 작성자 이름 가져오기 (사용자에게는 표시하지 않음)
        // - 인증 로직에서 sessionStorage.setItem('userName', ...) 저장해둔 값을 활용
        const authorName = sessionStorage.getItem('userName') || null; // 값이 없으면 null 저장
        const newEvent = {
            id: generateId(),
            title,
            date,
            time,
            description,
            // 유형 저장
            type: eventType,
            // 작성자 이름 저장 (비표시용 메타 데이터)
            authorName,
            // 작성/수정 일시 저장
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            // 의견 리스트 초기화
            comments: []
        };
        events.push(newEvent);
    }
    
    saveEvents();
    renderCalendar();
    closeModal();
});

// 모달 외부 클릭 시 닫기
window.onclick = function(event) {
    const modal = document.getElementById('eventModal');
    const viewModal = document.getElementById('viewModal');
    const addCommentModal = document.getElementById('addCommentModal');
    if (event.target === modal) {
        // 작성 중 외부 클릭 시 확인 모달 표시
        pendingCloseTarget = 'event';
        openConfirmCancel();
    }
    if (event.target === viewModal) {
        closeViewModal();
    }
    if (event.target === addCommentModal) {
        closeAddCommentModal();
    }
}

// 초기 렌더링
renderCalendar();

// 날짜/시간 표기 보조 함수
function formatDateTime(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } catch (e) {
        return '';
    }
}

// 보기 모달에서 의견 추가 (모달 기반)
function addCommentFromView() { openAddCommentModal(); }

// 의견 작성 모달 열기/닫기
function openAddCommentModal() {
    const textarea = document.getElementById('addCommentText');
    if (textarea) textarea.value = '';
    document.getElementById('addCommentModal').style.display = 'block';
}

function closeAddCommentModal() {
    document.getElementById('addCommentModal').style.display = 'none';
}

// 의견 작성 모달 저장
function saveCommentFromModal() {
    if (!viewingEventId) return;
    const textarea = document.getElementById('addCommentText');
    const rawText = textarea ? textarea.value : '';
    const text = sanitizeInput(rawText).trim();
    
    if (!text) {
        alert('의견을 입력해주세요.');
        return;
    }
    
    const idx = events.findIndex(ev => ev.id === viewingEventId);
    if (idx === -1) return;
    
    const commenter = sanitizeInput(sessionStorage.getItem('userName') || '익명');
    const comment = { 
        text, 
        commenter, 
        createdAt: new Date().toISOString() 
    };
    
    const prev = Array.isArray(events[idx].comments) ? events[idx].comments : [];
    events[idx].comments = [...prev, comment];
    events[idx].updatedAt = new Date().toISOString();
    saveEvents();
    
    // 테이블 갱신 및 모달 닫기
    const found = events.find(ev => ev.id === viewingEventId);
    if (found) renderCommentsTable(found);
    closeAddCommentModal();
}

// 의견 테이블 렌더링
function renderCommentsTable(event) {
    const tbody = document.getElementById('viewCommentsBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const list = Array.isArray(event.comments) ? event.comments : [];
    list.forEach((c, idx) => {
        const tr = document.createElement('tr');
        const tdIdx = document.createElement('td');
        tdIdx.textContent = String(idx + 1);
        const tdAuthor = document.createElement('td');
        tdAuthor.textContent = c.commenter || '';
        const tdDate = document.createElement('td');
        tdDate.textContent = formatDateTime(c.createdAt) || '';
        const tdText = document.createElement('td');
        tdText.textContent = c.text || '';
        tdText.className = 'comment-text';
        // 클릭 시 전체 의견 팝업
        tdText.onclick = () => openCommentPopup({
            text: c.text || '',
            index: idx + 1,
            author: c.commenter || '',
            date: formatDateTime(c.createdAt) || ''
        });
        tr.appendChild(tdIdx);
        tr.appendChild(tdAuthor);
        tr.appendChild(tdDate);
        tr.appendChild(tdText);
        tbody.appendChild(tr);
    });
}

// 의견 전체보기 팝업 열기/닫기
let commentPopupContext = { eventId: null, commentIndex: null, commentAuthor: null };
function openCommentPopup({ text, index, author, date }) {
    const el = document.getElementById('commentFullText');
    if (el) el.textContent = text;
    const idxEl = document.getElementById('commentIndex');
    const authorEl = document.getElementById('commentAuthor');
    const dateEl = document.getElementById('commentDate');
    if (idxEl) idxEl.textContent = `#${index}`; // 숫자 표기는 타이틀과 동일 폰트/사이즈
    if (authorEl) authorEl.textContent = author;
    if (dateEl) dateEl.textContent = date;
    // 삭제 버튼 노출 조건: 현재 사용자 == 의견 작성자
    const currentUserName = sessionStorage.getItem('userName') || '';
    const canDelete = currentUserName && author && currentUserName === author;
    const deleteBtn = document.getElementById('commentDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = canDelete ? 'inline-block' : 'none';
    // 컨텍스트 저장 (삭제 시 사용)
    commentPopupContext = { eventId: viewingEventId, commentIndex: index - 1, commentAuthor: author };
    document.getElementById('commentModal').style.display = 'block';
}

function closeCommentPopup() {
    document.getElementById('commentModal').style.display = 'none';
}

// 의견 삭제 (작성자 본인만 가능)
function deleteCommentFromPopup() {
    const { eventId, commentIndex, commentAuthor } = commentPopupContext || {};
    if (eventId == null || commentIndex == null) return;
    const currentUserName = sessionStorage.getItem('userName') || '';
    if (!currentUserName || currentUserName !== commentAuthor) return;
    const idx = events.findIndex(ev => ev.id === eventId);
    if (idx === -1) return;
    const list = Array.isArray(events[idx].comments) ? events[idx].comments : [];
    if (commentIndex < 0 || commentIndex >= list.length) return;
    if (!confirm('이 의견을 삭제하시겠습니까?')) return;
    list.splice(commentIndex, 1);
    events[idx].comments = list;
    events[idx].updatedAt = new Date().toISOString();
    saveEvents();
    // 테이블 갱신 및 팝업 닫기
    const found = events[idx];
    renderCommentsTable(found);
    closeCommentPopup();
}

// 작성 취소 확인 모달 제어
function openConfirmCancel() {
    document.getElementById('confirmCancelModal').style.display = 'block';
}

function closeConfirmCancel() {
    document.getElementById('confirmCancelModal').style.display = 'none';
}

function confirmCancelYes() {
    // 예를 누르면 해당 대상 모달 닫기
    if (pendingCloseTarget === 'event') {
        closeModal();
    }
    pendingCloseTarget = null;
    closeConfirmCancel();
}

function confirmCancelNo() {
    // 아니오를 누르면 아무것도 닫지 않음
    pendingCloseTarget = null;
    closeConfirmCancel();
}
