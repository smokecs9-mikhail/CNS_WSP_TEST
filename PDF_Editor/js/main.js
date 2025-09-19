/**
 * PDF 편집기 메인 애플리케이션 - 새로운 UI 버전
 * 작업 공간 기반의 문서 관리 및 편집 기능을 제공합니다.
 */

class PDFEditorApp {
    constructor() {
        // 문서 관리 상태
        this.documents = new Map(); // documentId -> documentData
        this.selectedDocuments = new Set();
        this.selectedPages = new Map(); // documentId -> Set of pageNumbers
        this.documentOrder = []; // 문서 순서
        
        // UI 요소들
        this.initializeElements();
        
        // 이벤트 리스너 설정
        this.setupEventListeners();
        
        // PDF.js 설정
        this.setupPDFJS();
        
        // 컨텍스트 메뉴 관리
        this.contextMenu = null;
        this.contextMenuTarget = null;
        
        console.log('PDF 편집기가 초기화되었습니다.');
    }

    // 안전하게 PDF-lib 문서를 로드하는 헬퍼 (detached ArrayBuffer 대비)
    async loadPdfLibFromDoc(doc) {
        const pdfLib = window.PDFLib;
        // 1차: originalData가 유효하면 그대로 로드 시도
        if (doc && doc.originalData) {
            try {
                const bytes = new Uint8Array(doc.originalData);
                return await pdfLib.PDFDocument.load(bytes);
            } catch (e) {
                // detached 등 실패 시 아래 폴백
            }
        }
        // 2차: pdf.js → pdf-lib 바이트 변환 폴백
        const converted = await window.pdfEditor.convertPdfJsToPdfLib(doc.pdf, null);
        return await pdfLib.PDFDocument.load(converted);
    }

    // UI 페이지 번호 → 실제 PDF 내 인덱스 매핑을 생성 (삭제된 페이지 고려)
    buildVisibleToUnderlyingIndexMap(documentId) {
        const doc = this.documents.get(documentId);
        if (!doc) return [];
        const pdf = doc.pdf;
        const total = pdf ? (pdf.numPages || 0) : 0;
        const arr = Array.from({ length: total }, (_, i) => i + 1); // 1-based underlying indices
        const del = doc.deletedPages ? Array.from(doc.deletedPages) : [];
        del.sort((a, b) => a - b);
        // 순차적으로 현재 보이는 인덱스 기준으로 제거
        for (const d of del) {
            if (d >= 1 && d <= arr.length) {
                arr.splice(d - 1, 1);
            }
        }
        return arr; // 길이 = 현재 보이는 페이지 수, 값 = 실제 underlying 1-based 인덱스
    }

    // UI 1-based 페이지 번호 → 실제 0-based 인덱스 (삭제된 페이지 보정)
    uiPageToUnderlyingZero(documentId, uiPageNumber) {
        const map = this.buildVisibleToUnderlyingIndexMap(documentId);
        if (!map || uiPageNumber < 1 || uiPageNumber > map.length) return null;
        return (map[uiPageNumber - 1] - 1);
    }

    // 대상 문서에 UI 위치 기준으로 삽입할 실제 0-based 인덱스 계산 (targetPosition: 1-based 위치, null이면 끝)
    computeInsertIndexZero(documentId, targetPosition) {
        const doc = this.documents.get(documentId);
        if (!doc || !doc.pdf) return 0;
        const count = doc.pdf.numPages || 0;
        if (targetPosition == null) return count; // 끝에 추가
        const map = this.buildVisibleToUnderlyingIndexMap(documentId);
        if (!map || map.length === 0) return 0;
        if (targetPosition <= 0) return 0;
        if (targetPosition > map.length) return count; // 보이는 마지막 뒤
        // 보이는 targetPosition은 실제 map[targetPosition-1] 앞
        return map[targetPosition - 1] - 1;
    }


    /**
     * DOM 요소들을 초기화합니다.
     */
    initializeElements() {
        // 메인 드롭 존
        this.mainDropZone = document.getElementById('mainDropZone');
        this.fileInput = document.getElementById('fileInput');
        this.documentsContainer = document.getElementById('documentsContainer');
        
        // 툴바 버튼들
        this.fileAddBtn = document.getElementById('fileAddBtn');
        this.saveBtn = document.getElementById('saveBtn');
        this.deleteBtn = document.getElementById('deleteBtn');
        this.moveUpBtn = document.getElementById('moveUpBtn');
        this.moveDownBtn = document.getElementById('moveDownBtn');
        this.mergeAllBtn = document.getElementById('mergeAllBtn');
        this.previewBtn = document.getElementById('previewBtn');
        this.rotateLeftBtn = document.getElementById('rotateLeftBtn');
        this.rotateRightBtn = document.getElementById('rotateRightBtn');
        
        // 컨텍스트 메뉴
        this.contextMenu = document.getElementById('contextMenu');
        this.pageContextMenu = document.getElementById('pageContextMenu');
        
        // 오버레이 및 알림
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.notification = document.getElementById('notification');
        this.notificationMessage = document.getElementById('notificationMessage');
        // 확인 모달 요소
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmYes = document.getElementById('confirmYes');
        this.confirmNo = document.getElementById('confirmNo');

        // 페이지 보기 모달 요소
        this.pvModal = document.getElementById('pageViewerModal');
        this.pvCloseBtn = document.getElementById('pvCloseBtn');
        this.pvPageIndex = document.getElementById('pvPageIndex');
        this.pvTotalPages = document.getElementById('pvTotalPages');
        this.pvZoomInput = document.getElementById('pvZoomInput');
        this.pvZoomIn = document.getElementById('pvZoomIn');
        this.pvZoomOut = document.getElementById('pvZoomOut');
        this.pvFitWidth = document.getElementById('pvFitWidth');
        this.pvFitHeight = document.getElementById('pvFitHeight');
        this.pvRotateLeft = document.getElementById('pvRotateLeft');
        this.pvRotateRight = document.getElementById('pvRotateRight');
        this.pvSaveAsIs = document.getElementById('pvSaveAsIs');
        this.pvSavePage = document.getElementById('pvSavePage');
        this.pvCanvasWrap = document.getElementById('pvCanvasWrap');
        this.pvCanvas = document.getElementById('pvCanvas');
        this.pvCtx = this.pvCanvas ? this.pvCanvas.getContext('2d') : null;
        this.pvPrevBtn = document.getElementById('pvPrevBtn');
        this.pvNextBtn = document.getElementById('pvNextBtn');

        // 페이지 보기 상태
        this.pvState = {
            documentId: null,
            pageNumber: 1,
            zoom: 1.0,
            rotation: 0, // 0/90/180/270
            fit: 'none' // 'none' | 'width' | 'height'
        };
        
        // 선택 순서 추적용 맵 (문서ID -> 선택된 페이지 번호 배열)
        this.selectionSequences = new Map();
        
        // 필수 요소들이 없으면 오류 발생
        if (!this.mainDropZone || !this.fileInput || !this.documentsContainer) {
            throw new Error('필수 DOM 요소를 찾을 수 없습니다. 페이지가 완전히 로드되었는지 확인해주세요.');
        }
        
        console.log('DOM 요소들이 성공적으로 초기화되었습니다.');
    }

