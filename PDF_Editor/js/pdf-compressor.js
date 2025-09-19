/**
 * PDF 압축 모듈
 * PDF 파일의 용량을 줄이는 압축 기능을 제공합니다.
 */

class PDFCompressor {
    constructor() {
        this.pdfLib = window.PDFLib;
    }

    /**
     * PDF를 압축합니다.
     * @param {Object} pdfDoc - PDF 문서 객체 (PDF.js)
     * @param {string} compressionLevel - 압축 레벨 ('high', 'medium', 'low')
     * @param {number} imageQuality - 이미지 품질 (0.1 ~ 1.0)
     * @param {ArrayBuffer} originalData - 원본 PDF 데이터 (선택사항)
     * @returns {Promise<Uint8Array>} 압축된 PDF의 바이트 배열
     */
    async compressPdf(pdfDoc, compressionLevel = 'medium', imageQuality = 0.8, originalData = null) {
        try {
            if (!pdfDoc) {
                throw new Error('압축할 PDF가 필요합니다.');
            }

            // 압축 설정
            const compressionSettings = this.getCompressionSettings(compressionLevel, imageQuality);
            
            // PDF.js 문서를 PDF-lib 문서로 변환하면서 압축 적용
            const compressedPdfBytes = await this.convertAndCompressPdf(pdfDoc, compressionSettings, originalData);
            
            console.log(`PDF 압축 완료 (${compressionLevel} 레벨, 품질: ${Math.round(imageQuality * 100)}%)`);
            return compressedPdfBytes;
            
        } catch (error) {
            console.error('PDF 압축 오류:', error);
            throw new Error('PDF 압축 중 오류가 발생했습니다.');
        }
    }

    /**
     * 압축 설정을 가져옵니다.
     * @param {string} compressionLevel - 압축 레벨
     * @param {number} imageQuality - 이미지 품질
     * @returns {Object} 압축 설정
     */
    getCompressionSettings(compressionLevel, imageQuality) {
        const settings = {
            high: {
                imageScale: 0.5,
                imageQuality: Math.max(0.3, imageQuality * 0.7),
                removeMetadata: true,
                optimizeImages: true,
                compressText: true
            },
            medium: {
                imageScale: 0.7,
                imageQuality: Math.max(0.5, imageQuality * 0.8),
                removeMetadata: false,
                optimizeImages: true,
                compressText: false
            },
            low: {
                imageScale: 0.9,
                imageQuality: Math.max(0.7, imageQuality),
                removeMetadata: false,
                optimizeImages: false,
                compressText: false
            }
        };

        return settings[compressionLevel] || settings.medium;
    }

    /**
     * PDF를 변환하면서 압축을 적용합니다.
     * @param {Object} pdfDoc - PDF.js 문서 객체
     * @param {Object} settings - 압축 설정
     * @param {ArrayBuffer} originalData - 원본 PDF 데이터 (선택사항)
     * @returns {Promise<Uint8Array>} 압축된 PDF 바이트 배열
     */
    async convertAndCompressPdf(pdfDoc, settings, originalData = null) {
        try {
            // 원본 데이터가 있고 유효하며 압축 설정이 낮은 경우 원본 사용
            if (originalData && !this.isArrayBufferDetached(originalData) && 
                settings.imageScale >= 0.9 && settings.imageQuality >= 0.8) {
                try {
                    return new Uint8Array(originalData);
                } catch (error) {
                    console.warn('원본 데이터 사용 실패, 압축 변환으로 대체:', error);
                }
            }
            
            const newPdf = await this.pdfLib.PDFDocument.create();
            
            // 메타데이터 설정
            if (!settings.removeMetadata) {
                newPdf.setTitle('압축된 PDF');
                newPdf.setAuthor('PDF 편집기');
                newPdf.setSubject('압축된 PDF 문서');
                newPdf.setCreator('PDF 편집기 v1.0');
                newPdf.setProducer('PDF 편집기');
                newPdf.setCreationDate(new Date());
                newPdf.setModificationDate(new Date());
            }
            
            // 모든 페이지를 처리
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                try {
                    const page = await pdfDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 1.0 });
                    
                    // 압축된 크기로 뷰포트 조정
                    const compressedViewport = page.getViewport({ 
                        scale: settings.imageScale 
                    });
                    
                    // 캔버스에 페이지 렌더링
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = compressedViewport.height;
                    canvas.width = compressedViewport.width;
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: compressedViewport
                    };
                    
                    await page.render(renderContext).promise;
                    
                    // 이미지 품질에 따라 압축
                    const imageData = canvas.toDataURL('image/jpeg', settings.imageQuality);
                    const image = await newPdf.embedJpg(imageData);
                    
