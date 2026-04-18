/**
 * Stable primary key for a course *offering*: same catalog code may repeat in another term,
 * but (code + term) is unique. Stored as courses.id and referenced by course_id everywhere.
 * Uses "~" (not ":") so paths work on Windows when course id appears in folder names.
 */

function slugTerm(term) {
    return String(term || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'unknown-term';
}

function courseOfferingStorageId(courseCode, term) {
    const code = String(courseCode || '').trim();
    if (!code) {
        throw new Error('Course code is required');
    }
    if (code.includes('~')) {
        throw new Error('Course code cannot contain "~"');
    }
    return `${code}~${slugTerm(term)}`;
}

module.exports = { slugTerm, courseOfferingStorageId };
