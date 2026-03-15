import Editor from '@monaco-editor/react';

import '../../lib/monacoEnvironment';
import type { MonacoLanguage } from '../../lib/monacoLanguage';
export type { MonacoLanguage } from '../../lib/monacoLanguage';
export { languageFromAssignmentLanguage, languageFromFilename } from '../../lib/monacoLanguage';

interface MonacoCodeEditorProps {
    value: string;
    onChange?: (value: string) => void;
    language?: MonacoLanguage;
    height?: number | string;
    readOnly?: boolean;
    theme?: 'light' | 'dark';
    showMiniMap?: boolean;
    wordWrap?: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
    fontSize?: number;
}

export default function MonacoCodeEditor(props: MonacoCodeEditorProps) {
    const {
        value,
        onChange,
        language = 'plaintext',
        height = 360,
        readOnly = false,
        theme = 'dark',
        showMiniMap = false,
        wordWrap = 'on',
        fontSize = 13,
    } = props;

    return (
        <Editor
            height={height}
            language={language}
            value={value}
            theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
            onChange={(v) => onChange?.(v ?? '')}
            options={{
                readOnly,
                minimap: { enabled: showMiniMap },
                fontSize,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap,
                automaticLayout: true,
                renderLineHighlight: 'line',
                folding: true,
                tabSize: 4,
                formatOnPaste: true,
                formatOnType: true,
                smoothScrolling: true,
                mouseWheelZoom: true,
            }}
        />
    );
}

