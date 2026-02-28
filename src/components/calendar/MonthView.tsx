import React from 'react';
import { Link } from 'react-router-dom';
import type { Assignment, Todo } from '../../lib/api';
import './MonthView.css';

interface MonthViewProps {
    assignments: Assignment[];
    todos: Todo[];
    courseColors: Record<string, string>;
    selectedDate: Date;
    onDateChange: (date: Date) => void;
    onDeleteTodo: (id: string) => void;
    userRole?: string;
}

export const MonthView: React.FC<MonthViewProps> = ({
    assignments,
    todos,
    courseColors,
    selectedDate,
    onDateChange,
    onDeleteTodo,
    userRole = 'student'
}) => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Previous month's trailing days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
        days.push({
            date: new Date(year, month - 1, prevMonthLastDay - i),
            currentMonth: false
        });
    }

    // Current month's days
    for (let i = 1; i <= daysInMonth; i++) {
        days.push({
            date: new Date(year, month, i),
            currentMonth: true
        });
    }

    // Next month's leading days
    const remaining = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= remaining; i++) {
        days.push({
            date: new Date(year, month + 1, i),
            currentMonth: false
        });
    }

    const getItemsForDate = (date: Date) => {
        const targetYear = date.getFullYear();
        const targetMonth = date.getMonth();
        const targetDay = date.getDate();

        const dayAssignments = assignments.filter(a => {
            if (!a.due_date) return false;
            const d = new Date(a.due_date);
            return d.getFullYear() === targetYear &&
                d.getMonth() === targetMonth &&
                d.getDate() === targetDay;
        });

        const dayTodos = todos.filter(t => {
            if (!t.due_date) return false;
            const d = new Date(t.due_date);
            return d.getFullYear() === targetYear &&
                d.getMonth() === targetMonth &&
                d.getDate() === targetDay;
        });

        return [
            ...dayAssignments.map(a => ({ type: 'assignment' as const, id: a.id, title: a.title, color: courseColors[a.course_id] || '#3b82f6', courseId: a.course_id })),
            ...dayTodos.map(t => ({ type: 'todo' as const, id: t.id, title: t.title, color: t.course_id ? (courseColors[t.course_id] || '#3b82f6') : '#6b7280', courseId: t.course_id, original: t }))
        ];
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const isSelected = (date: Date) => {
        return date.getDate() === selectedDate.getDate() &&
            date.getMonth() === selectedDate.getMonth() &&
            date.getFullYear() === selectedDate.getFullYear();
    };

    return (
        <div className="month-view">
            <div className="month-grid-header">
                <span>SUN</span><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span>
            </div>
            <div className="month-grid">
                {days.map((day, idx) => {
                    const items = getItemsForDate(day.date);
                    return (
                        <div
                            key={idx}
                            className={`month-cell ${day.currentMonth ? '' : 'other-month'} ${isToday(day.date) ? 'today' : ''} ${isSelected(day.date) ? 'selected' : ''}`}
                            onClick={() => onDateChange(day.date)}
                        >
                            <span className="cell-day">{day.date.getDate()}</span>
                            <div className="cell-events">
                                {items.slice(0, 3).map((item) => {
                                    const pill = (
                                        <div
                                            key={`${item.type}-${item.id}`}
                                            className={`event-pill ${item.type}`}
                                            style={{ backgroundColor: item.color }}
                                            title={item.type === 'todo' ? 'Personal Todo' : 'Course Assignment (Click to view)'}
                                        >
                                            <span className="pill-icon">
                                                {item.type === 'assignment' ? '📝' : '🔘'}
                                            </span>
                                            <span className="pill-title">{item.title}</span>
                                            {item.type === 'todo' && (
                                                <button
                                                    className="delete-pill-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteTodo(item.id);
                                                    }}
                                                    aria-label="Delete todo"
                                                >
                                                    &times;
                                                </button>
                                            )}
                                        </div>
                                    );

                                    if (item.type === 'assignment') {
                                        return (
                                            <Link
                                                key={`${item.type}-${item.id}`}
                                                to={userRole === 'faculty'
                                                    ? `/faculty/courses/${item.courseId}/assignments/${item.id}/grading`
                                                    : `/student/courses/${item.courseId}/assignments/${item.id}`
                                                }
                                                className="event-link"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {pill}
                                            </Link>
                                        );
                                    }

                                    return pill;
                                })}
                                {items.length > 3 && (
                                    <div className="more-events">+{items.length - 3} more</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
