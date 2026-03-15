function createWorker(url: string) {
    return new Worker(new URL(url, import.meta.url), { type: 'module' });
}

export function ensureMonacoEnvironment() {
    if (typeof window === 'undefined') return;
    const g = globalThis as any;
    if (g.MonacoEnvironment?.getWorker) return;

    g.MonacoEnvironment = {
        getWorker(_moduleId: string, label: string) {
            if (label === 'json') return createWorker('monaco-editor/esm/vs/language/json/json.worker?worker');
            if (label === 'css' || label === 'scss' || label === 'less') return createWorker('monaco-editor/esm/vs/language/css/css.worker?worker');
            if (label === 'html' || label === 'handlebars' || label === 'razor') return createWorker('monaco-editor/esm/vs/language/html/html.worker?worker');
            if (label === 'typescript' || label === 'javascript') return createWorker('monaco-editor/esm/vs/language/typescript/ts.worker?worker');
            return createWorker('monaco-editor/esm/vs/editor/editor.worker?worker');
        },
    };
}

ensureMonacoEnvironment();

