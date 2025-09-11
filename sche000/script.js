import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, push, set, onValue, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

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

// Firebase 경고 지연 설정 (3초)
const FIREBASE_WARNING_DELAY_MS = 3000;
let firebaseWarningAllowedAt = Date.now() + FIREBASE_WARNING_DELAY_MS;

class ScheduleManager {
    constructor() {
        console.log('ScheduleManager 생성자 시작');
        this.tableBody = document.getElementById('tableBody');
        this.addRowBtn = document.getElementById('addRow');
        this.saveDataBtn = document.getElementById('saveData');
        this.loadDataBtn = document.getElementById('loadData');
        this.rowCount = 0;
        this.rows = new Map(); // Firebase document IDs를 저장
        this.isFirebaseConnected = false; // Firebase 연결 상태 추적
        
        console.log('DOM 요소들:', {
            tableBody: this.tableBody,
            addRowBtn: this.addRowBtn,
            saveDataBtn: this.saveDataBtn,
            loadDataBtn: this.loadDataBtn
        });
        
        this.init();
    }
    
    init() {
        console.log('init() 메서드 시작');
        this.addRowBtn.addEventListener('click', () => this.addRow());
        this.saveDataBtn.addEventListener('click', () => this.saveData());
        this.loadDataBtn.addEventListener('click', () => this.loadData());
        
        // 경고 초기 상태 업데이트
        this.updateFirebaseWarning();

        // Firebase에서 데이터 로드
        console.log('Firebase 데이터 로드 시작');
        this.loadDataFromFirebase();
        console.log('init() 메서드 완료');

        // 재연결 버튼
        const retryBtn = document.getElementById('retryFirebaseBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', async () => {
                await this.retryFirebaseConnection();
            });
        }
    }
    
    async addRow() {
        this.rowCount++;
        const row = document.createElement('tr');
        row.innerHTML = this.createRowHTML(this.rowCount);
        this.tableBody.appendChild(row);
        
        // 이벤트 리스너 추가
        this.attachRowEventListeners(row);
        
        // Firebase에 새 행 저장
        await this.saveRowToFirebase(row);
    }

    addRowWithoutFirebase() {
        this.rowCount++;
        const row = document.createElement('tr');
        row.innerHTML = this.createRowHTML(this.rowCount);
        this.tableBody.appendChild(row);
        
        console.log(`행 ${this.rowCount} 추가됨:`, row);
        console.log('추가된 textarea 개수:', row.querySelectorAll('textarea').length);
        
        // 이벤트 리스너 추가
        this.attachRowEventListeners(row);
    }
    
    createRowHTML(rowNumber) {
        const html = `
            <td>${rowNumber}</td>
            <td><textarea data-field="buildingName"></textarea></td>
            <td><textarea data-field="address"></textarea></td>
            <td><textarea data-field="completionDate"></textarea></td>
            <td><textarea data-field="area"></textarea></td>
            <td><textarea class="stage-input" data-field="stage1-1"></textarea></td>
            <td><textarea class="stage-input" data-field="stage1-2"></textarea></td>
            <td><textarea class="stage-input" data-field="stage1-3"></textarea></td>
            <td><textarea class="stage-input" data-field="stage2-1"></textarea></td>
            <td><textarea class="stage-input" data-field="stage2-2"></textarea></td>
            <td><textarea class="stage-input" data-field="stage2-3"></textarea></td>
            <td><textarea class="stage-input" data-field="stage3-1"></textarea></td>
            <td><textarea class="stage-input" data-field="stage3-2"></textarea></td>
            <td><textarea class="stage-input" data-field="stage3-3"></textarea></td>
            <td><textarea class="stage-input" data-field="stage4-1"></textarea></td>
            <td><textarea class="stage-input" data-field="stage4-2"></textarea></td>
            <td><textarea class="stage-input" data-field="stage4-3"></textarea></td>
            <td><textarea data-field="manager"></textarea></td>
            <td><textarea data-field="remarks"></textarea></td>
        `;
        console.log(`행 ${rowNumber} HTML 생성:`, html);
        return html;
    }
    
    attachRowEventListeners(row) {
        // 입력 필드 이벤트
        const inputs = row.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                // Firebase 연결 상태에 따라 다른 저장 방식 사용
                if (this.isFirebaseConnected) {
                    this.updateRowInFirebase(row);
                } else {
                this.saveToLocalStorage();
                }
            });
        });
        
        // 셀 우클릭 이벤트
        const cells = row.querySelectorAll('td');
        cells.forEach(cell => {
            cell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, cell);
            });
        });
    }
    
    async saveData() {
        try {
            // 데이터가 있는 행만 Firebase에 저장
            const rows = this.tableBody.querySelectorAll('tr');
            let savedCount = 0;
            
            for (const row of rows) {
                const rowData = this.collectRowData(row);
                // 빈 행이 아닌 경우만 저장 (건물명이나 주소가 있는 경우)
                if (rowData.buildingName.trim() || rowData.address.trim() || rowData.manager.trim()) {
                    await this.updateRowInFirebase(row);
                    savedCount++;
                }
            }
            
            // Excel 파일 다운로드 (데이터가 있는 행만)
            this.downloadExcel();
            
            alert(`${savedCount}개의 데이터가 Firebase에 저장되었습니다!`);
        } catch (error) {
            console.error('데이터 저장 실패:', error);
            alert('데이터 저장 중 오류가 발생했습니다: ' + error.message);
        }
    }
    
    async loadData() {
        try {
            // 기존 데이터 초기화
            this.tableBody.innerHTML = '';
            this.rowCount = 0;
            this.rows.clear();
            
            await this.loadDataFromFirebase();
            alert('Firebase에서 데이터가 성공적으로 불러와졌습니다!');
        } catch (error) {
            console.error('데이터 로드 실패:', error);
            alert('데이터 로드 중 오류가 발생했습니다: ' + error.message);
        }
    }
    
    loadDataIntoTable(data) {
        // 기존 데이터 초기화
        this.tableBody.innerHTML = '';
        this.rowCount = 0;
        
        // 데이터 로드
        data.forEach((rowData, index) => {
            this.addRow();
            this.populateRow(this.tableBody.children[index], rowData);
        });
    }
    
    populateRow(row, data) {
        // 입력 필드 데이터 설정
        const inputs = row.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            const field = input.dataset.field;
            if (data[field]) {
                input.value = data[field];
            }
        });
    }
    
    collectData() {
        const data = [];
        const rows = this.tableBody.querySelectorAll('tr');
        
        rows.forEach((row, index) => {
            const rowData = {
                rowNumber: index + 1,
                buildingName: '',
                address: '',
                completionDate: '',
                area: '',
                manager: '',
                remarks: '',
                'stage1-1': '',
                'stage1-2': '',
                'stage1-3': '',
                'stage2-1': '',
                'stage2-2': '',
                'stage2-3': '',
                'stage3-1': '',
                'stage3-2': '',
                'stage3-3': '',
                'stage4-1': '',
                'stage4-2': '',
                'stage4-3': ''
            };
            
            // 입력 필드 데이터 수집
            const inputs = row.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                const field = input.dataset.field;
                if (field) {
                    rowData[field] = input.value;
                }
            });
            
            data.push(rowData);
        });
        
        return data;
    }
    
    downloadExcel() {
        try {
            // 데이터가 있는 행만 필터링
            const data = this.collectData().filter(row => 
                row.buildingName.trim() || row.address.trim() || row.manager.trim()
            );
            
            if (data.length === 0) {
                alert('저장할 데이터가 없습니다.');
                return;
            }
            
            // Excel 워크북 생성
            const wb = XLSX.utils.book_new();
            
            // 헤더 정의
            const headers = [
                'NO', '건물명', '주소', '준공일(예정)', '연면적(평)',
                '1-1', '1-2', '1-3', '2-1', '2-2', '2-3',
                '3-1', '3-2', '3-3', '4-1', '4-2', '4-3',
                '담당자', '비고'
            ];
            
            // 데이터를 Excel 형식으로 변환
            const excelData = data.map(row => [
                row.rowNumber,
                row.buildingName,
                row.address,
                row.completionDate,
                row.area,
                row['stage1-1'],
                row['stage1-2'],
                row['stage1-3'],
                row['stage2-1'],
                row['stage2-2'],
                row['stage2-3'],
                row['stage3-1'],
                row['stage3-2'],
                row['stage3-3'],
                row['stage4-1'],
                row['stage4-2'],
                row['stage4-3'],
                row.manager,
                row.remarks
            ]);
            
            // 헤더와 데이터를 합치기
            const worksheetData = [headers, ...excelData];
            
            // 워크시트 생성
            const ws = XLSX.utils.aoa_to_sheet(worksheetData);
            
            // 컬럼 너비 설정
            const colWidths = [
                { wch: 5 },   // NO
                { wch: 20 },  // 건물명
                { wch: 30 },  // 주소
                { wch: 15 },  // 준공일
                { wch: 12 },  // 연면적
                { wch: 15 },  // 1-1
                { wch: 15 },  // 1-2
                { wch: 15 },  // 1-3
                { wch: 15 },  // 2-1
                { wch: 15 },  // 2-2
                { wch: 15 },  // 2-3
                { wch: 15 },  // 3-1
                { wch: 15 },  // 3-2
                { wch: 15 },  // 3-3
                { wch: 15 },  // 4-1
                { wch: 15 },  // 4-2
                { wch: 15 },  // 4-3
                { wch: 10 },  // 담당자
                { wch: 15 }   // 비고
            ];
            ws['!cols'] = colWidths;
            
            // 워크시트를 워크북에 추가
            XLSX.utils.book_append_sheet(wb, ws, '영업현황');
            
            // 파일명 생성 (현재 날짜 포함)
            const fileName = `영업현황_추진상황_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            // Excel 파일 다운로드
            XLSX.writeFile(wb, fileName);
            
            console.log('Excel 파일이 다운로드되었습니다:', fileName);
        } catch (error) {
            console.error('Excel 다운로드 실패:', error);
            alert('Excel 파일 다운로드 중 오류가 발생했습니다: ' + error.message);
        }
    }
    
    
    showContextMenu(e, cell) {
        const contextMenu = document.getElementById('contextMenu');
        contextMenu.style.display = 'block';
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        
        // 현재 셀의 배경색 저장
        contextMenu.currentCell = cell;
        
        // 메뉴 외부 클릭 시 숨기기
        const hideMenu = (event) => {
            if (!contextMenu.contains(event.target)) {
                contextMenu.style.display = 'none';
                document.removeEventListener('click', hideMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
        }, 100);
    }
    
    changeCellColor(cell, color) {
        cell.style.backgroundColor = color;
        // 셀이 속한 행을 찾아서 Firebase에 업데이트
        const row = cell.closest('tr');
        if (row) {
            this.updateRowInFirebase(row);
        }
    }

    // Firebase Realtime Database 관련 메서드들
    async saveRowToFirebase(row) {
        try {
            const rowData = this.collectRowData(row);
            const newRowRef = push(ref(database, 'scheduleData'));
            await set(newRowRef, {
                ...rowData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            
            // 행에 Firebase key 저장
            row.dataset.firebaseId = newRowRef.key;
            this.rows.set(row, newRowRef.key);
            
            console.log('행이 Firebase에 저장되었습니다:', newRowRef.key);
        } catch (error) {
            console.error('Firebase 저장 실패:', error);
            throw error;
        }
    }

    async updateRowInFirebase(row) {
        try {
            const firebaseId = row.dataset.firebaseId;
            if (!firebaseId) {
                // Firebase ID가 없으면 새로 저장
                await this.saveRowToFirebase(row);
                return;
            }

            const rowData = this.collectRowData(row);
            const rowRef = ref(database, `scheduleData/${firebaseId}`);
            await set(rowRef, {
                ...rowData,
                updatedAt: new Date().toISOString()
            });
            
            console.log('행이 Firebase에서 업데이트되었습니다:', firebaseId);
        } catch (error) {
            console.error('Firebase 업데이트 실패:', error);
            throw error;
        }
    }

    async loadDataFromFirebase() {
        try {
            console.log('Firebase에서 데이터 로드를 시작합니다...');

            // 연결 테스트: 간단한 쓰기 시도 (table 데이터 밖 경로 사용)
            const testRef = ref(database, 'meta/connectionTest');
            await set(testRef, { ts: Date.now() });

            const scheduleDataRef = ref(database, 'scheduleData');
            
            // 기존 데이터 초기화
            this.tableBody.innerHTML = '';
            this.rowCount = 0;
            this.rows.clear();
            
            // Firebase에서 데이터 읽기 (한 번만 실행)
            const snapshot = await new Promise((resolve, reject) => {
                const unsubscribe = onValue(scheduleDataRef, (snapshot) => {
                    unsubscribe(); // 리스너 해제
                    resolve(snapshot);
                }, (error) => {
                    unsubscribe(); // 리스너 해제
                    reject(error);
                });
            });
            
            const data = snapshot.val();
            
            if (!data) {
                console.log('Firebase에 데이터가 없습니다. 초기 행을 추가합니다.');
                // 데이터가 없으면 초기 9개 행 추가 (Firebase 저장 없이)
                for (let i = 0; i < 9; i++) {
                    this.addRowWithoutFirebase();
                }
                console.log('초기 9개 행이 추가되었습니다.');
                this.isFirebaseConnected = true;
                this.updateFirebaseWarning();
                return;
            }

            console.log(`Firebase에서 ${Object.keys(data).length}개의 데이터를 찾았습니다.`);
            
            // 보조 키(__로 시작) 제외하고 정렬하여 로드
            const sortedData = Object.entries(data)
                .filter(([key]) => !key.startsWith('__'))
                .sort((a, b) => {
                    const aData = a[1];
                    const bData = b[1];
                    return (aData.rowNumber || 0) - (bData.rowNumber || 0);
                });

            sortedData.forEach(([key, value]) => {
                this.addRowFromFirebase(value, key);
            });
            
            console.log('Firebase에서 데이터를 성공적으로 로드했습니다.');
            this.isFirebaseConnected = true;
            this.updateFirebaseWarning();
            
        } catch (error) {
            console.error('Firebase 로드 실패:', error);
            console.log('Firebase 연결 실패로 인해 오프라인 모드로 전환합니다.');
            
            // Firebase 연결 실패 시 오프라인 모드로 전환
            this.enableOfflineMode();
            this.updateFirebaseWarning();
        }
    }

    updateFirebaseWarning() {
        const warning = document.getElementById('firebaseWarning');
        if (!warning) return;
        const now = Date.now();
        const allowShow = now >= firebaseWarningAllowedAt;
        if (this.isFirebaseConnected || !allowShow) {
            warning.style.display = 'none';
        } else {
            warning.style.display = 'block';
        }
    }

    async retryFirebaseConnection() {
        try {
            // 재시도시 지연 타이머 재설정
            firebaseWarningAllowedAt = Date.now() + FIREBASE_WARNING_DELAY_MS;
            this.updateFirebaseWarning();

            // 간단한 쓰기 테스트
            const testRef = ref(database, 'scheduleData/__connectionTest');
            await set(testRef, { ts: Date.now(), retry: true });

            // 다시 로드
            await this.loadDataFromFirebase();
        } catch (e) {
            console.error('재연결 실패:', e);
            this.isFirebaseConnected = false;
            this.updateFirebaseWarning();
        }
    }

    enableOfflineMode() {
        console.log('오프라인 모드 활성화');
        this.isFirebaseConnected = false;
        
        // 기존 데이터 초기화
        this.tableBody.innerHTML = '';
        this.rowCount = 0;
        this.rows.clear();
        
        // 로컬 스토리지에서 데이터 로드 시도
        const hasLocalData = this.loadFromLocalStorage();
        
        if (!hasLocalData) {
            // 로컬 데이터가 없으면 초기 9개 행 추가
            for (let i = 0; i < 9; i++) {
                this.addRowWithoutFirebase();
            }
            console.log('오프라인 모드: 초기 9개 행이 추가되었습니다.');
        }
        
        // 경고는 updateFirebaseWarning에서 제어
    }

    addRowFromFirebase(data, firebaseId) {
        this.rowCount++;
        const row = document.createElement('tr');
        row.innerHTML = this.createRowHTML(this.rowCount);
        row.dataset.firebaseId = firebaseId;
        this.tableBody.appendChild(row);
        
        // 데이터 채우기
        this.populateRow(row, data);
        
        // 이벤트 리스너 추가
        this.attachRowEventListeners(row);
        
        // rows Map에 추가
        this.rows.set(row, firebaseId);
    }

    collectRowData(row) {
        const rowData = {
            rowNumber: parseInt(row.querySelector('td:first-child').textContent),
            buildingName: '',
            address: '',
            completionDate: '',
            area: '',
            manager: '',
            remarks: '',
            'stage1-1': '',
            'stage1-2': '',
            'stage1-3': '',
            'stage2-1': '',
            'stage2-2': '',
            'stage2-3': '',
            'stage3-1': '',
            'stage3-2': '',
            'stage3-3': '',
            'stage4-1': '',
            'stage4-2': '',
            'stage4-3': ''
        };
        
        // 입력 필드 데이터 수집
        const inputs = row.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            const field = input.dataset.field;
            if (field) {
                rowData[field] = input.value;
            }
        });
        
        return rowData;
    }

    // 로컬 스토리지 관련 메서드들
    saveToLocalStorage() {
        const data = this.collectData();
        localStorage.setItem('scheduleData', JSON.stringify(data));
        console.log('로컬 스토리지에 데이터 저장됨');
    }
    
    loadFromLocalStorage() {
        const savedData = localStorage.getItem('scheduleData');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this.loadDataIntoTable(data);
                console.log('로컬 스토리지에서 데이터 로드됨');
                return true;
            } catch (error) {
                console.error('로컬 스토리지 데이터 로드 실패:', error);
                return false;
            }
        }
        return false;
    }
    
    loadDataIntoTable(data) {
        // 기존 데이터 초기화
        this.tableBody.innerHTML = '';
        this.rowCount = 0;
        
        // 데이터 로드
        data.forEach((rowData, index) => {
            this.addRowWithoutFirebase();
            this.populateRow(this.tableBody.children[index], rowData);
        });
    }
    
    populateRow(row, data) {
        // 입력 필드 데이터 설정
        const inputs = row.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            const field = input.dataset.field;
            if (data[field]) {
                input.value = data[field];
            }
        });
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    console.log('페이지 로드 완료. ScheduleManager를 초기화합니다.');
    const scheduleManager = new ScheduleManager();
    console.log('ScheduleManager 초기화 완료.');
    
    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            scheduleManager.saveData();
        }
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            scheduleManager.loadData();
        }
    });
    
    // 컨텍스트 메뉴 이벤트 리스너
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('context-menu-item')) {
            const color = e.target.dataset.color;
            const contextMenu = document.getElementById('contextMenu');
            if (contextMenu.currentCell) {
                scheduleManager.changeCellColor(contextMenu.currentCell, color);
                contextMenu.style.display = 'none';
            }
        }
    });
});

// 헤더 클릭 토글 기능
document.addEventListener('DOMContentLoaded', () => {
    // 헤더 툴팁 요소 생성
    const headerTooltip = document.createElement('div');
    headerTooltip.className = 'header-tooltip';
    document.body.appendChild(headerTooltip);
    
    // 툴팁 내용 매핑
    const tooltipContent = {
        '1-1': '지역별 개발계획 확인 및 현장 사전 조사',
        '1-2': '영업활동 및 소개',
        '1-3': '수시방문, 주기적인 연락 통해 친분유지',
        '2-1': '시설물(건물) 도면 및 관리 적정성 검토',
        '2-2': '주기적 연락을 통해 시행사(관리단) 요구조건 파악',
        '2-3': '실행내역 검토',
        '3-1': '제안서 작성 및 검토 후 제안서 제출',
        '3-2': '시행사(관리단)와 실시 협상',
        '3-3': '최종 시설물(건물) 관리 적정성 검토',
        '4-1': '계약서 작성',
        '4-2': '운영개시 준비(시설물 하자 파악, 인원셋팅 등)',
        '4-3': '관리파트 이관'
    };
    
    // 헤더 클릭 이벤트 리스너
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('clickable-header')) {
            const stage = e.target.dataset.stage;
            const isActive = e.target.classList.contains('active');
            
            // 모든 헤더에서 active 클래스 제거
            document.querySelectorAll('.clickable-header').forEach(header => {
                header.classList.remove('active');
            });
            
            // 툴팁 숨기기
            headerTooltip.style.opacity = '0';
            
            // 클릭한 헤더가 활성화되지 않은 상태였다면 활성화
            if (!isActive && tooltipContent[stage]) {
                e.target.classList.add('active');
                headerTooltip.textContent = tooltipContent[stage];
                
                // 툴팁 위치 계산
                const rect = e.target.getBoundingClientRect();
                headerTooltip.style.left = (rect.left + rect.width / 2) + 'px';
                headerTooltip.style.top = (rect.top - 10) + 'px';
                headerTooltip.style.transform = 'translateX(-50%) translateY(-100%)';
                
                // 툴팁 표시
                headerTooltip.style.opacity = '1';
            }
        }
    });
    
    // 다른 곳 클릭 시 툴팁 숨기기
    document.addEventListener('click', (e) => {
        if (!e.target.classList.contains('clickable-header')) {
            document.querySelectorAll('.clickable-header').forEach(header => {
                header.classList.remove('active');
            });
            headerTooltip.style.opacity = '0';
        }
    });
    
});
