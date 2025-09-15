// 보안 유틸리티 함수들

/**
 * XSS 방지를 위한 안전한 HTML 생성
 * @param {string} tag - HTML 태그명
 * @param {Object} attributes - 속성 객체
 * @param {string} content - 텍스트 내용
 * @returns {HTMLElement} 안전한 HTML 요소
 */
export function createSafeElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);
    
    // 속성 설정 (XSS 방지)
    Object.keys(attributes).forEach(key => {
        if (key === 'innerHTML' || key === 'outerHTML') {
            console.warn('보안 경고: innerHTML/outerHTML 사용은 XSS 위험이 있습니다.');
            return;
        }
        element.setAttribute(key, attributes[key]);
    });
    
    // 텍스트 내용 설정 (XSS 방지)
    if (content) {
        element.textContent = content;
    }
    
    return element;
}

/**
 * 사용자 입력 데이터 검증 및 정리
 * @param {string} input - 사용자 입력
 * @returns {string} 정리된 입력
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return '';
    }
    
    // HTML 태그 제거
    return input
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .trim();
}

/**
 * 비밀번호 강도 검증
 * @param {string} password - 비밀번호
 * @returns {Object} 검증 결과
 */
export function validatePassword(password) {
    const result = {
        isValid: false,
        errors: []
    };
    
    if (password.length < 8) {
        result.errors.push('비밀번호는 최소 8자 이상이어야 합니다.');
    }
    
    if (!/[A-Z]/.test(password)) {
        result.errors.push('대문자를 포함해야 합니다.');
    }
    
    if (!/[a-z]/.test(password)) {
        result.errors.push('소문자를 포함해야 합니다.');
    }
    
    if (!/[0-9]/.test(password)) {
        result.errors.push('숫자를 포함해야 합니다.');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        result.errors.push('특수문자를 포함해야 합니다.');
    }
    
    result.isValid = result.errors.length === 0;
    return result;
}

/**
 * 안전한 데이터 저장 (로컬스토리지)
 * @param {string} key - 저장 키
 * @param {any} data - 저장할 데이터
 */
export function safeSetStorage(key, data) {
    try {
        // 민감한 정보는 암호화하여 저장
        const sensitiveKeys = ['password', 'token', 'secret'];
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
            console.warn('보안 경고: 민감한 정보를 로컬스토리지에 저장하지 마세요.');
            return false;
        }
        
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('로컬스토리지 저장 실패:', error);
        return false;
    }
}

/**
 * 안전한 데이터 로드 (로컬스토리지)
 * @param {string} key - 로드할 키
 * @returns {any} 로드된 데이터
 */
export function safeGetStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('로컬스토리지 로드 실패:', error);
        return null;
    }
}
