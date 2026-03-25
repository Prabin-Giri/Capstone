export type ThemeMode = 'system' | 'light' | 'dark';

export const APP_THEME_KEY = 'app-theme';
export const APP_THEME_EVENT = 'theme-change';

export const isThemeMode = (value: unknown): value is ThemeMode =>
    value === 'system' || value === 'light' || value === 'dark';

export const getSystemPrefersDark = (): boolean =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

export const getStoredThemeMode = (): ThemeMode => {
    if (typeof window === 'undefined') {
        return 'system';
    }
    const stored = window.localStorage.getItem(APP_THEME_KEY);
    return isThemeMode(stored) ? stored : 'system';
};

export const isDarkForTheme = (mode: ThemeMode): boolean =>
    mode === 'dark' || (mode === 'system' && getSystemPrefersDark());

export const applyThemeModeToDocument = (mode: ThemeMode): void => {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.classList.toggle('dark-theme', isDarkForTheme(mode));
};

export const setThemeMode = (mode: ThemeMode): void => {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(APP_THEME_KEY, mode);
    applyThemeModeToDocument(mode);
    window.dispatchEvent(new CustomEvent<ThemeMode>(APP_THEME_EVENT, { detail: mode }));
};

export const getNextThemeMode = (current: ThemeMode): ThemeMode => {
    if (current === 'system') return 'dark';
    if (current === 'dark') return 'light';
    return 'system';
};
