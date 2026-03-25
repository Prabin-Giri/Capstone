import React from 'react';
import { Home, RotateCcw } from 'lucide-react';
import { Link, useNavigate, useRouteError } from 'react-router-dom';
import './NotFound.css';

const getRouteErrorMessage = (error: unknown): string => {
    if (!error) {
        return '';
    }

    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'object' && error !== null) {
        const potentialError = error as { status?: unknown; statusText?: unknown; data?: unknown };
        const status = typeof potentialError.status === 'number' ? `${potentialError.status} ` : '';
        const statusText = typeof potentialError.statusText === 'string' ? potentialError.statusText : '';
        const detail = typeof potentialError.data === 'string' ? ` - ${potentialError.data}` : '';
        const assembledMessage = `${status}${statusText}${detail}`.trim();

        if (assembledMessage) {
            return assembledMessage;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    return String(error);
};

const NotFound: React.FC = () => {
    const navigate = useNavigate();
    const routeError = useRouteError();
    const routeErrorMessage = getRouteErrorMessage(routeError);
    const displayMessage = routeErrorMessage || 'This URL does not match any page in the application.';

    return (
        <main className="notfound-page">
            <section className="notfound-card" role="status" aria-live="polite">
                <p className="notfound-kicker">Error 404</p>
                <h1 className="notfound-code" aria-label="404">
                    404
                </h1>
                <h2 className="notfound-title">Page not found</h2>
                <p className="notfound-description">
                    The page may have been moved, deleted, or the link might be incorrect.
                </p>

                <div className="notfound-cause">
                    <p className="notfound-cause-label">Error message</p>
                    <p className="notfound-cause-text">{displayMessage}</p>
                </div>

                <div className="notfound-actions">
                    <button type="button" className="notfound-btn notfound-btn-secondary" onClick={() => navigate(-1)}>
                        <RotateCcw size={16} />
                        Go Back
                    </button>

                    <Link to="/" className="notfound-btn notfound-btn-primary">
                        <Home size={16} />
                        Return Home
                    </Link>
                </div>
            </section>
        </main>
    );
};

export default NotFound;
