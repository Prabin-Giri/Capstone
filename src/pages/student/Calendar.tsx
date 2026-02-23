import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { AgendaView } from '../../components/calendar/AgendaView';
import { CalendarSidebar } from '../../components/calendar/CalendarSidebar';
import { MonthView } from '../../components/calendar/MonthView';
import { PRESET_COLORS } from '../../lib/colors';
import { getAssignments, getCourses, getTodos, createTodo, deleteTodo, updateTodo, getColors, saveColor } from '../../lib/api';
import type { Assignment, Course, Todo } from '../../lib/api';
import { getUser } from '../../lib/auth';
import './Calendar.css';

type ViewMode = 'agenda' | 'month';

const Calendar: React.FC = () => {
    const user = getUser();
    const studentId = user?.id || 'student-001';
    const [view, setView] = useState<ViewMode>('month');
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [todos, setTodos] = useState<Todo[]>([]);
    const [courseColors, setCourseColors] = useState<Record<string, string>>({});
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    // Modal state
    const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
    const [newTodoTitle, setNewTodoTitle] = useState('');
    const [newTodoDate, setNewTodoDate] = useState('');
    const [newTodoTime, setNewTodoTime] = useState('');
    const [newTodoCourse, setNewTodoCourse] = useState('');
    const [currentTimePlaceholder, setCurrentTimePlaceholder] = useState('');
    const [currentDatePlaceholder, setCurrentDatePlaceholder] = useState('');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [activeMobilePicker, setActiveMobilePicker] = useState<string | null>(null);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (mobile) setView('agenda');
        };

        window.addEventListener('resize', handleResize);
        handleResize(); // Initial check

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (isTodoModalOpen) {
            const now = new Date();
            setCurrentTimePlaceholder(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const yyyy = now.getFullYear();
            setCurrentDatePlaceholder(`${mm}/${dd}/${yyyy}`);

            // Clear date to show placeholder
            setNewTodoDate('');
        }
    }, [isTodoModalOpen]);

    const loadData = async () => {
        try {
            const [fetchedCourses, fetchedAssignments, fetchedTodos, fetchedColors] = await Promise.all([
                getCourses(),
                getAssignments(),
                getTodos({ student_id: studentId }),
                getColors(studentId)
            ]);

            setCourses(fetchedCourses);
            setAssignments(fetchedAssignments);
            setTodos(fetchedTodos);
            setCourseColors(fetchedColors);
        } catch (err) {
            console.error('Failed to load calendar data', err);
        }
    };

    const handleColorChange = async (courseId: string, color: string) => {
        try {
            setCourseColors(prev => ({ ...prev, [courseId]: color }));
            await saveColor({ student_id: studentId, course_id: courseId, color });
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

    const handleAddTodo = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let finalDate = newTodoDate;
            if (!finalDate) {
                const now = new Date();
                finalDate = now.toISOString().split('T')[0];
            }

            let dueDateTime = undefined;
            if (finalDate) {
                const timeString = newTodoTime ? `T${newTodoTime}:00` : '';
                try {
                    dueDateTime = timeString ? new Date(`${finalDate}${timeString}`).toISOString() : new Date(`${finalDate}T00:00:00`).toISOString().split('T')[0];
                } catch (e) {
                    throw new Error("Invalid date format");
                }
            }

            const newTodo = await createTodo({
                student_id: studentId,
                title: newTodoTitle,
                due_date: dueDateTime,
                course_id: newTodoCourse || undefined
            });
            setTodos(prev => [...prev, newTodo]);
            setIsTodoModalOpen(false);
            setNewTodoTitle('');
            setNewTodoDate('');
            setNewTodoTime('');
            setNewTodoCourse('');
        } catch (err) {
            console.error('Failed to create todo', err);
            alert('Failed to save the event. Please ensure the date format is correct.');
        }
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
            {!isMobile && (
                <CalendarSidebar
                    courses={courses}
                    courseColors={courseColors}
                    onColorChange={handleColorChange}
                    selectedDate={selectedDate}
                    onDateChange={handleDateChange}
                />
            )}

            <div className="calendar-main">
                {isMobile && courses.length > 0 && (
                    <div className="mobile-course-colors">
                        <div className="mobile-colors-scroll">
                            {courses.map(course => (
                                <div
                                    key={course.id}
                                    className={`mobile-color-pill ${activeMobilePicker === course.id ? 'active' : ''}`}
                                    onClick={() => setActiveMobilePicker(activeMobilePicker === course.id ? null : course.id)}
                                >
                                    <div
                                        className="mobile-color-indicator"
                                        style={{ backgroundColor: courseColors[course.id] || '#3b82f6' }}
                                    />
                                    <span className="mobile-course-name">{course.name}</span>
                                </div>
                            ))}
                        </div>

                        {activeMobilePicker && (
                            <div className="mobile-color-picker-overlay animate-in" onClick={() => setActiveMobilePicker(null)}>
                                <div className="mobile-color-picker-card" onClick={e => e.stopPropagation()}>
                                    <div className="mobile-picker-header">
                                        <h4>Pick color for {courses.find(c => c.id === activeMobilePicker)?.name}</h4>
                                        <button className="close-picker-btn" onClick={() => setActiveMobilePicker(null)}>&times;</button>
                                    </div>
                                    <div className="mobile-color-grid">
                                        {PRESET_COLORS.map(c => (
                                            <button
                                                key={c.value}
                                                className="mobile-color-option"
                                                style={{ backgroundColor: c.value }}
                                                onClick={() => {
                                                    handleColorChange(activeMobilePicker, c.value);
                                                    setActiveMobilePicker(null);
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                <div className="calendar-header">
                    <div className="calendar-header-left">
                        <button className="today-btn" onClick={() => setSelectedDate(new Date())}>Today</button>
                        <div className="nav-controls">
                            <button className="icon-nav-btn" onClick={handlePrev}><ChevronLeft size={20} /></button>
                            <button className="icon-nav-btn" onClick={handleNext}><ChevronRight size={20} /></button>
                        </div>
                        <h2 className="current-range">
                            {selectedDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                        </h2>
                    </div>

                    <div className="calendar-header-right">
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
                        <button
                            className="create-btn"
                            onClick={() => setIsTodoModalOpen(true)}
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
                        />
                    )}
                    {view === 'month' && (
                        <MonthView
                            assignments={assignments}
                            todos={todos}
                            courseColors={courseColors}
                            selectedDate={selectedDate}
                            onDateChange={setSelectedDate}
                        />
                    )}
                </div>
            </div>

            {/* Todo Modal */}
            {isTodoModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card">
                        <h3>Add New Event</h3>
                        <form onSubmit={handleAddTodo}>
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
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                    <label>Date</label>
                                    <input
                                        type="date"
                                        value={newTodoDate}
                                        onChange={e => setNewTodoDate(e.target.value)}
                                        className={!newTodoDate ? 'date-placeholder' : ''}
                                        style={{ '--date-placeholder': `"${currentDatePlaceholder}"` } as React.CSSProperties}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                    <label>Time (Optional)</label>
                                    <input
                                        type="time"
                                        value={newTodoTime}
                                        onChange={e => setNewTodoTime(e.target.value)}
                                        className={!newTodoTime ? 'time-placeholder' : ''}
                                        style={{ '--time-placeholder': `"${currentTimePlaceholder}"` } as React.CSSProperties}
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
                                <button type="button" className="ghost-btn" onClick={() => {
                                    setIsTodoModalOpen(false);
                                    setNewTodoTime('');
                                }}>Cancel</button>
                                <button type="submit" className="primary-btn">Save Event</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Calendar;
