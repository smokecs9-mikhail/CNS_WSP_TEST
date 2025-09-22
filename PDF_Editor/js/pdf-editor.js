/**
 * PDF 편집 모듈
 * PDF 페이지 삭제, 추출, 다운로드 등의 편집 기능을 제공합니다.
 */

class PDFEditor {
    constructor() {
        this.pdfLib = window.PDFLib;
    }

    /**
     * 선택된 페이지들을 삭제합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @param {Array<number>} pageNumbers - 삭제할 페이지 번호 배열 (1부터 시작)
     * @param {ArrayBuffer} originalData - 원본 PDF 데이터 (선택사항)
     * @returns {Promise<Uint8Array>} 수정된 PDF의 바이트 배열
     */
    async deletePages(pdfDoc, pageNumbers, originalData = null) {
        try {
            // PDF.js 문서를 PDF-lib 문서로 변환 (originalData 우선 사용)
            const pdfBytes = await this.convertPdfJsToPdfLib(pdfDoc, originalData);
            const pdfDocLib = await this.pdfLib.PDFDocument.load(pdfBytes);
            
            // 페이지 번호를 0부터 시작하는 인덱스로 변환
            const pageIndices = pageNumbers.map(num => num - 1).sort((a, b) => b - a);
            
            // 페이지 삭제 (뒤에서부터 삭제하여 인덱스 변화 방지)
            for (const pageIndex of pageIndices) {
                if (pageIndex >= 0 && pageIndex < pdfDocLib.getPageCount()) {
                    pdfDocLib.removePage(pageIndex);
                }
            }
            
            // 수정된 PDF를 바이트 배열로 변환
            const modifiedPdfBytes = await pdfDocLib.save();
            
            console.log(`${pageNumbers.length}개 페이지가 삭제되었습니다.`);
            return modifiedPdfBytes;
            
        } catch (error) {
            console.error('페이지 삭제 오류:', error);
            throw new Error('페이지 삭제 중 오류가 발생했습니다.');
        }
    }

    /**
     * 선택된 페이지들을 추출하여 새로운 PDF를 생성합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @param {Array<number>} pageNumbers - 추출할 페이지 번호 배열 (1부터 시작)
     * @param {ArrayBuffer} originalData - 원본 PDF 데이터 (선택사항)
     * @returns {Promise<Uint8Array>} 추출된 페이지들의 PDF 바이트 배열
     */
    async extractPages(pdfDoc, pageNumbers, originalData = null) {
        try {
            // PDF.js 문서를 PDF-lib 문서로 변환 (originalData 우선 사용)
            const pdfBytes = await this.convertPdfJsToPdfLib(pdfDoc, originalData);
            const sourcePdf = await this.pdfLib.PDFDocument.load(pdfBytes);
            
            // 새로운 PDF 문서 생성
            const newPdf = await this.pdfLib.PDFDocument.create();
            
            // 선택된 페이지들을 새 PDF에 복사
            const pageIndices = pageNumbers.map(num => num - 1).sort((a, b) => a - b);
            const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
            
            // 페이지들을 새 PDF에 추가
            for (const page of copiedPages) {
                newPdf.addPage(page);
            }
            
            // 추출된 PDF를 바이트 배열로 변환
            const extractedPdfBytes = await newPdf.save();
            
            console.log(`${pageNumbers.length}개 페이지가 추출되었습니다.`);
            return extractedPdfBytes;
            
        } catch (error) {
            console.error('페이지 추출 오류:', error);
            throw new Error('페이지 추출 중 오류가 발생했습니다.');
        }
    }

    /**
     * PDF를 다운로드합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @param {string} filename - 다운로드할 파일명 (기본값: 'edited.pdf')
     * @param {ArrayBuffer} originalData - 원본 PDF 데이터 (선택사항)
     * @returns {Promise<void>}
     */
    async downloadPdf(pdfDoc, filename = 'edited.pdf', originalData = null) {
        try {
            // PDF.js 문서를 PDF-lib 문서로 변환 (originalData 우선 사용)
            const pdfBytes = await this.convertPdfJsToPdfLib(pdfDoc, originalData);
            
            // Blob 생성 및 다운로드
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 메모리 정리
            URL.revokeObjectURL(url);
            
            console.log(`PDF가 다운로드되었습니다: ${filename}`);
            
        } catch (error) {
            console.error('PDF 다운로드 오류:', error);
            throw new Error('PDF 다운로드 중 오류가 발생했습니다.');
        }
    }

    /**
     * 수정된 PDF를 다운로드합니다.
     * @param {Uint8Array} pdfBytes - PDF 바이트 배열
     * @param {string} filename - 다운로드할 파일명
     * @returns {Promise<void>}
     */
    async downloadModifiedPdf(pdfBytes, filename = 'modified.pdf') {
        try {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            console.log(`수정된 PDF가 다운로드되었습니다: ${filename}`);
            
        } catch (error) {
            console.error('수정된 PDF 다운로드 오류:', error);
            throw new Error('수정된 PDF 다운로드 중 오류가 발생했습니다.');
        }
    }


