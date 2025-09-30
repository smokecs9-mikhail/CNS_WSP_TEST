/**
 * 상업용(Retail/office) 부동산 가치 평가 결과 JavaScript
 * Property Value Calculator - CNS Corporation
 */

// Firebase 설정 및 초기화
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, push, set, onValue, remove, get } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// Firebase 설정 (sche.html과 동일한 설정 사용)
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

// ================== 상수 정의 ==================
const GRADE_DESCRIPTIONS = {
    1: "핵심입지이며, 공실률이 낮고 빠르게 변화하고 있는 지역",
    2: "핵심입지이나, 공실률이 평균보다 높고 변화가 예정되어있는 지역",
    3: "비핵심지역이며, 주변상권이 잘 형성되어있으며, 거래가 활성화 되어있는 지역",
    4: "비핵심지역이고, 주변상권은 형성되어 있으나 공실상태가 눈에 띄이게 보이는 지역",
    5: "비핵심지역이면서, 주변 상권이 형성되어 있지 않은 곳이나 골목상권지역"
};

const ACCESSIBILITY_DESCRIPTIONS = {
    1: "대중교통/주요도로 접근이 용이하고 주차시설 여유로움",
    2: "대중교통/도로 접근 양호하거나 양호한 주차시설",
    3: "보통 수준의 접근성을 가졌거나 평이한 주차시설.",
    4: "교통/도로 접근 불편하거나 열악한 주차시설",
    5: "접근성 매우 열악하거나 매우 부족한 주차시설"
};

const FACILITY_DESCRIPTIONS = {
    1: "우수(신축 5년이내 혹은 눈에 띄이는 익스테리어)",
    2: "양호(신축 12년 혹은 사소한 보수 필요없는 상태)",
    3: "보통(신축 20년 이내 혹은 사소한 보수가 눈에 띄임)",
    4: "미흡(신축 30년 이내 혹은 설비가 노후되어 교체나 대대적인 보수가 필요한 상태)",
    5: "열악(전면적 개보수 필요)"
};

const STABILITY_DESCRIPTIONS = {
    1: "장기계약·우량임차인·신뢰도 높으며, 공실위험 매우 낮음",
    2: "공기업 및 신뢰할 수 있는 평균 이상 수준의 계약, 만기 분산도 잘 되어있음.",
    3: "신뢰도 높은 임차인과 소상공인의 혼재. 만기분산이 잘 안되어있음. 신용도 보통",
    4: "소상공인 위주의 임차인 구성, 경기영향 크게 받는 업종, 계약상 리스크가 있음.",
    5: "공실위험이 높으며, 임대료 변동성 높고 신뢰도 낮은 업종(유흥,혐오시설)"
};

// 등급별 계수(기본가치 대비 %)
const LOCATION_FACTORS = { 1: +0.001, 2: -0.02, 3: -0.037, 4: -0.06, 5: -0.1 };
const STABILITY_FACTORS = { 1: -0.02, 2: -0.05, 3: -0.065, 4: -0.0, 5: -0.1 };
const ACCESS_FACTORS = { 1: +0.0001, 2: -0.035, 3: -0.05, 4: -0.10, 5: -0.15 };
const FACILITY_FACTORS = { 1: +0.0001, 2: -0.015, 3: -0.03, 4: -0.045, 5: -0.06 };

