const { Pool, types } = require('pg');

// Return DATE columns as plain "YYYY-MM-DD" strings instead of Date objects.
// Without this, node-postgres creates Date objects at local midnight which
// toISOString() converts to UTC, shifting the date in non-UTC timezones.
types.setTypeParser(1082, val => val);

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
}

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = pool;
