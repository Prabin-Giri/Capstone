require('dotenv').config({ path: '../.env' });
require('./db-mysql').initDb()
  .then(() => console.log('Database initialized successfully'))
  .catch(err => console.error('Error initializing database:', err));
