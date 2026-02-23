/**
 * Database layer: uses MySQL when DATABASE_URL or MYSQL_HOST is set, otherwise SQLite (sql.js).
 * Set DATABASE_URL (e.g. mysql://user:pass@host:3306/dbname) or MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE for cloud MySQL.
 */
const useMySQL = Boolean(process.env.DATABASE_URL || process.env.MYSQL_HOST);

const adapter = useMySQL ? require('./db-mysql') : require('./db-sqlite');

module.exports = {
    initDb: adapter.initDb,
    getDb: adapter.getDb,
    saveDb: adapter.saveDb,
    query: adapter.query,
    run: adapter.run,
    queryOne: adapter.queryOne,
    queryToObjects: adapter.queryToObjects,
    isMySQL: adapter.isMySQL,
};
