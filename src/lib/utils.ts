/**
 * Returns the appropriate single-line comment character for a given programming language.
 */
export function getCommentChar(language: string): string {
    const lang = language.toLowerCase();
    if (lang === 'python' || lang === 'py' || lang === 'ruby' || lang === 'perl' || lang === 'shell' || lang === 'bash') {
        return '#';
    }
    // Default to double slash for most other supported languages (JS, TS, Java, C++, PHP, etc.)
    return '//';
}

/**
 * Returns the programming language based on a file's extension.
 * Falls back to the provided default (or 'python') if the extension is unrecognized.
 */
export function getLanguageFromFilename(filename: string, fallback = 'python'): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
        py: 'python',
        java: 'java',
        js: 'javascript',
        ts: 'javascript',
        jsx: 'javascript',
        tsx: 'javascript',
        php: 'php',
        rb: 'python',   // no ruby runner, fall back
        c: 'python',
        cpp: 'python',
    };
    return map[ext] ?? fallback;
}
