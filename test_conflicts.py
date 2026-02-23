import os
files = ["server/package.json", "src/lib/api.ts", ".gitignore", "server/db.js", "server/routes/assignments.js", "server/routes/courses.js", "server/routes/submissions.js", "server/schema.sql"]
for f in files:
    if not os.path.exists(f): continue
    print(f"--- {f} ---")
    with open(f) as file:
        lines = file.readlines()
    in_marker = False
    for line in lines:
        if line.startswith("<<<<<<<"):
            in_marker = True
        if in_marker:
            print(line, end="")
        if line.startswith(">>>>>>>"):
            in_marker = False
            print("--------------------\n")
