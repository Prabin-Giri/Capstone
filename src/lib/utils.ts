/**
 * Utility functions for formatting and data manipulation.
 */

export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
}

export function formatDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(d);
}

export function truncateText(text: string, length: number): string {
    if (text.length <= length) return text;
    return text.slice(0, length) + '...';
}

export function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

export function getFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return '📄';
        case 'doc':
        case 'docx': return '📝';
        case 'xls':
        case 'xlsx': return '📊';
        case 'zip':
        case 'rar': return '📦';
        case 'jpg':
        case 'jpeg':
        case 'png': return '🖼️';
        case 'py': return '🐍';
        case 'js':
        case 'ts':
        case 'tsx':
        case 'jsx': return '📜';
        case 'java': return '☕';
        case 'cpp':
        case 'c': return '⚙️';
        default: return '📁';
    }
}

export function isValidEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Parses a UTC date string from the database and returns a localized Date object.
 * Forces UTC interpretation for strings that lack timezone information.
 */
export function parseUTC(dateStr: string | null | undefined): Date {
    if (!dateStr) return new Date();
    const s = String(dateStr).trim();
    
    // 1. If it already has 'Z' or a large offset, trust the browser's native parser
    if (s.includes('Z') || (s.includes('+') && s.length > 15)) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d;
    }
    
    // 2. Handle SQL format: YYYY-MM-DD HH:MM:SS[.mmm]
    // We convert space to T and append Z to force UTC
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s)) {
        const iso = s.replace(' ', 'T');
        const d = new Date(iso + (iso.includes('Z') ? '' : 'Z'));
        if (!isNaN(d.getTime())) return d;
    }
    
    // 3. Fallback for other formats, still attempting to force UTC if no TZ info present
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        if (!s.includes('Z') && !s.includes('+') && !s.includes('GMT')) {
            const forced = new Date(s.replace(' ', 'T') + 'Z');
            if (!isNaN(forced.getTime())) return forced;
        }
        return d;
    }
    
    return new Date();
}

/**
 * Returns the valid file extensions for a given language.
 */
export function getValidExtensions(language: string): string[] {
    const lang = language.toLowerCase();
    switch (lang) {
        case 'python': return ['py'];
        case 'java': return ['java'];
        case 'javascript':
        case 'nodejs': return ['js', 'jsx', 'ts', 'tsx'];
        case 'cpp':
        case 'c++': return ['cpp', 'hpp', 'cc', 'cxx', 'h'];
        case 'c': return ['c', 'h'];
        default: return [];
    }
}

/**
 * Returns the comment character for a given language.
 */
export function getCommentChar(language: string): string {
    const lang = language.toLowerCase();
    if (lang === 'python') return '#';
    return '//';
}

/**
 * Detects the language from a filename.
 */
export function getLanguageFromFilename(filename: string, defaultLang: string = 'python'): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'py': return 'python';
        case 'java': return 'java';
        case 'js':
        case 'jsx': return 'javascript';
        case 'ts':
        case 'tsx': return 'typescript';
        case 'cpp':
        case 'cc':
        case 'cxx': return 'cpp';
        case 'c': return 'c';
        default: return defaultLang;
    }
}

/**
 * Normalizes language names for the execution engine.
 */
export function normalizeLanguage(lang: string): string {
    const l = lang.toLowerCase();
    if (l === 'js' || l === 'javascript') return 'nodejs';
    if (l === 'c++') return 'cpp';
    return l;
}
