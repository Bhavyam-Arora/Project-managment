function errorHandler(err, req, res, next) {
  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(422).json({ success: false, error: { code: 'DUPLICATE_KEY', message: err.detail } });
  }

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message;

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json({ success: false, error: { code, message } });
}

module.exports = errorHandler;
