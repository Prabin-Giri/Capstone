import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CodeViewer } from '../../components/ui/CodeViewer';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { assignments, courses } from '../../lib/mockData';

const AssignmentDetails: React.FC = () => {
    const { courseId, assignmentId } = useParams();
    const assignment = assignments.find(
        (item) => item.id === assignmentId && item.courseId === courseId
    );
    const selectedCourse = courses.find((course) => course.id === courseId);

    if (!assignment || !selectedCourse) {
        const backLink = courseId ? `/student/courses/${courseId}/assignments` : '/student';
        return (
            <div className="p-6">
                <Card className="max-w-4xl mx-auto text-center py-10">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Assignment not found</h1>
                    <p className="text-gray-600 mb-6">We could not find that assignment.</p>
                    <Link to={backLink}>
                        <Button variant="secondary">Back to Assignments</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        <span>{selectedCourse.name}</span>
                        <span>•</span>
                        <span>Due: {assignment.dueDate}</span>
                    </div>
                </div>
                <StatusBadge status={assignment.status} />
            </div>

            <Card title="Overview">
                <p className="text-gray-700 leading-relaxed">
                    {assignment.description || "No description provided for this assignment."}
                </p>
            </Card>

            {assignment.starterCode && (
                <Card title="Starter Code">
                    <CodeViewer
                        code={assignment.starterCode}
                        language="typescript"
                        filename="starter.ts"
                    />
                    <div className="mt-4">
                        <Button variant="outline" size="sm">Download Starter Code</Button>
                    </div>
                </Card>
            )}

            <div className="flex justify-end pt-4">
                <Link to="submit">
                    <Button size="lg">Submit Assignment</Button>
                </Link>
            </div>
        </div>
    );
};

export default AssignmentDetails;
