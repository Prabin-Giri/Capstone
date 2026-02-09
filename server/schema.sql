-- AutoGrade Database Schema
-- Run: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS autograde;
USE autograde;

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    term VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assignments table
CREATE TABLE IF NOT EXISTS assignments (
    id VARCHAR(50) PRIMARY KEY,
    course_id VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    status ENUM('active', 'closed', 'late') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id VARCHAR(50) NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('pending', 'graded', 'returned') DEFAULT 'pending',
    grade DECIMAL(5,2) DEFAULT NULL,
    feedback TEXT DEFAULT NULL,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    UNIQUE KEY unique_submission (assignment_id, student_id)
);

-- Insert sample courses
INSERT INTO courses (id, name, term) VALUES
    ('CSCI4060', 'Software Engineering', 'Spring 2026'),
    ('CSCI2100', 'Data Structures', 'Spring 2026'),
    ('CSCI1100', 'Intro to Computer Science', 'Spring 2026')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Insert sample assignments
INSERT INTO assignments (id, course_id, title, due_date, status) VALUES
    ('lang-platform', 'CSCI4060', 'Language and Platform', '2026-02-19', 'active'),
    ('sprint-1', 'CSCI4060', 'Sprint 1 Planning', '2026-03-02', 'closed'),
    ('linked-lists', 'CSCI2100', 'Linked List Utilities', '2026-02-18', 'late'),
    ('stacks-queues', 'CSCI2100', 'Stacks and Queues', '2026-03-01', 'active'),
    ('intro-lab', 'CSCI1100', 'Intro Lab', '2026-02-10', 'closed')
ON DUPLICATE KEY UPDATE title = VALUES(title);
