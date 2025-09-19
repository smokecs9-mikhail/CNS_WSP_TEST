/**
 * PDF 뷰어 모듈
 * PDF 파일을 화면에 표시하고 페이지 네비게이션을 관리합니다.
 */

class PDFViewer {
    constructor() {
        this.currentPdf = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.renderTask = null;
    }

    /**
     * PDF 문서를 로드합니다.
     * @param {ArrayBuffer} arrayBuffer - PDF 파일의 ArrayBuffer
     * @returns {Promise<Object>} PDF 문서 객체
     */
    async loadPdf(arrayBuffer) {
        try {
            this.currentPdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            this.totalPages = this.currentPdf.numPages;
            this.currentPage = 1;
            this.scale = 1.0;
            
            console.log(`PDF 로드 완료: ${this.totalPages}페이지`);
            return this.currentPdf;
        } catch (error) {
            console.error('PDF 로드 오류:', error);
            throw new Error('PDF 파일을 로드할 수 없습니다.');
        }
    }

    /**
     * 특정 페이지를 렌더링합니다.
     * @param {number} pageNumber - 렌더링할 페이지 번호 (1부터 시작)
     * @param {HTMLCanvasElement} canvas - 렌더링할 캔버스 요소
     * @param {number} scale - 확대/축소 비율
     * @returns {Promise<void>}
     */
    async renderPage(pageNumber, canvas, scale = this.scale) {
        if (!this.currentPdf) {
            throw new Error('PDF가 로드되지 않았습니다.');
        }

        if (pageNumber < 1 || pageNumber > this.totalPages) {
            throw new Error('유효하지 않은 페이지 번호입니다.');
        }

        try {
            // 이전 렌더링 작업 취소
            if (this.renderTask) {
                this.renderTask.cancel();
            }

            const page = await this.currentPdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: scale });
            
            // 캔버스 크기 설정
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // 렌더링 컨텍스트 설정
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            // 페이지 렌더링
            this.renderTask = page.render(renderContext);
            await this.renderTask.promise;
            
