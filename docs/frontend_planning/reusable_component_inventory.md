# Reusable Component Inventory

## Layout Components
- **DashboardLayout:** Sidebar navigation, top bar (User profile, Breadcrumbs), main content area.
- **PageHeader:** Title, descriptions, and primary page actions (e.g., "Create Assignment").
- **Card:** Container for content sections (Instructions, Submission Box).

## Data Display
- **DataTable:**
  - Features: Sortable headers, Pagination, Row actions.
  - Usage: Assignment lists, Roster, Submission history.
- **StatusBadge:**
  - Variants: 
    - `Queued` (Yellow/Gray)
    - `Running` (Blue/Pulse)
    - `Completed` (Green)
    - `Failed` (Red)
    - `Timed Out` (Orange)
  - Usage: Submission status, Assignment status.
- **InfoList:** Key-value pairs for quick details (e.g., "Due Date: Oct 12").

## Forms & Input
- **FormGroup:** Label, Input, Helper text, Error message.
- **CodeEditor:**
  - Features: Syntax highlighting (Monaco/Ace), Read-only mode, Diff view.
  - Usage: Starter code preview, Submission viewer.
- **FileUploader:**
  - Features: Drag & drop, File type validation, Progress bar.
  - Usage: Assignment submission, Starter code upload.
- **SearchInput:** Filter lists/tables.
- **DatePicker:** Start/End date selection.

## Feedback & Overlays
- **Modal:**
  - Usage: Confirmations (Delete), Quick forms (Add Student).
- **Alert/Toast:**
  - Variants: Success, Error, Warning, Info.
  - Usage: "Submission uploaded", "Compilation failed".
- **LoadingState:**
  - Variants: Full screen spinner, Skeleton rows for tables, Button loading spinner.
- **EmptyState:**
  - Content: Icon, Title, Description, Action button.
  - Usage: "No assignments found".

## Navigation
- **Tabs:** Switch between sub-views (e.g., "Instructions" vs "Rubric").
- **Breadcrumbs:** Navigation hierarchy.
- **Pagination:** Next/Prev/Page numbers.
