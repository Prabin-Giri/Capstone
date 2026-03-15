import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { AgendaView } from '../../components/calendar/AgendaView';
import { CalendarSidebar } from '../../components/calendar/CalendarSidebar';
import { MonthView } from '../../components/calendar/MonthView';
import { getAssignments, getCourses, getTodos, createTodo, deleteTodo, updateTodo, getColors, saveColor } from '../../lib/api';
import type { Assignment, Course, Todo } from '../../lib/api';
import { getUser } from '../../lib/auth';
import './Calendar.css';

type ViewMode = 'agenda' | 'month';

const Calendar: React.FC = () => {
    const user = getUser();
    const userId = user?.id || 'user-001';
    const role = user?.role;
    const [view, setView] = useState<ViewMode>('month');
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [todos, setTodos] = useState<Todo[]>([]);
    const [courseColors, setCourseColors] = useState<Record<string, string>>({});
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    // Modal state
    const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
    const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
    const [newTodoTitle, setNewTodoTitle] = useState('');
    const [newTodoDate, setNewTodoDate] = useState('');
    const [newTodoTime, setNewTodoTime] = useState('');
    const [newTodoCourse, setNewTodoCourse] = useState('');

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (mobile) {
                setView('agenda');
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        loadData();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const loadData = async () => {
        try {
            // Courses: faculty see courses they teach; TA sees both TA and enrolled courses; students see enrolled.
            let coursesPromise: Promise<Course[]>;
            if (role === 'faculty') {
                coursesPromise = getCourses({ instructorId: userId });
            } else if (role === 'ta') {
                coursesPromise = (async () => {
                    const [asStudent, asTA] = await Promise.all([
                        getCourses({ studentId: userId }),
                        getCourses({ taId: userId }),
                    ]);
                    const byId = new Map<string, Course>();
                    [...asStudent, ...asTA].forEach((c) => {
                        if (!byId.has(c.id)) byId.set(c.id, c);
                    });
                    return Array.from(byId.values());
                })();
            } else {
                coursesPromise = getCourses({ studentId: userId });
            }

            const [fetchedCourses, fetchedAssignments, fetchedTodos, fetchedColors] = await Promise.all([
                coursesPromise,
                getAssignments(),
                getTodos({ student_id: userId }),
                getColors(userId)
            ]);

            const enrolledCourseIds = new Set(fetchedCourses.map((c) => c.id));
            const myAssignments = fetchedAssignments.filter((a) => enrolledCourseIds.has(a.course_id));

            setCourses(fetchedCourses);
            setAssignments(myAssignments);
            setTodos(fetchedTodos);
            setCourseColors(fetchedColors);
        } catch (err) {
            console.error('Failed to load calendar data', err);
        }
    };

    const handleColorChange = async (courseId: string, color: string) => {
        try {
            setCourseColors(prev => ({ ...prev, [courseId]: color }));
            await saveColor({ student_id: userId, course_id: courseId, color });
        } catch (err) {
            console.error('Failed to save color', err);
            loadData();
        }
    };

    const handleDateChange = (date: Date) => {
        setSelectedDate(date);
    };

    const handlePrev = () => {
        const newDate = new Date(selectedDate);
        if (view === 'month') {
            newDate.setMonth(selectedDate.getMonth() - 1);
        } else {
            newDate.setDate(selectedDate.getDate() - 7);
        }
        setSelectedDate(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(selectedDate);
        if (view === 'month') {
            newDate.setMonth(selectedDate.getMonth() + 1);
        } else {
            newDate.setDate(selectedDate.getDate() + 7);
        }
        setSelectedDate(newDate);
    };

    const handleSaveTodo = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const combinedDateTime = newTodoDate && newTodoTime
                ? new Date(`${newTodoDate}T${newTodoTime}:00`).toISOString()
                : (newTodoDate ? new Date(newTodoDate + 'T12:00:00').toISOString() : undefined);

            const todoData = {
                student_id: userId,
                title: newTodoTitle,
                due_date: combinedDateTime,
                course_id: newTodoCourse || undefined
            };

            if (editingTodo) {
                const updatedTodo = await updateTodo(editingTodo.id, todoData);
                setTodos(prev => prev.map(t => t.id === editingTodo.id ? updatedTodo : t));
            } else {
                const newTodo = await createTodo(todoData);
                setTodos(prev => [...prev, newTodo]);
            }

            closeTodoModal();
        } catch (err: any) {
            console.error('Failed to save todo', err);
            alert('Failed to save todo: ' + (err.message || 'Unknown error'));
        }
    };

    const openTodoModal = (todo?: Todo) => {
        if (todo) {
            setEditingTodo(todo);
            setNewTodoTitle(todo.title);
            setNewTodoDate(todo.due_date ? todo.due_date.split('T')[0] : '');
            setNewTodoTime(todo.due_date ? todo.due_date.split('T')[1].substring(0, 5) : '');
            setNewTodoCourse(todo.course_id || '');
        } else {
            const now = new Date();
            setEditingTodo(null);
            setNewTodoTitle('');
            setNewTodoDate(now.toISOString().split('T')[0]);
            setNewTodoTime(now.toTimeString().substring(0, 5));
            setNewTodoCourse('');
        }
        setIsTodoModalOpen(true);
    };

    const closeTodoModal = () => {
        setIsTodoModalOpen(false);
        setEditingTodo(null);
        setNewTodoTitle('');
        setNewTodoDate('');
        setNewTodoTime('');
        setNewTodoCourse('');
    };

    const handleToggleTodo = async (id: string, completed: boolean) => {
        try {
            setTodos(prev => prev.map(t => t.id === id ? { ...t, completed } : t));
            await updateTodo(id, { completed });
        } catch (err) {
            console.error('Failed to update todo', err);
            loadData();
        }
    };

    const handleDeleteTodo = async (id: string) => {
        if (!confirm('Are you sure you want to delete this todo?')) return;
        try {
            setTodos(prev => prev.filter(t => t.id !== id));
            await deleteTodo(id);
        } catch (err) {
            console.error('Failed to delete todo', err);
            loadData();
        }
    };

    return (
        <div className="calendar-page">
            <CalendarSidebar
                courses={courses}
                courseColors={courseColors}
                onColorChange={handleColorChange}
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
            />

            <div className="calendar-main">
                <div className="calendar-header">
                    <div className="header-left">
                        <button className="today-btn" onClick={() => setSelectedDate(new Date())}>Today</button>
                        <div className="nav-controls">
                            <button className="icon-nav-btn" onClick={handlePrev}><ChevronLeft size={20} /></button>
                            <button className="icon-nav-btn" onClick={handleNext}><ChevronRight size={20} /></button>
                        </div>
                        <h2 className="current-range">
                            {selectedDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                        </h2>
                    </div>

                    <div className="header-right">
                        {!isMobile && (
                            <div className="view-switcher">
                                <button
                                    className={`view-btn ${view === 'month' ? 'active' : ''}`}
                                    onClick={() => setView('month')}
                                >
                                    Month
                                </button>
                                <button
                                    className={`view-btn ${view === 'agenda' ? 'active' : ''}`}
                                    onClick={() => setView('agenda')}
                                >
                                    Agenda
                                </button>
                            </div>
                        )}
                        <button
                            className="calendar-create-btn"
                            onClick={() => openTodoModal()}
                        >
                            <Plus size={20} />
                            Create
                        </button>
                    </div>
                </div>

                <div className="calendar-content">
                    {view === 'agenda' && (
                        <AgendaView
                            assignments={assignments}
                            todos={todos}
                            courseColors={courseColors}
                            onToggleTodo={handleToggleTodo}
                            onDeleteTodo={handleDeleteTodo}
                            selectedDate={selectedDate}
                            userRole={user?.role}
                        />
                    )}
                    {view === 'month' && !isMobile && (
                        <MonthView
                            assignments={assignments}
                            todos={todos}
                            courseColors={courseColors}
                            selectedDate={selectedDate}
                            onDateChange={setSelectedDate}
                            onDeleteTodo={handleDeleteTodo}
                            userRole={user?.role}
                        />
                    )}
                </div>
            </div>

            {/* Todo Modal */}
            {isTodoModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card">
                        <h3>{editingTodo ? 'Edit Event' : 'Add New Event'}</h3>
                        <form onSubmit={handleSaveTodo}>
                            <div className="form-group">
                                <label>Title</label>
                                <input
                                    type="text"
                                    value={newTodoTitle}
                                    onChange={e => setNewTodoTitle(e.target.value)}
                                    required
                                    autoFocus
                                    placeholder="Event title..."
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group flex-1">
                                    <label>Date</label>
                                    <input
                                        type="date"
                                        value={newTodoDate}
                                        onChange={e => setNewTodoDate(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="form-group flex-1">
                                    <label>Time</label>
                                    <input
                                        type="time"
                                        value={newTodoTime}
                                        onChange={e => setNewTodoTime(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Course (Optional)</label>
                                <select
                                    value={newTodoCourse}
                                    onChange={e => setNewTodoCourse(e.target.value)}
                                >
                                    <option value="">Personal Event</option>
                                    {courses.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="ghost-btn" onClick={closeTodoModal}>Cancel</button>
                                <button type="submit" className="primary-btn">
                                    {editingTodo ? 'Save Changes' : 'Save Event'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Calendar;