            this.currentPage = pageNumber;
            this.scale = scale;
            
        } catch (error) {
            if (error.name !== 'RenderingCancelledException') {
                console.error('페이지 렌더링 오류:', error);
                throw new Error('페이지를 렌더링할 수 없습니다.');
            }
        }
    }

    /**
     * 페이지 썸네일을 생성합니다.
     * @param {number} pageNumber - 썸네일을 생성할 페이지 번호
     * @param {number} thumbnailScale - 썸네일 크기 비율 (기본값: 0.2)
     * @returns {Promise<HTMLCanvasElement>} 썸네일 캔버스
     */
    async createThumbnail(pageNumber, thumbnailScale = 0.2) {
        if (!this.currentPdf) {
            throw new Error('PDF가 로드되지 않았습니다.');
        }

        try {
            const page = await this.currentPdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: thumbnailScale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            return canvas;
        } catch (error) {
            console.error(`페이지 ${pageNumber} 썸네일 생성 오류:`, error);
            throw new Error('썸네일을 생성할 수 없습니다.');
        }
    }

    /**
     * 모든 페이지의 썸네일을 생성합니다.
     * @param {number} thumbnailScale - 썸네일 크기 비율
     * @returns {Promise<HTMLCanvasElement[]>} 썸네일 캔버스 배열
     */
    async createAllThumbnails(thumbnailScale = 0.2) {
        if (!this.currentPdf) {
            throw new Error('PDF가 로드되지 않았습니다.');
        }

        const thumbnails = [];
        
        for (let i = 1; i <= this.totalPages; i++) {
            try {
                const thumbnail = await this.createThumbnail(i, thumbnailScale);
                thumbnails.push(thumbnail);
            } catch (error) {
                console.error(`페이지 ${i} 썸네일 생성 실패:`, error);
                // 빈 캔버스로 대체
                const emptyCanvas = document.createElement('canvas');
                emptyCanvas.width = 100;
                emptyCanvas.height = 100;
                const ctx = emptyCanvas.getContext('2d');
                ctx.fillStyle = '#f3f4f6';
                ctx.fillRect(0, 0, 100, 100);
                ctx.fillStyle = '#6b7280';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('오류', 50, 50);
                thumbnails.push(emptyCanvas);
            }
        }
        
        return thumbnails;
    }

    /**
     * PDF 메타데이터를 가져옵니다.
     * @returns {Promise<Object>} PDF 메타데이터
     */
    async getMetadata() {
        if (!this.currentPdf) {
            throw new Error('PDF가 로드되지 않았습니다.');
        }

        try {
            const metadata = await this.currentPdf.getMetadata();
            return {
                title: metadata.info?.Title || '제목 없음',
                author: metadata.info?.Author || '작성자 없음',
                subject: metadata.info?.Subject || '',
                creator: metadata.info?.Creator || '',
                producer: metadata.info?.Producer || '',
                creationDate: metadata.info?.CreationDate || '',
                modificationDate: metadata.info?.ModDate || '',
                pageCount: this.totalPages
            };
        } catch (error) {
            console.error('메타데이터 가져오기 오류:', error);
            return {
                title: '제목 없음',
                author: '작성자 없음',
                subject: '',
                creator: '',
                producer: '',
                creationDate: '',
                modificationDate: '',
                pageCount: this.totalPages
            };
        }
    }

    /**
     * PDF 텍스트 내용을 추출합니다.
     * @param {number} pageNumber - 텍스트를 추출할 페이지 번호
     * @returns {Promise<string>} 추출된 텍스트
     */
    async extractText(pageNumber) {
        if (!this.currentPdf) {
            throw new Error('PDF가 로드되지 않았습니다.');
        }

        try {
            const page = await this.currentPdf.getPage(pageNumber);
            const textContent = await page.getTextContent();
            
            return textContent.items
                .map(item => item.str)
                .join(' ');
        } catch (error) {
            console.error(`페이지 ${pageNumber} 텍스트 추출 오류:`, error);
            throw new Error('텍스트를 추출할 수 없습니다.');
        }
    }

    /**
     * 모든 페이지의 텍스트를 추출합니다.
     * @returns {Promise<string[]>} 각 페이지의 텍스트 배열
     */
    async extractAllText() {
        if (!this.currentPdf) {
            throw new Error('PDF가 로드되지 않았습니다.');
        }

        const allText = [];
        
        for (let i = 1; i <= this.totalPages; i++) {
            try {
                const text = await this.extractText(i);
                allText.push(text);
            } catch (error) {
                console.error(`페이지 ${i} 텍스트 추출 실패:`, error);
                allText.push('');
            }
        }
        
        return allText;
    }

    /**
     * 현재 페이지 번호를 반환합니다.
     * @returns {number} 현재 페이지 번호
     */
    getCurrentPage() {
        return this.currentPage;
    }

    /**
     * 전체 페이지 수를 반환합니다.
     * @returns {number} 전체 페이지 수
     */
    getTotalPages() {
        return this.totalPages;
    }

    /**
     * 현재 확대/축소 비율을 반환합니다.
     * @returns {number} 현재 확대/축소 비율
     */
    getScale() {
        return this.scale;
    }

    /**
     * PDF 문서 객체를 반환합니다.
     * @returns {Object|null} PDF 문서 객체
     */
    getPdf() {
        return this.currentPdf;
    }

    /**
     * 뷰어를 초기화합니다.
     */
    reset() {
        this.currentPdf = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        
        if (this.renderTask) {
            this.renderTask.cancel();
            this.renderTask = null;
        }
    }

    /**
     * 특정 페이지가 존재하는지 확인합니다.
     * @param {number} pageNumber - 확인할 페이지 번호
     * @returns {boolean} 페이지 존재 여부
     */
    hasPage(pageNumber) {
        return this.currentPdf && pageNumber >= 1 && pageNumber <= this.totalPages;
    }

    /**
     * PDF 파일 크기를 가져옵니다.
     * @returns {number} PDF 파일 크기 (바이트)
     */
    getFileSize() {
        if (!this.currentPdf) {
            return 0;
        }
        
        // PDF.js에서는 직접적인 파일 크기 정보를 제공하지 않으므로
        // 원본 ArrayBuffer 크기를 별도로 저장해야 함
        return this.currentPdf._transport?.stream?.length || 0;
    }
}

// 전역 PDF 뷰어 인스턴스 생성
window.pdfViewer = new PDFViewer();
