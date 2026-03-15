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
