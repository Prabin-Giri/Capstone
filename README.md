# Capstone – Automated Grading System

Full-stack assignment submission and grading system with React frontend and Express/SQLite backend.

## Tech Stack
- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express
- **Database:** SQLite (sql.js)

## Getting Started

### Requirements
- Node.js (LTS recommended)
- npm

### Install & Run

**1. Install frontend dependencies:**
```bash
npm install
```

**2. Install backend dependencies:**
```bash
cd server && npm install
```

**3. Start backend server (Terminal 1):**
```bash
cd server && npm run dev
```
Backend runs on http://localhost:3001

**4. Start frontend (Terminal 2):**
```bash
npm run dev
```
Frontend runs on http://localhost:5173

## Features
- Student dashboard with course list
- View assignments per course
- Submit assignments (file upload)
- Resubmit assignments
- View submission status and feedback

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/courses` | List all courses |
| GET | `/api/courses/:id/assignments` | Get assignments for a course |
| GET | `/api/submissions` | Get submissions (filter by student_id, assignment_id) |
| POST | `/api/submissions` | Submit assignment (file upload) |
| PUT | `/api/submissions/:id` | Update submission |
| DELETE | `/api/submissions/:id` | Delete submission |

## Project Structure
```
├── src/                    # React frontend
│   ├── pages/              # Page components
│   └── lib/api.ts          # API client
├── server/                 # Express backend
│   ├── index.js            # Server entry
│   ├── db.js               # SQLite database
│   ├── routes/             # API routes
│   └── uploads/            # Uploaded files (gitignored)
└── package.json
```

## Build
```bash
npm run build
```
