import React, { useEffect, useState } from 'react';
import { AgendaView } from '../../components/calendar/AgendaView';
import { CalendarSidebar } from '../../components/calendar/CalendarSidebar';
import { getAssignments, getCourses, getTodos, createTodo, deleteTodo, updateTodo, getColors, saveColor } from '../../lib/api';
import type { Assignment, Course, Todo } from '../../lib/api';
import './Calendar.css';

const STUDENT_ID = 'student-001';

type ViewMode = 'agenda' | 'week' | 'month';

const Calendar: React.FC = () => {
    // console.log('Calendar component mounting');
    const [view, setView] = useState<ViewMode>('agenda');
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
            // Optimistic update
            setCourseColors(prev => ({ ...prev, [courseId]: color }));
            await saveColor({ student_id: STUDENT_ID, course_id: courseId, color });
        } catch (err) {
            console.error('Failed to save color', err);
            loadData(); // Revert on error
        }
    };

    const handleDateChange = (date: Date) => {
        setSelectedDate(date);
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
            // Optimistic update
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
            // Optimistic update
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
                        <h2 className="current-range">
                            {new Date().toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </h2>
                    </div>

                    <div className="header-right">
                        <div className="view-switcher">
                            <button
                                className={`view-btn ${view === 'week' ? 'active' : ''}`}
                                onClick={() => setView('week')}
                                disabled
                                title="Coming soon"
                            >
                                Week
                            </button>
                            <button
                                className={`view-btn ${view === 'month' ? 'active' : ''}`}
                                onClick={() => setView('month')}
                                disabled
                                title="Coming soon"
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
                            className="add-todo-btn-main"
                            onClick={() => setIsTodoModalOpen(true)}
                            aria-label="Add Todo"
                        >
                            <span className="plus-icon">+</span> Create
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
                    {view !== 'agenda' && (
                        <div className="placeholder-view">
                            {view.charAt(0).toUpperCase() + view.slice(1)} view coming soon...
                        </div>
                    )}
                </div>
            </div>

            {/* Todo Modal */}
            {isTodoModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Add New Todo</h3>
                        <form onSubmit={handleAddTodo}>
                            <div className="form-group">
                                <label>Title</label>
                                <input
                                    type="text"
                                    value={newTodoTitle}
                                    onChange={e => setNewTodoTitle(e.target.value)}
                                    required
                                    autoFocus
                                    placeholder="Enter task name..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    value={newTodoDate}
                                    onChange={e => setNewTodoDate(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Course (Optional)</label>
                                <select
                                    value={newTodoCourse}
                                    onChange={e => setNewTodoCourse(e.target.value)}
                                >
                                    <option value="">No Course</option>
                                    {courses.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" onClick={() => setIsTodoModalOpen(false)}>Cancel</button>
                                <button type="submit" className="primary">Add Todo</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Calendar;
