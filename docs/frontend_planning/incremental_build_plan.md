# Incremental Frontend Build Plan

This plan breaks down the frontend development into discrete, verifiable steps. Each step produces a concrete artifact and ends with a git commit.

## Phase 1: Foundation & Student Core

### Step 1: Project Initialization & Routing
- **Goal:** Set up the project shell, router, and basic layout.
- **Artifacts:** 
  - `src/App.tsx` (Router setup)
  - `src/layouts/DashboardLayout.tsx` (Shell with Sidebar/Header)
  - `src/pages/NotFound.tsx`
- **Verification:** Run app, navigate to `/` (redirects to login/student), see the layout.
- **Commit:** `chore: init project structure and routing`

### Step 2: Core UI Components (Part 1)
- **Goal:** Implement base atoms needed for dashboards.
- **Artifacts:**
  - `src/components/ui/Card.tsx`
  - `src/components/ui/Badge.tsx` (With Status Vocabulary handling)
  - `src/components/ui/Button.tsx`
- **Verification:** View components in a test page or Storybook (if used).
- **Commit:** `feat: implement card and badge components`

### Step 3: Student Dashboard (Class List)
- **Goal:** Display list of classes and assignment summary.
- **Artifacts:**
  - `src/pages/student/Dashboard.tsx`
  - `src/components/ClassCard.tsx`
  - Mock Data for classes.
- **Verification:** `/student` shows grid of classes.
- **Commit:** `feat: student dashboard screen`

### Step 4: Assignment Details & File Upload
- **Goal:** View assignment instructions and "Submit" interface.
- **Artifacts:**
  - `src/pages/student/AssignmentDetails.tsx`
  - `src/components/FileUploader.tsx`
  - `src/components/CodeViewer.tsx` (ReadOnly for starter code)
- **Verification:** Click assignment -> View Details -> Upload file -> Visual feedback.
- **Commit:** `feat: assignment details and submission ui`

### Step 5: Submission Results View
- **Goal:** Display `Queued` -> `Running` -> `Result` states.
- **Artifacts:**
  - `src/pages/student/SubmissionResults.tsx`
  - `src/components/TestResultList.tsx`
  - Mock logic to simulate state transition.
- **Verification:** Submit file -> Watch state change to `Running` then `Completed`.
- **Commit:** `feat: submission results and status tracking`

## Phase 2: Faculty & Grading

### Step 6: Faculty Dashboard & Class Management
- **Goal:** Faculty landing page with Roster view.
- **Artifacts:**
  - `src/pages/faculty/Dashboard.tsx`
  - `src/pages/faculty/ClassManager.tsx`
  - `src/components/RosterTable.tsx`
- **Verification:** `/faculty` shows classes. Click class -> See roster.
- **Commit:** `feat: faculty dashboard and class roster`

### Step 7: Assignment Creation Wizard
- **Goal:** specific form for creating assignments.
- **Artifacts:**
  - `src/pages/faculty/AssignmentEditor.tsx`
  - `src/components/forms/RubricBuilder.tsx`
  - `src/components/forms/TestCaseUploader.tsx`
- **Verification:** `/faculty/.../create` -> Fill form -> Save -> Console log payload.
- **Commit:** `feat: assignment creation flow`

### Step 8: Grading Dashboard
- **Goal:** View all submissions and manual grading.
- **Artifacts:**
  - `src/pages/faculty/GradingDashboard.tsx`
  - `src/components/SubmissionTable.tsx` (With Bulk Actions)
- **Verification:** View submissions table, filter by status.
- **Commit:** `feat: faculty grading dashboard`

### Step 9: Reports & Polish
- **Goal:** Visualize class performance.
- **Artifacts:**
  - `src/pages/faculty/Reports.tsx`
  - `src/components/charts/ScoreDistribution.tsx`
- **Verification:** View charts with mock data.
- **Commit:** `feat: course reporting screen`
