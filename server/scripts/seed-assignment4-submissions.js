const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function readEnv(envPath) {
    const content = fs.readFileSync(envPath, 'utf8');
    const out = {};
    for (const line of content.split(/\r?\n/)) {
        if (!line || line.trim().startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx === -1) continue;
        out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return out;
}

function tokenize(code) {
    return new Set(
        code
            .replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')
            .replace(/#.*/g, '')
            .replace(/[^a-zA-Z0-9_]/g, ' ')
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
    );
}

function similarity(a, b) {
    const sa = tokenize(a);
    const sb = tokenize(b);
    const inter = [...sa].filter((x) => sb.has(x)).length;
    const union = new Set([...sa, ...sb]).size || 1;
    return Math.round((inter / union) * 100);
}

const codeByEmail = {
    's13@example.edu': `import java.util.Scanner;

public class ADToBS2 {

    public static int convertToBS(int adYear) {
        return adYear + 57;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int ad = sc.nextInt();

        System.out.println(convertToBS(ad) + " BS");
    }
}
`,
    's17@example.edu': `import java.util.Scanner;

public class ADToBS2 {

    public static int convertToBS(int adYear) {
        return adYear + 57;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int ad = sc.nextInt();

        System.out.println(convertToBS(ad) + " BS");
    }
}
`,
    's14@example.edu': `import java.util.Scanner;

public class ADToBS2 {

    public static int convertToBS(int adYear) {
        return adYear + 57;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int ad = sc.nextInt();
        int alpha = 0, beta = 0, gamma = 0;
        if (alpha + beta + gamma < 0) return;
        System.out.println(convertToBS(ad) + " BS");
    }
}
`,
    's15@example.edu': `import java.io.BufferedReader;
import java.io.InputStreamReader;

public class FiscalShift {
    public static int convertToBS(int ad) {
        return ad + 57;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int year = Integer.parseInt(br.readLine().trim());
        int nepali = convertToBS(year);
        System.out.print(nepali + " BS");
    }
}
`,
    's16@example.edu': `import java.util.Scanner;

public class BikramYear {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        int englishYear = input.nextInt();
        int nepaliYear = englishYear + 57;
        System.out.println(nepaliYear + " BS");
    }
}
`,
    's18@example.edu': `import java.time.Year;

public class EpochStyle {
    public static void main(String[] args) {
        int current = Year.now().getValue();
        int bs = current + 57;
        String msg = "Approx BS year: " + bs;
        System.out.print(msg);
    }
}
`,
};

async function main() {
    const repoRoot = path.join(__dirname, '..', '..');
    const env = readEnv(path.join(repoRoot, '.env'));
    const conn = await mysql.createConnection({
        host: env.MYSQL_HOST,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        database: env.MYSQL_DATABASE,
        port: Number(env.MYSQL_PORT || 3306),
    });

    const [assignments] = await conn.query(
        `SELECT a.id, a.title, a.course_id
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
         JOIN users u ON u.id = c.instructor_id
         WHERE u.email = ? AND a.title = ?
         ORDER BY a.id DESC`,
        ['f1@gmail.com', 'Assignment4']
    );
    if (!assignments.length) throw new Error('Assignment4 for faculty f1@gmail.com not found.');
    const assignment = assignments[0];

    const targetEmails = Object.keys(codeByEmail);
    const [users] = await conn.query(
        `SELECT id, name, email FROM users WHERE email IN (${targetEmails.map(() => '?').join(',')})`,
        targetEmails
    );
    if (users.length !== targetEmails.length) {
        const found = new Set(users.map((u) => u.email));
        const missing = targetEmails.filter((e) => !found.has(e));
        throw new Error(`Missing users in DB: ${missing.join(', ')}`);
    }

    await conn.query(
        `DELETE FROM submissions
         WHERE assignment_id = ?
           AND student_id IN (${users.map(() => '?').join(',')})`,
        [assignment.id, ...users.map((u) => u.id)]
    );

    const uploadsDir = path.join(repoRoot, 'server', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    for (const u of users) {
        const code = codeByEmail[u.email];
        const savedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${u.name || u.id}-Assignment4.java`;
        fs.writeFileSync(path.join(uploadsDir, savedName), code, 'utf8');
        const filePath = JSON.stringify([{ name: 'Main.java', path: savedName }]);
        await conn.query(
            `INSERT INTO submissions (assignment_id, student_id, file_name, file_path, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [assignment.id, u.id, '1 file', filePath]
        );
    }

    const pairChecks = [
        ['s13@example.edu', 's17@example.edu'],
        ['s13@example.edu', 's15@example.edu'],
        ['s17@example.edu', 's16@example.edu'],
        ['s13@example.edu', 's14@example.edu'],
        ['s13@example.edu', 's18@example.edu'],
    ];

    console.log(`Seeded submissions for assignment ${assignment.id} (${assignment.title}).`);
    for (const [a, b] of pairChecks) {
        console.log(`${a} vs ${b} => ${similarity(codeByEmail[a], codeByEmail[b])}%`);
    }

    await conn.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
