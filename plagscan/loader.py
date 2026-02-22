"""
Step 1: Loader — Walk submission folders and collect source files.

Reads from a filesystem directory where each subdirectory is a student
submission containing their source files.
"""

import os
from typing import List, Set

from .models import SourceFile, Submission

# Source file extensions we care about
SOURCE_EXTENSIONS: Set[str] = {
    '.py', '.java', '.js', '.jsx', '.ts', '.tsx',
    '.php', '.html', '.css', '.c', '.cpp', '.h',
    '.cs', '.rb', '.go', '.rs', '.swift', '.kt',
}

# Directories to always skip
IGNORED_DIRS: Set[str] = {
    'node_modules', 'venv', '.venv', 'env', '.env',
    '.git', 'dist', 'build', '__pycache__',
    '.idea', '.vscode', '.next', 'coverage',
    'target', 'bin', 'obj',
}


def load_submissions(submissions_dir: str) -> List[Submission]:
    """
    Load all student submissions from a directory.

    Expected layout:
        submissions_dir/
            s001/          <- student submission folder
                main.py
                utils.py
            s002/
                solution.java
            ...

    Args:
        submissions_dir: Path to the root submissions directory.

    Returns:
        List of Submission objects, each with their source files loaded.

    Raises:
        FileNotFoundError: If submissions_dir doesn't exist.
    """
    if not os.path.isdir(submissions_dir):
        raise FileNotFoundError(
            f"Submissions directory not found: {submissions_dir}"
        )

    submissions: List[Submission] = []

    # Each immediate subdirectory is a student submission
    for entry in sorted(os.listdir(submissions_dir)):
        student_dir = os.path.join(submissions_dir, entry)
        if not os.path.isdir(student_dir):
            continue

        files = _collect_source_files(student_dir)
        if files:  # Only include submissions that have source files
            submissions.append(Submission(id=entry, files=files))

    return submissions


def _collect_source_files(root_dir: str) -> List[SourceFile]:
    """
    Recursively collect all source files from a directory,
    skipping ignored directories and non-source files.
    """
    source_files: List[SourceFile] = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Prune ignored directories (modifying dirnames in-place)
        dirnames[:] = [
            d for d in dirnames
            if d not in IGNORED_DIRS
        ]

        for filename in sorted(filenames):
            ext = os.path.splitext(filename)[1].lower()
            if ext not in SOURCE_EXTENSIONS:
                continue

            full_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(full_path, root_dir)

            try:
                with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                    text = f.read()
                source_files.append(SourceFile(
                    relative_path=rel_path,
                    text=text,
                ))
            except (IOError, OSError) as e:
                print(f"Warning: Could not read {full_path}: {e}")

    return source_files
