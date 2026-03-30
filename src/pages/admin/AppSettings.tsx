import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Settings } from 'lucide-react';
import { Card } from '../../components/ui/Card';

const AppSettings: React.FC = () => {
    return (
        <div className="min-h-full bg-slate-950/95 text-slate-50 px-6 py-8">
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <Link
                        to="/admin"
                        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
                    >
                        <ChevronLeft size={18} /> Back to Dashboard
                    </Link>
                </div>
                <header className="flex items-center gap-3">
                    <div className="rounded-lg bg-slate-800 p-2">
                        <Settings size={24} className="text-rose-300" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-50">App Settings</h1>
                        <p className="text-sm text-slate-400">Configure platform-wide preferences</p>
                    </div>
                </header>

                <Card className="bg-slate-900/70 border-slate-800">
                    <p className="text-slate-300 text-sm leading-relaxed">
                        Global application settings will appear here as they are added (for example, default term dates,
                        feature flags, and integrations). Appearance theme is controlled from the top bar on any page.
                    </p>
                </Card>
            </div>
        </div>
    );
};

export default AppSettings;
