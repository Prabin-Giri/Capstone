import os

files = [
    "server/package.json", 
    "src/lib/api.ts", 
    ".gitignore", 
    "server/db.js", 
    "server/routes/assignments.js", 
    "server/routes/courses.js", 
    "server/routes/submissions.js", 
    "server/index.js",
    "server/package-lock.json",
    "server/schema.sql",
    "src/pages/student/ClassAssignments.tsx",
    "src/pages/student/StudentDashboard.tsx",
    "src/pages/student/SubmissionResults.tsx",
    "src/pages/student/SubmitAssignment.tsx"
]

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'r') as file:
        lines = file.readlines()
    
    out_lines = []
    state = "NORMAL" # NORMAL, IN_HEAD, IN_THEIRS
    
    for line in lines:
        if line.startswith("<<<<<<<"):
            state = "IN_HEAD"
            continue
        elif line.startswith("======="):
            state = "IN_THEIRS"
            continue
        elif line.startswith(">>>>>>>"):
            state = "NORMAL"
            continue
            
        if state == "NORMAL":
            out_lines.append(line)
        elif state == "IN_THEIRS":
            out_lines.append(line)
            
    with open(f, 'w') as file:
        file.writelines(out_lines)
print("Resolved all files.")
