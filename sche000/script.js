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
        // 한글 주석: DB 모두 삭제 버튼 이벤트
        const deleteBtn = document.getElementById('deleteAll');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteAllData());
        }
        // 합계 초기 계산
        this.updateTotals();
        
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
        // 합계 갱신
        this.updateTotals();
    }

    addRowWithoutFirebase() {
        this.rowCount++;
        const row = document.createElement('tr');
        row.innerHTML = this.createRowHTML(this.rowCount);
        this.tableBody.appendChild(row);
        // 한글 주석: 고정 행 상태 갱신(1~3행 sticky)
        this.applyStickyRows();
        
        console.log(`행 ${this.rowCount} 추가됨:`, row);
        console.log('추가된 textarea 개수:', row.querySelectorAll('textarea').length);
        
        // 이벤트 리스너 추가
        this.attachRowEventListeners(row);
        // 합계 갱신
        this.updateTotals();
    }
    
    createRowHTML(rowNumber) {
        const html = `
            <td>${rowNumber}</td>
            <td><textarea data-field="buildingName"></textarea></td>
            <td><textarea data-field="address"></textarea></td>
            <td><textarea data-field="scale"></textarea></td>
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
                // 합계 갱신
                this.updateTotals();
            });
        });
        
        // 한글 주석: 연면적(평) 입력란 전용 정규화/포맷 적용
        const areaInput = row.querySelector('textarea[data-field="area"]');
        if (areaInput) {
            // 입력 시 숫자/쉼표/점 외 문자는 제거
            areaInput.addEventListener('input', () => {
                const raw = (areaInput.value || '').toString();
                const cleaned = raw.replace(/[^0-9.,]/g, '');
                if (cleaned !== raw) areaInput.value = cleaned;
            });
            // 포커스 아웃 시 포맷팅(반올림 후 콤마)
            areaInput.addEventListener('blur', () => {
                areaInput.value = ScheduleManager.formatArea(areaInput.value);
                this.updateTotals();
                if (this.isFirebaseConnected) {
                    this.updateRowInFirebase(row);
                } else {
                    this.saveToLocalStorage();
                }
            });
        }
        
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
            // 기존 데이터 초기화 (thead에 남은 고정행도 복원/삭제)
            const table = document.getElementById('scheduleTable');
            const thead = table ? table.querySelector('thead') : null;
            if (thead) {
                Array.from(thead.querySelectorAll('tr.pinned-row')).forEach(tr => tr.remove());
            }
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
        // 기존 데이터 초기화 (thead에 남은 고정행도 복원/삭제)
        const table = document.getElementById('scheduleTable');
        const thead = table ? table.querySelector('thead') : null;
        if (thead) {
            Array.from(thead.querySelectorAll('tr.pinned-row')).forEach(tr => tr.remove());
        }
        this.tableBody.innerHTML = '';
        this.rowCount = 0;
        
        // 데이터 로드
        data.forEach((rowData, index) => {
            this.addRow();
            this.populateRow(this.tableBody.children[index], rowData);
        });
        // 합계 갱신
        this.updateTotals();
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
        // 한글 주석: 연면적 필드 표시 포맷 적용
        const areaInput = row.querySelector('textarea[data-field="area"]');
        if (areaInput) {
            areaInput.value = ScheduleManager.formatArea(areaInput.value);
        }
        // 합계 갱신
        this.updateTotals();
    }
    
    collectData() {
        const data = [];
        const rows = this.tableBody.querySelectorAll('tr');
        
        rows.forEach((row, index) => {
            const rowData = {
                rowNumber: index + 1,
                buildingName: '',
                address: '',
                scale: '',
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
    // 한글 주석: 행별 안정 키 생성 (NO 우선, 없으면 건물명+주소)
    makeStableKey(rowData) {
        const no = Number(rowData.rowNumber);
        if (Number.isFinite(no) && no > 0) return `NO_${no}`;
        const name = (rowData.buildingName || '').trim().replace(/[.#$\[\]/]/g, '_');
        const addr = (rowData.address || '').trim().replace(/[.#$\[\]/]/g, '_');
        return `NK_${name}__${addr}`;
    }

    async saveRowToFirebase(row) {
        try {
            const rowData = this.collectRowData(row);
            const key = this.makeStableKey(rowData);
            const rowRef = ref(database, `scheduleData/${key}`);
            await set(rowRef, {
                ...rowData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            // 행에 Firebase key 저장(안정 키 사용)
            row.dataset.firebaseId = key;
            this.rows.set(row, key);
            console.log('행이 Firebase에 저장되었습니다(안정키):', key);
        } catch (error) {
            console.error('Firebase 저장 실패:', error);
            throw error;
        }
    }

    async updateRowInFirebase(row) {
        try {
            const rowData = this.collectRowData(row);
            // 한글 주석: 안정 키로 upsert
            const key = row.dataset.firebaseId || this.makeStableKey(rowData);
            const rowRef = ref(database, `scheduleData/${key}`);
            await set(rowRef, {
                ...rowData,
                updatedAt: new Date().toISOString()
            });
            // 한글 주석: 키 저장(최초 저장 시)
            row.dataset.firebaseId = key;
            console.log('행이 Firebase에서 업데이트되었습니다:', key);
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
            
            let data = snapshot.val();
            
            if (!data) {
                console.log('Firebase에 데이터가 없습니다. (자동 행 생성 생략)');
                // 한글 주석: 예전에는 빈 화면에 9행을 자동 추가했지만, 예기치 않은 행 증가를 막기 위해 생략
                this.isFirebaseConnected = true;
                this.updateFirebaseWarning();
                return;
            }

            // 한글 주석: 로드 시 중복/불량 키 자동 정리 (안정키 기준 병합)
            try {
                const normalized = await this.dedupeFirebaseData(data);
                if (normalized) {
                    data = normalized;
                }
            } catch (e) {
                console.warn('중복 정리 중 경고:', e);
            }

            console.log(`Firebase에서 ${Object.keys(data).length}개의 데이터를 찾았습니다.`);
            
            // 한글 주석: 빈 행 판별 유틸
            const isEmptyRow = (obj) => {
                const keys = ['buildingName','address','scale','completionDate','area','manager','remarks','stage1-1','stage1-2','stage1-3','stage2-1','stage2-2','stage2-3','stage3-1','stage3-2','stage3-3','stage4-1','stage4-2','stage4-3'];
                return keys.every(k => (obj?.[k] ?? '').toString().trim() === '');
            };

            // 보조 키(__로 시작) 제외하고 정렬하여 로드, 그리고 완전 빈 행 제거
            const sortedData = Object.entries(data)
                .filter(([key]) => !key.startsWith('__'))
                .sort((a, b) => {
                    const aData = a[1];
                    const bData = b[1];
                    return (aData.rowNumber || 0) - (bData.rowNumber || 0);
                })
                .filter(([, value]) => !isEmptyRow(value));

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

    // 한글 주석: Firebase 중복/불량 키 정리 (안정 키 기준 upsert)
    async dedupeFirebaseData(dataObj) {
        try {
            if (!dataObj) return null;
            const entries = Object.entries(dataObj).filter(([k]) => !k.startsWith('__'));
            if (entries.length === 0) return null;

            const bestByStableKey = new Map();
            const allKeys = new Set();
            for (const [key, value] of entries) {
                allKeys.add(key);
                const stable = this.makeStableKey(value || {});
                const current = bestByStableKey.get(stable);
                const tsOf = (v) => {
                    const u = Date.parse(v?.updatedAt || '') || 0;
                    const c = Date.parse(v?.createdAt || '') || 0;
                    return Math.max(u, c);
                };
                if (!current || tsOf(value) >= tsOf(current)) {
                    bestByStableKey.set(stable, { key, value });
                }
            }

            // 쓰기/삭제 계획 실행
            const keepKeys = new Set();
            for (const [stable, { key, value }] of bestByStableKey.entries()) {
                const rowRef = ref(database, `scheduleData/${stable}`);
                await set(rowRef, { ...value, updatedAt: new Date().toISOString() });
                keepKeys.add(stable);
            }
            // 불필요 키 삭제 (안정키가 아닌 기존 키들)
            for (const key of allKeys) {
                if (!keepKeys.has(key)) {
                    await remove(ref(database, `scheduleData/${key}`));
                }
            }

            // 정리된 객체 반환
            const normalized = {};
            for (const [stable, { value }] of bestByStableKey.entries()) {
                normalized[stable] = value;
            }
            return normalized;
        } catch (e) {
            console.error('dedupeFirebaseData 오류:', e);
            return null;
        }
    }

    // 한글 주석: 완전 강제 정리(빈 행 제거 + 안정키 병합 + 잔여키 삭제) 후 재로딩
    async forceCleanupAndReload() {
        try {
            const scheduleDataRef = ref(database, 'scheduleData');
            const snapshot = await new Promise((resolve, reject) => {
                const unsub = onValue(scheduleDataRef, (snap) => { unsub(); resolve(snap); }, (err) => { unsub(); reject(err); });
            });
            const data = snapshot.val() || {};
            const entries = Object.entries(data).filter(([k]) => !k.startsWith('__'));

            const isEmptyRow = (obj) => {
                const keys = ['buildingName','address','scale','completionDate','area','manager','remarks','stage1-1','stage1-2','stage1-3','stage2-1','stage2-2','stage2-3','stage3-1','stage3-2','stage3-3','stage4-1','stage4-2','stage4-3'];
                return keys.every(k => (obj?.[k] ?? '').toString().trim() === '');
            };

            // 1) 빈 행 삭제
            for (const [key, value] of entries) {
                if (isEmptyRow(value)) {
                    await remove(ref(database, `scheduleData/${key}`));
                }
            }

            // 2) 안정키 병합/정리
            const afterSnap = await new Promise((resolve, reject) => {
                const unsub = onValue(scheduleDataRef, (snap) => { unsub(); resolve(snap); }, (err) => { unsub(); reject(err); });
            });
            const afterData = afterSnap.val() || {};
            await this.dedupeFirebaseData(afterData);

            // 3) 화면 재로딩
            await this.loadDataFromFirebase();
            alert('DB 강제 정리 완료: 빈 행 삭제 및 중복 병합이 끝났습니다.');
        } catch (e) {
            console.error('forceCleanupAndReload 오류:', e);
            alert('DB 강제 정리 중 오류가 발생했습니다: ' + (e?.message || e));
        }
    }

    // 한글 주석: Firebase scheduleData 전체 삭제(확인창 포함)
    async deleteAllData() {
        try {
            if (!confirm('정말로 DB의 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
            await remove(ref(database, 'scheduleData'));
            // 화면/로컬 초기화
            localStorage.removeItem('scheduleData');
            this.tableBody.innerHTML = '';
            this.rowCount = 0;
            this.rows.clear();
            this.updateTotals();
            alert('DB의 모든 데이터를 삭제했습니다.');
        } catch (e) {
            console.error('deleteAllData 오류:', e);
            alert('DB 모두 삭제 중 오류가 발생했습니다: ' + (e?.message || e));
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
        
        // 한글 주석: 로컬 데이터가 없을 때도 더 이상 기본 행을 자동 추가하지 않음
        
        // 경고는 updateFirebaseWarning에서 제어
    }

    addRowFromFirebase(data, firebaseId) {
        this.rowCount++;
        const row = document.createElement('tr');
        row.innerHTML = this.createRowHTML(this.rowCount);
        row.dataset.firebaseId = firebaseId;
        this.tableBody.appendChild(row);
        // 한글 주석: 고정 행 상태 갱신(1~3행 sticky)
        this.applyStickyRows();
        
        // 데이터 채우기
        this.populateRow(row, data);
        
        // 이벤트 리스너 추가
        this.attachRowEventListeners(row);
        
        // rows Map에 추가
        this.rows.set(row, firebaseId);
        // 합계 갱신
        this.updateTotals();
    }

    collectRowData(row) {
        const rowData = {
            rowNumber: parseInt(row.querySelector('td:first-child').textContent),
            buildingName: '',
            address: '',
            scale: '',
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
        // 한글 주석: 고정 행 상태 갱신(1~3행 sticky)
        this.applyStickyRows();
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

// 합계 계산 유틸 추가 (연면적 합계)
ScheduleManager.prototype.updateTotals = function() {
    try {
        const tbody = document.getElementById('tableBody');
        const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
        let sum = 0; // 한글 주석: 연면적 합계
        let stage1Count = 0; // 한글 주석: 최종 작성 단계가 1단계인 행 수
        let stage2Count = 0; // 한글 주석: 최종 작성 단계가 2단계인 행 수
        let stage3Count = 0; // 한글 주석: 최종 작성 단계가 3단계인 행 수
        let stage4Count = 0; // 한글 주석: 최종 작성 단계가 4단계인 행 수
        rows.forEach(row => {
            // 연면적(평) 컬럼은 현재 6번째 컬럼
            const areaInput = row.querySelector('td:nth-child(6) textarea');
            if (areaInput) {
                const raw = (areaInput.value || '').toString().replace(/,/g, '').trim();
                const num = parseFloat(raw);
                if (!isNaN(num)) sum += Math.round(num);
            }

            // 한글 주석: 단계 판정 규칙
            // 7~18열(1-1..4-3) 중 마지막으로 값이 들어있는 셀의 단계가 그 행의 단계
            const stageCols = [7,8,9,10,11,12,13,14,15,16,17,18];
            let lastFilledIndex = -1;
            for (let i = stageCols.length - 1; i >= 0; i--) {
                const col = stageCols[i];
                const el = row.querySelector(`td:nth-child(${col}) textarea`);
                const val = (el?.value || '').toString().trim();
                if (val !== '') { lastFilledIndex = i; break; }
            }
            if (lastFilledIndex >= 0) {
                const stageNumber = Math.floor(lastFilledIndex / 3) + 1; // 0..2=>1, 3..5=>2, 6..8=>3, 9..11=>4
                if (stageNumber === 1) stage1Count++;
                if (stageNumber === 2) stage2Count++;
                if (stageNumber === 3) stage3Count++;
                if (stageNumber === 4) stage4Count++;
            }
        });
        const totalArea = document.getElementById('totalArea');
        if (totalArea) {
            totalArea.textContent = Number.isFinite(sum) ? sum.toLocaleString() : '0';
        }
        const total = stage1Count + stage2Count + stage3Count + stage4Count;
        const pct = (n) => {
            if (!total) return 0;
            return Math.round((n / total) * 100);
        };
        const totalStage1 = document.getElementById('totalStage1');
        if (totalStage1) totalStage1.textContent = `1단계 : ${stage1Count}건 (${pct(stage1Count)}%)`;
        const totalStage2 = document.getElementById('totalStage2');
        if (totalStage2) totalStage2.textContent = `2단계 : ${stage2Count}건 (${pct(stage2Count)}%)`;
        const totalStage3 = document.getElementById('totalStage3');
        if (totalStage3) totalStage3.textContent = `3단계 : ${stage3Count}건 (${pct(stage3Count)}%)`;
        const totalStage4 = document.getElementById('totalStage4');
        if (totalStage4) totalStage4.textContent = `4단계 : ${stage4Count}건 (${pct(stage4Count)}%)`;
    } catch (e) {
        console.error('합계 계산 오류:', e);
    }
};

// 한글 주석: 연면적 포맷터(숫자면 반올림 후 3자리 콤마, 숫자 아니면 원문 유지)
ScheduleManager.formatArea = function(value) {
    try {
        if (value == null) return '';
        const raw = value.toString().replace(/,/g, '').trim();
        if (raw === '') return '';
        const num = Number(raw);
        if (!Number.isFinite(num)) return value; // 숫자가 아니면 그대로 둠
        const rounded = Math.round(num);
        return rounded.toLocaleString();
    } catch (_) {
        return value;
    }
};

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

    // ================== EXCEL 업로드: 버튼(id=uploadData) 핸들러 ==================
    const uploadBtn = document.getElementById('uploadData');
    if (uploadBtn) {
        // 숨김 파일 입력 생성 (xlsx 전용)
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.xlsx';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        uploadBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (ev) => {
            try {
                const file = ev.target.files && ev.target.files[0];
                if (!file) return;

                const data = await file.arrayBuffer();
                const wb = XLSX.read(data, { type: 'array' });
                const sheetName = wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

                // 1) A열에서 숫자 1이 되는 곳부터 시작 행 찾기
                let startIdx = -1;
                for (let i = 0; i < rows.length; i++) {
                    const a = rows[i]?.[0];
                    if (Number(a) === 1) { startIdx = i; break; }
                }
                if (startIdx === -1) {
                    alert('엑셀에서 시작 행(A열=1)을 찾을 수 없습니다.');
                    return;
                }

                // 2) A열 숫자가 끝나고 '합계'를 만나면 종료 (숫자 구간만 수집)
                const picked = [];
                for (let i = startIdx; i < rows.length; i++) {
                    const a = rows[i]?.[0];
                    if (typeof a === 'string' && a.trim() === '합계') break;
                    const aNum = Number(a);
                    if (!Number.isFinite(aNum)) break; // 숫자 구간 종료
                    picked.push(rows[i]);
                }

                // 3) 행 부족 시 자동 추가는 loadDataIntoTable 내부에서 처리되므로,
                //    여기서는 테이블에 넣을 데이터 객체 배열을 구성한다.
                // 컬럼 매핑: A:NO, B:건물명, C:주소, D:규모, E:준공일, F:연면적,
                // G..I:1-1..1-3, J..L:2-1..2-3, M..O:3-1..3-3, P..R:4-1..4-3, S:담당자, T:비고
                const mapRow = (r) => ({
                    rowNumber: Number(r?.[0]) || '',
                    buildingName: r?.[1] ?? '',
                    address: r?.[2] ?? '',
                    scale: r?.[3] ?? '',
                    completionDate: r?.[4] ?? '',
                    area: r?.[5] ?? '',
                    'stage1-1': r?.[6] ?? '',
                    'stage1-2': r?.[7] ?? '',
                    'stage1-3': r?.[8] ?? '',
                    'stage2-1': r?.[9] ?? '',
                    'stage2-2': r?.[10] ?? '',
                    'stage2-3': r?.[11] ?? '',
                    'stage3-1': r?.[12] ?? '',
                    'stage3-2': r?.[13] ?? '',
                    'stage3-3': r?.[14] ?? '',
                    'stage4-1': r?.[15] ?? '',
                    'stage4-2': r?.[16] ?? '',
                    'stage4-3': r?.[17] ?? '',
                    manager: r?.[18] ?? '',
                    remarks: r?.[19] ?? ''
                });

                const isEmptyRow = (obj) => {
                    const keys = ['buildingName','address','scale','completionDate','area','stage1-1','stage1-2','stage1-3','stage2-1','stage2-2','stage2-3','stage3-1','stage3-2','stage3-3','stage4-1','stage4-2','stage4-3','manager','remarks'];
                    return keys.every(k => (obj[k] ?? '').toString().trim() === '');
                };

                const dataObjs = picked.map(mapRow)
                    .filter(row => !isEmptyRow(row)); // 4) 데이터가 모두 없는 행은 제거

                // rowNumber는 테이블 표시용이라 비어있으면 자동 번호 부여
                dataObjs.forEach((r, idx) => { if (!r.rowNumber) r.rowNumber = idx + 1; });

                // =============== 중복 검사 및 덮어쓰기 확인 ===============
                // 기준 키: 우선 NO(숫자)가 있으면 NO로 식별, 없으면 건물명+주소 조합으로 식별
                // 한 개라도 겹치면 확인 팝업(덮어쓰기 여부)을 표시

                // 현재 테이블의 키 집합 수집
                const buildKeyFromObj = (obj) => {
                    const no = Number(obj.rowNumber);
                    if (Number.isFinite(no) && no > 0) return `NO:${no}`;
                    const name = (obj.buildingName || '').trim();
                    const addr = (obj.address || '').trim();
                    return `NMADDR:${name}||${addr}`;
                };

                const buildKeyFromRow = (tr) => {
                    // 현재 화면의 행에서 값 읽기
                    const getVal = (selector) => {
                        const el = tr.querySelector(selector);
                        return el ? el.value || '' : '';
                    };
                    const noText = (tr.querySelector('td:first-child')?.textContent || '').trim();
                    const no = Number(noText);
                    if (Number.isFinite(no) && no > 0) return `NO:${no}`;
                    const name = getVal('textarea[data-field="buildingName"]').trim();
                    const addr = getVal('textarea[data-field="address"]').trim();
                    return `NMADDR:${name}||${addr}`;
                };

                const currentRows = Array.from(document.getElementById('tableBody')?.querySelectorAll('tr') || []);
                const currentKeySet = new Set(currentRows.map(buildKeyFromRow));

                // 업로드 데이터의 키 집합 생성
                const uploadKeys = dataObjs.map(buildKeyFromObj);
                const hasOverlap = uploadKeys.some(k => currentKeySet.has(k));

                if (hasOverlap) {
                    const ok = window.confirm('기존의 자료를 덮어쓰기 하시겠습니까?');
                    if (!ok) {
                        // 사용자가 취소하면 업로드 작업 중단
                        fileInput.value = '';
                        return;
                    }
                }

                // 테이블 채우기 (Firebase 저장 없이)
                scheduleManager.loadDataIntoTable(dataObjs);

                // 한글 주석: 업로드 후 연면적(평) 모든 셀 포맷팅 적용 및 합계 갱신
                try {
                    const areaInputs = document.querySelectorAll('tbody#tableBody td:nth-child(6) textarea[data-field="area"]');
                    areaInputs.forEach((el) => {
                        el.value = ScheduleManager.formatArea(el.value);
                    });
                } catch (_) {}
                scheduleManager.updateTotals();

                // ================== 업로드 후 자동 저장 처리 ==================
                // 온라인(Firebase 연결)인 경우: 모든 행을 Firebase에 저장
                // 오프라인인 경우: 로컬스토리지에 저장
                try {
                    const tbody = document.getElementById('tableBody');
                    const trs = Array.from(tbody ? tbody.querySelectorAll('tr') : []);
                    if (scheduleManager.isFirebaseConnected) {
                        // 한글 주석: 업로드된 모든 행을 Firebase에 반영
                        for (const tr of trs) {
                            await scheduleManager.updateRowInFirebase(tr);
                        }
                    } else {
                        // 한글 주석: 오프라인 모드에서는 로컬 저장
                        scheduleManager.saveToLocalStorage();
                    }
                } catch (persistErr) {
                    console.error('업로드 후 저장 과정에서 오류:', persistErr);
                }

                // 파일 입력 초기화
                fileInput.value = '';
                alert(`엑셀 업로드 완료: ${dataObjs.length}개 행 반영\n데이터가 자동 저장되었습니다.`);
            } catch (err) {
                console.error('엑셀 업로드 오류:', err);
                alert('엑셀 업로드 중 오류가 발생했습니다.');
            }
        });
    }
});

// 한글 주석: 행 고정 취소 및 원상 복구
ScheduleManager.prototype.applyStickyRows = function() {
    try {
        const table = document.getElementById('scheduleTable');
        const thead = table ? table.querySelector('thead') : null;
        const tbody = document.getElementById('tableBody');
        if (!thead || !tbody) return;

        // thead로 올라간 고정행을 모두 tbody 앞으로 되돌림
        const pinned = Array.from(thead.querySelectorAll('tr.pinned-row'));
        pinned.forEach(tr => {
            tr.classList.remove('pinned-row');
            tbody.insertBefore(tr, tbody.firstChild);
        });
        // sticky-row 클래스들도 제거
        Array.from(tbody.querySelectorAll('tr.sticky-row')).forEach(tr => {
            tr.classList.remove('sticky-row', 'row-1', 'row-2', 'row-3');
        });
    } catch (e) {
        console.error('sticky 행 적용 오류:', e);
    }
};

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
