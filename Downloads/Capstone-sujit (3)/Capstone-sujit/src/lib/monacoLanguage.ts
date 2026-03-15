export type MonacoLanguage =
    | 'plaintext'
    | 'python'
    | 'javascript'
    | 'typescript'
    | 'java'
    | 'cpp'
    | 'c'
    | 'json'
    | 'markdown'
    | 'sql'
    | 'html'
    | 'css';

export function languageFromFilename(filename: string | null | undefined): MonacoLanguage {
    const name = (filename || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    switch (ext) {
        case 'py':
            return 'python';
        case 'js':
            return 'javascript';
        case 'ts':
            return 'typescript';
        case 'tsx':
            return 'typescript';
        case 'jsx':
            return 'javascript';
        case 'java':
            return 'java';
        case 'cpp':
        case 'cc':
        case 'cxx':
            return 'cpp';
        case 'c':
        case 'h':
            return 'c';
        case 'json':
            return 'json';
        case 'md':
            return 'markdown';
        case 'sql':
            return 'sql';
        case 'html':
        case 'htm':
            return 'html';
        case 'css':
            return 'css';
        case 'txt':
        default:
            return 'plaintext';
    }
}

export function languageFromAssignmentLanguage(lang: string | null | undefined): MonacoLanguage {
    switch ((lang || '').toLowerCase()) {
        case 'python':
            return 'python';
        case 'javascript':
            return 'javascript';
        case 'java':
            return 'java';
        case 'cpp':
            return 'cpp';
        case 'c':
            return 'c';
        default:
            return 'plaintext';
    }
}

