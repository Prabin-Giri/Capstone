import React from 'react';
import type { Assignment, Todo } from '../../lib/api';
import './MonthView.css';

interface MonthViewProps {
    assignments: Assignment[];
    todos: Todo[];
    courseColors: Record<string, string>;
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

export const MonthView: React.FC<MonthViewProps> = ({
    assignments,
    todos,
    courseColors,
    selectedDate,
    onDateChange
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
        const dStr = date.toISOString().split('T')[0];

        const dayAssignments = assignments.filter(a => a.due_date && a.due_date.startsWith(dStr));
        const dayTodos = todos.filter(t => t.due_date && t.due_date.startsWith(dStr));

        return [
            ...dayAssignments.map(a => ({ type: 'assignment', id: a.id, title: a.title, color: courseColors[a.course_id] || '#3b82f6' })),
            ...dayTodos.map(t => ({ type: 'todo', id: t.id, title: t.title, color: t.course_id ? (courseColors[t.course_id] || '#3b82f6') : '#6b7280' }))
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
                                {items.slice(0, 3).map((item) => (
                                    <div
                                        key={`${item.type}-${item.id}`}
                                        className={`event-pill ${item.type}`}
                                        style={{ backgroundColor: item.color }}
                                    >
                                        {item.title}
                                    </div>
                                ))}
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
