import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getAssignment, getSubmissions, downloadAllSubmissions } from '../../lib/api';
import type { Assignment, Submission } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RefreshCw } from 'lucide-react';

const GradingDashboard: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const navigate = useNavigate();
    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    useEffect(() => {
        loadData();

        // Auto-refresh every 10 seconds
        const interval = setInterval(() => {
            loadData(true); // Silent refresh
        }, 10000);

        return () => clearInterval(interval);
    }, [assignmentId]);

    async function loadData(silent = false) {
        if (!assignmentId) return;
        if (!silent) setLoading(true);
        try {
            const [assignmentData, submissionsData] = await Promise.all([
                getAssignment(assignmentId),
                getSubmissions({ assignment_id: assignmentId })
            ]);
            setAssignment(assignmentData);
            setSubmissions(submissionsData);
            setLastRefresh(new Date());
        } catch (err) {
            console.error(err);
        } finally {
            if (!silent) setLoading(false);
        }
    }

    async function handleRefresh() {
        setRefreshing(true);
        await loadData(false);
        setRefreshing(false);
    }

    async function handleDownloadAll() {
        if (!assignmentId) return;
        setDownloading(true);
        try {
            await downloadAllSubmissions(assignmentId);
        } catch (err) {
            console.error('Download failed:', err);
            alert('Failed to download submissions. Please try again.');
        } finally {
            setDownloading(false);
        }
    }

    if (loading) return <div className="p-8">Loading...</div>;
    if (!assignment) return <div className="p-8">Assignment not found</div>;

    return (
        <div className="max-w-7xl mx-auto p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                        <Link to={`/faculty/courses/${courseId}`} className="hover:text-blue-600">Back to Course</Link>
                        <span>/</span>
                        <span>{assignment.title}</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900">Grading Dashboard</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Last updated: {lastRefresh.toLocaleTimeString()} • Auto-refreshes every 10s
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Button
                        onClick={handleDownloadAll}
                        disabled={submissions.length === 0 || downloading}
                    >
                        {downloading ? 'Downloading...' : 'Download All Submissions'}
                    </Button>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Student ID</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Submitted</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Grade</th>
                            <th className="px-6 py-3 text-sm font-medium text-gray-500">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {submissions.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    No submissions found for this assignment yet.
                                </td>
                            </tr>
                        ) : (
                            submissions.map(submission => (
                                <tr key={submission.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{submission.student_id}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {new Date(submission.submitted_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <StatusBadge status={submission.status} />
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        {submission.grade !== undefined && submission.grade !== null ? submission.grade : '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <Button
                                            size="sm"
                                            onClick={() => navigate(`${submission.id}`)}
                                        >
                                            Grade
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default GradingDashboard;

