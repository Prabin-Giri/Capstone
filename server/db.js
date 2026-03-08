// Choose database adapter based on environment
if (process.env.MYSQL_HOST || process.env.DATABASE_URL) {
    module.exports = require('./db-mysql');
} else {
    module.exports = require('./db-sqlite');
}
