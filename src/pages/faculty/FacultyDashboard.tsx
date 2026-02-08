import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Link } from 'react-router-dom';

// Mock data for faculty courses
const MOCK_FACULTY_COURSES = [
    { id: 'CSCI4060', name: 'Software Engineering', term: 'Spring 2026', students: 42, activeAssignments: 2 },
    { id: 'CSCI2100', name: 'Data Structures', term: 'Spring 2026', students: 128, activeAssignments: 1 },
    { id: 'CSCI1100', name: 'Intro to Computer Science', term: 'Spring 2026', students: 250, activeAssignments: 0 },
];

const FacultyDashboard: React.FC = () => {
    const [courses, setCourses] = useState(MOCK_FACULTY_COURSES);

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Faculty Dashboard</h1>
                    <p className="text-gray-600">Overview of your active courses.</p>
                </div>
                <Button>
                    + Create New Course
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.map((course) => (
                    <Card key={course.id} className="hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{course.id}</h3>
                                <p className="text-sm text-gray-500">{course.term}</p>
                            </div>
                            <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded">
                                Active
                            </span>
                        </div>

                        <h4 className="text-xl font-medium text-gray-800 mb-4">{course.name}</h4>

                        <div className="flex justify-between text-sm text-gray-600 border-t pt-4 border-gray-100">
                            <div>
                                <span className="block font-bold text-gray-900">{course.students}</span>
                                <span>Students</span>
                            </div>
                            <div>
                                <span className="block font-bold text-gray-900">{course.activeAssignments}</span>
                                <span>Active Assignments</span>
                            </div>
                        </div>

                        <div className="mt-6 flex space-x-3">
                            <Link to={`/faculty/courses/${course.id}`} className="flex-1">
                                <Button variant="outline" className="w-full text-xs">View Course</Button>
                            </Link>
                            <Link to={`/faculty/courses/${course.id}/grading`} className="flex-1">
                                <Button variant="secondary" className="w-full text-xs">Needs Grading</Button>
                            </Link>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default FacultyDashboard;
