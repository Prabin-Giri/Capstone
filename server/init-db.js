const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('./db-mysql').initDb()
  .then(() => console.log('Database initialized successfully'))
  .catch(err => console.error('Error initializing database:', err));
