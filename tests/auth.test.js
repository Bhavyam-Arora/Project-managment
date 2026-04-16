require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/app');
const { createTestUser, authHeader } = require('./helpers');

describe('Auth', () => {
  test('register with valid data returns 201 and token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `reg_${Date.now()}@example.com`,
      password: 'password123',
      display_name: 'Register User',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBeDefined();
  });

  test('register with duplicate email returns 422 EMAIL_TAKEN', async () => {
    const { user } = await createTestUser();
    const res = await request(app).post('/api/auth/register').send({
      email: user.email,
      password: 'password123',
      display_name: 'Dupe User',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('register with short password returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `short_${Date.now()}@example.com`,
      password: '123',
      display_name: 'Short Pass',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('login with correct credentials returns 200 and token', async () => {
    const { user, rawPassword } = await createTestUser();
    const res = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: rawPassword,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  test('login with wrong password returns 401 INVALID_CREDENTIALS', async () => {
    const { user } = await createTestUser();
    const res = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('access protected route without token returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('access protected route with invalid token returns 401 TOKEN_INVALID', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });
});
