/**
 * PDF 병합 모듈
 * 여러 PDF 파일을 하나로 병합하는 기능을 제공합니다.
 */

class PDFMerger {
    constructor() {
        this.pdfLib = window.PDFLib;
    }

    /**
     * 여러 PDF 파일을 병합합니다.
     * @param {Object} mainPdf - 메인 PDF 문서 객체 (PDF.js)
     * @param {Array<Object>} additionalPdfs - 추가 PDF 파일 배열
     * @returns {Promise<Uint8Array>} 병합된 PDF의 바이트 배열
     */
    async mergePdfs(mainPdf, additionalPdfs) {
        try {
            if (!mainPdf) {
                throw new Error('메인 PDF가 필요합니다.');
            }

            if (!additionalPdfs || additionalPdfs.length === 0) {
                throw new Error('병합할 추가 PDF 파일이 필요합니다.');
            }

            // 메인 PDF를 PDF-lib 문서로 변환
            const mainPdfBytes = await this.convertPdfJsToPdfLib(mainPdf);
            const mergedPdf = await this.pdfLib.PDFDocument.load(mainPdfBytes);

            // 추가 PDF들을 순차적으로 병합
            for (const additionalPdf of additionalPdfs) {
                try {
                    const additionalPdfBytes = await this.convertPdfJsToPdfLib(additionalPdf.pdf);
                    const additionalPdfDoc = await this.pdfLib.PDFDocument.load(additionalPdfBytes);
                    
                    // 모든 페이지를 메인 PDF에 복사
                    const pageIndices = Array.from({ length: additionalPdfDoc.getPageCount() }, (_, i) => i);
                    const copiedPages = await mergedPdf.copyPages(additionalPdfDoc, pageIndices);
                    
                    // 페이지들을 메인 PDF에 추가
                    for (const page of copiedPages) {
                        mergedPdf.addPage(page);
                    }
                    
                    console.log(`${additionalPdf.name}: ${additionalPdf.pages}페이지 병합 완료`);
                    
                } catch (error) {
                    console.error(`${additionalPdf.name} 병합 오류:`, error);
                    // 개별 PDF 병합 실패 시에도 계속 진행
                }
            }

            // 병합된 PDF를 바이트 배열로 변환
            const mergedPdfBytes = await mergedPdf.save();
            
            console.log('PDF 병합이 완료되었습니다.');
            return mergedPdfBytes;
            
        } catch (error) {
            console.error('PDF 병합 오류:', error);
            throw new Error('PDF 병합 중 오류가 발생했습니다.');
        }
    }

