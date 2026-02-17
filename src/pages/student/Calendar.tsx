import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { AgendaView } from '../../components/calendar/AgendaView';
import { CalendarSidebar } from '../../components/calendar/CalendarSidebar';
import { MonthView } from '../../components/calendar/MonthView';
import { getAssignments, getCourses, getTodos, createTodo, deleteTodo, updateTodo, getColors, saveColor } from '../../lib/api';
import type { Assignment, Course, Todo } from '../../lib/api';
import './Calendar.css';

const STUDENT_ID = 'student-001';

type ViewMode = 'agenda' | 'month';

const Calendar: React.FC = () => {
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
    const [newTodoCourse, setNewTodoCourse] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [fetchedCourses, fetchedAssignments, fetchedTodos, fetchedColors] = await Promise.all([
                getCourses(),
                getAssignments(),
                getTodos({ student_id: STUDENT_ID }),
                getColors(STUDENT_ID)
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
            await saveColor({ student_id: STUDENT_ID, course_id: courseId, color });
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
            const newTodo = await createTodo({
                student_id: STUDENT_ID,
                title: newTodoTitle,
                due_date: newTodoDate ? new Date(newTodoDate).toISOString() : undefined,
                course_id: newTodoCourse || undefined
            });
            setTodos(prev => [...prev, newTodo]);
            setIsTodoModalOpen(false);
            setNewTodoTitle('');
            setNewTodoDate('');
            setNewTodoCourse('');
        } catch (err) {
            console.error('Failed to create todo', err);
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
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    value={newTodoDate}
                                    onChange={e => setNewTodoDate(e.target.value)}
                                    required
                                />
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
                                <button type="button" className="ghost-btn" onClick={() => setIsTodoModalOpen(false)}>Cancel</button>
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
