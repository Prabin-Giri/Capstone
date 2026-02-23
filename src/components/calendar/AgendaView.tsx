import React from 'react';
import type { Assignment, Todo } from '../../lib/api';
import './AgendaView.css';

interface AgendaViewProps {
    assignments: Assignment[];
    todos: Todo[];
    courseColors: Record<string, string>;
    onToggleTodo: (id: string, completed: boolean) => void;
    onDeleteTodo: (id: string) => void;
    selectedDate: Date;
}

interface AgendaItem {
    type: 'assignment' | 'todo';
    id: string;
    title: string;
    date: Date;
    courseId?: string;
    completed?: boolean;
    original: Assignment | Todo;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
    assignments,
    todos,
    courseColors,
    onToggleTodo,
    onDeleteTodo,
    selectedDate
}) => {
    // Calculate end date (selected date + 6 days = 7 days total)
    const startDate = new Date(selectedDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    const parseDateLocal = (dateStr: string | undefined | null) => {
        if (!dateStr) return new Date();
        if (dateStr.length === 10) {
            // It's YYYY-MM-DD, parse as local midnight
            const [y, m, d] = dateStr.split('-');
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        }
        return new Date(dateStr);
    };

    const items: AgendaItem[] = [
        ...assignments.map(a => ({
            type: 'assignment' as const,
            id: a.id,
            title: a.title,
            date: a.due_date ? parseDateLocal(a.due_date) : new Date(8640000000000000),
            courseId: a.course_id,
            original: a
        })),
        ...todos.map(t => ({
            type: 'todo' as const,
            id: t.id,
            title: t.title,
            date: parseDateLocal(t.due_date),
            courseId: t.course_id,
            completed: t.completed,
            original: t
        }))
    ].filter(item => {
        const d = item.date;
        return d >= startDate && d <= endDate;
    }).sort((a, b) => a.date.getTime() - b.date.getTime());

    // Group by date (YYYY-MM-DD)
    const groupedItems: Record<string, AgendaItem[]> = {};
    items.forEach(item => {
        const dateKey = item.date.toISOString().split('T')[0];
        if (!groupedItems[dateKey]) groupedItems[dateKey] = [];
        groupedItems[dateKey].push(item);
    });

    const sortedDates = Object.keys(groupedItems).sort();

    const getCourseColor = (courseId?: string) => {
        if (!courseId) return '#6b7280'; // Gray
        return courseColors[courseId] || '#3b82f6'; // Default Blue
    };

    return (
        <div className="agenda-view">
            <h3 className="agenda-date-header">
                {startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </h3>

            {sortedDates.length === 0 ? (
                <div className="empty-state">No events for these 7 days</div>
            ) : (
                sortedDates.map(dateKey => {
                    const dateItems = groupedItems[dateKey];
                    const dateObj = new Date(dateKey + 'T12:00:00');

                    return (
                        <div key={dateKey} className="agenda-day">
                            <h3 className="agenda-date">
                                {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </h3>
                            <div className="agenda-items">
                                {dateItems.map(item => (
                                    <div key={`${item.type}-${item.id}`} className="agenda-item">
                                        <div
                                            className="item-color-strip"
                                            style={{ backgroundColor: getCourseColor(item.courseId) }}
                                        />
                                        <div className="item-content">
                                            {item.type === 'todo' ? (
                                                <div className="todo-row">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.completed}
                                                        onChange={(e) => onToggleTodo(item.id, e.target.checked)}
                                                        className="todo-checkbox"
                                                    />
                                                    <span className={`todo-title ${item.completed ? 'completed' : ''}`}>
                                                        {item.title}
                                                    </span>
                                                    {(item.date.getHours() !== 0 || item.date.getMinutes() !== 0) && (
                                                        <span className="todo-time">
                                                            Due {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="assignment-row">
                                                    <span className="assignment-icon" role="img" aria-label="assignment">📝</span>
                                                    <span className="assignment-title">{item.title}</span>
                                                    <span className="assignment-time">
                                                        Due {(item.date.getHours() !== 0 || item.date.getMinutes() !== 0)
                                                            ? item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                            : '11:59 PM'}
                                                    </span>
                                                </div>
                                            )}
                                            {item.courseId && (
                                                <div
                                                    className="item-course-tag"
                                                    style={{ color: getCourseColor(item.courseId) }}
                                                >
                                                    {item.courseId}
                                                </div>
                                            )}
                                            {item.type === 'todo' && (
                                                <button
                                                    onClick={() => onDeleteTodo(item.id)}
                                                    className="delete-todo-btn"
                                                    aria-label="Delete todo"
                                                >
                                                    &times;
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};
