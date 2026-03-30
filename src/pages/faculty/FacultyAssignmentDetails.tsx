import React from 'react';
import AssignmentWizard from './AssignmentWizard';

/** Same UI as Edit Assignment, read-only; Edit / Grade in header (see AssignmentWizard viewOnly). */
const FacultyAssignmentDetails: React.FC = () => <AssignmentWizard viewOnly />;

export default FacultyAssignmentDetails;
