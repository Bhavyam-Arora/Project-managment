require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/app');
const { createTestUser, authHeader } = require('./helpers');

describe('Auth', () => {
  // ── Existing tests ──────────────────────────────────────────────────────────

  test('TC-A01 register with valid data returns 201 and token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `reg_${Date.now()}@example.com`,
      password: 'password123',
      display_name: 'Register User',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBeDefined();
  });

  test('TC-A02 register with duplicate email returns 422 EMAIL_TAKEN', async () => {
    const { user } = await createTestUser();
    const res = await request(app).post('/api/auth/register').send({
      email: user.email,
      password: 'password123',
      display_name: 'Dupe User',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('TC-A03 register with short password returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `short_${Date.now()}@example.com`,
      password: '123',
      display_name: 'Short Pass',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-A04 login with correct credentials returns 200 and token', async () => {
    const { user, rawPassword } = await createTestUser();
    const res = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: rawPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  test('TC-A05 login with wrong password returns 401 INVALID_CREDENTIALS', async () => {
    const { user } = await createTestUser();
    const res = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('TC-A06 access protected route without token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('TC-A07 access protected route with invalid token returns 401 TOKEN_INVALID', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  // ── New tests ────────────────────────────────────────────────────────────────

  test('TC-A08 register with missing email field returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/register').send({
      password: 'password123',
      display_name: 'No Email',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-A09 register with invalid email format returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      password: 'password123',
      display_name: 'Bad Email',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-A10 register with missing display_name returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `noname_${Date.now()}@example.com`,
      password: 'password123',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-A11 login with non-existent email returns 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody_exists@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('TC-A12 register with exactly 8-char password (boundary) succeeds with 201', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `boundary_${Date.now()}@example.com`,
      password: 'exactly8',
      display_name: 'Boundary Test',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
  });

  test('TC-A13 login response contains correct user email and display_name', async () => {
    const { user, rawPassword } = await createTestUser();
    const res = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: rawPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.display_name).toBe(user.display_name);
  });

  test('TC-A14 register with display_name over 100 characters returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `longname_${Date.now()}@example.com`,
      password: 'password123',
      display_name: 'A'.repeat(101),
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
