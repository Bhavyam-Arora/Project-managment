const pool = require('../db/pool');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

async function register({ email, password, display_name }) {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    const err = new Error('Email already taken');
    err.code = 'EMAIL_TAKEN';
    err.status = 422;
    throw err;
  }

  const password_hash = await hashPassword(password);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name`,
    [email, password_hash, display_name]
  );

  const token = signToken({ sub: user.id, email: user.email, display_name: user.display_name });
  return { token, user: { id: user.id, email: user.email, display_name: user.display_name } };
}

async function login({ email, password }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    const err = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    err.status = 401;
    throw err;
  }

  const user = rows[0];
  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    err.status = 401;
    throw err;
  }

  const token = signToken({ sub: user.id, email: user.email, display_name: user.display_name });
  return { token, user: { id: user.id, email: user.email, display_name: user.display_name } };
}

module.exports = { register, login };