                    // 원본 크기로 페이지 추가
                    const newPage = newPdf.addPage([viewport.width, viewport.height]);
                    newPage.drawImage(image, {
                        x: 0,
                        y: 0,
                        width: viewport.width,
                        height: viewport.height,
                    });
                    
                } catch (error) {
                    console.error(`페이지 ${i} 압축 오류:`, error);
                    // 압축 실패 시 원본 페이지 추가
                    await this.addOriginalPage(newPdf, pdfDoc, i);
                }
            }
            
            return await newPdf.save();
            
        } catch (error) {
            console.error('PDF 변환 및 압축 오류:', error);
            throw new Error('PDF 변환 및 압축 중 오류가 발생했습니다.');
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
     * 원본 페이지를 추가합니다 (압축 실패 시 사용).
     * @param {Object} newPdf - 새 PDF 문서
     * @param {Object} pdfDoc - 원본 PDF 문서
     * @param {number} pageNumber - 페이지 번호
     */
    async addOriginalPage(newPdf, pdfDoc, pageNumber) {
        try {
            const page = await pdfDoc.getPage(pageNumber);
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
            
        } catch (error) {
            console.error(`원본 페이지 ${pageNumber} 추가 오류:`, error);
        }
    }

    /**
     * PDF 압축 진행 상황을 추적합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @param {string} compressionLevel - 압축 레벨
     * @param {number} imageQuality - 이미지 품질
     * @param {Function} progressCallback - 진행 상황 콜백 함수
     * @returns {Promise<Uint8Array>} 압축된 PDF의 바이트 배열
     */
    async compressPdfWithProgress(pdfDoc, compressionLevel, imageQuality, progressCallback) {
        try {
            const compressionSettings = this.getCompressionSettings(compressionLevel, imageQuality);
            const newPdf = await this.pdfLib.PDFDocument.create();
            
            const totalPages = pdfDoc.numPages;
            
            for (let i = 1; i <= totalPages; i++) {
                try {
                    progressCallback(i, totalPages, `페이지 ${i} 압축 중...`);
                    
                    const page = await pdfDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 1.0 });
                    const compressedViewport = page.getViewport({ 
                        scale: compressionSettings.imageScale 
                    });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = compressedViewport.height;
                    canvas.width = compressedViewport.width;
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: compressedViewport
                    };
                    
                    await page.render(renderContext).promise;
                    
                    const imageData = canvas.toDataURL('image/jpeg', compressionSettings.imageQuality);
                    const image = await newPdf.embedJpg(imageData);
                    
                    const newPage = newPdf.addPage([viewport.width, viewport.height]);
                    newPage.drawImage(image, {
                        x: 0,
                        y: 0,
                        width: viewport.width,
                        height: viewport.height,
                    });
                    
                } catch (error) {
                    console.error(`페이지 ${i} 압축 오류:`, error);
                    progressCallback(i, totalPages, `페이지 ${i} 압축 실패, 원본 사용`);
                    await this.addOriginalPage(newPdf, pdfDoc, i);
                }
            }
            
            progressCallback(totalPages, totalPages, '압축 완료, PDF 저장 중...');
            return await newPdf.save();
            
        } catch (error) {
            console.error('진행 상황 추적 PDF 압축 오류:', error);
            throw new Error('PDF 압축 중 오류가 발생했습니다.');
        }
    }

    /**
     * 압축된 PDF를 다운로드합니다.
     * @param {Uint8Array} pdfBytes - PDF 바이트 배열
     * @param {string} filename - 다운로드할 파일명
     * @returns {Promise<void>}
     */
    async downloadCompressedPdf(pdfBytes, filename = 'compressed.pdf') {
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
            
            console.log(`압축된 PDF가 다운로드되었습니다: ${filename}`);
            
        } catch (error) {
            console.error('압축된 PDF 다운로드 오류:', error);
            throw new Error('압축된 PDF 다운로드 중 오류가 발생했습니다.');
        }
    }

    /**
     * 압축 비율을 계산합니다.
     * @param {number} originalSize - 원본 크기 (바이트)
     * @param {number} compressedSize - 압축된 크기 (바이트)
     * @returns {Object} 압축 정보
     */
    calculateCompressionRatio(originalSize, compressedSize) {
        const ratio = ((originalSize - compressedSize) / originalSize) * 100;
        const savedBytes = originalSize - compressedSize;
        
        return {
            originalSize,
            compressedSize,
            savedBytes,
            compressionRatio: Math.round(ratio * 100) / 100,
            sizeReduction: ratio > 0 ? `${Math.round(ratio)}% 감소` : '압축 효과 없음'
        };
    }

    /**
     * 파일 크기를 사람이 읽기 쉬운 형태로 변환합니다.
     * @param {number} bytes - 바이트 크기
     * @returns {string} 변환된 크기 문자열
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 압축 레벨별 예상 압축 비율을 가져옵니다.
     * @param {string} compressionLevel - 압축 레벨
     * @returns {Object} 예상 압축 정보
     */
    getExpectedCompression(compressionLevel) {
        const expectations = {
            high: {
                ratio: '60-80%',
                quality: '낮음',
                description: '최대 압축, 품질 저하 있음'
            },
            medium: {
                ratio: '30-50%',
                quality: '보통',
                description: '균형잡힌 압축과 품질'
            },
            low: {
                ratio: '10-30%',
                quality: '높음',
                description: '최소 압축, 고품질 유지'
            }
        };
        
        return expectations[compressionLevel] || expectations.medium;
    }

    /**
     * PDF가 압축 가능한지 확인합니다.
     * @param {Object} pdfDoc - PDF 문서 객체
     * @returns {boolean} 압축 가능 여부
     */
    canCompress(pdfDoc) {
        return pdfDoc && 
               typeof pdfDoc.numPages === 'number' && 
               pdfDoc.numPages > 0 &&
               !pdfDoc.isEncrypted;
    }

    /**
     * 압축 설정을 검증합니다.
     * @param {string} compressionLevel - 압축 레벨
     * @param {number} imageQuality - 이미지 품질
     * @returns {boolean} 설정 유효성
     */
    validateCompressionSettings(compressionLevel, imageQuality) {
        const validLevels = ['high', 'medium', 'low'];
        const validQuality = typeof imageQuality === 'number' && 
                           imageQuality >= 0.1 && 
                           imageQuality <= 1.0;
        
        return validLevels.includes(compressionLevel) && validQuality;
    }
}

// 전역 PDF 압축기 인스턴스 생성
window.pdfCompressor = new PDFCompressor();
