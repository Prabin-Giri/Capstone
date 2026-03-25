const { initDb } = require('./db-mysql');
initDb().then(() => console.log("DB INITED")).catch(e => console.error(e));
