# UI State Definitions

## Global UI States

### Loading
- **Skeleton:** Use for initial data fetch (Cards, Tables). Retains layout structure.
- **Spinner:** Use for actions (Buttons) or overlays (Blocking interactions during upload).

### Empty
- **Context:** displayed when a list or resource is empty.
- **Elements:**
  - **Illustration/Icon:** Relevant to the context.
  - **Message:** "No assignments yet".
  - **Action:** Primary call to action if applicable (e.g., "Create Assignment").

### Error
- **Validation Errors:** Inline below form fields (Red text).
- **System Errors:** Toast notification or banner (Global).
- **Critical Failure:** Full page error (500) with "Retry" button.

### Success
- **Action Confirmation:** Toast notification (Auto-dismissing).
- **State Change:** Badge update (e.g., Status changes from Running to Completed).

## Domain-Specific Status Vocabulary (Verbatim)

### Submission / Execution Status
| Status | Visual Indicator | Description |
|--------|------------------|-------------|
| `queued` | Yellow Dot / Badge | Submission received, waiting for autograder. |
| `running` | Blue Spinner / Pulse | Code is currently executing. |
| `completed` | Green Check / Badge | Execution finished (Pass or Fail logic handled by grade). |
| `failed` | Red X / Badge | Runtime error, Compilation error, or System crash. |
| `timed out` | Orange Clock / Badge | Execution exceeded time limits. |

### Visibility Status
| Status | Visual Indicator | Description |
|--------|------------------|-------------|
| `hidden` | Eye Off Icon / Gray | Not visible to students. |
| `released` | Eye Icon / Green | Visible to students. |

### Assignment Availability
| Status | Visual Indicator | Description |
|--------|------------------|-------------|
| `open` | Green Badge | Currently accepting submissions. |
| `closed` | Red/Gray Badge | Deadline passed, no submissions accepted (unless late policy). |
| `late` | Orange Badge | Accepting submissions with late penalty. |
