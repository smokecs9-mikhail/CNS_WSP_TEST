// 소송일정표 JavaScript 기능
let currentDate = new Date();
let events = JSON.parse(localStorage.getItem('calendarEvents')) || [];
let editingEventId = null;

const monthNames = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월'
];

// 고유 ID 생성 함수
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 이벤트 저장 함수
function saveEvents() {
    localStorage.setItem('calendarEvents', JSON.stringify(events));
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
                editEvent(event);
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
    document.getElementById('deleteBtn').style.display = 'inline-block';
    document.getElementById('saveBtn').textContent = '수정';
    
    document.getElementById('eventModal').style.display = 'block';
}

// 모달 닫기
function closeModal() {
    document.getElementById('eventModal').style.display = 'none';
    editingEventId = null;
}

// 일정 삭제
function deleteEvent() {
    if (editingEventId && confirm('이 일정을 삭제하시겠습니까?')) {
        events = events.filter(event => event.id !== editingEventId);
        saveEvents();
        renderCalendar();
        closeModal();
    }
}

// 폼 제출 이벤트 처리
document.getElementById('eventForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const title = document.getElementById('eventTitle').value;
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const description = document.getElementById('eventDescription').value;
    
    if (editingEventId) {
        // 수정
        const eventIndex = events.findIndex(event => event.id === editingEventId);
        if (eventIndex !== -1) {
            events[eventIndex] = {
                ...events[eventIndex],
                title,
                date,
                time,
                description
            };
        }
    } else {
        // 추가
        const newEvent = {
            id: generateId(),
            title,
            date,
            time,
            description
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
    if (event.target === modal) {
        closeModal();
    }
}

// 초기 렌더링
renderCalendar();