    /**
     * 이벤트 리스너들을 설정합니다.
     */
    setupEventListeners() {
        // 파일 업로드
        if (this.mainDropZone) {
            this.mainDropZone.addEventListener('click', () => this.fileInput.click());
            this.mainDropZone.addEventListener('dragenter', (e) => this.handleDragEnter(e), true);
            this.mainDropZone.addEventListener('dragover', (e) => this.handleDragOver(e), true);
            this.mainDropZone.addEventListener('drop', (e) => this.handleFileDrop(e), true);
            this.mainDropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e), true);
        }
        
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        
        // 툴바 버튼들
        if (this.fileAddBtn) {
            this.fileAddBtn.addEventListener('click', () => this.fileInput.click());
        }
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.saveSelectedDocuments());
        }
        if (this.deleteBtn) {
            this.deleteBtn.addEventListener('click', () => this.deleteSelectedPages());
        }
        if (this.moveUpBtn) {
            this.moveUpBtn.addEventListener('click', () => this.moveDocumentsUp());
        }
        if (this.moveDownBtn) {
            this.moveDownBtn.addEventListener('click', () => this.moveDocumentsDown());
        }
        if (this.mergeAllBtn) {
            this.mergeAllBtn.addEventListener('click', () => this.mergeAllDocuments());
        }
        if (this.previewBtn) {
            this.previewBtn.addEventListener('click', () => this.previewSelectedDocument());
        }
        if (this.rotateLeftBtn) {
            this.rotateLeftBtn.addEventListener('click', () => this.rotatePagesLeft());
        }
        if (this.rotateRightBtn) {
            this.rotateRightBtn.addEventListener('click', () => this.rotatePagesRight());
        }
        
        // 컨텍스트 메뉴
        this.setupContextMenu();
        
        // 전역 클릭 이벤트 (컨텍스트 메뉴 숨기기)
        document.addEventListener('click', () => this.hideContextMenu());
        
        // 페이지 보기 모달 이벤트
        if (this.pvCloseBtn) this.pvCloseBtn.addEventListener('click', () => this.closePageViewer());
        if (this.pvZoomIn) this.pvZoomIn.addEventListener('click', () => this.changePvZoom(0.1));
        if (this.pvZoomOut) this.pvZoomOut.addEventListener('click', () => this.changePvZoom(-0.1));
        if (this.pvZoomInput) this.pvZoomInput.addEventListener('change', () => this.applyPvZoomInput());
        if (this.pvPageIndex) this.pvPageIndex.addEventListener('change', () => this.applyPvPageInput());
        if (this.pvFitWidth) this.pvFitWidth.addEventListener('click', () => this.fitPv('width'));
        if (this.pvFitHeight) this.pvFitHeight.addEventListener('click', () => this.fitPv('height'));
        if (this.pvRotateLeft) this.pvRotateLeft.addEventListener('click', () => this.rotatePv(-90));
        if (this.pvRotateRight) this.pvRotateRight.addEventListener('click', () => this.rotatePv(90));
        if (this.pvSaveAsIs) this.pvSaveAsIs.addEventListener('click', () => this.savePvAsIs());
        if (this.pvPrevBtn) this.pvPrevBtn.addEventListener('click', () => this.changePvPage(-1));
        if (this.pvNextBtn) this.pvNextBtn.addEventListener('click', () => this.changePvPage(1));

        // 키보드 네비게이션
        window.addEventListener('keydown', (e) => {
            if (!this.pvModal || this.pvModal.classList.contains('hidden')) return;
            if (e.key === 'ArrowLeft') { this.changePvPage(-1); e.preventDefault(); }
            if (e.key === 'ArrowRight') { this.changePvPage(1); e.preventDefault(); }
            if (e.key === 'Escape') { this.closePageViewer(); e.preventDefault(); }
        });
        
        // 전역 드래그 이벤트 차단 (브라우저 기본 동작 방지)
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        }, false);
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
        }, false);
        
        // body 요소에도 이벤트 리스너 추가
        document.body.addEventListener('dragover', (e) => {
            e.preventDefault();
        }, false);
        
        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
        }, false);
        

        // 확인 모달 버튼
        if (this.confirmYes) this.confirmYes.addEventListener('click', () => this.handleConfirm(true));
        if (this.confirmNo) this.confirmNo.addEventListener('click', () => this.handleConfirm(false));
        
        // 전역 클릭 시 페이지 컨텍스트 메뉴 닫기
        document.addEventListener('click', () => {
            if (this.pageContextMenu) this.pageContextMenu.classList.add('hidden');
        });
        
        console.log('이벤트 리스너들이 성공적으로 설정되었습니다.');
    }

    /**
     * 컨텍스트 메뉴를 설정합니다.
     */
    setupContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.target.dataset.action;
                if (action) {
                    this.handleContextMenuAction(action);
                }
            });
        }
    }

    /**
     * PDF.js를 설정합니다.
     */
    setupPDFJS() {
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    /**
     * 드래그 엔터 이벤트를 처리합니다.
     */
    handleDragEnter(e) {
        console.log('드래그 엔터 이벤트 발생');
        e.preventDefault();
        this.mainDropZone.classList.add('dragover');
    }

    /**
     * 드래그 오버 이벤트를 처리합니다.
     */
    handleDragOver(e) {
        console.log('드래그 오버 이벤트 발생');
        e.preventDefault();
        this.mainDropZone.classList.add('dragover');
    }

    /**
     * 드래그 리브 이벤트를 처리합니다.
     */
    handleDragLeave(e) {
        console.log('드래그 리브 이벤트 발생');
        e.preventDefault();
        this.mainDropZone.classList.remove('dragover');
    }

    /**
     * 파일 드롭 이벤트를 처리합니다.
     */
    handleFileDrop(e) {
        console.log('파일 드롭 이벤트 발생:', e.dataTransfer.files);
        e.preventDefault();
        e.stopPropagation();
        this.mainDropZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
        console.log('필터링된 PDF 파일들:', files);
        
        if (files.length > 0) {
            this.loadDocuments(files);
        } else {
            this.showNotification('PDF 파일만 업로드할 수 있습니다.', 'error');
        }
    }

    /**
     * 파일 선택 이벤트를 처리합니다.
     */
    handleFileSelect(e) {
        const files = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
        if (files.length > 0) {
            this.loadDocuments(files);
        } else {
            this.showNotification('PDF 파일만 업로드할 수 있습니다.', 'error');
        }
    }

    /**
     * 문서들을 로드합니다.
     */
    async loadDocuments(files) {
        try {
            this.showLoading(true);
            
            for (const file of files) {
                await this.loadDocument(file);
            }
            
            this.showNotification(`${files.length}개의 PDF 파일이 로드되었습니다.`, 'success');
        } catch (error) {
            console.error('문서 로드 오류:', error);
            this.showNotification('문서 로드 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 단일 문서를 로드합니다.
     */
    async loadDocument(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true
            }).promise;
            
            const documentId = this.generateDocumentId();
            const documentData = {
                id: documentId,
                name: file.name,
                file: file,
                pdf: pdf,
                pages: pdf.numPages,
                originalData: arrayBuffer,
                thumbnails: [],
                selectedPages: new Set(),
                rotations: {}, // 페이지별 회전 상태(deg)
                deletedPages: new Set(), // 삭제된 페이지 번호들
                dirty: false // 문서 변경 여부
            };
            
            this.documents.set(documentId, documentData);
            this.documentOrder.push(documentId);
            this.selectedPages.set(documentId, new Set());
            
            // 썸네일 생성
            await this.generateThumbnails(documentId);
            
            // UI 업데이트
            this.renderDocument(documentId);
            this.updateUI();
            
        } catch (error) {
            console.error('문서 로드 오류:', error);
            throw error;
        }
    }

    /**
     * 문서의 썸네일을 생성합니다.
     */
    async generateThumbnails(documentId) {
        const doc = this.documents.get(documentId);
        if (!doc) return;
        
        const thumbnails = [];
        
        for (let i = 1; i <= doc.pages; i++) {
            try {
                const page = await doc.pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.2 });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;
                
                // 썸네일 컨테이너(페이지 번호 배지 포함)
                const wrapper = document.createElement('div');
                wrapper.className = 'page-thumbnail relative inline-block';
                wrapper.dataset.pageNumber = i;
                wrapper.dataset.documentId = documentId;

                const img = document.createElement('img');
                img.src = canvas.toDataURL('image/png');
                img.className = 'block rounded-sm';

                const badge = document.createElement('span');
                badge.className = 'absolute bottom-2 right-2 text-[20px] leading-none bg-black/60 text-white px-3 py-1 rounded';
                badge.textContent = String(i);

                // 선택 순서 배지 (좌상단)
                const selBadge = document.createElement('span');
                selBadge.className = 'absolute top-2 left-2 text-[14px] leading-none bg-emerald-600/80 text-white px-2 py-1 rounded';
                selBadge.dataset.role = 'selection-order-badge';
                selBadge.style.display = 'none';

                wrapper.appendChild(img);
                wrapper.appendChild(badge);
                wrapper.appendChild(selBadge);
                
                // 썸네일 클릭 이벤트
                wrapper.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectPage(documentId, i);
                });
                
                // 썸네일 더블클릭: 페이지 보기 모달 열기
                wrapper.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    this.openPageViewer(documentId, i);
                });
                
                // 드래그 앤 드롭 이벤트
                wrapper.draggable = true;
                wrapper.addEventListener('dragstart', (e) => this.handleDragStart(e, documentId, i));
                wrapper.addEventListener('dragend', (e) => this.handleDragEnd(e));
                wrapper.addEventListener('dragover', (e) => this.handleDragOver(e));
                wrapper.addEventListener('drop', (e) => this.handlePageDrop(e, documentId, i));

                // 썸네일 우클릭 이벤트 (페이지 컨텍스트 메뉴)
                wrapper.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showPageContextMenu(e, documentId, i);
                });
                
                thumbnails.push(wrapper);
            } catch (error) {
                console.error(`페이지 ${i} 썸네일 생성 오류:`, error);
            }
        }
        
        doc.thumbnails = thumbnails;
    }

    /**
     * 페이지 보기 모달 열기
     */
    async openPageViewer(documentId, pageNumber) {
        try {
            if (!this.pvModal) return;
            this.pvState.documentId = documentId;
            this.pvState.pageNumber = pageNumber;
            this.pvState.zoom = 1.0;
            this.pvState.rotation = 0;
            this.pvState.fit = 'none';

            const doc = this.documents.get(documentId);
            if (this.pvTotalPages) this.pvTotalPages.textContent = String(doc.pages);
            if (this.pvPageIndex) this.pvPageIndex.value = String(pageNumber);
            if (this.pvZoomInput) this.pvZoomInput.value = '100%';

            this.pvModal.classList.remove('hidden');
            // 패닝 활성화 (한 번만 바인딩되도록 조건)
            if (!this._pvPanningEnabled) {
                this.enablePvPanning();
                this._pvPanningEnabled = true;
            }
            await this.renderPv();
        } catch (error) {
            console.error('페이지 보기 열기 오류:', error);
        }
    }

    closePageViewer() {
        if (!this.pvModal) return;
        this.pvModal.classList.add('hidden');
    }

    async renderPv() {
        const { documentId, pageNumber, zoom, rotation, fit } = this.pvState;
        const doc = this.documents.get(documentId);
        if (!doc || !this.pvCanvas || !this.pvCtx) return;

        const page = await doc.pdf.getPage(pageNumber);
        const appliedRotation = ((doc.rotations[pageNumber] || 0) + (this.pvState.rotation || 0)) % 360;
        const baseViewport = page.getViewport({ scale: 1.0, rotation: 0 });

        let scale = zoom;
        if (fit !== 'none') {
            const wrap = this.pvCanvasWrap.getBoundingClientRect();
            const width = baseViewport.width;
            const height = baseViewport.height;
            const rotated = rotation % 180 !== 0;
            const pageW = rotated ? height : width;
            const pageH = rotated ? width : height;
            if (fit === 'width') scale = Math.max(0.1, (wrap.width - 40) / pageW);
            if (fit === 'height') scale = Math.max(0.1, (wrap.height - 40) / pageH);
            // 계산된 확대율을 상태와 입력창에 반영
            this.pvState.zoom = scale;
            if (this.pvZoomInput) this.pvZoomInput.value = Math.round(scale * 100) + '%';
        }

        const viewport = page.getViewport({ scale, rotation: appliedRotation });
        this.pvCanvas.width = Math.ceil(viewport.width);
        this.pvCanvas.height = Math.ceil(viewport.height);
        const renderContext = { canvasContext: this.pvCtx, viewport };
        this.pvCtx.clearRect(0, 0, this.pvCanvas.width, this.pvCanvas.height);
        await page.render(renderContext).promise;
    }

    // 패닝: 마우스로 드래그하여 이동
    enablePvPanning() {
        if (!this.pvCanvasWrap) return;
        let isDown = false;
        let startX = 0, startY = 0;
        let scrollLeft = 0, scrollTop = 0;
        this.pvCanvasWrap.addEventListener('mousedown', (e) => {
            isDown = true;
            this.pvCanvasWrap.classList.add('cursor-grabbing');
            startX = e.pageX - this.pvCanvasWrap.offsetLeft;
            startY = e.pageY - this.pvCanvasWrap.offsetTop;
            scrollLeft = this.pvCanvasWrap.scrollLeft;
            scrollTop = this.pvCanvasWrap.scrollTop;
        });
        this.pvCanvasWrap.addEventListener('mouseleave', () => { isDown = false; this.pvCanvasWrap.classList.remove('cursor-grabbing'); });
        this.pvCanvasWrap.addEventListener('mouseup', () => { isDown = false; this.pvCanvasWrap.classList.remove('cursor-grabbing'); });
        this.pvCanvasWrap.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - this.pvCanvasWrap.offsetLeft;
            const y = e.pageY - this.pvCanvasWrap.offsetTop;
            const walkX = (x - startX);
            const walkY = (y - startY);
            this.pvCanvasWrap.scrollLeft = scrollLeft - walkX;
            this.pvCanvasWrap.scrollTop = scrollTop - walkY;
        });
    }

    changePvZoom(delta) {
        this.pvState.fit = 'none';
        this.pvState.zoom = Math.min(5, Math.max(0.1, this.pvState.zoom + delta));
        if (this.pvZoomInput) this.pvZoomInput.value = Math.round(this.pvState.zoom * 100) + '%';
        this.renderPv();
    }

    changePvPage(delta) {
        const { documentId } = this.pvState;
        const doc = this.documents.get(documentId);
        if (!doc) return;
        let next = this.pvState.pageNumber + delta;
        if (next < 1) next = 1;
        if (next > doc.pages) next = doc.pages;
        if (next === this.pvState.pageNumber) return;
        this.pvState.pageNumber = next;
        if (this.pvPageIndex) this.pvPageIndex.value = String(next);
        this.renderPv();
    }

    applyPvZoomInput() {
        const val = String(this.pvZoomInput.value).replace('%', '').trim();
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
            this.pvState.fit = 'none';
            this.pvState.zoom = Math.min(500, Math.max(10, num)) / 100;
            this.pvZoomInput.value = Math.round(this.pvState.zoom * 100) + '%';
            this.renderPv();
        }
    }

    applyPvPageInput() {
        const inputValue = Number(this.pvPageIndex.value);
        const doc = this.documents.get(this.pvState.documentId);
        if (!doc) return;
        
        // 입력값이 유효한 범위인지 확인
        if (isNaN(inputValue) || inputValue < 1 || inputValue > doc.pages) {
            // 유효하지 않은 경우 현재 페이지로 복원
            this.pvPageIndex.value = String(this.pvState.pageNumber);
            return;
        }
        
        // 페이지 변경
        this.pvState.pageNumber = inputValue;
        this.renderPv();
    }

    fitPv(mode) {
        this.pvState.fit = mode;
        this.renderPv();
    }

    rotatePv(deltaDeg) {
        this.pvState.rotation = (this.pvState.rotation + deltaDeg + 360) % 360;
        this.renderPv();
    }

    async savePvPage() {
        try {
            const { documentId, pageNumber } = this.pvState;
            const doc = this.documents.get(documentId);
            if (!doc) return;
            const bytes = await window.pdfEditor.extractPages(doc.pdf, [pageNumber], doc.originalData);
            const base = doc.name.replace(/\.pdf$/i, '');
            await window.pdfEditor.downloadModifiedPdf(bytes, `${base}_page${pageNumber}.pdf`);
            this.showNotification('현재 페이지가 저장되었습니다.', 'success');
        } catch (e) {
            console.error('현재 페이지 저장 오류:', e);
            this.showNotification('현재 페이지 저장 중 오류가 발생했습니다.', 'error');
        }
    }

    // 회전 상태를 적용하여 저장 (현재 페이지만)
    async savePvAsIs() {
        try {
            const { documentId, pageNumber, rotation } = this.pvState;
            const doc = this.documents.get(documentId);
            if (!doc) return;

            // 회전 상태를 작업공간(썸네일/뷰어)에 적용 (저장하지 않고 상태 반영)
            const newRotation = ((doc.rotations[pageNumber] || 0) + rotation) % 360;
            doc.rotations[pageNumber] = newRotation;
            // 변경 플래그 설정 (문서 닫기 시 저장 확인용)
            doc.dirty = true;

            // 썸네일 재생성(해당 페이지만 업데이트)
            await this.updateSingleThumbnail(documentId, pageNumber);

            // 모달 내부도 초기화(추가 회전값 0으로 리셋) 후 재렌더링
            this.pvState.rotation = 0;
            if (this.pvPageIndex) this.pvPageIndex.value = String(pageNumber);
            await this.renderPv();

            this.showNotification('회전이 적용되었습니다.', 'success');
        } catch (e) {
            console.error('이대로 저장 오류:', e);
            this.showNotification('회전 적용 중 오류가 발생했습니다.', 'error');
        }
    }

    // 특정 페이지만 썸네일 갱신
    async updateSingleThumbnail(documentId, pageNumber) {
        const doc = this.documents.get(documentId);
        if (!doc) return;
        try {
            const page = await doc.pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 0.2, rotation: doc.rotations[pageNumber] || 0 });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;

            // 기존 썸네일 이미지 교체
            const thumbnail = doc.thumbnails[pageNumber - 1];
            if (thumbnail) {
                thumbnail.src = canvas.toDataURL('image/png');
            }
        } catch (err) {
            console.error('썸네일 갱신 오류:', err);
        }
    }

    /**
     * 문서의 순서번호를 가져옵니다.
     */
    getDocumentOrderNumber(documentId) {
        const index = this.documentOrder.indexOf(documentId);
        return index !== -1 ? Math.min(index + 1, 255) : 1;
    }

    /**
     * 모든 문서의 순서번호를 업데이트합니다.
     */
    updateAllDocumentOrderNumbers() {
        this.documentOrder.forEach((documentId, index) => {
            const documentElement = document.querySelector(`[data-document-id="${documentId}"]`);
            if (documentElement) {
                const orderBadge = documentElement.querySelector('.order-badge');
                if (orderBadge) {
                    const orderNumber = Math.min(index + 1, 255);
                    orderBadge.textContent = orderNumber;
                    orderBadge.title = `문서 순서: ${orderNumber}`;
                }
            }
        });
    }

    /**
     * 문서를 렌더링합니다.
     */
    renderDocument(documentId) {
        const doc = this.documents.get(documentId);
        if (!doc) return;
        
        // 기존 컨테이너 재사용하여 중복 생성 방지
        let documentContainer = this.documentsContainer.querySelector(`[data-document-id="${documentId}"]`);
        if (!documentContainer) {
            documentContainer = document.createElement('div');
            documentContainer.className = 'document-container';
            documentContainer.dataset.documentId = documentId;
        } else {
            documentContainer.innerHTML = '';
        }
        
        // 문서 헤더
        const header = document.createElement('div');
        header.className = 'document-header flex items-center justify-between';
        
        // 순서번호와 제목을 포함하는 왼쪽 영역
        const leftSection = document.createElement('div');
        leftSection.className = 'flex items-center';
        
        // 순서번호
        const orderNumber = this.getDocumentOrderNumber(documentId);
        const orderBadge = document.createElement('div');
        orderBadge.className = 'order-badge';
        orderBadge.textContent = orderNumber;
        orderBadge.title = `문서 순서: ${orderNumber}`;
        
        // 제목
        const title = document.createElement('div');
        title.className = 'ml-2';
        title.textContent = `${doc.name} (페이지: ${doc.pages})`;
        
        leftSection.appendChild(orderBadge);
        leftSection.appendChild(title);
        
        // 닫기 버튼
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ml-2 text-gray-500 hover:text-red-600';
        closeBtn.innerHTML = '✕';
        closeBtn.title = '닫기';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.requestCloseDocument(documentId);
        });
        
        header.appendChild(leftSection);
        header.appendChild(closeBtn);
        
        // 문서 컨텐츠
        const content = document.createElement('div');
        content.className = 'document-content';
        
        // 썸네일 컨테이너
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        // 갭 영역에서도 드래그 오버/드롭이 가능하도록 컨테이너에 직접 바인딩
        thumbnailContainer.addEventListener('dragenter', (e) => { e.preventDefault(); });
        thumbnailContainer.addEventListener('dragover', (e) => this.handleDragOver(e));
        thumbnailContainer.addEventListener('drop', (e) => this.handleContainerPageDrop(e, documentId));
        
        // 썸네일들 추가
        doc.thumbnails.forEach(thumbnail => {
            // 페이지 컨텍스트 메뉴 바인딩
            thumbnail.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const pageNumber = Number(thumbnail.dataset.pageNumber);
                this.showPageContextMenu(e, documentId, pageNumber);
            });
            thumbnailContainer.appendChild(thumbnail);
        });
        
        content.appendChild(thumbnailContainer);
        documentContainer.appendChild(header);
        documentContainer.appendChild(content);
        
        // 문서 컨테이너 클릭 이벤트
        documentContainer.addEventListener('click', (e) => {
            if (this.isDraggingPages || (this.suppressClickUntil && Date.now() < this.suppressClickUntil)) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            if (e.target === documentContainer || e.target === header || e.target === content || e.target === thumbnailContainer) {
                this.selectDocument(documentId);
            }
        });
        
        // 문서 컨테이너 드래그 이벤트 (다른 문서로 페이지 복사용)
        documentContainer.addEventListener('dragover', (e) => this.handleDocumentDragOver(e, documentId));
        documentContainer.addEventListener('drop', (e) => this.handleDocumentDrop(e, documentId));
        
        // 문서 컨테이너 우클릭 이벤트
        documentContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, documentId);
        });
        
        if (!documentContainer.parentElement) {
            this.documentsContainer.appendChild(documentContainer);
        }
        
        // 드롭 존을 항상 표시하되, 위치를 조정
        this.updateDropZoneVisibility();
    }

    /**
     * 드롭 존의 가시성을 업데이트합니다.
     */
    updateDropZoneVisibility() {
        if (!this.mainDropZone) return;
        
        if (this.documents.size === 0) {
            // 문서가 없으면 드롭 존을 중앙에 표시
            this.mainDropZone.style.display = 'flex';
            this.mainDropZone.classList.remove('compact');
            
            // 원래 내용으로 복원
            const dropZoneContent = this.mainDropZone.querySelector('div');
            if (dropZoneContent) {
                dropZoneContent.innerHTML = `
                    <div class="text-center">
                        <svg class="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        <p class="text-lg font-medium">끌어다 놓기 - 편집할 문서를 여기에 가져다 놓으세요</p>
                        <p class="text-sm text-gray-500 mt-2">PDF 파일을 드래그하거나 클릭하여 업로드</p>
                    </div>
                `;
            }
        } else {
            // 문서가 있으면 드롭 존을 하단에 작게 표시
            this.mainDropZone.style.display = 'flex';
            this.mainDropZone.classList.add('compact');
            
            // 드롭 존 내용 업데이트
            const dropZoneContent = this.mainDropZone.querySelector('div');
            if (dropZoneContent) {
                dropZoneContent.innerHTML = `
                    <div class="text-center">
                        <svg class="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        <p class="text-sm font-medium">추가 파일 업로드</p>
                        <p class="text-xs text-gray-500 mt-1">PDF 파일을 드래그하거나 클릭하여 추가</p>
                    </div>
                `;
            }
        }
    }

    /**
     * 페이지를 선택합니다.
     */
    selectPage(documentId, pageNumber) {
        const selectedPages = this.selectedPages.get(documentId);
        if (selectedPages.has(pageNumber)) {
            selectedPages.delete(pageNumber);
        } else {
            selectedPages.add(pageNumber);
        }
        
        this.updatePageSelection(documentId);
        this.updateUI();
    }

    /**
     * 문서를 선택합니다.
     */
    selectDocument(documentId) {
        if (this.selectedDocuments.has(documentId)) {
            this.selectedDocuments.delete(documentId);
        } else {
            this.selectedDocuments.add(documentId);
        }
        
        this.updateDocumentSelection();
        this.updateUI();
    }

    /**
     * 페이지 선택 상태를 업데이트합니다.
     */
    updatePageSelection(documentId) {
        const doc = this.documents.get(documentId);
        if (!doc) return;
        
        const selectedPages = this.selectedPages.get(documentId);
        let seq = this.selectionSequences.get(documentId) || [];
        
        doc.thumbnails.forEach(thumbnail => {
            const pageNumber = parseInt(thumbnail.dataset.pageNumber);
            const isSel = selectedPages.has(pageNumber);
            if (isSel) {
                thumbnail.classList.add('selected');
                if (!seq.includes(pageNumber)) seq.push(pageNumber);
            } else {
                thumbnail.classList.remove('selected');
                if (seq.includes(pageNumber)) seq = seq.filter(n => n !== pageNumber);
            }
            const sBadge = thumbnail.querySelector('span[data-role="selection-order-badge"]');
            if (sBadge) {
                const idx = seq.indexOf(pageNumber);
                if (idx !== -1) {
                    sBadge.textContent = String(idx + 1);
                    sBadge.style.display = '';
                } else {
                    sBadge.textContent = '';
                    sBadge.style.display = 'none';
                }
            }
        });
        this.selectionSequences.set(documentId, seq);
    }

    /**
     * 문서 선택 상태를 업데이트합니다.
     */
    updateDocumentSelection() {
        const documentContainers = this.documentsContainer.querySelectorAll('.document-container');
        documentContainers.forEach(container => {
            const documentId = container.dataset.documentId;
            if (this.selectedDocuments.has(documentId)) {
                container.style.border = '2px solid #10b981';
                container.style.backgroundColor = '#f0fdf4';
            } else {
                container.style.border = 'none';
                container.style.backgroundColor = 'white';
            }
        });
    }

    /**
     * 컨텍스트 메뉴를 표시합니다.
     */
    showContextMenu(e, documentId, pageNumber = null) {
        e.preventDefault();
        e.stopPropagation();
        
        if (!this.contextMenu) return;
        
        this.contextMenuTarget = { documentId, pageNumber };
        
        // 메뉴를 먼저 표시하여 크기를 계산할 수 있도록 함
        this.contextMenu.classList.remove('hidden');
        
        // 메뉴 크기 계산
        const menuRect = this.contextMenu.getBoundingClientRect();
        const menuWidth = menuRect.width;
        const menuHeight = menuRect.height;
        
        // 화면 크기
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // 초기 위치 (마우스 위치)
        let x = e.clientX;
        let y = e.clientY;
        
        // 오른쪽 경계 초과 시 왼쪽으로 이동
        if (x + menuWidth > screenWidth) {
            x = screenWidth - menuWidth - 10;
        }
        
        // 아래쪽 경계 초과 시 위쪽으로 이동
        if (y + menuHeight > screenHeight) {
            y = screenHeight - menuHeight - 10;
        }
        
        // 왼쪽 경계 초과 시 오른쪽으로 이동
        if (x < 0) {
            x = 10;
        }
        
        // 위쪽 경계 초과 시 아래쪽으로 이동
        if (y < 0) {
            y = 10;
        }
        
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        
        // 메뉴 항목 활성화/비활성화
        this.updateContextMenuItems();
    }

    // 페이지 컨텍스트 메뉴 표시
    showPageContextMenu(e, documentId, pageNumber) {
        if (!this.pageContextMenu) return;
        
        // 메뉴를 먼저 표시하여 크기를 계산할 수 있도록 함
        this.pageContextMenu.classList.remove('hidden');
        
        // 메뉴 크기 계산 (하위 메뉴 포함)
        const menuRect = this.pageContextMenu.getBoundingClientRect();
        const menuWidth = menuRect.width;
        const menuHeight = menuRect.height;
        
        // 하위 메뉴가 있는 경우 더 넓은 폭 고려
        const submenu = this.pageContextMenu.querySelector('.context-submenu');
        let totalWidth = menuWidth;
        if (submenu) {
            const submenuRect = submenu.getBoundingClientRect();
            totalWidth = Math.max(menuWidth, submenuRect.width + menuWidth);
        }
        
        // 화면 크기
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // 초기 위치 (마우스 위치)
        let x = e.clientX;
        let y = e.clientY;
        
        // 오른쪽 경계 초과 시 왼쪽으로 이동
        if (x + totalWidth > screenWidth) {
            x = screenWidth - totalWidth - 10;
        }
        
        // 아래쪽 경계 초과 시 위쪽으로 이동
        if (y + menuHeight > screenHeight) {
            y = screenHeight - menuHeight - 10;
        }
        
        // 왼쪽 경계 초과 시 오른쪽으로 이동
        if (x < 0) {
            x = 10;
        }
        
        // 위쪽 경계 초과 시 아래쪽으로 이동
        if (y < 0) {
            y = 10;
        }
        
        this.pageContextMenu.style.left = `${x}px`;
        this.pageContextMenu.style.top = `${y}px`;

        // 하위 메뉴 활성/비활성 처리
        if (submenu) {
            const items = submenu.querySelectorAll('.context-menu-item');
            // 조건: 우클릭 선택(_rightClickSelection)에 페이지가 있는 경우에만 활성화
            const rc = this._rightClickSelection;
            const hasRightClickSelection = rc && rc.pages && rc.pages.size > 0;
            items.forEach(el => {
                if (hasRightClickSelection) {
                    el.classList.remove('disabled');
                } else {
                    el.classList.add('disabled');
                }
            });
            
            // 서브메뉴 위치 조정 (화면 밖으로 나가지 않도록)
            this.adjustSubmenuPosition(submenu);
            
            // 서브메뉴가 표시될 때마다 위치 조정
            const groupItem = this.pageContextMenu.querySelector('.group');
            if (groupItem) {
                // 기존 이벤트 리스너 제거 (중복 방지)
                groupItem.removeEventListener('mouseenter', this._submenuAdjustHandler);
                
                // 새로운 이벤트 리스너 추가
                this._submenuAdjustHandler = () => {
                    // 약간의 지연을 두어 서브메뉴가 완전히 표시된 후 위치 조정
                    setTimeout(() => {
                        this.adjustSubmenuPosition(submenu);
                    }, 10);
                };
                groupItem.addEventListener('mouseenter', this._submenuAdjustHandler);
            }
        }
        // 현재 우클릭 기준 페이지를 저장 (우클릭 선택 초기 후보)
        this._rcCandidate = { documentId, pageNumber };
        this.bindPageContextMenuHandlers(documentId, pageNumber);
    }

    /**
     * 서브메뉴 위치를 화면 경계에 맞게 조정합니다.
     */
    adjustSubmenuPosition(submenu) {
        if (!submenu) return;
        
        // 현재 서브메뉴 표시 상태 확인
        const isCurrentlyVisible = submenu.style.display === 'block' || 
                                 submenu.offsetParent !== null;
        
        // 서브메뉴를 임시로 표시하여 크기 계산
        const originalDisplay = submenu.style.display;
        const originalVisibility = submenu.style.visibility;
        
        submenu.style.display = 'block';
        submenu.style.visibility = 'hidden';
        submenu.style.left = '100%';
        submenu.style.right = 'auto';
        submenu.style.top = '0';
        
        // 강제로 레이아웃 재계산
        submenu.offsetHeight;
        
        const submenuRect = submenu.getBoundingClientRect();
        const submenuWidth = submenuRect.width;
        const submenuHeight = submenuRect.height;
        
        // 화면 크기 (여백 포함)
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const margin = 10; // 화면 가장자리에서의 여백
        
        // 부모 메뉴 위치
        const parentMenu = submenu.closest('.context-menu');
        const parentRect = parentMenu.getBoundingClientRect();
        
        // 서브메뉴가 표시될 실제 위치 계산
        let submenuLeft = parentRect.right;
        let submenuTop = parentRect.top;
        
        // 오른쪽 경계 검사
        if (submenuLeft + submenuWidth > screenWidth - margin) {
            // 왼쪽에 표시
            submenuLeft = parentRect.left - submenuWidth;
            
            // 왼쪽도 화면 밖이면 부모 메뉴 중앙에 맞춤
            if (submenuLeft < margin) {
                submenuLeft = Math.max(margin, parentRect.left - submenuWidth / 2);
            }
        }
        
        // 아래쪽 경계 검사
        if (submenuTop + submenuHeight > screenHeight - margin) {
            // 위쪽으로 조정
            submenuTop = screenHeight - submenuHeight - margin;
            
            // 위쪽도 화면 밖이면 부모 메뉴 중앙에 맞춤
            if (submenuTop < margin) {
                submenuTop = Math.max(margin, parentRect.top - submenuHeight / 2);
            }
        }
        
        // 부모 메뉴 기준 상대 위치로 변환
        const relativeLeft = submenuLeft - parentRect.left;
        const relativeTop = submenuTop - parentRect.top;
        
        // 서브메뉴 위치 설정
        submenu.style.left = `${relativeLeft}px`;
        submenu.style.right = 'auto';
        submenu.style.top = `${relativeTop}px`;
        
        // 원래 상태로 복원 (표시 중이었다면 다시 표시)
        if (isCurrentlyVisible) {
            submenu.style.display = 'block';
            submenu.style.visibility = 'visible';
        } else {
            submenu.style.display = originalDisplay;
            submenu.style.visibility = originalVisibility;
        }
    }

    bindPageContextMenuHandlers(documentId, pageNumber) {
        if (!this.pageContextMenu) return;
        const menu = this.pageContextMenu;
        const handler = async (evt) => {
            const item = evt.target.closest('.context-menu-item');
            if (!item) return;
            if (item.classList.contains('disabled')) return;
            const action = item.dataset.action;
            // '이 페이지를...'은 하위 메뉴 활성화를 위한 트리거이므로 메뉴를 닫지 않음
            if (action !== 'page-sub') {
                menu.classList.add('hidden');
            }
            try {
                switch (action) {
                    case 'page-preview':
                        this.openPageViewer(documentId, pageNumber);
                        break;
                    case 'page-delete':
                        this.deleteSelectedPages();
                        break;
                    case 'page-rotate-right':
                        this.rotatePagesRight();
                        break;
                    case 'page-rotate-left':
                        this.rotatePagesLeft();
                        break;
                    case 'page-sub': {
                        // 기존 선택을 비우고 우클릭 선택으로만 보관
                        const current = this.selectedPages.get(documentId) || new Set();
                        const pages = current.size > 0 ? Array.from(current) : [pageNumber];
                        this.selectedPages.set(documentId, new Set());
                        this.updatePageSelection(documentId); // 초록 선택 해제
                        this._rightClickSelection = { documentId, pages: new Set(pages) };
                        // 하위 메뉴 활성화
                        const sub = this.pageContextMenu.querySelector('.context-submenu');
                        if (sub) {
                            sub.querySelectorAll('.context-menu-item').forEach(el => el.classList.remove('disabled'));
                        }
                        // 메뉴는 유지 (하위 메뉴 사용을 위해). 하위 메뉴가 즉시 활성화됨
                        this.pageContextMenu.classList.remove('hidden');
                        return; // 다른 작업 수행하지 않음 (finally는 여전히 실행됨 주의)
                    }
                    case 'page-move-before': {
                        const rc = this._rightClickSelection;
                        const pages = rc && rc.documentId === documentId ? Array.from(rc.pages) : null;
                        if (!pages || pages.length === 0) { this.showNotification('먼저 "이 페이지를..."로 페이지를 선택하세요.', 'warning'); break; }
                        // 같은 문서 내 이동
                        await this.reorderPagesInDocument(documentId, pages, pageNumber);
                        break;
                    }
                    case 'page-move-after': {
                        const rc = this._rightClickSelection;
                        const pages = rc && rc.documentId === documentId ? Array.from(rc.pages) : null;
                        if (!pages || pages.length === 0) { this.showNotification('먼저 "이 페이지를..."로 페이지를 선택하세요.', 'warning'); break; }
                        // 같은 문서 내 이동
                        await this.reorderPagesInDocument(documentId, pages, pageNumber + 1);
                        break;
                    }
                    case 'page-copy-before': {
                        const rc = this._rightClickSelection;
                        const pages = rc && rc.documentId === documentId ? Array.from(rc.pages) : null;
                        if (!pages || pages.length === 0) { this.showNotification('먼저 "이 페이지를..."로 페이지를 선택하세요.', 'warning'); break; }
                        // 같은 문서 내 복사
                        if (pages.length > 1) {
                            await this.copyPagesToDocumentBulk(documentId, pages, documentId, pageNumber);
                        } else {
                            await this.copyPageToDocument(documentId, pages[0], documentId, pageNumber);
                        }
                        break;
                    }
                    case 'page-copy-after': {
                        const rc = this._rightClickSelection;
                        const pages = rc && rc.documentId === documentId ? Array.from(rc.pages) : null;
                        if (!pages || pages.length === 0) { this.showNotification('먼저 "이 페이지를..."로 페이지를 선택하세요.', 'warning'); break; }
                        // 같은 문서 내 복사
                        const dest = pageNumber + 1;
                        if (pages.length > 1) {
                            await this.copyPagesToDocumentBulk(documentId, pages, documentId, dest);
                        } else {
                            await this.copyPageToDocument(documentId, pages[0], documentId, dest);
                        }
                        break;
                    }
                    default:
                        break;
                }
            } catch (err) {
                console.error('페이지 컨텍스트 작업 오류:', err);
                this.showNotification('작업 중 오류가 발생했습니다.', 'error');
            } finally {
                // '이 페이지를...' 클릭 시에는 리스너/선택 유지, 하위 메뉴 동작 후에는 우클릭 선택 초기화
                if (action !== 'page-sub') {
                    menu.removeEventListener('click', handler);
                    this._rightClickSelection = null;
                }
            }
        };
        // 안전하게 리스너 바인딩 초기화
        const cloned = menu.cloneNode(true);
        menu.parentNode.replaceChild(cloned, menu);
        this.pageContextMenu = document.getElementById('pageContextMenu');
        this.pageContextMenu.addEventListener('click', handler);
    }

    /**
     * 컨텍스트 메뉴 항목들을 업데이트합니다.
     */
    updateContextMenuItems() {
        if (!this.contextMenu) return;
        
        const items = this.contextMenu.querySelectorAll('.context-menu-item');
        const hasSelection = this.hasSelection();
        
        items.forEach(item => {
            const action = item.dataset.action;
            let disabled = false;
            
            switch (action) {
                case 'select-all':
                case 'deselect-all':
                    disabled = !this.contextMenuTarget.documentId;
                    break;
                case 'delete-pages':
                case 'extract-pages':
                case 'rotate-left':
                case 'rotate-right':
                    disabled = !hasSelection;
                    break;
                case 'move-up':
                case 'move-down':
                    disabled = !this.contextMenuTarget.documentId;
                    break;
                case 'duplicate':
                    disabled = !this.contextMenuTarget.documentId;
                    break;
                case 'remove-document':
                    disabled = !this.contextMenuTarget.documentId;
                    break;
            }
            
            if (disabled) {
                item.classList.add('disabled');
            } else {
                item.classList.remove('disabled');
            }
        });
    }

    /**
     * 컨텍스트 메뉴를 숨깁니다.
     */
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.classList.add('hidden');
        }
        this.contextMenuTarget = null;
    }

    /**
     * 컨텍스트 메뉴 액션을 처리합니다.
     */
    handleContextMenuAction(action) {
        this.hideContextMenu();
        
        switch (action) {
            case 'select-all':
                this.selectAllPages();
                break;
            case 'deselect-all':
                this.deselectAllPages();
                break;
            case 'delete-pages':
                this.deleteSelectedPages();
                break;
            case 'extract-pages':
                this.extractSelectedPages();
                break;
            case 'rotate-left':
                this.rotatePagesLeft();
                break;
            case 'rotate-right':
                this.rotatePagesRight();
                break;
            case 'move-up':
                this.moveDocumentsUp();
                break;
            case 'move-down':
                this.moveDocumentsDown();
                break;
            case 'duplicate':
                this.duplicateDocument();
                break;
            case 'remove-document':
                this.removeDocument();
                break;
        }
    }

    /**
     * 모든 페이지를 선택합니다.
     */
    selectAllPages() {
        if (!this.contextMenuTarget.documentId) return;
        
        const doc = this.documents.get(this.contextMenuTarget.documentId);
        if (!doc) return;
        
        const selectedPages = this.selectedPages.get(this.contextMenuTarget.documentId);
        for (let i = 1; i <= doc.pages; i++) {
            selectedPages.add(i);
        }
        
        this.updatePageSelection(this.contextMenuTarget.documentId);
        this.updateUI();
    }

    /**
     * 모든 페이지 선택을 해제합니다.
     */
    deselectAllPages() {
        if (!this.contextMenuTarget.documentId) return;
        
        const selectedPages = this.selectedPages.get(this.contextMenuTarget.documentId);
        selectedPages.clear();
        // 선택 순서도 초기화
        this.selectionSequences.set(this.contextMenuTarget.documentId, []);
        
        this.updatePageSelection(this.contextMenuTarget.documentId);
        this.updateUI();
    }

    /**
     * 선택된 페이지들을 삭제합니다.
     */
    async deleteSelectedPages() {
        const pagesToDelete = this.getSelectedPages();
        if (pagesToDelete.length === 0) {
            this.showNotification('삭제할 페이지를 선택해주세요.', 'warning');
            return;
        }
        
        try {
            this.showLoading(true);
            
            for (const { documentId, pageNumbers } of pagesToDelete) {
                const doc = this.documents.get(documentId);
                if (!doc) continue;
                
                // 삭제할 페이지 번호들을 문서 데이터에 저장
                if (!doc.deletedPages) {
                    doc.deletedPages = new Set();
                }
                
                // 삭제할 페이지들을 추가
                pageNumbers.forEach(pageNum => {
                    doc.deletedPages.add(pageNum);
                });
                
                // 문서 변경 상태로 표시
                doc.dirty = true;
                
                // 미리보기에서 해당 페이지들 제거
                await this.removePagesFromPreview(documentId, Array.from(pageNumbers));
                
                // 선택 상태 초기화
                this.selectedPages.set(documentId, new Set());
                this.selectionSequences.set(documentId, []);
                this._rightClickSelection = null;
            }
            
            this.updateUI();
            this.showNotification('선택된 페이지가 삭제되었습니다. 저장 시 반영됩니다.', 'success');
        } catch (error) {
            console.error('페이지 삭제 오류:', error);
            this.showNotification('페이지 삭제 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 미리보기에서 특정 페이지들을 제거합니다.
     */
    async removePagesFromPreview(documentId, pageNumbers) {
        const doc = this.documents.get(documentId);
        if (!doc) return;
        
        try {
            // 실제 PDF에서도 페이지 제거 (UI와 내부 상태 동기화)
            const pdfLib = window.PDFLib;
            const sourcePdf = await this.loadPdfLibFromDoc(doc);
            const totalPages = sourcePdf.getPageCount();
            
            // 삭제할 페이지들을 0-based 인덱스로 변환
            const indicesToRemove = pageNumbers.map(p => p - 1).filter(i => i >= 0 && i < totalPages);
            
            if (indicesToRemove.length > 0) {
                // 유지할 페이지들의 인덱스 생성
                const keepIndices = Array.from({ length: totalPages }, (_, i) => i)
                    .filter(i => !indicesToRemove.includes(i));
                
                // 새 PDF 생성 (삭제된 페이지 제외)
                const newPdf = await pdfLib.PDFDocument.create();
                if (keepIndices.length > 0) {
                    const copiedPages = await newPdf.copyPages(sourcePdf, keepIndices);
                    copiedPages.forEach(page => newPdf.addPage(page));
                }
                
                const newBytes = await newPdf.save();
                
                // 문서 상태 업데이트
                doc.originalData = newBytes;
                doc.pdf = await pdfjsLib.getDocument({ data: newBytes }).promise;
                doc.pages = doc.pdf.numPages;
                
                // 삭제된 페이지 정보 초기화 (실제 PDF에서 제거했으므로)
                doc.deletedPages = new Set();
                
                // 썸네일 재생성
                await this.generateThumbnails(documentId);
                this.renderDocument(documentId);
            }
            
            // 문서 헤더의 페이지 수 업데이트
            const documentElement = document.querySelector(`[data-document-id="${documentId}"]`);
            if (documentElement) {
                const header = documentElement.querySelector('.document-header');
                if (header) {
                    // 제목 부분만 업데이트 (X 버튼은 유지)
                    const titleElement = header.querySelector('div:first-child');
                    if (titleElement) {
                        titleElement.textContent = `${doc.name} (페이지: ${doc.pages})`;
                    }
                }
            }
        } catch (error) {
            console.error('페이지 제거 중 오류:', error);
            // 오류 시 기존 방식으로 폴백
            const thumbnailsToRemove = [];
            doc.thumbnails.forEach((thumbnail, index) => {
                const pageNum = parseInt(thumbnail.dataset.pageNumber);
                if (pageNumbers.includes(pageNum)) {
                    thumbnailsToRemove.push(index);
                }
            });
            
            thumbnailsToRemove.reverse().forEach(index => {
                const thumbnail = doc.thumbnails[index];
                if (thumbnail && thumbnail.parentNode) {
                    thumbnail.parentNode.removeChild(thumbnail);
                }
                doc.thumbnails.splice(index, 1);
            });
            
            doc.pages = doc.thumbnails.length;
        }
    }

    /**
     * 선택된 페이지들을 추출합니다.
     */
    async extractSelectedPages() {
        const pagesToExtract = this.getSelectedPages();
        if (pagesToExtract.length === 0) {
            this.showNotification('추출할 페이지를 선택해주세요.', 'warning');
            return;
        }
        
        try {
            this.showLoading(true);
            
            for (const { documentId, pageNumbers } of pagesToExtract) {
                const doc = this.documents.get(documentId);
                if (!doc) continue;
                
                const extractedPdfBytes = await window.pdfEditor.extractPages(
                    doc.pdf, 
                    Array.from(pageNumbers), 
                    doc.originalData
                );
                
                const filename = `${doc.name.replace('.pdf', '')}_extracted_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
                await window.pdfEditor.downloadModifiedPdf(extractedPdfBytes, filename);
            }
            
            this.showNotification('선택된 페이지가 추출되었습니다.', 'success');
        } catch (error) {
            console.error('페이지 추출 오류:', error);
            this.showNotification('페이지 추출 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 선택된 문서들을 순서대로 병합합니다.
     */
    async mergeAllDocuments() {
        if (this.selectedDocuments.size < 2) {
            this.showNotification('합치기를 위해서는 여러개의 파일이 필요합니다.', 'warning');
            return;
        }
        
        try {
            this.showLoading(true);
            
            // 선택된 문서들을 순서번호 순으로 정렬
            const selectedDocs = Array.from(this.selectedDocuments)
                .map(id => ({ id, doc: this.documents.get(id) }))
                .filter(item => item.doc)
                .sort((a, b) => {
                    const indexA = this.documentOrder.indexOf(a.id);
                    const indexB = this.documentOrder.indexOf(b.id);
                    return indexA - indexB;
                })
                .map(item => item.doc);
            
            // 각 문서의 변경사항(회전, 삭제된 페이지)을 적용하여 병합
            const processedDocs = [];
            for (const doc of selectedDocs) {
                const processedBytes = await this.exportDocumentWithRotations(doc);
                processedDocs.push(processedBytes);
            }
            
            // PDF-lib를 사용하여 병합
            const pdfLib = window.PDFLib;
            const mergedPdf = await pdfLib.PDFDocument.create();
            
            for (const pdfBytes of processedDocs) {
                const pdf = await pdfLib.PDFDocument.load(pdfBytes);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
            }
            
            const mergedPdfBytes = await mergedPdf.save();
            
            // 파일명 생성 (선택된 문서들의 이름을 포함)
            const docNames = selectedDocs.map(doc => doc.name.replace('.pdf', '')).join('_');
            const filename = `merged_${docNames}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
            
            // 저장 대화상자 표시
            await this.saveBytesWithDialog(mergedPdfBytes, filename);
            
            this.showNotification('선택된 문서들이 병합되었습니다.', 'success');
        } catch (error) {
            console.error('문서 병합 오류:', error);
            this.showNotification('문서 병합 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 선택된 문서들을 저장합니다.
     */
    async saveSelectedDocuments() {
        if (this.selectedDocuments.size === 0) {
            this.showNotification('저장할 문서를 선택해주세요.', 'warning');
            return;
        }
        
        try {
            this.showLoading(true);
            
            let savedCount = 0;
            for (const documentId of this.selectedDocuments) {
                const doc = this.documents.get(documentId);
                if (!doc) continue;
                const filename = `${doc.name.replace(/\.pdf$/i, '')}_saved_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.pdf`;
                try {
                    const outBytes = await this.exportDocumentWithRotations(doc);
                    const saved = await this.saveBytesWithDialog(outBytes, filename);
                    if (saved) {
                        savedCount++;
                    }
                } catch (err) {
                    console.warn('파일 저장 대화상자 실패, 다운로드로 대체:', err);
                    // 폴백: 다운로드 방식
                    await window.pdfEditor.downloadPdf(doc.pdf, filename);
                    savedCount++;
                }
            }
            
            if (savedCount > 0) {
                this.showNotification(`${savedCount}개의 문서가 저장되었습니다.`, 'success');
            } else {
                this.showNotification('저장이 취소되었습니다.', 'info');
            }
        } catch (error) {
            console.error('문서 저장 오류:', error);
            this.showNotification('문서 저장 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 선택된 페이지들을 반시계 방향으로 회전합니다.
     */
    async rotatePagesLeft() {
        const pagesToRotate = this.getSelectedPages();
        if (pagesToRotate.length === 0) {
            this.showNotification('회전할 페이지를 선택해주세요.', 'warning');
            return;
        }
        
        try {
            this.showLoading(true);
            
            for (const { documentId, pageNumbers } of pagesToRotate) {
                const doc = this.documents.get(documentId);
                if (!doc) continue;
                
                // 각 페이지의 회전 상태 업데이트 (반시계 방향으로 90도)
                pageNumbers.forEach(pageNum => {
                    const currentRotation = doc.rotations[pageNum] || 0;
                    doc.rotations[pageNum] = (currentRotation - 90) % 360;
                });
                
                // 문서 변경 상태로 표시
                doc.dirty = true;
                
                // 미리보기에서 해당 페이지들 업데이트
                this.updateRotatedPagesInPreview(documentId, Array.from(pageNumbers));
            }
            
            this.updateUI();
            this.showNotification('선택된 페이지가 반시계 방향으로 회전되었습니다.', 'success');
        } catch (error) {
            console.error('페이지 회전 오류:', error);
            this.showNotification('페이지 회전 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 선택된 페이지들을 시계 방향으로 회전합니다.
     */
    async rotatePagesRight() {
        const pagesToRotate = this.getSelectedPages();
        if (pagesToRotate.length === 0) {
            this.showNotification('회전할 페이지를 선택해주세요.', 'warning');
            return;
        }
        
        try {
            this.showLoading(true);
            
            for (const { documentId, pageNumbers } of pagesToRotate) {
                const doc = this.documents.get(documentId);
                if (!doc) continue;
                
                // 각 페이지의 회전 상태 업데이트 (시계 방향으로 90도)
                pageNumbers.forEach(pageNum => {
                    const currentRotation = doc.rotations[pageNum] || 0;
                    doc.rotations[pageNum] = (currentRotation + 90) % 360;
                });
                
                // 문서 변경 상태로 표시
                doc.dirty = true;
                
                // 미리보기에서 해당 페이지들 업데이트
                this.updateRotatedPagesInPreview(documentId, Array.from(pageNumbers));
            }
            
            this.updateUI();
            this.showNotification('선택된 페이지가 시계 방향으로 회전되었습니다.', 'success');
        } catch (error) {
            console.error('페이지 회전 오류:', error);
            this.showNotification('페이지 회전 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 미리보기에서 회전된 페이지들을 업데이트합니다.
     */
    async updateRotatedPagesInPreview(documentId, pageNumbers) {
        const doc = this.documents.get(documentId);
        if (!doc) return;
        
        for (const pageNum of pageNumbers) {
            try {
                const page = await doc.pdf.getPage(pageNum);
                const rotation = doc.rotations[pageNum] || 0;
                const viewport = page.getViewport({ scale: 0.2, rotation: rotation });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;
                
                // 해당 페이지의 썸네일 찾기
                const thumbnail = doc.thumbnails.find(thumb => 
                    parseInt(thumb.dataset.pageNumber) === pageNum
                );
                
                if (thumbnail) {
                    const img = thumbnail.querySelector('img');
                    if (img) {
                        img.src = canvas.toDataURL('image/png');
                    }
                }
            } catch (error) {
                console.error(`페이지 ${pageNum} 썸네일 업데이트 오류:`, error);
            }
        }
    }

    /**
     * 선택된 문서들을 위로 이동합니다.
     */
    moveDocumentsUp() {
        if (this.selectedDocuments.size === 0) {
            this.showNotification('이동할 문서를 선택해주세요.', 'warning');
            return;
        }
        
        let moved = false;
        const sortedSelectedDocs = Array.from(this.selectedDocuments).sort((a, b) => {
            return this.documentOrder.indexOf(a) - this.documentOrder.indexOf(b);
        });
        
        for (const documentId of sortedSelectedDocs) {
            const currentIndex = this.documentOrder.indexOf(documentId);
            if (currentIndex > 0) {
                // 위로 이동
                this.documentOrder.splice(currentIndex, 1);
                this.documentOrder.splice(currentIndex - 1, 0, documentId);
                moved = true;
            }
        }
        
        if (moved) {
            this.reorderDocumentContainers();
            this.updateUI();
            this.showNotification('선택된 문서가 위로 이동되었습니다.', 'success');
        } else {
            this.showNotification('더 이상 위로 이동할 수 없습니다.', 'info');
        }
    }

    /**
     * 선택된 문서들을 아래로 이동합니다.
     */
    moveDocumentsDown() {
        if (this.selectedDocuments.size === 0) {
            this.showNotification('이동할 문서를 선택해주세요.', 'warning');
            return;
        }
        
        let moved = false;
        const sortedSelectedDocs = Array.from(this.selectedDocuments).sort((a, b) => {
            return this.documentOrder.indexOf(b) - this.documentOrder.indexOf(a);
        });
        
        for (const documentId of sortedSelectedDocs) {
            const currentIndex = this.documentOrder.indexOf(documentId);
            if (currentIndex < this.documentOrder.length - 1) {
                // 아래로 이동
                this.documentOrder.splice(currentIndex, 1);
                this.documentOrder.splice(currentIndex + 1, 0, documentId);
                moved = true;
            }
        }
        
        if (moved) {
            this.reorderDocumentContainers();
            this.updateUI();
            this.showNotification('선택된 문서가 아래로 이동되었습니다.', 'success');
        } else {
            this.showNotification('더 이상 아래로 이동할 수 없습니다.', 'info');
        }
    }

    /**
     * 문서 컨테이너들을 새로운 순서로 재정렬합니다.
     */
    reorderDocumentContainers() {
        const container = this.documentsContainer;
        const fragment = document.createDocumentFragment();
        
        // 새로운 순서에 따라 컨테이너들을 fragment에 추가
        this.documentOrder.forEach(documentId => {
            const element = container.querySelector(`[data-document-id="${documentId}"]`);
            if (element) {
                fragment.appendChild(element);
            }
        });
        
        // 기존 컨테이너들을 모두 제거하고 새로운 순서로 추가
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    /**
     * 선택된 문서를 미리보기합니다.
     */
    previewSelectedDocument() {
        if (this.selectedDocuments.size === 0) {
            this.showNotification('선택된 파일이 없습니다.', 'warning');
            return;
        }
        
        // 선택된 문서들 중 순서번호가 가장 빠른 문서 찾기
        let targetDocumentId = null;
        let minOrderIndex = Infinity;
        
        for (const documentId of this.selectedDocuments) {
            const orderIndex = this.documentOrder.indexOf(documentId);
            if (orderIndex !== -1 && orderIndex < minOrderIndex) {
                minOrderIndex = orderIndex;
                targetDocumentId = documentId;
            }
        }
        
        if (targetDocumentId) {
            // 해당 문서의 1페이지부터 미리보기 팝업 열기
            this.openPageViewer(targetDocumentId, 1);
        } else {
            this.showNotification('미리보기할 문서를 찾을 수 없습니다.', 'error');
        }
    }


    /**
     * 문서를 복제합니다.
     */
    duplicateDocument() {
        if (!this.contextMenuTarget.documentId) return;
        
        const doc = this.documents.get(this.contextMenuTarget.documentId);
        if (!doc) return;
        
        // 구현 예정
        this.showNotification('문서 복제 기능은 향후 구현될 예정입니다.', 'info');
    }

    /**
     * 문서를 제거합니다.
     */
    removeDocument() {
        if (!this.contextMenuTarget.documentId) return;
        
        const documentId = this.contextMenuTarget.documentId;
        const doc = this.documents.get(documentId);
        
        this.requestCloseDocument(documentId);
    }

    // 문서 닫기 요청 (변경사항 확인 포함)
    requestCloseDocument(documentId) {
        const doc = this.documents.get(documentId);
        if (!doc) return;
        if (doc.dirty) {
            this._pendingCloseId = documentId;
            this.showConfirmModal(true);
        } else {
            this.closeDocument(documentId);
        }
    }

    showConfirmModal(show) {
        if (!this.confirmModal) return;
        if (show) this.confirmModal.classList.remove('hidden');
        else this.confirmModal.classList.add('hidden');
    }

    async handleConfirm(yes) {
        this.showConfirmModal(false);
        const documentId = this._pendingCloseId;
        this._pendingCloseId = null;
        if (!documentId) return;
        const doc = this.documents.get(documentId);
        if (!doc) return;
        if (yes) {
            const filename = `${doc.name.replace(/\.pdf$/i,'')}_edited_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.pdf`;
            let outBytes = null;
            try {
                // 회전 등 작업공간의 변경사항을 적용하여 PDF 저장
                outBytes = await this.exportDocumentWithRotations(doc);
                const saved = await this.saveBytesWithDialog(outBytes, filename);
                if (!saved) {
                    // 사용자가 취소함 - 문서를 닫지 않음
                    this.showNotification('저장이 취소되었습니다.', 'info');
                    return;
                }
            } catch (e) {
                console.error('저장 중 오류 - 다운로드로 대체:', e);
                if (outBytes) {
                    await window.pdfEditor.downloadModifiedPdf(outBytes, filename);
                } else {
                    // 최후 폴백: 현재 pdf.js 문서를 변환하여 저장
                    await window.pdfEditor.downloadPdf(doc.pdf, filename);
                }
            }
        }
        this.closeDocument(documentId);
    }

    // 작업공간의 회전 상태와 삭제된 페이지를 실제 PDF에 적용하여 바이트로 반환
    async exportDocumentWithRotations(doc) {
        const pdfLib = window.PDFLib;
        let pdfDoc = null;
        // 1차 시도: 원본 ArrayBuffer가 유효하다면 그대로 로드
        if (doc.originalData) {
            try {
                const src = new Uint8Array(doc.originalData);
                pdfDoc = await pdfLib.PDFDocument.load(src);
            } catch (err) {
                // detached 등 오류 시 아래로 폴백
            }
        }
        // 2차 시도: pdf.js → pdf-lib 바이트 변환 경로 사용
        if (!pdfDoc) {
            const bytes = await window.pdfEditor.convertPdfJsToPdfLib(doc.pdf, null);
            pdfDoc = await pdfLib.PDFDocument.load(bytes);
        }
        
        // 삭제된 페이지가 있다면 먼저 삭제
        if (doc.deletedPages && doc.deletedPages.size > 0) {
            const pagesToDelete = Array.from(doc.deletedPages).sort((a, b) => b - a); // 역순으로 정렬
            for (const pageNum of pagesToDelete) {
                if (pageNum > 0 && pageNum <= pdfDoc.getPageCount()) {
                    pdfDoc.removePage(pageNum - 1); // PDF-lib는 0-based 인덱스 사용
                }
            }
        }
        
        // 회전 적용
        const total = pdfDoc.getPageCount();
        for (let i = 0; i < total; i++) {
            const pg = pdfDoc.getPage(i);
            const deg = (doc.rotations[(i + 1)] || 0) % 360;
            if (deg !== 0) {
                pg.setRotation(pdfLib.degrees(deg));
            }
        }
        return await pdfDoc.save();
    }

    // 파일 저장 대화상자를 시도(Chromium 계열), 실패 시 다운로드로 폴백
    async saveBytesWithDialog(bytes, suggestedName) {
        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName,
                    types: [{
                        description: 'PDF Document',
                        accept: { 'application/pdf': ['.pdf'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(new Blob([bytes], { type: 'application/pdf' }));
                await writable.close();
                return true; // 성공적으로 저장됨
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                // 사용자가 취소함
                return false;
            }
            console.warn('showSaveFilePicker 사용 불가, 다운로드로 대체:', err);
        }
        // 폴백: 브라우저 다운로드
        await window.pdfEditor.downloadModifiedPdf(bytes, suggestedName);
        return true; // 다운로드로 저장됨
    }

    closeDocument(documentId) {
        this.documents.delete(documentId);
        this.selectedDocuments.delete(documentId);
        this.selectedPages.delete(documentId);
        this.documentOrder = this.documentOrder.filter(id => id !== documentId);
        const container = this.documentsContainer.querySelector(`[data-document-id="${documentId}"]`);
        if (container) container.remove();
        this.updateDropZoneVisibility();
        this.updateUI();
        this.showNotification('문서가 제거되었습니다.', 'success');
    }

    /**
     * 선택된 페이지들을 가져옵니다.
     */
    getSelectedPages() {
        const result = [];
        
        for (const [documentId, selectedPages] of this.selectedPages) {
            if (selectedPages.size > 0) {
                result.push({
                    documentId,
                    pageNumbers: selectedPages
                });
            }
        }
        
        return result;
    }

    /**
     * 선택된 항목이 있는지 확인합니다.
     */
    hasSelection() {
        for (const selectedPages of this.selectedPages.values()) {
            if (selectedPages.size > 0) {
                return true;
            }
        }
        return this.selectedDocuments.size > 0;
    }

    /**
     * UI 상태를 업데이트합니다.
     */
    updateUI() {
        const hasDocuments = this.documents.size > 0;
        const hasSelection = this.hasSelection();
        const hasSelectedDocuments = this.selectedDocuments.size > 0;
        
        // 툴바 버튼 상태 업데이트
        this.saveBtn.disabled = !hasSelectedDocuments;
        this.deleteBtn.disabled = !hasSelection;
        this.moveUpBtn.disabled = !hasSelectedDocuments;
        this.moveDownBtn.disabled = !hasSelectedDocuments;
        this.mergeAllBtn.disabled = !hasSelectedDocuments;
        this.previewBtn.disabled = false; // 미리보기 버튼은 항상 활성화 (내부에서 선택 여부 확인)
        this.rotateLeftBtn.disabled = !hasSelection;
        this.rotateRightBtn.disabled = !hasSelection;
        
        // 문서 순서번호 업데이트
        this.updateAllDocumentOrderNumbers();
    }

    /**
     * 문서 ID를 생성합니다.
     */
    generateDocumentId() {
        return 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 로딩 오버레이를 표시/숨깁니다.
     */
    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.remove('hidden');
        } else {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * 알림 메시지를 표시합니다.
     */
    showNotification(message, type = 'info') {
        this.notificationMessage.textContent = message;
        
        // 알림 타입에 따른 스타일 변경
        const notification = this.notification;
        notification.className = 'fixed top-4 left-1/2 -translate-x-1/2 transform z-50';
        
        if (type === 'success') {
            notification.classList.add('bg-green-50', 'border-green-500');
        } else if (type === 'error') {
            notification.classList.add('bg-red-50', 'border-red-500');
        } else if (type === 'warning') {
            notification.classList.add('bg-yellow-50', 'border-yellow-500');
        } else {
            notification.classList.add('bg-blue-50', 'border-blue-500');
        }
        
        notification.classList.remove('hidden');
        
        // 3초 후 자동 숨김
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }

    /**
     * 드래그 시작 처리
     */
    handleDragStart(e, documentId, pageNumber) {
        e.stopPropagation(); // 파일 드롭과 충돌 방지
        e.dataTransfer.effectAllowed = 'move';
        // 여러 페이지 선택 상태면 함께 이동
        const selected = this.selectedPages.get(documentId);
        let sourcePageNumbers = [pageNumber];
        if (selected && selected.size > 0 && selected.has(pageNumber)) {
            sourcePageNumbers = Array.from(selected).sort((a,b)=>a-b);
        }
        e.dataTransfer.setData('text/plain', JSON.stringify({
            sourceDocumentId: documentId,
            sourcePageNumber: pageNumber,
            sourcePageNumbers
        }));
        
        e.target.classList.add('dragging');
        this.draggedElement = e.target;

        // 드래그 중 hover/강조 비활성화를 위한 바디 플래그
        document.body.classList.add('dragging-page');

        // 드롭 인디케이터 준비 (썸네일 컨테이너 기준으로 고정 표시)
        const container = e.target.closest('.thumbnail-container');
        if (container) {
            if (!this.dropIndicator) {
                this.dropIndicator = document.createElement('div');
                this.dropIndicator.className = 'drop-indicator';
            }
            container.style.position = 'relative';
            container.appendChild(this.dropIndicator);
            this.dropIndicator.style.display = 'none';
        }
    }

    /**
     * 드래그 종료 처리
     */
    handleDragEnd(e) {
        e.stopPropagation(); // 파일 드롭과 충돌 방지
        e.target.classList.remove('dragging');
        this.draggedElement = null;
        document.body.classList.remove('dragging-page');
        
        // 모든 드래그 오버 상태 제거
        document.querySelectorAll('.page-thumbnail.drag-over, .document-container.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });

        // 드롭 인디케이터 제거/숨김
        if (this.dropIndicator && this.dropIndicator.parentElement) {
            this.dropIndicator.style.display = 'none';
        }

        // 드래그 클릭 억제 해제 및 다음 클릭 잠시 무시
        this.isDraggingPages = false;
        if (this._dragClickBlocker) {
            document.removeEventListener('click', this._dragClickBlocker, true);
        }
        this.suppressClickUntil = Date.now() + 150; // 드래그 후 발생하는 클릭 무시
        this._lastDropDest = null;
    }

    /**
     * 드래그 오버 처리 (페이지 썸네일)
     */
    handleDragOver(e) {
        // 파일 드롭 존이 아닌 경우에만 처리
        if (e.target.closest('#mainDropZone')) {
            return; // 파일 드롭 존은 별도 처리
        }
        
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        // 드래그 중에는 다른 썸네일을 활성화하지 않음 (시각 강조 제거)

        // 인디케이터 위치 계산 (단일 스냅)
        const containerEl = e.target.closest('.thumbnail-container');
        if (this.dropIndicator && containerEl) {
            // 스크롤을 고려하여 컨테이너 좌표계 내 위치를 계산
            const children = Array.from(containerEl.querySelectorAll('.page-thumbnail'));
            const containerRect = containerEl.getBoundingClientRect();
            const scrollX = containerEl.scrollLeft || 0;
            let snapX;
            let dest = children.length + 1;
            if (children.length > 0) {
                // 기본을 마지막 썸네일의 오른쪽 경계로 설정
                const lastRect = children[children.length - 1].getBoundingClientRect();
                snapX = Math.round(scrollX + (lastRect.right - containerRect.left));
            } else {
                snapX = 0;
            }
            for (let idx = 0; idx < children.length; idx++) {
                const rect = children[idx].getBoundingClientRect();
                const mid = rect.left + rect.width / 2;
                if (e.clientX < mid) {
                    // 해당 페이지 앞 위치(왼쪽 경계)
                    snapX = Math.round(scrollX + (rect.left - containerRect.left));
                    dest = idx + 1; // 해당 페이지 앞
                    break;
                } else {
                    // 해당 페이지 뒤 위치(오른쪽 경계)
                    snapX = Math.round(scrollX + (rect.right - containerRect.left));
                    dest = idx + 2; // 해당 페이지 뒤
                }
            }
            // 인디케이터 표시 (컨테이너를 기준으로 절대 좌표)
            containerEl.style.position = containerEl.style.position || 'relative';
            this.dropIndicator.style.display = 'block';
            this.dropIndicator.style.left = snapX + 'px';
            this.dropIndicator.style.top = '8px';
            this.dropIndicator.style.bottom = '8px';
            // 현재 계산된 목적지 임시 저장 (드롭 시 재사용)
            this._lastDropDest = dest;
        }

        // 자동 스크롤 가속: 가장자리 근접 시 가속도 적용
        if (containerEl) {
            const edgeThreshold = 40; // px
            const maxSpeed = 30; // px/frame
            const rect = containerEl.getBoundingClientRect();
            const x = e.clientX;
            let speed = 0;
            if (x < rect.left + edgeThreshold) {
                const ratio = (rect.left + edgeThreshold - x) / edgeThreshold; // 0..1
                speed = -Math.ceil(maxSpeed * ratio);
            } else if (x > rect.right - edgeThreshold) {
                const ratio = (x - (rect.right - edgeThreshold)) / edgeThreshold; // 0..1
                speed = Math.ceil(maxSpeed * ratio);
            }
            this.updateAutoScroll(containerEl, speed);
        }
    }

    /**
     * 페이지 드롭 처리 (페이지 썸네일)
     */
    async handlePageDrop(e, targetDocumentId, targetPageNumber) {
        // 파일 드롭 존이 아닌 경우에만 처리
        if (e.target.closest('#mainDropZone')) {
            return; // 파일 드롭 존은 별도 처리
        }
        
        e.preventDefault();
        e.stopPropagation();
        e.target.classList.remove('drag-over');

        // 인디케이터 숨김
        if (this.dropIndicator) {
            this.dropIndicator.style.display = 'none';
        }
        // 자동 스크롤 중지
        this.updateAutoScroll(null, 0);
        
        try {
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const { sourceDocumentId, sourcePageNumber, sourcePageNumbers } = dragData;
            
            // 같은 문서 내에서 페이지 순서 변경 (스냅된 단일 목적지 활용)
            if (sourceDocumentId === targetDocumentId) {
                let dest = this._lastDropDest || targetPageNumber;
                // 드롭 금지 영역: 블록 내부(시작~끝+1)에는 이동하지 않음
                if (Array.isArray(sourcePageNumbers) && sourcePageNumbers.length > 1) {
                    const start = Math.min(...sourcePageNumbers);
                    const end = Math.max(...sourcePageNumbers);
                    if (dest >= start && dest <= end + 1) {
                        // 제자리에 드롭 → 무시
                        return;
                    }
                    this.reorderPagesInDocument(sourceDocumentId, sourcePageNumbers, dest);
                } else {
                    // 단일 페이지 이동
                    if (dest === sourcePageNumber || dest === sourcePageNumber + 1) {
                        return;
                    }
                    this.reorderPageInDocument(sourceDocumentId, sourcePageNumber, dest);
                }
            } else {
                // 다른 문서로 페이지 이동 (드래그앤드랍은 이동으로 처리)
                if (Array.isArray(sourcePageNumbers) && sourcePageNumbers.length > 1) {
                    // 다중 페이지 이동
                    await this.movePagesBetweenDocuments(sourceDocumentId, sourcePageNumbers, targetDocumentId, targetPageNumber);
                } else {
                    // 단일 페이지 이동
                    await this.movePageBetweenDocuments(sourceDocumentId, sourcePageNumber, targetDocumentId, targetPageNumber);
                }
            }
        } catch (error) {
            console.error('드롭 처리 오류:', error);
        }
    }

    // 자동 스크롤 가속 루프 업데이트
    updateAutoScroll(containerEl, speed) {
        if (!this._autoScroll) this._autoScroll = { el: null, speed: 0, raf: 0 };
        // 속도 0이면 중지
        if (!speed || !containerEl) {
            this._autoScroll.speed = 0;
            if (this._autoScroll.raf) {
                cancelAnimationFrame(this._autoScroll.raf);
                this._autoScroll.raf = 0;
            }
            return;
        }
        this._autoScroll.el = containerEl;
        this._autoScroll.speed = speed;
        if (!this._autoScroll.raf) {
            const tick = () => {
                const s = this._autoScroll.speed;
                const el = this._autoScroll.el;
                if (!s || !el) { this._autoScroll.raf = 0; return; }
                el.scrollLeft += s;
                this._autoScroll.raf = requestAnimationFrame(tick);
            };
            this._autoScroll.raf = requestAnimationFrame(tick);
        }
    }

    // 컨테이너(빈 공간 포함) 드롭 처리 → _lastDropDest 사용
    async handleContainerPageDrop(e, targetDocumentId) {
        if (e.target.closest('#mainDropZone')) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.dropIndicator) this.dropIndicator.style.display = 'none';
        try {
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const { sourceDocumentId, sourcePageNumber, sourcePageNumbers } = dragData;
            let dest = this._lastDropDest || 1;
            if (sourceDocumentId === targetDocumentId) {
                if (Array.isArray(sourcePageNumbers) && sourcePageNumbers.length > 1) {
                    const start = Math.min(...sourcePageNumbers);
                    const end = Math.max(...sourcePageNumbers);
                    if (dest >= start && dest <= end + 1) return;
                    this.reorderPagesInDocument(sourceDocumentId, sourcePageNumbers, dest);
                } else {
                    if (dest === sourcePageNumber || dest === sourcePageNumber + 1) return;
                    this.reorderPageInDocument(sourceDocumentId, sourcePageNumber, dest);
                }
            } else {
                // 다른 문서로 페이지 이동 (컨테이너 기준 dest 사용)
                if (Array.isArray(sourcePageNumbers) && sourcePageNumbers.length > 1) {
                    // 다중 페이지 이동
                    await this.movePagesBetweenDocuments(sourceDocumentId, sourcePageNumbers, targetDocumentId, dest);
                } else {
                    // 단일 페이지 이동
                    await this.movePageBetweenDocuments(sourceDocumentId, sourcePageNumber, targetDocumentId, dest);
                }
            }
        } catch (err) {
            console.error('컨테이너 드롭 처리 오류:', err);
        }
    }

    // 여러 페이지를 같은 문서 내에서 새 위치로 이동
    async reorderPagesInDocument(documentId, sourcePageNumbers, destPageNumber) {
        const doc = this.documents.get(documentId);
        if (!doc || !Array.isArray(sourcePageNumbers) || sourcePageNumbers.length === 0) return;
        const uniqueSources = Array.from(new Set(sourcePageNumbers)).sort((a,b)=>a-b);
        try {
            this.showLoading(true);
            const pdfLib = window.PDFLib;
            const srcPdf = await this.loadPdfLibFromDoc(doc);
            const count = srcPdf.getPageCount();

            // 원본 인덱스 배열
            const indices = Array.from({ length: count }, (_, i) => i);
            // 제거할 0-based 인덱스 목록
            const removeIdx = uniqueSources.map(n => Math.min(Math.max(1, n), count) - 1);
            // 사본 작성 (원본 변경 방지)
            const remaining = indices.filter(i => !removeIdx.includes(i));

            // 목적지 인덱스 (0..count, count=맨 뒤 허용)
            let destZero = Math.min(Math.max(0, destPageNumber - 1), count);
            // 소스 제거 후 기준 배열은 remaining (길이 = count - blockSize)
            // 소스 중 dest 이전에 있던 개수만큼 목적지를 당겨서 보정
            const numRemovedBeforeDest = removeIdx.filter(i => i < destZero).length;
            destZero -= numRemovedBeforeDest;
            if (destZero < 0) destZero = 0;
            if (destZero > remaining.length) destZero = remaining.length; // 맨 뒤 허용

            // 이동할 블록(원래 순서 유지) 추가
            const block = removeIdx.map(i => i);
            // remaining에 destZero 위치로 삽입
            const newOrder = remaining.slice(0, destZero).concat(block, remaining.slice(destZero));

            // 새 PDF 구성
            const newPdf = await pdfLib.PDFDocument.create();
            const copied = await newPdf.copyPages(srcPdf, newOrder);
            copied.forEach(p => newPdf.addPage(p));
            const newBytes = await newPdf.save();

            // rotations 재매핑
            const oldRot = doc.rotations || {};
            const oldDegArr = Array.from({ length: count }, (_, i) => oldRot[i + 1] || 0);
            const newDegArr = newOrder.map(oldIndex => oldDegArr[oldIndex] || 0);
            const newRotations = {};
            newDegArr.forEach((deg, i) => { if ((deg % 360) !== 0) newRotations[i + 1] = deg; });

            // 상태 업데이트
            doc.originalData = newBytes;
            doc.pdf = await pdfjsLib.getDocument({ data: newBytes }).promise;
            doc.pages = doc.pdf.numPages || count;
            doc.rotations = newRotations;
            doc.dirty = true;

            // 이동 후 선택 상태 해제 (다중 이동)
            this.selectedPages.set(documentId, new Set());
            this.selectionSequences.set(documentId, []);
            this._rightClickSelection = null;

            await this.generateThumbnails(documentId);
            this.renderDocument(documentId);
            this.showNotification(`${uniqueSources.length}개의 페이지가 이동되었습니다.`, 'success');
        } catch (error) {
            console.error('여러 페이지 순서 변경 오류:', error);
            this.showNotification('여러 페이지 이동 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 문서 컨테이너 드래그 오버 처리
     */
    handleDocumentDragOver(e, documentId) {
        // 파일 드롭 존이 아닌 경우에만 처리
        if (e.target.closest('#mainDropZone')) {
            return; // 파일 드롭 존은 별도 처리
        }
        
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        // 문서 컨테이너에 오버 효과
        if (e.currentTarget.classList.contains('document-container')) {
            e.currentTarget.classList.add('drag-over');
        }

        // 인디케이터 위치 계산 (다른 문서로 드래그할 때)
        const thumbnailContainer = e.currentTarget.querySelector('.thumbnail-container');
        if (this.dropIndicator && thumbnailContainer) {
            // 인디케이터를 현재 문서 컨테이너에 추가
            if (this.dropIndicator.parentElement !== thumbnailContainer) {
                thumbnailContainer.appendChild(this.dropIndicator);
            }
            
            const children = Array.from(thumbnailContainer.querySelectorAll('.page-thumbnail'));
            const containerRect = thumbnailContainer.getBoundingClientRect();
            const scrollX = thumbnailContainer.scrollLeft || 0;
            const clientX = e.clientX;
            
            if (children.length === 0) {
                // 빈 컨테이너인 경우 중앙에 표시
                this.dropIndicator.style.display = 'block';
                this.dropIndicator.style.left = `${containerRect.width / 2}px`;
                this.dropIndicator.style.top = '8px';
                this.dropIndicator.style.bottom = '8px';
                this._lastDropDest = 1;
                return;
            }
            
            // 페이지 사이에서 정확한 위치 계산
            let snapX;
            let dest = children.length + 1;
            
            for (let idx = 0; idx < children.length; idx++) {
                const rect = children[idx].getBoundingClientRect();
                const mid = rect.left + rect.width / 2;
                if (clientX < mid) {
                    // 해당 페이지 앞 위치(왼쪽 경계)
                    snapX = Math.round(scrollX + (rect.left - containerRect.left));
                    dest = idx + 1; // 해당 페이지 앞
                    break;
                } else {
                    // 해당 페이지 뒤 위치(오른쪽 경계)
                    snapX = Math.round(scrollX + (rect.right - containerRect.left));
                    dest = idx + 2; // 해당 페이지 뒤
                }
            }
            
            // 인디케이터 표시
            this.dropIndicator.style.display = 'block';
            this.dropIndicator.style.left = snapX + 'px';
            this.dropIndicator.style.top = '8px';
            this.dropIndicator.style.bottom = '8px';
            this._lastDropDest = dest;
        }
    }

    /**
     * 문서 컨테이너 드롭 처리
     */
    async handleDocumentDrop(e, targetDocumentId) {
        // 파일 드롭 존이 아닌 경우에만 처리
        if (e.target.closest('#mainDropZone')) {
            return; // 파일 드롭 존은 별도 처리
        }
        
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        // 인디케이터 숨김
        if (this.dropIndicator) {
            this.dropIndicator.style.display = 'none';
        }
        
        try {
            const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const { sourceDocumentId, sourcePageNumber, sourcePageNumbers } = dragData;
            
            // 다른 문서로 페이지 이동
            if (sourceDocumentId !== targetDocumentId) {
                let dest = this._lastDropDest || 1;
                if (Array.isArray(sourcePageNumbers) && sourcePageNumbers.length > 1) {
                    // 다중 페이지 이동
                    await this.movePagesBetweenDocuments(sourceDocumentId, sourcePageNumbers, targetDocumentId, dest);
                } else {
                    // 단일 페이지 이동
                    await this.movePageBetweenDocuments(sourceDocumentId, sourcePageNumber, targetDocumentId, dest);
                }
            }
        } catch (error) {
            console.error('문서 드롭 처리 오류:', error);
        }
    }

    /**
     * 같은 문서 내에서 페이지 순서 변경
     */
    async reorderPageInDocument(documentId, sourcePageNumber, targetPageNumber) {
        const doc = this.documents.get(documentId);
        if (!doc || sourcePageNumber === targetPageNumber) return;
        
        try {
            this.showLoading(true);
            const pdfLib = window.PDFLib;
            const srcPdf = await this.loadPdfLibFromDoc(doc);
            const count = srcPdf.getPageCount();
            // 1-based → 0/끝 포함 위치로 변환 (끝 뒤는 count 허용)
            const srcIdx = Math.min(Math.max(1, sourcePageNumber), count) - 1;
            let destZero = Math.min(Math.max(0, targetPageNumber - 1), count); // count 허용 = 맨 뒤

            // 새로운 인덱스 순서 계산
            const indices = Array.from({ length: count }, (_, i) => i);
            const [moved] = indices.splice(srcIdx, 1);
            // 소스가 목적지보다 앞이었다면 제거로 인해 목적지가 한 칸 당겨짐 → 보정
            if (srcIdx < destZero) destZero -= 1;
            // 경계 보정
            if (destZero < 0) destZero = 0;
            if (destZero > indices.length) destZero = indices.length;
            indices.splice(destZero, 0, moved);

            // 새 PDF 구성
            const newPdf = await pdfLib.PDFDocument.create();
            const copiedPages = await newPdf.copyPages(srcPdf, indices);
            copiedPages.forEach(p => newPdf.addPage(p));
            const newBytes = await newPdf.save();

            // rotations 재매핑 (페이지 번호 기반 → 새 순서 반영)
            const oldRot = doc.rotations || {};
            const oldDegArr = Array.from({ length: count }, (_, i) => oldRot[i + 1] || 0);
            const newDegArr = indices.map(oldIndex => oldDegArr[oldIndex] || 0);
            const newRotations = {};
            newDegArr.forEach((deg, i) => { if ((deg % 360) !== 0) newRotations[i + 1] = deg; });

            // 상태 업데이트
            doc.originalData = newBytes;
            doc.pdf = await pdfjsLib.getDocument({ data: newBytes }).promise;
            doc.pages = doc.pdf.numPages || count;
            doc.rotations = newRotations;
            doc.dirty = true;
            
            // 이동 후 선택 상태 해제 (단일 이동)
            this.selectedPages.set(documentId, new Set());
            this.selectionSequences.set(documentId, []);
            this._rightClickSelection = null;

            await this.generateThumbnails(documentId);
            this.renderDocument(documentId);
            this.showNotification(`페이지 ${sourcePageNumber}번이 ${targetPageNumber}번 위치로 이동되었습니다.`, 'success');
        } catch (error) {
            console.error('페이지 순서 변경 오류:', error);
            this.showNotification('페이지 순서 변경 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 다른 문서로 페이지 복사
     */
    async copyPageToDocument(sourceDocumentId, sourcePageNumber, targetDocumentId, targetPosition) {
        const sourceDoc = this.documents.get(sourceDocumentId);
        const targetDoc = this.documents.get(targetDocumentId);
        
        if (!sourceDoc || !targetDoc) return;
        
        try {
            this.showLoading(true);
            
            // PDF-lib를 사용하여 페이지 복사 (detached 대비 안전 로드)
            const pdfLib = window.PDFLib;
            const sourcePdf = await this.loadPdfLibFromDoc(sourceDoc);
            const targetPdf = await this.loadPdfLibFromDoc(targetDoc);
            
            // 소스 페이지 복사 (삭제된 페이지 보정)
            const srcIndexZero = this.uiPageToUnderlyingZero(sourceDocumentId, sourcePageNumber);
            if (srcIndexZero == null) throw new Error('유효하지 않은 소스 페이지 번호입니다.');
            const [copiedPage] = await targetPdf.copyPages(sourcePdf, [srcIndexZero]);

            // 최종 바이트 산출
            let outBytes = null;
            if (targetPosition === null) {
                // 문서 끝에 추가
                targetPdf.addPage(copiedPage);
                outBytes = await targetPdf.save();
            } else {
                // 삽입 대상 위치 계산 (0-based, 삭제된 페이지 보정)
                const insertAtZero = this.computeInsertIndexZero(targetDocumentId, targetPosition);
                const count = targetPdf.getPageCount();
                if (insertAtZero === count) {
                    // 사실상 끝에 추가와 동일 → 단순 추가 경로로 처리
                    targetPdf.addPage(copiedPage);
                    outBytes = await targetPdf.save();
                } else {
                    // 지정된 위치에 삽입 (재빌드)
                    const indices = Array.from({ length: count }, (_, i) => i);
                    // 임시로 마지막에 추가 후 재정렬을 위해 새 문서로 복사
                    targetPdf.addPage(copiedPage);
                    const lastIndex = targetPdf.getPageCount() - 1;
                    // 새 순서: 마지막에 추가된 페이지를 insertAtZero 위치로 이동
                    indices.push(lastIndex);
                    const [moved] = indices.splice(indices.length - 1, 1);
                    indices.splice(insertAtZero, 0, moved);
                    const newPdf = await pdfLib.PDFDocument.create();
                    const copied = await newPdf.copyPages(targetPdf, indices);
                    copied.forEach(p => newPdf.addPage(p));
                    outBytes = await newPdf.save();
                }
            }

            // 문서 갱신
            targetDoc.originalData = outBytes;
            targetDoc.pdf = await pdfjsLib.getDocument({ data: outBytes }).promise;
            targetDoc.pages = targetDoc.pdf.numPages;
            targetDoc.dirty = true;
            
            // 썸네일 재생성
            await this.generateThumbnails(targetDocumentId);
            this.renderDocument(targetDocumentId);
            
            // 복사 후 선택 상태 초기화
            this.selectedPages.set(targetDocumentId, new Set());
            this.selectionSequences.set(targetDocumentId, []);
            this._rightClickSelection = null;
            
            const positionText = targetPosition ? `${targetPosition}번 위치에` : '끝에';
            this.showNotification(`페이지가 ${positionText} 복사되었습니다.`, 'success');
        } catch (error) {
            console.error('페이지 복사 오류:', error);
            this.showNotification('페이지 복사 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 같은 문서 내 여러 페이지를 한 번에 순서대로 복사 삽입 (원본 순서 유지)
     */
    async copyPagesToDocumentBulk(sourceDocumentId, sourcePageNumbers, targetDocumentId, targetPosition) {
        const sourceDoc = this.documents.get(sourceDocumentId);
        const targetDoc = this.documents.get(targetDocumentId);
        if (!sourceDoc || !targetDoc || !Array.isArray(sourcePageNumbers) || sourcePageNumbers.length === 0) return;
        try {
            this.showLoading(true);
            const pdfLib = window.PDFLib;
            const sourcePdf = await this.loadPdfLibFromDoc(sourceDoc);
            const targetPdf = await this.loadPdfLibFromDoc(targetDoc);
            
            // 0-based 삽입 위치 계산 (삭제된 페이지 보정)
            const count = targetPdf.getPageCount();
            const insertAtZero = this.computeInsertIndexZero(targetDocumentId, targetPosition);
            
            if (insertAtZero === count) {
                // 끝에 순서대로 추가
                for (const p of sourcePageNumbers) {
                    const idxZero = this.uiPageToUnderlyingZero(sourceDocumentId, p);
                    if (idxZero == null) continue;
                    const [cp] = await targetPdf.copyPages(sourcePdf, [idxZero]);
                    targetPdf.addPage(cp);
                }
                const out = await targetPdf.save();
                targetDoc.originalData = out;
                targetDoc.pdf = await pdfjsLib.getDocument({ data: out }).promise;
                targetDoc.pages = targetDoc.pdf.numPages;
                targetDoc.dirty = true;
            } else {
                // 중간 삽입: 재빌드로 정확한 위치 유지
                const indices = Array.from({ length: count }, (_, i) => i);
                // 원본 페이지들을 순서대로 임시 추가 → 마지막에 연달아 위치함
                const addedIndices = [];
                for (const p of sourcePageNumbers) {
                    const idxZero = this.uiPageToUnderlyingZero(sourceDocumentId, p);
                    if (idxZero == null) continue;
                    const [cp] = await targetPdf.copyPages(sourcePdf, [idxZero]);
                    targetPdf.addPage(cp);
                    addedIndices.push(targetPdf.getPageCount() - 1);
                }
                // 새 순서: 기존 indices에 addedIndices를 insertAtZero 위치에 순서대로 끼워넣기
                const newOrder = indices.slice(0, insertAtZero)
                    .concat(addedIndices)
                    .concat(indices.slice(insertAtZero));
                const newPdf = await pdfLib.PDFDocument.create();
                const copied = await newPdf.copyPages(targetPdf, newOrder);
                copied.forEach(p => newPdf.addPage(p));
                const out = await newPdf.save();
                targetDoc.originalData = out;
                targetDoc.pdf = await pdfjsLib.getDocument({ data: out }).promise;
                targetDoc.pages = targetDoc.pdf.numPages;
                targetDoc.dirty = true;
            }
            
            await this.generateThumbnails(targetDocumentId);
            this.renderDocument(targetDocumentId);
            
            // 복사 후 선택 상태 초기화
            this.selectedPages.set(targetDocumentId, new Set());
            this.selectionSequences.set(targetDocumentId, []);
            this._rightClickSelection = null;
            
            this.showNotification('선택한 페이지들이 순서대로 복사되었습니다.', 'success');
        } catch (err) {
            console.error('다중 페이지 복사 오류:', err);
            this.showNotification('다중 페이지 복사 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 단일 페이지를 다른 문서로 이동
     */
    async movePageBetweenDocuments(sourceDocumentId, sourcePageNumber, targetDocumentId, targetPosition) {
        const sourceDoc = this.documents.get(sourceDocumentId);
        const targetDoc = this.documents.get(targetDocumentId);
        if (!sourceDoc || !targetDoc) return;

        try {
            this.showLoading(true);
            const pdfLib = window.PDFLib;
            
            // 소스 문서에서 페이지 제거
            const sourcePdf = await this.loadPdfLibFromDoc(sourceDoc);
            const sourceCount = sourcePdf.getPageCount();
            const sourceIdx = this.uiPageToUnderlyingZero(sourceDocumentId, sourcePageNumber);
            if (sourceIdx == null) return;

            // 소스에서 페이지 제거
            const keepIndices = Array.from({ length: sourceCount }, (_, i) => i).filter(i => i !== sourceIdx);
            const newSourcePdf = await pdfLib.PDFDocument.create();
            if (keepIndices.length > 0) {
                const copiedPages = await newSourcePdf.copyPages(sourcePdf, keepIndices);
                copiedPages.forEach(page => newSourcePdf.addPage(page));
            }
            const newSourceBytes = await newSourcePdf.save();

            // 타겟 문서에 페이지 추가
            const targetPdf = await this.loadPdfLibFromDoc(targetDoc);
            const targetCount = targetPdf.getPageCount();
            const insertAtZero = this.computeInsertIndexZero(targetDocumentId, targetPosition);
            
            if (insertAtZero === targetCount) {
                // 끝에 추가
                const [copiedPage] = await targetPdf.copyPages(sourcePdf, [sourceIdx]);
                targetPdf.addPage(copiedPage);
                const newTargetBytes = await targetPdf.save();
                targetDoc.originalData = newTargetBytes;
                targetDoc.pdf = await pdfjsLib.getDocument({ data: newTargetBytes }).promise;
                targetDoc.pages = targetDoc.pdf.numPages;
                targetDoc.dirty = true;
            } else {
                // 중간에 삽입
                const targetIndices = Array.from({ length: targetCount }, (_, i) => i);
                const newTargetPdf = await pdfLib.PDFDocument.create();
                
                // 삽입 위치 이전 페이지들 복사
                if (insertAtZero > 0) {
                    const beforePages = await newTargetPdf.copyPages(targetPdf, targetIndices.slice(0, insertAtZero));
                    beforePages.forEach(page => newTargetPdf.addPage(page));
                }
                
                // 새 페이지 추가 (새 PDF에서 복사)
                const [copiedPage] = await newTargetPdf.copyPages(sourcePdf, [sourceIdx]);
                newTargetPdf.addPage(copiedPage);
                
                // 삽입 위치 이후 페이지들 복사
                if (insertAtZero < targetCount) {
                    const afterPages = await newTargetPdf.copyPages(targetPdf, targetIndices.slice(insertAtZero));
                    afterPages.forEach(page => newTargetPdf.addPage(page));
                }
                
                const newTargetBytes = await newTargetPdf.save();
                targetDoc.originalData = newTargetBytes;
                targetDoc.pdf = await pdfjsLib.getDocument({ data: newTargetBytes }).promise;
                targetDoc.pages = targetDoc.pdf.numPages;
                targetDoc.dirty = true;
            }

            // 소스 문서 업데이트
            sourceDoc.originalData = newSourceBytes;
            sourceDoc.pdf = await pdfjsLib.getDocument({ data: newSourceBytes }).promise;
            sourceDoc.pages = sourceDoc.pdf.numPages;
            sourceDoc.dirty = true;

            // 썸네일 재생성
            await this.generateThumbnails(sourceDocumentId);
            await this.generateThumbnails(targetDocumentId);
            this.renderDocument(sourceDocumentId);
            this.renderDocument(targetDocumentId);

            // 선택 상태 초기화
            this.selectedPages.set(sourceDocumentId, new Set());
            this.selectedPages.set(targetDocumentId, new Set());
            this.selectionSequences.set(sourceDocumentId, []);
            this.selectionSequences.set(targetDocumentId, []);
            this._rightClickSelection = null;

            const sourceName = sourceDoc.name;
            const targetName = targetDoc.name;
            this.showNotification(`페이지가 "${sourceName}"에서 "${targetName}"으로 이동되었습니다.`, 'success');
        } catch (error) {
            console.error('문서 간 페이지 이동 오류:', error);
            this.showNotification('페이지 이동 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 여러 페이지를 다른 문서로 이동
     */
    async movePagesBetweenDocuments(sourceDocumentId, sourcePageNumbers, targetDocumentId, targetPosition) {
        const sourceDoc = this.documents.get(sourceDocumentId);
        const targetDoc = this.documents.get(targetDocumentId);
        if (!sourceDoc || !targetDoc || !Array.isArray(sourcePageNumbers) || sourcePageNumbers.length === 0) return;

        try {
            this.showLoading(true);
            const pdfLib = window.PDFLib;
            
            // 소스 문서에서 페이지들 제거
            const sourcePdf = await this.loadPdfLibFromDoc(sourceDoc);
            const sourceCount = sourcePdf.getPageCount();
            const sourceIndices = sourcePageNumbers.map(p => this.uiPageToUnderlyingZero(sourceDocumentId, p)).filter(i => i != null);
            if (sourceIndices.length === 0) return;

            // 소스에서 페이지들 제거
            const keepIndices = Array.from({ length: sourceCount }, (_, i) => i).filter(i => !sourceIndices.includes(i));
            const newSourcePdf = await pdfLib.PDFDocument.create();
            if (keepIndices.length > 0) {
                const copiedPages = await newSourcePdf.copyPages(sourcePdf, keepIndices);
                copiedPages.forEach(page => newSourcePdf.addPage(page));
            }
            const newSourceBytes = await newSourcePdf.save();

            // 타겟 문서에 페이지들 추가
            const targetPdf = await this.loadPdfLibFromDoc(targetDoc);
            const targetCount = targetPdf.getPageCount();
            const insertAtZero = this.computeInsertIndexZero(targetDocumentId, targetPosition);
            
            if (insertAtZero === targetCount) {
                // 끝에 추가
                const copiedPages = await targetPdf.copyPages(sourcePdf, sourceIndices);
                copiedPages.forEach(page => targetPdf.addPage(page));
                const newTargetBytes = await targetPdf.save();
                targetDoc.originalData = newTargetBytes;
                targetDoc.pdf = await pdfjsLib.getDocument({ data: newTargetBytes }).promise;
                targetDoc.pages = targetDoc.pdf.numPages;
                targetDoc.dirty = true;
            } else {
                // 중간에 삽입
                const targetIndices = Array.from({ length: targetCount }, (_, i) => i);
                const newTargetPdf = await pdfLib.PDFDocument.create();
                
                // 삽입 위치 이전 페이지들 복사
                if (insertAtZero > 0) {
                    const beforePages = await newTargetPdf.copyPages(targetPdf, targetIndices.slice(0, insertAtZero));
                    beforePages.forEach(page => newTargetPdf.addPage(page));
                }
                
                // 새 페이지들 추가 (새 PDF에서 복사)
                const copiedPages = await newTargetPdf.copyPages(sourcePdf, sourceIndices);
                copiedPages.forEach(page => newTargetPdf.addPage(page));
                
                // 삽입 위치 이후 페이지들 복사
                if (insertAtZero < targetCount) {
                    const afterPages = await newTargetPdf.copyPages(targetPdf, targetIndices.slice(insertAtZero));
                    afterPages.forEach(page => newTargetPdf.addPage(page));
                }
                
                const newTargetBytes = await newTargetPdf.save();
                targetDoc.originalData = newTargetBytes;
                targetDoc.pdf = await pdfjsLib.getDocument({ data: newTargetBytes }).promise;
                targetDoc.pages = targetDoc.pdf.numPages;
                targetDoc.dirty = true;
            }

            // 소스 문서 업데이트
            sourceDoc.originalData = newSourceBytes;
            sourceDoc.pdf = await pdfjsLib.getDocument({ data: newSourceBytes }).promise;
            sourceDoc.pages = sourceDoc.pdf.numPages;
            sourceDoc.dirty = true;

            // 썸네일 재생성
            await this.generateThumbnails(sourceDocumentId);
            await this.generateThumbnails(targetDocumentId);
            this.renderDocument(sourceDocumentId);
            this.renderDocument(targetDocumentId);

            // 선택 상태 초기화
            this.selectedPages.set(sourceDocumentId, new Set());
            this.selectedPages.set(targetDocumentId, new Set());
            this.selectionSequences.set(sourceDocumentId, []);
            this.selectionSequences.set(targetDocumentId, []);
            this._rightClickSelection = null;

            const sourceName = sourceDoc.name;
            const targetName = targetDoc.name;
            this.showNotification(`${sourcePageNumbers.length}개 페이지가 "${sourceName}"에서 "${targetName}"으로 이동되었습니다.`, 'success');
        } catch (error) {
            console.error('문서 간 다중 페이지 이동 오류:', error);
            this.showNotification('페이지 이동 중 오류가 발생했습니다.', 'error');
        } finally {
            this.showLoading(false);
        }
    }
}

// 애플리케이션 초기화
document.addEventListener('DOMContentLoaded', () => {
    // DOM이 완전히 로드된 후 약간의 지연을 두고 초기화
    setTimeout(() => {
        try {
            window.pdfEditorApp = new PDFEditorApp();
            console.log('PDF 편집기 애플리케이션이 성공적으로 초기화되었습니다.');
        } catch (error) {
            console.error('PDF 편집기 초기화 오류:', error);
        }
    }, 100);
});