    /**
     * PDF 배열을 병합합니다.
     * @param {Array<Object>} pdfArray - PDF 객체 배열
     * @returns {Promise<Uint8Array>} 병합된 PDF의 바이트 배열
     */
    async mergePdfArray(pdfArray) {
        try {
            if (!pdfArray || pdfArray.length === 0) {
                throw new Error('병합할 PDF 파일이 없습니다.');
            }

            if (pdfArray.length === 1) {
                // PDF가 하나인 경우 그대로 반환
                return await this.convertPdfJsToPdfLib(pdfArray[0]);
            }

            // 첫 번째 PDF를 기준으로 시작
            const firstPdfBytes = await this.convertPdfJsToPdfLib(pdfArray[0]);
            const mergedPdf = await this.pdfLib.PDFDocument.load(firstPdfBytes);

            // 나머지 PDF들을 순차적으로 병합
            for (let i = 1; i < pdfArray.length; i++) {
                try {
                    const pdfBytes = await this.convertPdfJsToPdfLib(pdfArray[i]);
                    const pdfDoc = await this.pdfLib.PDFDocument.load(pdfBytes);
                    
                    const pageIndices = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);
                    const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
                    
                    for (const page of copiedPages) {
                        mergedPdf.addPage(page);
                    }
                    
                } catch (error) {
                    console.error(`PDF ${i + 1} 병합 오류:`, error);
                }
            }

            return await mergedPdf.save();
            
        } catch (error) {
            console.error('PDF 배열 병합 오류:', error);
            throw new Error('PDF 배열 병합 중 오류가 발생했습니다.');
        }
    }

    /**
     * PDF를 특정 위치에 삽입합니다.
     * @param {Object} mainPdf - 메인 PDF 문서 객체
     * @param {Object} insertPdf - 삽입할 PDF 문서 객체
     * @param {number} insertPosition - 삽입할 위치 (0부터 시작)
     * @returns {Promise<Uint8Array>} 수정된 PDF의 바이트 배열
     */
    async insertPdfAtPosition(mainPdf, insertPdf, insertPosition) {
        try {
            const mainPdfBytes = await this.convertPdfJsToPdfLib(mainPdf);
            const mainPdfDoc = await this.pdfLib.PDFDocument.load(mainPdfBytes);
            
            const insertPdfBytes = await this.convertPdfJsToPdfLib(insertPdf);
            const insertPdfDoc = await this.pdfLib.PDFDocument.load(insertPdfBytes);
            
            // 삽입할 페이지들 복사
            const pageIndices = Array.from({ length: insertPdfDoc.getPageCount() }, (_, i) => i);
            const copiedPages = await mainPdfDoc.copyPages(insertPdfDoc, pageIndices);
            
            // 지정된 위치에 페이지들 삽입
            for (let i = 0; i < copiedPages.length; i++) {
                mainPdfDoc.insertPage(insertPosition + i, copiedPages[i]);
            }
            
            return await mainPdfDoc.save();
            
        } catch (error) {
            console.error('PDF 삽입 오류:', error);
            throw new Error('PDF 삽입 중 오류가 발생했습니다.');
        }
    }

    /**
     * PDF를 페이지별로 분할합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @returns {Promise<Array<Uint8Array>>} 분할된 PDF들의 바이트 배열 배열
     */
    async splitPdf(pdfDoc) {
        try {
            const pdfBytes = await this.convertPdfJsToPdfLib(pdfDoc);
            const sourcePdf = await this.pdfLib.PDFDocument.load(pdfBytes);
            const pageCount = sourcePdf.getPageCount();
            
            const splitPdfs = [];
            
            for (let i = 0; i < pageCount; i++) {
                const newPdf = await this.pdfLib.PDFDocument.create();
                const [copiedPage] = await newPdf.copyPages(sourcePdf, [i]);
                newPdf.addPage(copiedPage);
                
                const splitPdfBytes = await newPdf.save();
                splitPdfs.push(splitPdfBytes);
            }
            
            console.log(`PDF가 ${pageCount}개 페이지로 분할되었습니다.`);
            return splitPdfs;
            
        } catch (error) {
            console.error('PDF 분할 오류:', error);
            throw new Error('PDF 분할 중 오류가 발생했습니다.');
        }
    }

    /**
     * PDF.js 문서를 PDF-lib 문서로 변환합니다.
     * @param {Object} pdfJsDoc - PDF.js 문서 객체
     * @param {ArrayBuffer} originalData - 원본 PDF 데이터 (선택사항)
     * @returns {Promise<Uint8Array>} PDF 바이트 배열
     */
    async convertPdfJsToPdfLib(pdfJsDoc, originalData = null) {
        try {
            // 원본 데이터가 있고 유효한 경우에만 사용
            if (originalData && !this.isArrayBufferDetached(originalData)) {
                try {
                    return new Uint8Array(originalData);
                } catch (error) {
                    console.warn('원본 데이터 사용 실패, 이미지 변환으로 대체:', error);
                }
            }
            
            // 이미지로 변환하여 새 PDF 생성
            const newPdf = await this.pdfLib.PDFDocument.create();
            
            // 모든 페이지를 새 PDF에 복사
            for (let i = 1; i <= pdfJsDoc.numPages; i++) {
                const page = await pdfJsDoc.getPage(i);
                const viewport = page.getViewport({ scale: 1.0 });
                
                // 캔버스에 페이지 렌더링
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;
                
                // 캔버스를 이미지로 변환하여 PDF에 추가
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
     * 병합된 PDF를 다운로드합니다.
     * @param {Uint8Array} pdfBytes - PDF 바이트 배열
     * @param {string} filename - 다운로드할 파일명
     * @returns {Promise<void>}
     */
    async downloadMergedPdf(pdfBytes, filename = 'merged.pdf') {
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
            
            console.log(`병합된 PDF가 다운로드되었습니다: ${filename}`);
            
        } catch (error) {
            console.error('병합된 PDF 다운로드 오류:', error);
            throw new Error('병합된 PDF 다운로드 중 오류가 발생했습니다.');
        }
    }

    /**
     * PDF 병합 정보를 가져옵니다.
     * @param {Array<Object>} pdfArray - PDF 배열
     * @returns {Object} 병합 정보
     */
    getMergeInfo(pdfArray) {
        const totalPages = pdfArray.reduce((sum, pdf) => sum + pdf.pages, 0);
        const fileCount = pdfArray.length;
        
        return {
            fileCount,
            totalPages,
            fileNames: pdfArray.map(pdf => pdf.name),
            pageCounts: pdfArray.map(pdf => pdf.pages)
        };
    }

    /**
     * PDF 병합 순서를 변경합니다.
     * @param {Array<Object>} pdfArray - PDF 배열
     * @param {Array<number>} newOrder - 새로운 순서 (인덱스 배열)
     * @returns {Array<Object>} 재정렬된 PDF 배열
     */
    reorderPdfs(pdfArray, newOrder) {
        if (newOrder.length !== pdfArray.length) {
            throw new Error('순서 배열의 길이가 PDF 배열의 길이와 일치하지 않습니다.');
        }
        
        return newOrder.map(index => pdfArray[index]);
    }

    /**
     * PDF 병합 진행 상황을 추적합니다.
     * @param {Array<Object>} pdfArray - PDF 배열
     * @param {Function} progressCallback - 진행 상황 콜백 함수
     * @returns {Promise<Uint8Array>} 병합된 PDF의 바이트 배열
     */
    async mergePdfsWithProgress(pdfArray, progressCallback) {
        try {
            if (!pdfArray || pdfArray.length === 0) {
                throw new Error('병합할 PDF 파일이 없습니다.');
            }

            const firstPdfBytes = await this.convertPdfJsToPdfLib(pdfArray[0]);
            const mergedPdf = await this.pdfLib.PDFDocument.load(firstPdfBytes);
            
            progressCallback(1, pdfArray.length, '첫 번째 PDF 로드 완료');

            for (let i = 1; i < pdfArray.length; i++) {
                try {
                    const pdfBytes = await this.convertPdfJsToPdfLib(pdfArray[i]);
                    const pdfDoc = await this.pdfLib.PDFDocument.load(pdfBytes);
                    
                    const pageIndices = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);
                    const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
                    
                    for (const page of copiedPages) {
                        mergedPdf.addPage(page);
                    }
                    
                    progressCallback(i + 1, pdfArray.length, `${pdfArray[i].name} 병합 완료`);
                    
                } catch (error) {
                    console.error(`PDF ${i + 1} 병합 오류:`, error);
                    progressCallback(i + 1, pdfArray.length, `${pdfArray[i].name} 병합 실패`);
                }
            }

            return await mergedPdf.save();
            
        } catch (error) {
            console.error('진행 상황 추적 PDF 병합 오류:', error);
            throw new Error('PDF 병합 중 오류가 발생했습니다.');
        }
    }
}

// 전역 PDF 병합기 인스턴스 생성
window.pdfMerger = new PDFMerger();