    /**
     * PDF.js 문서를 PDF-lib 문서로 변환합니다 (byte-preserving 방식).
     * @param {Object} pdfJsDoc - PDF.js 문서 객체
     * @param {ArrayBuffer} originalData - 원본 PDF 데이터 (선택사항)
     * @returns {Promise<Uint8Array>} PDF 바이트 배열
     */
    async convertPdfJsToPdfLib(pdfJsDoc, originalData = null) {
        try {
            // 원본 데이터가 있고 유효한 경우 우선 사용 (byte-preserving)
            if (originalData && !this.isArrayBufferDetached(originalData)) {
                try {
                    // 원본 바이트 데이터를 직접 반환하여 벡터/텍스트 데이터 보존
                    console.log('원본 PDF 데이터 사용 (byte-preserving)');
                    return new Uint8Array(originalData);
                } catch (error) {
                    console.warn('원본 데이터 사용 실패, pdf-lib로 재생성:', error);
                }
            }
            
            // 원본 데이터가 없거나 사용할 수 없는 경우 pdf-lib로 재생성
            // 이 경우에도 이미지 변환보다는 원본 구조를 최대한 보존
            try {
                // PDF.js에서 원본 바이트 데이터 추출 시도
                const loadingTask = pdfJsDoc.loadingTask;
                if (loadingTask && loadingTask.source && loadingTask.source.data) {
                    console.log('PDF.js 원본 데이터 사용');
                    return new Uint8Array(loadingTask.source.data);
                }
            } catch (error) {
                console.warn('PDF.js 원본 데이터 추출 실패:', error);
            }
            
            // 최후의 수단: 이미지 변환 (파일 크기 증가 및 품질 저하)
            console.warn('이미지 변환 모드 사용 - 파일 크기가 증가할 수 있습니다');
            const newPdf = await this.pdfLib.PDFDocument.create();
            
            for (let i = 1; i <= pdfJsDoc.numPages; i++) {
                const page = await pdfJsDoc.getPage(i);
                const viewport = page.getViewport({ scale: 1.0 });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;
                
                const imageData = canvas.toDataURL('image/png');
                const image = await newPdf.embedPng(imageData);
                const newPage = newPdf.addPage([viewport.width, viewport.height]);
                newPage.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: viewport.width,
                    height: viewport.height,
                });
            }
            
            return await newPdf.save();
            
        } catch (error) {
            console.error('PDF 변환 오류:', error);
            throw new Error('PDF 변환 중 오류가 발생했습니다.');
        }
    }

    /**
     * ArrayBuffer가 detached 상태인지 확인합니다.
     * @param {ArrayBuffer} buffer - 확인할 ArrayBuffer
     * @returns {boolean} detached 상태 여부
     */
    isArrayBufferDetached(buffer) {
        try {
            // ArrayBuffer의 byteLength에 접근해보고 오류가 발생하면 detached 상태
            const length = buffer.byteLength;
            return false;
        } catch (error) {
            return true;
        }
    }

    /**
     * PDF 페이지를 이미지로 변환합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @param {number} pageNumber - 변환할 페이지 번호 (1부터 시작)
     * @param {number} scale - 변환 스케일 (기본값: 2.0)
     * @returns {Promise<string>} 이미지 데이터 URL
     */
    async pageToImage(pdfDoc, pageNumber, scale = 2.0) {
        try {
            const page = await pdfDoc.getPage(pageNumber);
            const viewport = page.getViewport({ scale: scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            return canvas.toDataURL('image/png');
            
        } catch (error) {
            console.error('페이지 이미지 변환 오류:', error);
            throw new Error('페이지를 이미지로 변환할 수 없습니다.');
        }
    }

    /**
     * PDF의 모든 페이지를 이미지로 변환합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @param {number} scale - 변환 스케일 (기본값: 1.0)
     * @returns {Promise<Array<string>>} 이미지 데이터 URL 배열
     */
    async allPagesToImages(pdfDoc, scale = 1.0) {
        const images = [];
        
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            try {
                const imageData = await this.pageToImage(pdfDoc, i, scale);
                images.push(imageData);
            } catch (error) {
                console.error(`페이지 ${i} 이미지 변환 실패:`, error);
                images.push(null);
            }
        }
        
        return images;
    }

    /**
     * PDF 정보를 가져옵니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @returns {Object} PDF 정보
     */
    getPdfInfo(pdfDoc) {
        return {
            pageCount: pdfDoc.numPages,
            fingerprint: pdfDoc.fingerprints?.[0] || 'unknown',
            isEncrypted: pdfDoc.isEncrypted || false,
            loadingTask: pdfDoc.loadingTask
        };
    }

    /**
     * PDF가 유효한지 확인합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @returns {boolean} PDF 유효성
     */
    isValidPdf(pdfDoc) {
        return pdfDoc && 
               typeof pdfDoc.numPages === 'number' && 
               pdfDoc.numPages > 0 &&
               !pdfDoc.isEncrypted;
    }

    /**
     * 페이지 번호 배열이 유효한지 확인합니다.
     * @param {Array<number>} pageNumbers - 페이지 번호 배열
     * @param {number} totalPages - 전체 페이지 수
     * @returns {boolean} 페이지 번호 유효성
     */
    isValidPageNumbers(pageNumbers, totalPages) {
        if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) {
            return false;
        }
        
        return pageNumbers.every(num => 
            Number.isInteger(num) && 
            num >= 1 && 
            num <= totalPages
        );
    }

    /**
     * 파일명에서 확장자를 제거합니다.
     * @param {string} filename - 파일명
     * @returns {string} 확장자가 제거된 파일명
     */
    removeFileExtension(filename) {
        return filename.replace(/\.[^/.]+$/, '');
    }

    /**
     * 안전한 파일명을 생성합니다.
     * @param {string} filename - 원본 파일명
     * @param {string} suffix - 접미사
     * @returns {string} 안전한 파일명
     */
    createSafeFilename(filename, suffix = '') {
        const baseName = this.removeFileExtension(filename);
        const safeName = baseName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        
        return `${safeName}${suffix ? '_' + suffix : ''}_${timestamp}.pdf`;
    }
}

// 전역 PDF 편집기 인스턴스 생성
window.pdfEditor = new PDFEditor();

