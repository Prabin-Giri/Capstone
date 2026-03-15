import React, { useState } from 'react';
import type { Course } from '../../lib/api';
import { PRESET_COLORS } from '../../lib/colors';
import './CalendarSidebar.css';

interface CalendarSidebarProps {
    courses: Course[];
    courseColors: Record<string, string>;
    onColorChange: (courseId: string, color: string) => void;
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

export const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
    courses,
    courseColors,
    onColorChange,
    selectedDate,
    onDateChange
}) => {
    // Current month for mini calendar
    const [currentDate, setCurrentDate] = useState(new Date());

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0 = Sun

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstDay }, (_, i) => i);

    const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleDateClick = (day: number) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        onDateChange(newDate);
    };

    return (
        <div className="calendar-sidebar">
            {/* Mini Calendar */}
            <div className="mini-calendar">
                <div className="mini-header">
                    <button className="nav-btn" onClick={handlePrevMonth}>&lt;</button>
                    <span>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                    <button className="nav-btn" onClick={handleNextMonth}>&gt;</button>
                </div>
                <div className="mini-days-header">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                </div>
                <div className="mini-grid">
                    {blanks.map(i => <div key={`blank-${i}`} className="mini-day empty"></div>)}
                    {days.map(d => {
                        const isSelected =
                            d === selectedDate.getDate() &&
                            currentDate.getMonth() === selectedDate.getMonth() &&
                            currentDate.getFullYear() === selectedDate.getFullYear();

                        const isToday =
                            d === new Date().getDate() &&
                            currentDate.getMonth() === new Date().getMonth() &&
                            currentDate.getFullYear() === new Date().getFullYear();

                        return (
                            <div
                                key={`day-${d}`}
                                className={`mini-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleDateClick(d)}
                            >
                                {d}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Calendars List */}
            <div className="calendars-list">
                <h3 className="section-title">CALENDARS</h3>
                <ul>
                    {courses.length === 0 && <li className="empty-msg">No courses found</li>}
                    {courses.map(course => (
                        <li key={course.id} className="calendar-item">
                            <div className="color-picker-wrapper">
                                <button
                                    className="color-dot"
                                    style={{ backgroundColor: courseColors[course.id] || '#3b82f6' }}
                                    onClick={() => setActiveColorPicker(activeColorPicker === course.id ? null : course.id)}
                                    aria-label={`Change color for ${course.name}`}
                                />
                                {activeColorPicker === course.id && (
                                    <div className="color-popover">
                                        <div className="color-grid">
                                            {PRESET_COLORS.map(c => (
                                                <button
                                                    key={c.value}
                                                    className="color-option"
                                                    style={{ backgroundColor: c.value }}
                                                    title={c.name}
                                                    onClick={() => {
                                                        onColorChange(course.id, c.value);
                                                        setActiveColorPicker(null);
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <span className="course-name">{course.name}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
