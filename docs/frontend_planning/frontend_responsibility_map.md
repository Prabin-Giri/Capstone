# Frontend Responsibility Map

## User: Student

### Screen: Student Dashboard (Home)
**Use Cases:**
- UC-S6 Select Multiple Classes
- UC-S11 View Assignment Status and Deadlines

**UI States:**
- **Loading:** Fetching class list.
- **Empty:** No classes enrolled.
- **Default:** List of classes with active assignments summary.

### Screen: Class Details / Assignment List
**Use Cases:**
- UC-S11 View Assignment Status and Deadlines
- UC-S5 View Grading Results (Summary)

**UI States:**
- **Loading:** Fetching assignments.
- **Empty:** No assignments available.
- **Default:** List of assignments (Open, Closed, Late) with status (Queued, Running, Completed, Failed, Timed Out).

### Screen: Assignment View (Details & Submission)
**Use Cases:**
- UC-S1 Submit Program/Assignment
- UC-S3 Access Starter Code (Download)
- UC-S4 View Grading Rubric and Testing Criteria
- UC-S10 Download Submitted Files

**UI States:**
- **Loading:** Fetching assignment details.
- **Default:** Assignment instructions, rubric, starter code download button, submission upload area.
- **Submitting:** Uploading files (Progress indicator).
- **Submitted:** Success message, link to view results.
- **Error:** Upload failed (File type, size limit).

### Screen: Submission Results (Public Tests)
**Use Cases:**
- UC-S2 Test Code Against Public Test Data
- UC-S9 View Public Test Results in Detail

**UI States:**
- **Queued:** Waiting for autograder resources.
- **Running:** Execution in progress (Spinner/Progress bar).
- **Completed (Pass):** All public tests passed.
- **Completed (Fail):** Some tests failed (Show Diff/Output).
- **Failed/Timed Out:** System error or execution timeout.

### Screen: Submission History
**Use Cases:**
- UC-S8 View Submission History
- UC-S5 View Grading Results

**UI States:**
- **Loading:** Fetching history.
- **Empty:** No submissions yet.
- **Default:** List of past submissions with timestamps and results.

---

## User: Faculty

### Screen: Faculty Dashboard
**Use Cases:**
- UC-F9 Create Class (View list)
- UC-F18 View Reporting Dashboard (Summary)

**UI States:**
- **Loading:** Fetching classes.
- **Empty:** No classes created.
- **Default:** List of classes, quick actions (Create Class).

### Screen: Class Management
**Use Cases:**
- UC-F10 Import Student Roster
- UC-F11 Create Single-Student Account
- UC-F12 Manage Assignment Availability (List)

**UI States:**
- **Default:** Student roster table, Assignment list.

### Screen: Assignment Editor (Create/Edit)
**Use Cases:**
- UC-F1 Create Assignment
- UC-F2 Select Programming Language(s)
- UC-F3 Create Public Test Data
- UC-F4 Create Private Test Data
- UC-F5 Design Weighted Rubric
- UC-F6 Design Unweighted Rubric

**UI States:**
- **Draft:** Editing form (Title, Description, Language).
- **Test Configuration:** Upload/Edit test cases (Public/Private).
- **Rubric Designer:** Adding criteria and weights.
- **Saving:** Sending data to backend.

### Screen: Grading Dashboard & Submissions
**Use Cases:**
- UC-F13 Release or Hide Grading Results
- UC-F14 Trigger Automatic Grading
- UC-F15 Grade Assignment (Manual Override)
- UC-F16 Download Submissions (Bulk)
- UC-F17 Re-run Grading (Regrade)

**UI States:**
- **Default:** List of students with submission status and grades.
- **Grading In Progress:** Bulk grading progress bar.
- **Manual Grade:** Editor for overriding scores.

### Screen: Course Reports
**Use Cases:**
- UC-F18 View Reporting Dashboard
- UC-F19 Generate Printable Reports

**UI States:**
- **Loading:** Generating metrics.
- **Default:** Charts/Tables of class performance.
