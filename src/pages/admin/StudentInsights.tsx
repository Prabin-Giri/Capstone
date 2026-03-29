import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { getStudentInsights, getCourses, enrollStudent, unenrollStudent, getUserEnrollments, type StudentInsight, type Course, type EnrollmentRecord } from '../../lib/api';
import { ChevronLeft, Search, GraduationCap, Settings, Plus, X, Trash2 } from 'lucide-react';

const StudentInsights: React.FC = () => {
    const [students, setStudents] = useState<StudentInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    
    // Enrollment Modal State
    const [selectedStudent, setSelectedStudent] = useState<StudentInsight | null>(null);
    const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
    const [allCourses, setAllCourses] = useState<Course[]>([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [selectedCourseId, setSelectedCourseId] = useState('');

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getStudentInsights();
            setStudents(data);
        } catch {
            setStudents([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openEnrollmentModal = async (student: StudentInsight) => {
        setSelectedStudent(student);
        setModalLoading(true);
        try {
            const [currentEnrollments, courses] = await Promise.all([
                getUserEnrollments(student.id),
                getCourses()
            ]);
            setEnrollments(currentEnrollments);
            setAllCourses(courses.filter(c => !c.is_archived));
        } catch (err) {
            console.error('Failed to load enrollment data', err);
        } finally {
            setModalLoading(false);
        }
    };

    const handleEnroll = async () => {
        if (!selectedStudent || !selectedCourseId) return;
        try {
            await enrollStudent(selectedCourseId, selectedStudent.id);
            // Refresh
            const updated = await getUserEnrollments(selectedStudent.id);
            setEnrollments(updated);
            setSelectedCourseId('');
            loadData(); // Update the main table counts
        } catch (err: any) {
            alert(err.message || 'Failed to enroll');
        }
    };

    const handleUnenroll = async (courseId: string) => {
        if (!selectedStudent) return;
        if (!window.confirm('Are you sure you want to unenroll this student?')) return;
        try {
            await unenrollStudent(courseId, selectedStudent.id);
            // Refresh
            const updated = await getUserEnrollments(selectedStudent.id);
            setEnrollments(updated);
            loadData(); // Update the main table counts
        } catch (err: any) {
            alert(err.message || 'Failed to unenroll');
        }
    };

    const filtered = students.filter(
        s =>
            !search.trim() ||
            s.name?.toLowerCase().includes(search.trim().toLowerCase()) ||
            s.email?.toLowerCase().includes(search.trim().toLowerCase()) ||
            s.id?.toLowerCase().includes(search.trim().toLowerCase())
    );

    return (
        <div className="min-h-full bg-slate-950/95 text-slate-50 px-6 py-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div>
                    <Link
                        to="/admin"
                        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
                    >
                        <ChevronLeft size={18} /> Back to Dashboard
                    </Link>
                </div>
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-slate-800 p-2">
                            <GraduationCap size={24} className="text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-50">Student Insights</h1>
                            <p className="text-sm text-slate-400">Enrollment and submission activity by student</p>
                        </div>
                    </div>
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search by name, email, ID..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-64 rounded-lg border border-slate-700 bg-slate-900/80 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                        />
                    </div>
                </header>

                <Card className="bg-slate-900/70 border-slate-800 overflow-hidden">
                    {loading ? (
                        <div className="py-12 text-center text-slate-400">Loading...</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-400 border-b border-slate-700">
                                        <th className="pb-3 pr-4 font-medium">Name</th>
                                        <th className="pb-3 pr-4 font-medium">Email</th>
                                        <th className="pb-3 pr-4 font-medium">ID</th>
                                        <th className="pb-3 pr-4 font-medium">Courses</th>
                                        <th className="pb-3 pr-4 font-medium">Submissions</th>
                                        <th className="pb-3 pr-4 font-medium">Graded</th>
                                        <th className="pb-3 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(s => (
                                        <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                            <td className="py-3 pr-4 text-slate-200">{s.name ?? '—'}</td>
                                            <td className="py-3 pr-4 text-slate-300">{s.email ?? '—'}</td>
                                            <td className="py-3 pr-4 text-slate-400 font-mono text-xs">{s.id}</td>
                                            <td className="py-3 pr-4 text-slate-200">{s.courses_enrolled}</td>
                                            <td className="py-3 pr-4 text-slate-200">{s.submissions_count}</td>
                                            <td className="py-3 pr-4 text-slate-200">{s.graded_count}</td>
                                            <td className="py-3 text-right">
                                                <button
                                                    onClick={() => openEnrollmentModal(s)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/60 transition-colors text-xs border border-emerald-800/50"
                                                >
                                                    <Settings size={14} />
                                                    Enrollments
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!loading && filtered.length === 0 && (
                        <div className="py-12 text-center text-slate-500">No students match your search.</div>
                    )}
                </Card>
            </div>

            {/* Enrollment Management Modal */}
            {selectedStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <Card className="w-full max-w-xl bg-slate-900 border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-100">Manage Enrollments</h2>
                                <p className="text-sm text-slate-400 mt-1">{selectedStudent.name} ({selectedStudent.email})</p>
                            </div>
                            <button onClick={() => setSelectedStudent(null)} className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Enroll Section */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-slate-300">Enroll in Course</h3>
                                <div className="flex gap-2">
                                    <select
                                        value={selectedCourseId}
                                        onChange={e => setSelectedCourseId(e.target.value)}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                                    >
                                        <option value="">Select a course...</option>
                                        {allCourses
                                            .filter(c => !enrollments.some(e => e.id === c.id))
                                            .map(c => (
                                                <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                                            ))
                                        }
                                    </select>
                                    <button
                                        onClick={handleEnroll}
                                        disabled={!selectedCourseId}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
                                    >
                                        <Plus size={16} /> Enroll
                                    </button>
                                </div>
                            </div>

                            {/* Current Enrollments */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-slate-300">Current Enrollments</h3>
                                {modalLoading ? (
                                    <div className="py-4 text-center text-slate-500 text-sm">Loading...</div>
                                ) : enrollments.length === 0 ? (
                                    <div className="bg-slate-950/50 border border-slate-800/50 rounded-lg py-4 px-4 text-center text-slate-500 text-sm border-dashed italic">
                                        Not enrolled in any courses.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-950/30 overflow-hidden">
                                        {enrollments.map(e => (
                                            <div key={e.id} className="flex items-center justify-between p-3 hover:bg-slate-800/30 transition-colors">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-200">{e.name}</p>
                                                    <p className="text-xs text-slate-500 font-mono mt-0.5">{e.id}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleUnenroll(e.id)}
                                                    className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all"
                                                    title="Unenroll"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-800 text-right bg-slate-900/50">
                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="px-5 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default StudentInsights;