// KOSIS 프록시 호출 유틸 (서버가 /api/kosis 제공)
async function fetchKosisViaProxy(params) {
    const query = new URLSearchParams(params).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const resp = await fetch(`/api/kosis?${query}`, { signal: controller.signal });
        if (!resp.ok) throw new Error(`KOSIS 프록시 오류: ${resp.status}`);
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return await resp.json();
        return await resp.text();
    } catch (err) {
        console.error('KOSIS 호출 실패:', err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ================== 전역 변수 ==================
let calculator;
let kosisData = [];
let kosisCacheTime = 0;
const KOSIS_CACHE_TTL = 600000; // 10분

// Firebase 경고 표시 지연(ms)
const FIREBASE_WARNING_DELAY_MS = 3000;
let firebaseWarningAllowedAt = Date.now() + FIREBASE_WARNING_DELAY_MS;

// ================== 부동산 가치 계산기 클래스 ==================
class PropertyCalculator {
    constructor() {
        // 로컬 스토리지에서 데이터 로드 (Firebase 연결 전까지 사용)
        this.history = JSON.parse(localStorage.getItem('propertyHistory') || '[]');
        this.inputsStore = JSON.parse(localStorage.getItem('propertyInputs') || '{}');
        this.isFirebaseConnected = false;
        this.initializeEventListeners();
        
        // 초기 상태 표시
        this.updateFirebaseStatus();
        
        // Firebase에서 데이터 로드 시도 (약간의 지연 후)
        setTimeout(() => {
            this.loadDataFromFirebase();
            // 30일 지난 휴지통 데이터 자동 정리 (5초 후)
            setTimeout(() => {
                this.cleanupExpiredTrash();
            }, 5000);
        }, 1000);
    }

    /**
     * 이벤트 리스너 초기화
     */
    initializeEventListeners() {
        // 등급 설명 업데이트
        document.getElementById('locationGrade').addEventListener('change', () => this.updateGradeDescription('locationGrade', GRADE_DESCRIPTIONS));
        document.getElementById('stabilityGrade').addEventListener('change', () => this.updateGradeDescription('stabilityGrade', STABILITY_DESCRIPTIONS));
        document.getElementById('accessibilityGrade').addEventListener('change', () => this.updateGradeDescription('accessibilityGrade', ACCESSIBILITY_DESCRIPTIONS));
        document.getElementById('facilityGrade').addEventListener('change', () => this.updateGradeDescription('facilityGrade', FACILITY_DESCRIPTIONS));

        // 주소 변경 시 KOSIS 자동 조회
        document.getElementById('propertyAddress').addEventListener('input', this.debounce(() => this.triggerKosisAutofill(), 700));

        // 기준금리 조회
        document.getElementById('refreshBaseRate').addEventListener('click', () => this.fetchBaseRate());

        // KOSIS 관련 버튼들
        document.getElementById('refreshKosis').addEventListener('click', () => this.triggerKosisAutofill(true));
        document.getElementById('manualKosis').addEventListener('click', () => this.openKosisSelector());

        // 모달 관련
        this.initializeModals();

        // 초기 등급 설명 표시
        this.updateAllGradeDescriptions();
        this.fetchBaseRate();
    }

    /**
     * 등급 설명 업데이트
     */
    updateGradeDescription(selectId, descriptions) {
        const select = document.getElementById(selectId);
        const descElement = document.getElementById(selectId + 'Desc');
        const grade = parseInt(select.value);
        descElement.textContent = descriptions[grade] || '';
    }

    /**
     * 모든 등급 설명 업데이트
     */
    updateAllGradeDescriptions() {
        this.updateGradeDescription('locationGrade', GRADE_DESCRIPTIONS);
        this.updateGradeDescription('stabilityGrade', STABILITY_DESCRIPTIONS);
        this.updateGradeDescription('accessibilityGrade', ACCESSIBILITY_DESCRIPTIONS);
        this.updateGradeDescription('facilityGrade', FACILITY_DESCRIPTIONS);
    }

    /**
     * 디바운스 함수
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 기준금리 조회
     */
    async fetchBaseRate() {
        const baseRateElement = document.getElementById('baseRate');
        baseRateElement.textContent = '기준금리 조회중…';

        try {
            // 간단한 기준금리 시뮬레이션 (실제로는 API 호출)
            setTimeout(() => {
                baseRateElement.textContent = '기준금리 3.5%';
            }, 1000);
        } catch (error) {
            baseRateElement.textContent = '기준금리 표시 없음';
        }
    }

    /**
     * KOSIS API 데이터 조회
     */
    async fetchKosisData(force = false) {
        const now = Date.now();
        if (!force && kosisData.length > 0 && (now - kosisCacheTime < KOSIS_CACHE_TTL)) {
            return kosisData;
        }

        try {
            // 실제 KOSIS API 호출 시뮬레이션
            // 실제 구현에서는 CORS 문제로 인해 프록시 서버가 필요할 수 있습니다
            const mockData = [
                { region: "서울특별시", vacancy: 8.5, period: "2024Q3" },
                { region: "부산광역시", vacancy: 12.3, period: "2024Q3" },
                { region: "대구광역시", vacancy: 15.2, period: "2024Q3" },
                { region: "인천광역시", vacancy: 11.8, period: "2024Q3" },
                { region: "광주광역시", vacancy: 18.5, period: "2024Q3" },
                { region: "대전광역시", vacancy: 14.7, period: "2024Q3" },
                { region: "울산광역시", vacancy: 16.9, period: "2024Q3" },
                { region: "세종특별자치시", vacancy: 9.2, period: "2024Q3" }
            ];

            kosisData = mockData;
            kosisCacheTime = now;
            return kosisData;
        } catch (error) {
            console.error('KOSIS 데이터 조회 실패:', error);
            return [];
        }
    }

    /**
     * KOSIS 자동 매칭
     */
    async triggerKosisAutofill(force = false) {
        const address = document.getElementById('propertyAddress').value.trim();
        if (!address) {
            this.clearKosisDisplay();
            return;
        }

        const data = await this.fetchKosisData(force);
        const matched = this.findBestMatch(data, address);
        
        if (matched) {
            this.applyKosisData(matched);
        } else {
            this.clearKosisDisplay();
        }
    }

    /**
     * 주소와 가장 잘 매칭되는 KOSIS 데이터 찾기
     */
    findBestMatch(data, address) {
        const addressLower = address.toLowerCase();
        const addressTokens = addressLower.split(/\s+/).filter(token => token.length >= 2);

        let bestMatch = null;
        let bestScore = 0;

        for (const item of data) {
            const regionLower = item.region.toLowerCase();
            let score = 0;

            // 완전 일치 또는 부분 일치
            if (regionLower.includes(addressLower) || addressLower.includes(regionLower)) {
                score += 1000;
            }

            // 토큰 매칭
            for (const token of addressTokens) {
                if (regionLower.includes(token)) {
                    score += 10;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        return bestScore > 0 ? bestMatch : null;
    }

    /**
     * KOSIS 데이터를 화면에 적용
     */
    applyKosisData(data) {
        document.getElementById('kosisRegion').textContent = data.region;
        document.getElementById('kosisVacancy').textContent = `${data.vacancy}%`;
    }

    /**
     * KOSIS 표시 초기화
     */
    clearKosisDisplay() {
        document.getElementById('kosisRegion').textContent = '-';
        document.getElementById('kosisVacancy').textContent = 'N/A';
    }

    /**
     * KOSIS 수동 선택 모달 열기
     */
    async openKosisSelector() {
        const data = await this.fetchKosisData();
        this.showKosisModal(data);
    }

    /**
     * KOSIS 모달 표시
     */
    showKosisModal(data) {
        const modal = document.getElementById('kosisModal');
        const list = document.getElementById('kosisList');
        
        list.innerHTML = '';
        data.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="kosis-item" data-index="${index}">
                    <strong>${item.region}</strong> | ${item.period} | ${item.vacancy}%
                </div>
            `;
            li.addEventListener('click', () => {
                this.selectKosisItem(item);
            });
            list.appendChild(li);
        });

        modal.style.display = 'block';
    }

    /**
     * KOSIS 아이템 선택
     */
    selectKosisItem(item) {
        this.applyKosisData(item);
        document.getElementById('kosisModal').style.display = 'none';
    }

    /**
     * 모달 초기화
     */
    initializeModals() {
        // 결과 모달
        const resultModal = document.getElementById('resultModal');
        const closeModal = document.getElementById('closeModal');
        const closeModalBtn = document.getElementById('closeModalBtn');

        closeModal.addEventListener('click', () => {
            resultModal.style.display = 'none';
        });

        closeModalBtn.addEventListener('click', () => {
            resultModal.style.display = 'none';
        });

        // KOSIS 모달
        const kosisModal = document.getElementById('kosisModal');
        const closeKosisModal = document.getElementById('closeKosisModal');
        const closeKosisModalBtn = document.getElementById('closeKosisModalBtn');

        closeKosisModal.addEventListener('click', () => {
            kosisModal.style.display = 'none';
        });

        closeKosisModalBtn.addEventListener('click', () => {
            kosisModal.style.display = 'none';
        });

        // 모달 외부 클릭 시 닫기
        window.addEventListener('click', (event) => {
            if (event.target === resultModal) {
                resultModal.style.display = 'none';
            }
            if (event.target === kosisModal) {
                kosisModal.style.display = 'none';
            }
        });
    }

    /**
     * 부동산 가치 계산
     */
    calculateValue(formData) {
        const monthlyRent = parseFloat(formData.monthlyRent) || 0;
        const deposit = parseFloat(formData.deposit) || 0;
        const adIncome = parseFloat(formData.adIncome) || 0;
        const parkingIncome = parseFloat(formData.parkingIncome) || 0;
        const otherIncome = parseFloat(formData.otherIncome) || 0;
        const facilityCosts = parseFloat(formData.facilityCosts) || 0;
        const managementReturnRate = parseFloat(formData.managementReturnRate) || 0;
        const capRate = parseFloat(formData.capRate) || 4.3;

        // 등급 값들
        const locationGrade = parseInt(formData.locationGrade) || 1;
        const stabilityGrade = parseInt(formData.stabilityGrade) || 2;
        const accessibilityGrade = parseInt(formData.accessibilityGrade) || 3;
        const facilityGrade = parseInt(formData.facilityGrade) || 3;

        // 공실률
        const currentVacancy = parseFloat(formData.currentVacancy) || 0;
        const regionalVacancy = parseFloat(formData.regionalVacancy) || 0;

        // NOI 계산
        const annualRentIncome = (monthlyRent + adIncome + parkingIncome + otherIncome) * 12 + (deposit * capRate / 100);
        const annualFacilityMgmtIncome = facilityCosts * (managementReturnRate / 100) * 12;
        const noi = annualRentIncome + annualFacilityMgmtIncome;

        // 기본가치 계산
        const baseValue = noi / (capRate / 100);

        // 등급별 계수 적용
        const locFactor = LOCATION_FACTORS[locationGrade] || 0;
        const stabFactor = STABILITY_FACTORS[stabilityGrade] || 0;
        const accFactor = ACCESS_FACTORS[accessibilityGrade] || 0;
        const facFactor = FACILITY_FACTORS[facilityGrade] || 0;
        const totalFactor = locFactor + stabFactor + accFactor + facFactor;

        // 현재가치 계산
        const currentValue = baseValue * (1.0 + totalFactor);

        // 잠재가치 계산
        let potentialValue = 0;
        if (capRate > 0) {
            const rawPotential = (noi * 0.88) * ((currentVacancy - regionalVacancy) / 100.0) / (capRate / 100);
            potentialValue = Math.max(0, rawPotential);
        }

        // 성장가치 계산
        const growthValue = currentValue + potentialValue;

        return {
            propertyName: formData.propertyName || '-',
            propertyAddress: formData.propertyAddress || '-',
            locationGrade: locationGrade,
            stabilityGrade: stabilityGrade,
            accessibilityGrade: accessibilityGrade,
            facilityGrade: facilityGrade,
            currentValue: Math.round(currentValue),
            potentialValue: Math.round(potentialValue),
            growthValue: Math.round(growthValue),
            baseValue: Math.round(baseValue),
            noi: Math.round(noi),
            capRate: capRate,
            currentVacancy: currentVacancy,
            regionalVacancy: regionalVacancy,
            kosisRegion: formData.kosisRegion || '',
            kosisPeriod: formData.kosisPeriod || ''
        };
    }

    /**
     * 히스토리에 추가
     */
    async addToHistory(result) {
        const historyItem = {
            id: Date.now(),
            timestamp: new Date().toLocaleString('ko-KR'),
            ...result
        };
        
        this.history.unshift(historyItem);
        
        // 입력값 저장
        const inputs = this.collectFormData();
        this.inputsStore[historyItem.id] = {
            inputs: inputs,
            detailedInfo: {
                investigatorName: '',
                investigationYear: '',
                investigationMonth: '',
                investigationDay: '',
                facilities: [],
                confirmerName: '',
                opinionText: ''
            }
        };
        
        // 로컬 스토리지에 저장 (백업용)
        localStorage.setItem('propertyHistory', JSON.stringify(this.history));
        localStorage.setItem('propertyInputs', JSON.stringify(this.inputsStore));
        
        // Firebase에 저장
        await this.saveHistoryToFirebase(historyItem);
        await this.saveInputsToFirebase(this.inputsStore);
        
        return historyItem;
    }

    /**
     * 폼 데이터 수집
     */
    collectFormData() {
        return {
            propertyName: document.getElementById('propertyName').value.trim(),
            propertyAddress: document.getElementById('propertyAddress').value.trim(),
            monthlyRent: this.removeCommas(document.getElementById('monthlyRent').value),
            deposit: this.removeCommas(document.getElementById('deposit').value),
            adIncome: this.removeCommas(document.getElementById('adRevenue').value),
            parkingIncome: this.removeCommas(document.getElementById('parkingRevenue').value),
            otherIncome: this.removeCommas(document.getElementById('otherRevenue').value),
            facilityCosts: this.removeCommas(document.getElementById('managementFee').value),
            managementReturnRate: document.getElementById('managementProfitRate').value || '0',
            capRate: document.getElementById('salesYield').value,
            locationGrade: document.getElementById('locationGrade').value,
            stabilityGrade: document.getElementById('stabilityGrade').value,
            accessibilityGrade: document.getElementById('accessibilityGrade').value,
            facilityGrade: document.getElementById('facilityGrade').value,
            currentVacancy: document.getElementById('currentVacancy').value,
            regionalVacancy: document.getElementById('kosisVacancy').textContent.replace('%', '') || '0',
            kosisRegion: document.getElementById('kosisRegion').textContent,
            kosisPeriod: '2024Q3' // 실제로는 KOSIS 데이터에서 가져와야 함
        };
    }

    /**
     * 콤마 제거
     */
    removeCommas(value) {
        if (!value) return '';
        return value.toString().replace(/,/g, '');
    }

    /**
     * 히스토리 조회
     */
    getHistory() {
        return this.history;
    }

    /**
     * 히스토리에서 입력값 불러오기
     */
    loadHistoryItem(id) {
        const data = this.inputsStore[id];
        if (!data) return false;

        // 구조 변경 대응: 기존 데이터와 새 데이터 구조 모두 지원
        const inputs = data.inputs || data;

        // 폼 필드에 값 설정
        document.getElementById('propertyName').value = inputs.propertyName || '';
        document.getElementById('propertyAddress').value = inputs.propertyAddress || '';
        document.getElementById('monthlyRent').value = this.formatNumber(inputs.monthlyRent || '');
        document.getElementById('deposit').value = this.formatNumber(inputs.deposit || '');
        document.getElementById('adRevenue').value = this.formatNumber(inputs.adIncome || '');
        document.getElementById('parkingRevenue').value = this.formatNumber(inputs.parkingIncome || '');
        document.getElementById('otherRevenue').value = this.formatNumber(inputs.otherIncome || '');
        document.getElementById('managementFee').value = this.formatNumber(inputs.facilityCosts || '');
        document.getElementById('managementProfitRate').value = inputs.managementReturnRate || '';
        document.getElementById('salesYield').value = inputs.capRate || '4.3';
        document.getElementById('locationGrade').value = inputs.locationGrade || '1';
        document.getElementById('stabilityGrade').value = inputs.stabilityGrade || '2';
        document.getElementById('accessibilityGrade').value = inputs.accessibilityGrade || '3';
        document.getElementById('facilityGrade').value = inputs.facilityGrade || '3';
        document.getElementById('currentVacancy').value = inputs.currentVacancy || '0';

        // KOSIS 데이터 복원
        if (inputs.kosisRegion) {
            document.getElementById('kosisRegion').textContent = inputs.kosisRegion;
            document.getElementById('kosisVacancy').textContent = `${inputs.regionalVacancy}%`;
        }

        // 등급 설명 업데이트
        this.updateAllGradeDescriptions();

        return true;
    }

    /**
     * 히스토리에서 결과 불러오기 (모달 표시)
     */
    loadHistoryResult(id) {
        const historyItem = this.history.find(item => item.id === id);
        if (!historyItem) return false;

        // 결과 모달에 데이터 표시
        this.showHistoryResultModal(historyItem);
        return true;
    }

    /**
     * 히스토리 결과를 모달로 표시
     */
    showHistoryResultModal(historyItem) {
        const modal = document.getElementById('resultModal');
        
        // 기본 정보 설정
        document.getElementById('resultPropertyName').textContent = historyItem.propertyName;
        document.getElementById('resultPropertyAddress').textContent = historyItem.propertyAddress;
        
        // 등급 설명 설정
        document.getElementById('resultLocationDesc').textContent = GRADE_DESCRIPTIONS[historyItem.locationGrade] || '';
        document.getElementById('resultStabilityDesc').textContent = STABILITY_DESCRIPTIONS[historyItem.stabilityGrade] || '';
        document.getElementById('resultAccessibilityDesc').textContent = ACCESSIBILITY_DESCRIPTIONS[historyItem.accessibilityGrade] || '';
        document.getElementById('resultFacilityDesc').textContent = FACILITY_DESCRIPTIONS[historyItem.facilityGrade] || '';
        document.getElementById('resultMarketValue').textContent = calculator.formatMillionWon(historyItem.currentValue);
        
        // 상세 정보 불러오기
        this.loadDetailedInfo(historyItem.id);
        
        // 현재 ID 저장 (나중에 상세 정보 저장 시 사용)
        modal.dataset.currentId = historyItem.id;
        
        modal.style.display = 'block';
    }

    /**
     * 숫자 포맷팅
     */
    formatNumber(value) {
        if (!value) return '';
        const num = parseFloat(value);
        if (isNaN(num)) return '';
        return num.toLocaleString();
    }

    /**
     * 백만원 단위로 포맷팅 (콤마 포함)
     */
    formatMillionWon(value) {
        if (!value || value === '') return '0 백만원';
        const num = parseFloat(value.toString().replace(/,/g, ''));
        if (isNaN(num)) return '0 백만원';
        const millionValue = (num / 1000000).toFixed(0);
        return `${parseInt(millionValue).toLocaleString('ko-KR')} 백만원`;
    }

    /**
     * 상세 정보 수집
     */
    collectDetailedInfo() {
        // 체크박스 수집
        const facilities = Array.from(document.querySelectorAll('input[name="facilities"]:checked'))
            .map(cb => cb.value);

        return {
            investigatorName: document.getElementById('investigatorName').value.trim(),
            investigationYear: document.getElementById('investigationYear').value,
            investigationMonth: document.getElementById('investigationMonth').value,
            investigationDay: document.getElementById('investigationDay').value,
            facilities: facilities,
            confirmerName: document.getElementById('confirmerName').value.trim(),
            opinionText: document.getElementById('opinionText').value.trim()
        };
    }

    /**
     * 상세 정보 불러오기
     */
    loadDetailedInfo(id) {
        const data = this.inputsStore[id];
        if (!data) {
            // 데이터가 없으면 초기화
            this.clearDetailedInfo();
            return false;
        }

        const detailedInfo = data.detailedInfo;
        
        if (detailedInfo) {
            // 상세 정보가 있으면 불러오기
            document.getElementById('investigatorName').value = detailedInfo.investigatorName || '';
            document.getElementById('investigationYear').value = detailedInfo.investigationYear || '';
            document.getElementById('investigationMonth').value = detailedInfo.investigationMonth || '';
            document.getElementById('investigationDay').value = detailedInfo.investigationDay || '';
            document.getElementById('confirmerName').value = detailedInfo.confirmerName || '';
            document.getElementById('opinionText').value = detailedInfo.opinionText || '';
            
            // 체크박스 복원
            document.querySelectorAll('input[name="facilities"]').forEach(cb => {
                cb.checked = detailedInfo.facilities && detailedInfo.facilities.includes(cb.value);
            });
            
            // 원본 데이터 저장 (변경 감지용)
            this.originalDetailedInfo = JSON.stringify(detailedInfo);
        } else {
            // 상세 정보가 없으면 기본값 설정
            const currentYear = new Date().getFullYear();
            document.getElementById('investigationYear').value = currentYear;
            document.getElementById('investigationMonth').value = '';
            document.getElementById('investigationDay').value = '';
            document.getElementById('investigatorName').value = '';
            document.getElementById('confirmerName').value = '';
            document.getElementById('opinionText').value = '';
            
            // 체크박스 초기화
            document.querySelectorAll('input[name="facilities"]').forEach(cb => {
                cb.checked = false;
            });
            
            // 원본 데이터를 빈 객체로 설정
            this.originalDetailedInfo = JSON.stringify({
                investigatorName: '',
                investigationYear: currentYear.toString(),
                investigationMonth: '',
                investigationDay: '',
                facilities: [],
                confirmerName: '',
                opinionText: ''
            });
        }
        
        return true;
    }

    /**
     * 상세 정보 초기화
     */
    clearDetailedInfo() {
        const currentYear = new Date().getFullYear();
        document.getElementById('investigationYear').value = currentYear;
        document.getElementById('investigationMonth').value = '';
        document.getElementById('investigationDay').value = '';
        document.getElementById('investigatorName').value = '';
        document.getElementById('confirmerName').value = '';
        document.getElementById('opinionText').value = '';
        
        // 체크박스 초기화
        document.querySelectorAll('input[name="facilities"]').forEach(cb => {
            cb.checked = false;
        });
    }

    /**
     * 상세 정보 변경 감지
     */
    hasDetailedInfoChanged() {
        const currentInfo = this.collectDetailedInfo();
        const currentInfoStr = JSON.stringify(currentInfo);
        
        // 원본 데이터가 없으면 변경되지 않은 것으로 간주
        if (!this.originalDetailedInfo) {
            return false;
        }
        
        return currentInfoStr !== this.originalDetailedInfo;
    }

    /**
     * 상세 정보 저장 (Firebase 및 로컬)
     */
    async saveDetailedInfo(id) {
        try {
            const detailedInfo = this.collectDetailedInfo();
            
            // inputsStore 업데이트
            if (this.inputsStore[id]) {
                this.inputsStore[id].detailedInfo = detailedInfo;
            } else {
                console.error('해당 ID의 데이터를 찾을 수 없습니다:', id);
                return false;
            }
            
            // 로컬 스토리지에 저장
            localStorage.setItem('propertyInputs', JSON.stringify(this.inputsStore));
            
            // Firebase에 저장
            await this.saveInputsToFirebase(this.inputsStore);
            
            // 원본 데이터 업데이트 (변경 감지 초기화)
            this.originalDetailedInfo = JSON.stringify(detailedInfo);
            
            console.log('상세 정보 저장 완료:', id);
            return true;
        } catch (error) {
            console.error('상세 정보 저장 실패:', error);
            return false;
        }
    }

    /**
     * 히스토리 아이템 삭제
     */
    deleteHistoryItem(id) {
        this.history = this.history.filter(item => item.id !== id);
        delete this.inputsStore[id];
        localStorage.setItem('propertyHistory', JSON.stringify(this.history));
        localStorage.setItem('propertyInputs', JSON.stringify(this.inputsStore));
    }

    /**
     * 선택된 히스토리 아이템들 삭제 (휴지통으로 이동)
     */
    async deleteSelectedHistory(ids) {
        // 삭제할 항목들을 휴지통으로 이동
        const deletedItems = this.history.filter(item => ids.includes(item.id));
        for (const item of deletedItems) {
            await this.moveToTrash(item.id, item, this.inputsStore[item.id]);
        }
        
        // 히스토리에서 제거
        this.history = this.history.filter(item => !ids.includes(item.id));
        ids.forEach(id => delete this.inputsStore[id]);
        
        // 로컬 스토리지에 저장 (백업용)
        localStorage.setItem('propertyHistory', JSON.stringify(this.history));
        localStorage.setItem('propertyInputs', JSON.stringify(this.inputsStore));
        
        // Firebase에서 삭제
        await this.deleteSelectedFromFirebase(ids);
    }

    /**
     * 모든 히스토리 삭제 (휴지통으로 이동)
     */
    async clearHistory() {
        // 모든 항목을 휴지통으로 이동
        for (const item of this.history) {
            await this.moveToTrash(item.id, item, this.inputsStore[item.id]);
        }
        
        this.history = [];
        this.inputsStore = {};
        
        // 로컬 스토리지에 저장 (백업용)
        localStorage.setItem('propertyHistory', JSON.stringify(this.history));
        localStorage.setItem('propertyInputs', JSON.stringify(this.inputsStore));
        
        // Firebase에서 삭제
        await this.deleteAllFromFirebase();
    }

    // ================== Firebase 관련 메서드들 ==================
    
    /**
     * 입력 데이터 구조 마이그레이션 (기존 구조 → 새 구조)
     */
    migrateInputsData(data) {
        const migratedData = {};
        
        for (const [id, item] of Object.entries(data)) {
            if (item.inputs) {
                // 이미 새 구조면 그대로 사용
                migratedData[id] = {
                    inputs: item.inputs,
                    detailedInfo: item.detailedInfo || {
                        investigatorName: '',
                        investigationYear: '',
                        investigationMonth: '',
                        investigationDay: '',
                        facilities: [],
                        confirmerName: '',
                        opinionText: ''
                    }
                };
            } else {
                // 기존 구조를 새 구조로 변환
                // detailedInfo가 혹시 있다면 보존
                migratedData[id] = {
                    inputs: item,
                    detailedInfo: item.detailedInfo || {
                        investigatorName: '',
                        investigationYear: '',
                        investigationMonth: '',
                        investigationDay: '',
                        facilities: [],
                        confirmerName: '',
                        opinionText: ''
                    }
                };
                console.log(`데이터 마이그레이션: ID ${id} (기존 구조 → 새 구조)`);
            }
        }
        
        return migratedData;
    }
    
    /**
     * Firebase에서 데이터 로드
     */
    async loadDataFromFirebase() {
        try {
            console.log('Firebase에서 데이터 로드 시작...');
            
            // Firebase 연결 테스트를 위한 간단한 쓰기 작업
            const testRef = ref(database, 'propertyCalculator/connectionTest');
            await set(testRef, { timestamp: Date.now() });
            console.log('Firebase 연결 테스트 성공');
            
            // 히스토리 데이터 로드
            const historyRef = ref(database, 'propertyCalculator/history');
            onValue(historyRef, (snapshot) => {
                const data = snapshot.val();
                this.isFirebaseConnected = true; // Firebase에 연결되었음을 표시
                
                if (data) {
                    this.history = Object.values(data);
                    console.log('Firebase에서 히스토리 데이터 로드 완료:', this.history.length, '개 항목');
                } else {
                    console.log('Firebase에 히스토리 데이터가 없습니다. 로컬 스토리지에서 로드');
                    // 로컬 스토리지에서 데이터 로드
                    this.history = JSON.parse(localStorage.getItem('propertyHistory') || '[]');
                }
                renderHistoryTable();
                this.updateFirebaseStatus();
            }, (error) => {
                console.error('Firebase 히스토리 데이터 로드 실패:', error);
                this.isFirebaseConnected = false;
                this.updateFirebaseStatus();
            });

            // 입력값 데이터 로드
            const inputsRef = ref(database, 'propertyCalculator/inputs');
            onValue(inputsRef, async (snapshot) => {
                const data = snapshot.val();
                let needsSave = false;
                
                if (data) {
                    // 데이터 구조 마이그레이션
                    const originalLength = Object.keys(data).length;
                    this.inputsStore = this.migrateInputsData(data);
                    const migratedLength = Object.keys(this.inputsStore).length;
                    
                    // 마이그레이션이 발생했는지 확인
                    if (originalLength > 0) {
                        const hasOldStructure = Object.values(data).some(item => !item.inputs);
                        if (hasOldStructure) {
                            needsSave = true;
                            console.log('기존 구조 발견 - 마이그레이션 수행 후 저장');
                        }
                    }
                    
                    console.log('Firebase에서 입력값 데이터 로드 완료');
                } else {
                    console.log('Firebase에 입력값 데이터가 없습니다. 로컬 스토리지에서 로드');
                    // 로컬 스토리지에서 데이터 로드
                    const localData = JSON.parse(localStorage.getItem('propertyInputs') || '{}');
                    this.inputsStore = this.migrateInputsData(localData);
                }
                
                // 마이그레이션된 데이터를 Firebase와 로컬에 저장
                if (needsSave) {
                    await this.saveInputsToFirebase(this.inputsStore);
                    localStorage.setItem('propertyInputs', JSON.stringify(this.inputsStore));
                    console.log('마이그레이션된 데이터 저장 완료');
                }
            }, (error) => {
                console.error('Firebase 입력값 데이터 로드 실패:', error);
            });

        } catch (error) {
            console.error('Firebase 연결 실패:', error);
            this.isFirebaseConnected = false;
            this.updateFirebaseStatus();
        }
    }

    /**
     * Firebase 연결 상태 UI 업데이트
     */
    updateFirebaseStatus() {
        const statusElement = document.getElementById('firebaseStatus');
        const warningElement = document.getElementById('firebaseWarning');
        
        if (statusElement) {
            if (this.isFirebaseConnected) {
                statusElement.textContent = '✅ Firebase 연결됨';
                statusElement.className = 'firebase-status connected';
            } else {
                statusElement.textContent = '⚠️ 로컬 저장소 사용';
                statusElement.className = 'firebase-status disconnected';
            }
        }
        
        // 경고 메시지 표시/숨김 제어 (초기 3초는 항상 숨김)
        if (warningElement) {
            const now = Date.now();
            const allowShow = now >= firebaseWarningAllowedAt;
            if (this.isFirebaseConnected || !allowShow) {
                warningElement.style.display = 'none';
            } else {
                warningElement.style.display = 'block';
            }
        }
    }

    /**
     * Firebase 연결 강제 재시도
     */
    async retryFirebaseConnection() {
        console.log('Firebase 연결 재시도 중...');
        this.isFirebaseConnected = false;
        this.updateFirebaseStatus();
        
        try {
            // 연결 테스트
            const testRef = ref(database, 'propertyCalculator/connectionTest');
            await set(testRef, { 
                timestamp: Date.now(),
                retry: true 
            });
            
            this.isFirebaseConnected = true;
            console.log('Firebase 재연결 성공');
            this.updateFirebaseStatus();
            
            // 데이터 다시 로드
            await this.loadDataFromFirebase();
            
        } catch (error) {
            console.error('Firebase 재연결 실패:', error);
            this.isFirebaseConnected = false;
            this.updateFirebaseStatus();
        }
    }

    /**
     * Firebase에 히스토리 데이터 저장
     */
    async saveHistoryToFirebase(historyItem) {
        try {
            if (!this.isFirebaseConnected) {
                console.log('Firebase 연결되지 않음. 로컬 스토리지만 사용');
                return;
            }

            const historyRef = ref(database, 'propertyCalculator/history');
            const newHistoryRef = push(historyRef);
            await set(newHistoryRef, historyItem);
            
            console.log('Firebase에 히스토리 데이터 저장 완료');
        } catch (error) {
            console.error('Firebase 히스토리 저장 실패:', error);
        }
    }

    /**
     * Firebase에 입력값 데이터 저장
     */
    async saveInputsToFirebase(inputs) {
        try {
            if (!this.isFirebaseConnected) {
                console.log('Firebase 연결되지 않음. 로컬 스토리지만 사용');
                return;
            }

            const inputsRef = ref(database, 'propertyCalculator/inputs');
            await set(inputsRef, inputs);
            
            console.log('Firebase에 입력값 데이터 저장 완료');
        } catch (error) {
            console.error('Firebase 입력값 저장 실패:', error);
        }
    }

    /**
     * Firebase에서 선택된 항목 삭제
     */
    async deleteSelectedFromFirebase(selectedIds) {
        try {
            if (!this.isFirebaseConnected) {
                console.log('Firebase 연결되지 않음. 로컬 스토리지만 사용');
                return;
            }

            const historyRef = ref(database, 'propertyCalculator/history');
            const snapshot = await get(historyRef);
            const data = snapshot.val();
            
            if (data) {
                for (const [key, item] of Object.entries(data)) {
                    if (selectedIds.includes(item.id)) {
                        const itemRef = ref(database, `propertyCalculator/history/${key}`);
                        await remove(itemRef);
                    }
                }
                console.log('Firebase에서 선택된 항목 삭제 완료');
            }
        } catch (error) {
            console.error('Firebase 선택 항목 삭제 실패:', error);
        }
    }

    /**
     * 휴지통으로 이동 (30일간 보관)
     */
    async moveToTrash(itemId, historyItem, inputData) {
        try {
            if (!this.isFirebaseConnected) {
                console.log('Firebase 연결되지 않음. 휴지통 기능을 사용할 수 없습니다.');
                return;
            }

            const trashData = {
                id: itemId,
                deletedAt: Date.now(),
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30일 후
                historyItem: historyItem,
                inputData: inputData
            };

            const trashRef = ref(database, `propertyCalculator/trash/${itemId}`);
            await set(trashRef, trashData);
            
            console.log('휴지통으로 이동 완료:', itemId);
        } catch (error) {
            console.error('휴지통 이동 실패:', error);
        }
    }

    /**
     * 30일 지난 휴지통 데이터 자동 정리
     */
    async cleanupExpiredTrash() {
        try {
            if (!this.isFirebaseConnected) {
                return;
            }

            const trashRef = ref(database, 'propertyCalculator/trash');
            const snapshot = await get(trashRef);

            const trashData = snapshot.val();
            if (!trashData) return;

            const now = Date.now();
            let cleanedCount = 0;

            for (const [key, item] of Object.entries(trashData)) {
                if (item.expiresAt && item.expiresAt < now) {
                    const itemRef = ref(database, `propertyCalculator/trash/${key}`);
                    await remove(itemRef);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                console.log(`${cleanedCount}개의 만료된 휴지통 항목 정리 완료`);
            }
        } catch (error) {
            console.error('휴지통 정리 실패:', error);
        }
    }

    /**
     * Firebase에서 모든 데이터 삭제
     */
    async deleteAllFromFirebase() {
        try {
            if (!this.isFirebaseConnected) {
                console.log('Firebase 연결되지 않음. 로컬 스토리지만 사용');
                return;
            }

            const historyRef = ref(database, 'propertyCalculator/history');
            await remove(historyRef);
            
            const inputsRef = ref(database, 'propertyCalculator/inputs');
            await remove(inputsRef);
            
            console.log('Firebase에서 모든 데이터 삭제 완료');
        } catch (error) {
            console.error('Firebase 전체 삭제 실패:', error);
        }
    }
}

// ================== 전역 함수들 ==================

/**
 * 안전한 숫자 포맷터 (undefined/null/NaN 방지)
 */
function formatNumberLocal(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString() : '0';
}

/**
 * 히스토리 테이블 렌더링
 */
function renderHistoryTable() {
    const history = calculator.getHistory();
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';

    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 20px; color: #666;">계산 결과가 없습니다.</td></tr>';
        return;
    }

    history.filter(Boolean).forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="checkbox-cell">
                <input type="checkbox" class="history-checkbox" data-id="${item.id}">
            </td>
            <td>${item.timestamp || ''}</td>
            <td>${item.propertyName || ''}</td>
            <td>${item.locationGrade || ''}등급</td>
            <td>${item.stabilityGrade || ''}등급</td>
            <td>${item.accessibilityGrade || ''}등급</td>
            <td>${item.facilityGrade || ''}등급</td>
            <td>${formatNumberLocal(item.currentValue)}원</td>
            <td>${formatNumberLocal(item.potentialValue)}원</td>
            <td>${formatNumberLocal(item.growthValue)}원</td>
            <td>${formatNumberLocal(item.noi)}원</td>
            <td>${item.capRate ?? ''}%</td>
        `;
        
        // 더블클릭 이벤트 추가 (결과 불러오기)
        row.addEventListener('dblclick', function(e) {
            // 체크박스 클릭은 제외
            if (e.target.type === 'checkbox') {
                return;
            }
            // 결과 모달 표시
            calculator.loadHistoryResult(item.id);
        });
        
        // 행에 마우스 오버 시 스타일 추가
        row.style.cursor = 'pointer';
        
        tbody.appendChild(row);
    });
}

/**
 * 결과 모달 표시
 */
function showResultModal(result) {
    const modal = document.getElementById('resultModal');
    
    // 기본 정보 설정
    document.getElementById('resultPropertyName').textContent = result.propertyName;
    document.getElementById('resultPropertyAddress').textContent = result.propertyAddress;
    
    // 등급 설명 설정
    document.getElementById('resultLocationDesc').textContent = GRADE_DESCRIPTIONS[result.locationGrade] || '';
    document.getElementById('resultStabilityDesc').textContent = STABILITY_DESCRIPTIONS[result.stabilityGrade] || '';
    document.getElementById('resultAccessibilityDesc').textContent = ACCESSIBILITY_DESCRIPTIONS[result.accessibilityGrade] || '';
    document.getElementById('resultFacilityDesc').textContent = FACILITY_DESCRIPTIONS[result.facilityGrade] || '';
    document.getElementById('resultMarketValue').textContent = calculator.formatMillionWon(result.currentValue);
    
    // 상세 정보 초기화 (새 계산 결과는 상세 정보가 없음)
    calculator.clearDetailedInfo();
    
    // 현재 ID 저장
    modal.dataset.currentId = result.id || Date.now();
    
    modal.style.display = 'block';
}

/**
 * 숫자 입력 필드 포맷팅
 */
function formatNumberInput(input) {
    input.addEventListener('input', function() {
        let value = this.value;
        const numbersOnly = value.replace(/[^\d]/g, '');
        this.value = numbersOnly;
    });
    
    input.addEventListener('blur', function() {
        let value = this.value;
        if (!value) return;
        
        const numbersOnly = value.replace(/[^\d]/g, '');
        if (numbersOnly) {
            const formatted = parseInt(numbersOnly).toLocaleString();
            this.value = formatted;
        } else {
            this.value = '';
        }
    });
    
    input.addEventListener('focus', function() {
        let value = this.value;
        if (value) {
            this.value = value.replace(/,/g, '');
        }
    });
}

/**
 * 모든자료 내려받기 (입력값 + 결과값 + 상세정보)
 */
function exportAllData() {
    const history = calculator.getHistory();
    if (history.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }

    // 디버그: inputsStore 확인
    console.log('=== CSV 다운로드 디버그 ===');
    console.log('History 항목 수:', history.length);
    console.log('InputsStore:', calculator.inputsStore);

    // CSV 헤더 (사용자 요청 순서대로)
    let csv = '시간,물건명,물건 주소,' +
              '월간 임대료 총액/월,보증금 총액,광고수익/월,주차수익/월,기타수익/월,' +
              '시설 관리비 총액/월,관리수익률(%),매매기준 수익률(%),' +
              '입지 등급(1~5),임대 안정성(1~5),접근성 등급(1~5),시설 등급(1~5),' +
              '현재 공실률(%),' +
              'Market Value,Value-Add Potential,HBU Value,NOI,CapRate(%),' +
              '조사담당자,조사일자,확인한 시설,확인자,검토 의견\n';
    
    history.forEach(item => {
        const inputData = calculator.inputsStore[item.id];
        
        // 디버그: 각 항목별 데이터 확인
        console.log(`\n항목 ID: ${item.id}`);
        console.log('  물건명:', item.propertyName);
        console.log('  inputData:', inputData);
        
        // 기존 데이터 구조와 새 데이터 구조 모두 지원
        let inputs, detailedInfo;
        
        if (inputData) {
            if (inputData.inputs) {
                // 새 구조: { inputs: {...}, detailedInfo: {...} }
                inputs = inputData.inputs || {};
                detailedInfo = inputData.detailedInfo;
                console.log('  데이터 구조: 새 구조');
            } else {
                // 기존 구조: { propertyName: ..., monthlyRent: ..., ... }
                inputs = inputData;
                detailedInfo = null;
                console.log('  데이터 구조: 기존 구조');
            }
        } else {
            inputs = {};
            detailedInfo = null;
            console.log('  데이터 구조: inputData 없음');
        }
        
        console.log('  detailedInfo:', detailedInfo);
        
        // 상세 정보 안전하게 가져오기 (null 체크)
        const investigatorName = detailedInfo?.investigatorName || '';
        const investigationYear = detailedInfo?.investigationYear || '';
        const investigationMonth = detailedInfo?.investigationMonth || '';
        const investigationDay = detailedInfo?.investigationDay || '';
        const facilities = detailedInfo?.facilities || [];
        const confirmerName = detailedInfo?.confirmerName || '';
        const opinionText = detailedInfo?.opinionText || '';
        
        console.log('  추출된 상세정보:', {
            investigatorName,
            investigationYear,
            investigationMonth,
            investigationDay,
            facilities,
            confirmerName,
            opinionText
        });
        
        // 조사일자 포맷팅
        let investigationDate = '';
        if (investigationYear) {
            investigationDate = `${investigationYear}년 ${investigationMonth}월 ${investigationDay}일`;
        }
        
        // 확인시설 배열을 문자열로 변환
        const facilitiesStr = Array.isArray(facilities) && facilities.length > 0 ? facilities.join('; ') : '';
        
        // CSV 특수문자 이스케이프 처리 (쉼표, 따옴표, 줄바꿈)
        const escapeCSV = (str) => {
            if (str == null || str === undefined) return '';
            const strValue = String(str);
            if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                return `"${strValue.replace(/"/g, '""')}"`;
            }
            return strValue;
        };
        
        // 데이터 행 생성 (요청된 순서대로)
        csv += `${escapeCSV(item.timestamp)},${escapeCSV(item.propertyName)},${escapeCSV(inputs.propertyAddress || '')}` + ',';
        csv += `${inputs.monthlyRent || ''},${inputs.deposit || ''},${inputs.adIncome || ''},${inputs.parkingIncome || ''},${inputs.otherIncome || ''}` + ',';
        csv += `${inputs.facilityCosts || ''},${inputs.managementReturnRate || ''},${inputs.capRate || ''}` + ',';
        csv += `${item.locationGrade || ''},${item.stabilityGrade || ''},${item.accessibilityGrade || ''},${item.facilityGrade || ''}` + ',';
        csv += `${inputs.currentVacancy || ''}` + ',';
        csv += `${item.currentValue || ''},${item.potentialValue || ''},${item.growthValue || ''},${item.noi || ''},${item.capRate || ''}` + ',';
        csv += `${escapeCSV(investigatorName)},${escapeCSV(investigationDate)},${escapeCSV(facilitiesStr)},${escapeCSV(confirmerName)},${escapeCSV(opinionText)}`;
        csv += '\n';
    });

    // UTF-8 BOM 추가 (Excel에서 한글 깨짐 방지)
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csv;
    
    const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `부동산_전체자료_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert('모든 자료가 CSV 파일로 다운로드되었습니다.');
}

/**
 * 선택된 항목들 삭제
 */
async function deleteSelectedItems() {
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('삭제할 항목을 선택해주세요.');
        return;
    }

    // 확인 대화상자 표시
    if (!confirm('선택한 결과를 삭제하시겠습니까?')) {
        return;
    }

    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
    await calculator.deleteSelectedHistory(selectedIds);
    renderHistoryTable();
    alert(`${selectedIds.length}개 항목이 삭제되었습니다.`);
}

/**
 * 선택된 항목 불러오기 (입력값)
 */
function loadSelectedItem() {
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('불러올 항목을 선택해주세요.');
        return;
    }

    const selectedId = parseInt(checkboxes[0].dataset.id);
    if (calculator.loadHistoryItem(selectedId)) {
        alert('선택한 항목의 입력값을 불러왔습니다.');
    } else {
        alert('입력값 정보를 찾을 수 없습니다.');
    }
}

/**
 * 선택된 항목의 결과 불러오기 (모달 표시)
 */
function loadSelectedResult() {
    const checkboxes = document.querySelectorAll('.history-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('결과를 불러올 항목을 선택해주세요.');
        return;
    }

    const selectedId = parseInt(checkboxes[0].dataset.id);
    if (calculator.loadHistoryResult(selectedId)) {
        // 모달이 표시됨
    } else {
        alert('결과 정보를 찾을 수 없습니다.');
    }
}

// ================== 폰트 관리 ==================
let selectedFont = null;
let selectedFontName = '시스템 기본 폰트';

/**
 * 폰트 모달 열기
 */
function openFontModal() {
    const modal = document.getElementById('fontModal');
    modal.style.display = 'block';
    
    // 현재 폰트 정보 업데이트
    updateFontInfo();
}

/**
 * 폰트 모달 닫기
 */
function closeFontModal() {
    const modal = document.getElementById('fontModal');
    modal.style.display = 'none';
}

/**
 * 폰트 파일 선택 처리
 */
function handleFontFileSelect(file) {
    if (!file) return;
    
    // 파일 확장자 확인
    const allowedExtensions = ['.ttf', '.otf'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(fileExtension)) {
        alert('TTF 또는 OTF 파일만 선택할 수 있습니다.');
        return;
    }

    // 파일 크기 확인 (10MB 제한)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        alert('파일 크기는 10MB를 초과할 수 없습니다.');
        return;
    }
    
    // 폰트 로드
    loadFontFile(file);
}

/**
 * 폰트 파일 로드
 */
function loadFontFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const fontData = e.target.result;
        const fontName = file.name.replace(/\.(ttf|otf)$/i, '');
        
        // 폰트 등록
        const fontFace = new FontFace(fontName, fontData);
        
        fontFace.load().then(function(loadedFont) {
            document.fonts.add(loadedFont);
            
            // 선택된 폰트 정보 저장
            selectedFont = fontName;
            selectedFontName = fontName;
            
            // 미리보기 업데이트
            updateFontPreview();
            updateFontInfo(file);
            
            console.log('폰트가 성공적으로 로드되었습니다:', fontName);
        }).catch(function(error) {
            console.error('폰트 로드 실패:', error);
            alert('폰트 로드에 실패했습니다. 파일이 손상되었을 수 있습니다.');
        });
    };
    
    reader.onerror = function() {
        alert('파일 읽기에 실패했습니다.');
    };
    
    reader.readAsArrayBuffer(file);
}

/**
 * 폰트 미리보기 업데이트
 */
function updateFontPreview() {
    const previewElement = document.getElementById('fontPreview');
    if (selectedFont) {
        previewElement.style.fontFamily = `"${selectedFont}", sans-serif`;
    } else {
        previewElement.style.fontFamily = 'inherit';
    }
}

/**
 * 폰트 정보 업데이트
 */
function updateFontInfo(file = null) {
    document.getElementById('currentFontName').textContent = selectedFontName;
    
    if (file) {
        const fileSizeKB = (file.size / 1024).toFixed(1);
        document.getElementById('fontFileSize').textContent = `${fileSizeKB} KB`;
    } else {
        document.getElementById('fontFileSize').textContent = '-';
    }
}

/**
 * 폰트 리셋
 */
function resetFont() {
    selectedFont = null;
    selectedFontName = '시스템 기본 폰트';
    updateFontPreview();
    updateFontInfo();
}

/**
 * 폰트 적용
 */
function applyFont() {
    if (selectedFont) {
        // 결과 모달의 모든 텍스트에 폰트 적용
        const modal = document.getElementById('resultModal');
        modal.style.fontFamily = `"${selectedFont}", sans-serif`;
        
        alert(`폰트가 적용되었습니다: ${selectedFontName}`);
        closeFontModal();
    } else {
        alert('적용할 폰트를 먼저 선택해주세요.');
    }
}

/**
 * PDF 생성 및 다운로드 (html2pdf.js 사용, 한글 완벽 지원)
 */
async function generatePDF() {
    const modal = document.getElementById('resultModal');
    
    // 모달이 열려있지 않으면 경고
    if (modal.style.display === 'none' || modal.style.display === '') {
        alert('먼저 결과창을 열어주세요.');
        return;
    }
    
    // 로딩 표시
    const originalText = document.getElementById('savePdf').textContent;
    document.getElementById('savePdf').textContent = 'PDF 생성 중...';
    document.getElementById('savePdf').disabled = true;
    
    try {
        // PDF용 HTML 요소 생성
        const pdfContent = createPDFContent();
        
        // 이미지 로딩 대기
        const images = pdfContent.querySelectorAll('img');
        if (images.length > 0) {
            await Promise.all(Array.from(images).map(img => {
                return new Promise((resolve) => {
                    if (img.complete) {
                        resolve();
                    } else {
                        img.onload = resolve;
                        img.onerror = resolve; // 오류가 있어도 계속 진행
                    }
                });
            }));
        }
        
        // html2pdf 옵션 설정 (고품질)
        const opt = {
            margin: [7.5, 7.5, 7.5, 7.5],
            filename: `${document.getElementById('resultPropertyName').textContent || '부동산평가'}_평가결과_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { 
                scale: 2,
                useCORS: true,
                letterRendering: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: 794, // A4 width in pixels at 96 DPI
                height: 1123, // A4 height in pixels at 96 DPI
                imageTimeout: 15000, // 이미지 로딩 대기 시간 증가
                removeContainer: true,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'portrait',
                compress: true,
                precision: 2,
                putOnlyUsedFonts: true,
                floatPrecision: 16
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        // PDF 생성 및 다운로드 (상단 정렬)
        await html2pdf().set(opt).from(pdfContent).save();
        
        alert('PDF 파일이 성공적으로 생성되었습니다.');
        
    } catch (error) {
        console.error('PDF 생성 오류:', error);
        alert('PDF 생성 중 오류가 발생했습니다: ' + error.message);
    } finally {
        // 버튼 상태 복원
        document.getElementById('savePdf').textContent = originalText;
        document.getElementById('savePdf').disabled = false;
    }
}

/**
 * PDF용 HTML 콘텐츠 생성 (프로페셔널 디자인)
 */
function createPDFContent() {
    // PDF용 컨테이너 생성
    const pdfContainer = document.createElement('div');
    pdfContainer.style.cssText = `
        width: 210mm;
        height: auto;
        min-height: auto;
        padding: 7.5mm;
        font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
        font-size: 11px;
        line-height: 1.5;
        color: #333;
        background: white;
        box-sizing: border-box;
        display: block;
    `;
    
    // 헤더 섹션
    const header = createHeader();
    pdfContainer.appendChild(header);
    
    // 제목
    const title = document.createElement('h1');
    title.textContent = '상업용(Retail/Office) 부동산 가치 평가 결과';
    title.style.cssText = `
        font-size: 24px;
        font-weight: bold;
        margin: 20px 0 30px 0;
        color: #2d4a2b;
        text-align: left;
    `;
    pdfContainer.appendChild(title);
    
    // 기본 정보 섹션 (테이블 형태)
    const basicInfo = createTableSection('기본 정보', [
        { label: '물건명', value: document.getElementById('resultPropertyName').textContent || '-' },
        { label: '주소', value: document.getElementById('resultPropertyAddress').textContent || '-' }
    ]);
    pdfContainer.appendChild(basicInfo);
    
    // 평가 요약 섹션 (테이블 형태)
    const facilities = document.querySelectorAll('input[name="facilities"]:checked');
    const facilityList = Array.from(facilities).map(f => f.value).join(', ');
    
    const evaluationSummary = createTableSection('평가 요약', [
        { label: '입지', value: document.getElementById('resultLocationDesc').textContent || '-' },
        { label: '임대안정성', value: document.getElementById('resultStabilityDesc').textContent || '-' },
        { label: '접근성', value: document.getElementById('resultAccessibilityDesc').textContent || '-' },
        { label: '시설', value: document.getElementById('resultFacilityDesc').textContent || '-' },
        { label: 'Market Value', value: document.getElementById('resultMarketValue').textContent || '-' },
        { label: '확인된 시설', value: facilityList || '없음' }
    ]);
    pdfContainer.appendChild(evaluationSummary);
    
    // 조사 정보 섹션 (테이블 형태)
    const investigationInfo = createTableSection('조사 정보', [
        { label: '조사 담당자', value: document.getElementById('investigatorName').value || '-' },
        { label: '조사일자', value: `${document.getElementById('investigationYear').value || '-'}년 ${document.getElementById('investigationMonth').value || '-'}월 ${document.getElementById('investigationDay').value || '-'}일` },
        { label: '확인자', value: document.getElementById('confirmerName').value || '-' }
    ]);
    pdfContainer.appendChild(investigationInfo);
    
    
    // 검토 의견 섹션
    const opinionText = document.getElementById('opinionText').value;
    if (opinionText && opinionText.trim()) {
        const reviewComments = createTableSection('검토 의견', [
            { label: '의견', value: opinionText }
        ]);
        pdfContainer.appendChild(reviewComments);
    }
    
    return pdfContainer;
}

/**
 * 헤더 생성 (출력일자, 출력자, 로고)
 */
function createHeader() {
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
    `;
    
    // 왼쪽: 출력 정보
    const outputInfo = document.createElement('div');
    outputInfo.style.cssText = `
        font-size: 10px;
        color: #666;
        line-height: 1.4;
    `;
    
    const currentDate = new Date().toLocaleDateString('ko-KR');
    const investigatorName = document.getElementById('investigatorName').value || '담당자';
    
    outputInfo.innerHTML = `
        <div>출력일자: ${currentDate}</div>
        <div>출력자: ${investigatorName}</div>
    `;
    
    // 오른쪽: CNS 로고 (이미지 사용)
    const logo = document.createElement('div');
    logo.style.cssText = `
        text-align: right;
        display: flex;
        align-items: center;
        justify-content: flex-end;
    `;
    
    const logoImg = document.createElement('img');
    logoImg.src = 'CNS_LOGO_prop.jpg';
    logoImg.alt = 'CNS Corporation';
    logoImg.style.cssText = `
        height: 40px;
        width: auto;
        max-width: 120px;
        object-fit: contain;
    `;
    
    logo.appendChild(logoImg);
    
    header.appendChild(outputInfo);
    header.appendChild(logo);
    
    return header;
}

/**
 * 테이블 형태 섹션 생성 함수 (프로페셔널 디자인)
 */
function createTableSection(title, items) {
    const section = document.createElement('div');
    section.style.cssText = `
        margin-bottom: 25px;
    `;
    
    // 섹션 헤더 (파란색 배경)
    const sectionHeader = document.createElement('div');
    sectionHeader.textContent = title;
    sectionHeader.style.cssText = `
        background-color: #2d4a2b;
        color: white;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: bold;
        margin: 0;
    `;
    section.appendChild(sectionHeader);
    
    // 테이블 컨테이너
    const tableContainer = document.createElement('div');
    tableContainer.style.cssText = `
        border: 1px solid #ddd;
        border-top: none;
    `;
    
    // 테이블 생성
    const table = document.createElement('table');
    table.style.cssText = `
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
    `;
    
    // 각 항목을 테이블 행으로 추가
    items.forEach((item, index) => {
        const row = document.createElement('tr');
        
        // 라벨 셀
        const labelCell = document.createElement('td');
        labelCell.textContent = item.label;
        labelCell.style.cssText = `
            padding: 10px 12px;
            background-color: #f8f9fa;
            border-bottom: 1px solid #ddd;
            border-right: 1px solid #ddd;
            font-weight: bold;
            width: 30%;
            vertical-align: top;
        `;
        
        // 값 셀
        const valueCell = document.createElement('td');
        // 줄바꿈을 HTML로 변환하여 처리
        const formattedValue = item.value.replace(/\n/g, '<br>');
        valueCell.innerHTML = formattedValue;
        valueCell.style.cssText = `
            padding: 10px 12px;
            border-bottom: 1px solid #ddd;
            word-wrap: break-word;
            vertical-align: top;
            white-space: pre-wrap;
        `;
        
        row.appendChild(labelCell);
        row.appendChild(valueCell);
        table.appendChild(row);
    });
    
    tableContainer.appendChild(table);
    section.appendChild(tableContainer);
    
    return section;
}

// ================== 이벤트 리스너 등록 ==================
document.addEventListener('DOMContentLoaded', function() {
    // 계산기 인스턴스 생성
    calculator = new PropertyCalculator();
    
    // 히스토리 테이블 초기 렌더링
    renderHistoryTable();
    
    // 숫자 입력 필드에 포맷팅 적용
    const numberInputs = [
        'monthlyRent', 'deposit', 'adRevenue', 'parkingRevenue', 
        'otherRevenue', 'managementFee'
    ];
    
    numberInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            formatNumberInput(input);
        }
    });

    // 폼 제출 이벤트
    document.getElementById('propertyForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = calculator.collectFormData();
        
        if (!formData.propertyName) {
            alert('물건명을 입력해주세요.');
            return;
        }

        const result = calculator.calculateValue(formData);
        await calculator.addToHistory(result);
        renderHistoryTable();
        showResultModal(result);
    });


    // 버튼 이벤트들
    document.getElementById('exportAllData').addEventListener('click', exportAllData);
    document.getElementById('deleteSelected').addEventListener('click', deleteSelectedItems);
    document.getElementById('loadSelected').addEventListener('click', loadSelectedItem);
    document.getElementById('loadResult').addEventListener('click', loadSelectedResult);
    
    // Firebase 재연결 버튼들
    document.getElementById('retryFirebaseBtn2').addEventListener('click', async function() {
        await calculator.retryFirebaseConnection();
    });

    // PDF 저장 버튼
    document.getElementById('savePdf').addEventListener('click', function() {
        generatePDF();
    });

    // 폰트 선택 버튼
    document.getElementById('selectFont').addEventListener('click', function() {
        openFontModal();
    });

    // 상세 정보 저장 버튼
    document.getElementById('saveDetailedInfo').addEventListener('click', async function() {
        const modal = document.getElementById('resultModal');
        const currentId = modal.dataset.currentId;
        
        if (!currentId) {
            alert('저장할 데이터를 찾을 수 없습니다.');
            return;
        }
        
        // 변경 감지
        if (calculator.hasDetailedInfoChanged()) {
            // 변경된 경우 확인 메시지 표시
            if (confirm('저장하시겠습니까?')) {
                const success = await calculator.saveDetailedInfo(parseInt(currentId));
                if (success) {
                    alert('상세 정보가 저장되었습니다.');
                } else {
                    alert('상세 정보 저장에 실패했습니다.');
                }
            }
        } else {
            // 변경되지 않은 경우에도 저장
            const success = await calculator.saveDetailedInfo(parseInt(currentId));
            if (success) {
                alert('상세 정보가 저장되었습니다.');
            } else {
                alert('상세 정보 저장에 실패했습니다.');
            }
        }
    });

    // 폰트 모달 이벤트 리스너들
    document.getElementById('closeFontModal').addEventListener('click', closeFontModal);
    document.getElementById('closeFontModalBtn').addEventListener('click', closeFontModal);
    document.getElementById('resetFont').addEventListener('click', resetFont);
    document.getElementById('applyFont').addEventListener('click', applyFont);
    
    // 폰트 파일 입력 이벤트
    document.getElementById('fontFileInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleFontFileSelect(file);
        }
    });
    
    // 드래그 앤 드롭 이벤트
    const uploadArea = document.querySelector('.upload-area');
    
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFontFileSelect(files[0]);
        }
    });
    
    // 모달 외부 클릭 시 닫기
    document.getElementById('fontModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeFontModal();
        }
    });
});