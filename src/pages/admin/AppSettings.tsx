import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Settings } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { getAdminAppSettings, patchAdminAppSettings, type AdminAppSettings } from '../../lib/api';

const AppSettings: React.FC = () => {
    const [settings, setSettings] = useState<AdminAppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const s = await getAdminAppSettings();
                if (!cancelled) setSettings(s);
            } catch {
                if (!cancelled) setSettings(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const boolVal = (k: string) => settings?.[k] === 'true';

    const setField = (key: string, value: string) => {
        setSettings((prev) => ({ ...(prev || {}), [key]: value }));
    };

    const save = async () => {
        if (!settings) return;
        setSaving(true);
        setMessage(null);
        try {
            const next = await patchAdminAppSettings(settings);
            setSettings(next);
            setMessage('Settings saved.');
        } catch (e: unknown) {
            setMessage(e instanceof Error ? e.message : 'Could not save.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-full bg-slate-950/95 text-slate-50 px-6 py-8">
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <div className="breadcrumb">
                        <Link to="/admin">
                            <ChevronLeft size={14} />
                            Back to Dashboard
                        </Link>
                    </div>
                </div>
                <header className="flex items-center gap-3">
                    <div className="rounded-lg bg-slate-800 p-2">
                        <Settings size={24} className="text-rose-300" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-50">App Settings</h1>
                        <p className="text-sm text-slate-400">Platform-wide switches and limits</p>
                    </div>
                </header>

                {loading ? (
                    <Card className="bg-slate-900/70 border-slate-800 p-6 text-slate-400">Loading…</Card>
                ) : settings ? (
                    <Card className="bg-slate-900/70 border-slate-800 p-6 space-y-6">
                        <p className="text-sm text-slate-400">
                            These values are stored in the database. Frontend features can read them via the API as you wire them in. Theme selection
                            remains in the top bar.
                        </p>

                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-1 rounded border-slate-600"
                                checked={boolVal('maintenance_mode')}
                                onChange={(e) => setField('maintenance_mode', e.target.checked ? 'true' : 'false')}
                            />
                            <span>
                                <span className="font-medium text-slate-200">Maintenance mode</span>
                                <span className="block text-xs text-slate-500">When enabled, you can block non-admin access in your deployment (check this flag in API/gateway).</span>
                            </span>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-1 rounded border-slate-600"
                                checked={boolVal('allow_self_registration')}
                                onChange={(e) => setField('allow_self_registration', e.target.checked ? 'true' : 'false')}
                            />
                            <span>
                                <span className="font-medium text-slate-200">Allow self-registration</span>
                                <span className="block text-xs text-slate-500">Policy flag for signup flows (enforce in signup route when connected).</span>
                            </span>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                className="mt-1 rounded border-slate-600"
                                checked={boolVal('require_email_verification')}
                                onChange={(e) => setField('require_email_verification', e.target.checked ? 'true' : 'false')}
                            />
                            <span>
                                <span className="font-medium text-slate-200">Require email verification</span>
                                <span className="block text-xs text-slate-500">Expected policy for new accounts (existing verification flow).</span>
                            </span>
                        </label>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Active user window (minutes)</label>
                                <input
                                    type="number"
                                    min={5}
                                    max={120}
                                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 text-sm"
                                    value={settings.active_user_window_minutes || '15'}
                                    onChange={(e) => setField('active_user_window_minutes', e.target.value)}
                                />
                                <p className="text-xs text-slate-500 mt-1">Used by App Analytics “Active users”.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Max upload size (MB)</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={500}
                                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 text-sm"
                                    value={settings.max_upload_mb || '25'}
                                    onChange={(e) => setField('max_upload_mb', e.target.value)}
                                />
                                <p className="text-xs text-slate-500 mt-1">Policy hint for submission uploads.</p>
                            </div>
                        </div>

                        {message && (
                            <p className={`text-sm ${message.includes('Could not') ? 'text-rose-400' : 'text-emerald-400'}`}>{message}</p>
                        )}

                        <button
                            type="button"
                            onClick={() => void save()}
                            disabled={saving}
                            className="rounded-lg bg-rose-900/80 hover:bg-rose-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                        >
                            {saving ? 'Saving…' : 'Save settings'}
                        </button>
                    </Card>
                ) : (
                    <Card className="bg-slate-900/70 border-slate-800 p-6 text-slate-500">Could not load settings.</Card>
                )}
            </div>
        </div>
    );
};

export default AppSettings;
