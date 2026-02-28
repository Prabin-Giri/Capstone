# Capstone – Automated Grading System

Full-stack assignment submission and grading system with React frontend and Express/MySQL backend.

## Tech Stack
- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express
- **Database:** MySQL (mysql2)

## Getting Started

### Requirements
- Node.js (LTS recommended)
- npm

### Install & Run

**1. Install dependencies:**
```bash
npm install
cd server && npm install
cd ..
```

**2. Start both servers:**
```bash
npm run dev
```

This runs both frontend (http://localhost:5173) and backend (http://localhost:3001) together.

**Alternative (separate terminals):**
- `npm run dev:frontend` – Frontend only
- `npm run dev:server` – Backend only

## Features
- Student dashboard with course list
- View assignments per course
- Submit assignments (file upload)
- Resubmit assignments
- View submission status and feedback
s
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
│   ├── db.js               # MySQL connection pool
│   ├── routes/             # API routes
│   └── uploads/            # Uploaded files (gitignored)
└── package.json
```

## Build
```bash
npm run build
```
