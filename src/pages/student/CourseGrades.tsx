import React from 'react';
import { useParams } from 'react-router-dom';
import { courses } from '../../lib/mockData';
import './CourseGrades.css';

const CourseGrades: React.FC = () => {
    const { courseId } = useParams();
    const course = courses.find((item) => item.id === courseId);

    return (
        <div className="course-grades">
            <h1 className="grades-title">Grades</h1>
            <p className="grades-subtitle">
                {course ? `${course.name} grades will appear here.` : 'Grades will appear here.'}
            </p>
            <div className="state-card">No grades posted yet.</div>
        </div>
    );
};

export default CourseGrades;
