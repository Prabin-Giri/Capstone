# Frontend Route Map

## Student Routes

| Route | Description | Associated Screen |
|-------|-------------|-------------------|
| `/student` | Student Dashboard (Class List) | Student Dashboard |
| `/student/classes/:classId` | Assignments for a specific class | Class Details / Assignment List |
| `/student/classes/:classId/assignments/:assignmentId` | Assignment Details & Submission | Assignment View |
| `/student/classes/:classId/assignments/:assignmentId/results/:submissionId` | Specific submission results | Submission Results |
| `/student/profile` | User profile (Password update) | Profile Settings |

## Faculty Routes

| Route | Description | Associated Screen |
|-------|-------------|-------------------|
| `/faculty` | Faculty Dashboard (Class List) | Faculty Dashboard |
| `/faculty/classes/create` | Create a new class | Class Creation Modal/Page |
| `/faculty/classes/:classId` | Class Management (Roster, Assignment List) | Class Management |
| `/faculty/classes/:classId/assignments/create` | Create new assignment | Assignment Editor |
| `/faculty/classes/:classId/assignments/:assignmentId/edit` | Edit assignment | Assignment Editor |
| `/faculty/classes/:classId/assignments/:assignmentId/grading` | Grading Dashboard | Grading Dashboard |
| `/faculty/classes/:classId/reports` | Course Reports | Course Reports |

## Public/Auth Routes

| Route | Description |
|-------|-------------|
| `/login` | Login Screen |
| `/unauthorized` | Access Denied |
| `/404` | Not Found |
