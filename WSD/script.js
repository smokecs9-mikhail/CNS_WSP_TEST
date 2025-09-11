// 간단한 캘린더 렌더러 (정적 페이지 용)
const monthTitle = document.getElementById('month-title');
const gridBody = document.getElementById('grid-body');
const miniGrid = document.getElementById('mini-grid');
const miniMonthLabel = document.getElementById('mini-month-label');

// 2025년 1월 고정 데이터 (스크린샷 기준)
let current = new Date(2025, 0, 1);

const events = {
  '2025-01-08': [
    { time: '09:00', title: '팀 회의', color: 'green' },
    { time: '14:00', title: '프로젝트 기획', color: 'green' },
  ],
  '2025-01-15': [
    { time: '10:30', title: '클라이언트 미팅', color: 'red' },
  ],
  '2025-01-22': [
    { time: '15:00', title: '분기 리뷰', color: 'orange' },
    { time: '', title: '개발팀 회의', color: 'green' },
  ],
  '2025-01-24': [
    { time: '', title: '휴가', color: 'purple' },
  ],
  '2025-01-29': [
    { time: '11:00', title: '결합 점검', color: 'green' },
  ],
};

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildMonthGrid(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // 주 시작(일요일)
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));

  const todayKey = ymd(new Date());
  monthTitle.textContent = `${year}년 ${month + 1}월`;
  gridBody.innerHTML = '';

  let day = new Date(start);
  while (day <= end) {
    const cell = document.createElement('div');
    cell.className = 'day';
    if (day.getDay() === 0) cell.classList.add('sun');
    if (day.getDay() === 6) cell.classList.add('sat');
    if (ymd(day) === todayKey) cell.classList.add('today');

    const dateEl = document.createElement('div');
    dateEl.className = 'date';
    dateEl.textContent = String(day.getDate());
    cell.appendChild(dateEl);

    const evts = events[ymd(day)] || [];
    evts.forEach(e => {
      const el = document.createElement('div');
      el.className = `event ${e.color}`;
      el.innerHTML = `${e.time ? `<span class="time">${e.time}</span>` : ''}<span class="title">${e.title}</span>`;
      cell.appendChild(el);
    });

    gridBody.appendChild(cell);
    day.setDate(day.getDate() + 1);
  }

  // 미니 캘린더
  miniMonthLabel.textContent = `${year}년 ${month + 1}월`;
  miniGrid.innerHTML = '';
  const miniStart = new Date(first); miniStart.setDate(first.getDate() - first.getDay());
  const miniEnd = new Date(last); miniEnd.setDate(last.getDate() + (6 - last.getDay()));
  let md = new Date(miniStart);
  const today = new Date();
  while (md <= miniEnd) {
    const c = document.createElement('div');
    c.className = 'cell';
    c.textContent = String(md.getDate());
    if (ymd(md) === ymd(today)) c.classList.add('today');
    miniGrid.appendChild(c);
    md.setDate(md.getDate() + 1);
  }
}

// 네비게이션 (데모: 2025년 1월에서만 동작)
document.getElementById('btn-prev').addEventListener('click', () => {
  current = new Date(2024, 11, 1); // 2024년 12월로 이동 (비어있음)
  buildMonthGrid(current);
});
document.getElementById('btn-next').addEventListener('click', () => {
  current = new Date(2025, 1, 1); // 2025년 2월로 이동 (비어있음)
  buildMonthGrid(current);
});
document.getElementById('btn-today').addEventListener('click', () => {
  current = new Date(2025, 0, 1);
  buildMonthGrid(current);
});

buildMonthGrid(current);


