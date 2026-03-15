/**
 * One-off test: run the student "grades processor" program with file input/output.
 *
 * Usage (use Docker on Linux VM at 10.0.0.137, user bersek):
 *   DOCKER_HOST=ssh://bersek@10.0.0.137 node server/grader/scripts/testFileIO.js
 *
 * Or run on the VM itself:
 *   node server/grader/scripts/testFileIO.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runCode } = require('../runCode');

const STUDENT_CODE = `
"""
Student Grades Processor

Reads student records from an input file.
Each line format:
Name,score1,score2,score3

Writes results to an output file with:
Name | Average | Grade
"""

def calculate_average(scores):
    return sum(scores) / len(scores)


def assign_grade(average):
    if average >= 90:
        return "A"
    elif average >= 80:
        return "B"
    elif average >= 70:
        return "C"
    elif average >= 60:
        return "D"
    else:
        return "F"


def process_file(input_filename, output_filename):
    with open(input_filename, "r") as infile, open(output_filename, "w") as outfile:
        outfile.write("Name | Average | Grade\\n")
        outfile.write("-" * 30 + "\\n")

        for line in infile:
            line = line.strip()
            if not line:
                continue

            parts = line.split(",")
            name = parts[0]
            scores = list(map(int, parts[1:]))

            average = calculate_average(scores)
            grade = assign_grade(average)

            outfile.write(f"{name} | {average:.2f} | {grade}\\n")


if __name__ == "__main__":
    process_file("input.txt", "output.txt")
    print("Processing complete. Check output.txt")
`.trim();

const INPUT_CONTENT = `Alice,85,90,88
Bob,70,75,72
Charlie,95,92,93
Diana,50,60,58`;

const EXPECTED_OUTPUT = `Name | Average | Grade
------------------------------
Alice | 87.67 | B
Bob | 72.33 | C
Charlie | 93.33 | A
Diana | 56.00 | F`;

function normalize(s) {
    return (s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

async function main() {
    const dh = process.env.DOCKER_HOST || '';
    if (dh.startsWith('ssh://')) {
        console.log('Using remote Docker:', dh.replace(/ssh:\/\/([^@]+)@/, 'ssh://***@'));
    } else {
        console.log('Using local Docker (set DOCKER_HOST=ssh://user@linux-server to use Linux server)');
    }

    const sourcePath = path.join(os.tmpdir(), `grades_processor_${Date.now()}.py`);
    fs.writeFileSync(sourcePath, STUDENT_CODE, 'utf8');

    try {
        console.log('Running student code with file input (input.txt) -> file output (output.txt)...');
        const result = await runCode({
            sourceFilePath: sourcePath,
            language: 'python',
            stdin: '',
            inputFile: { filename: 'input.txt', content: INPUT_CONTENT },
            outputFileName: 'output.txt',
        });

        console.log('Exit code:', result.exitCode);
        console.log('Stdout:', result.stdout?.slice(0, 200) || '(none)');
        if (result.stderr) console.log('Stderr:', result.stderr.slice(0, 300));

        const actual = normalize(result.outputFileContent ?? '');
        const expected = normalize(EXPECTED_OUTPUT);
        const match = actual === expected;

        console.log('\n--- Output file content (actual) ---');
        console.log(result.outputFileContent ?? '(none)');
        console.log('--- Expected ---');
        console.log(EXPECTED_OUTPUT);
        console.log('\nMatch:', match ? 'PASS' : 'FAIL');
        if (!match) {
            console.log('Actual length:', actual.length, 'Expected length:', expected.length);
        }
        process.exit(match ? 0 : 1);
    } finally {
        try { fs.unlinkSync(sourcePath); } catch (_) {}
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
