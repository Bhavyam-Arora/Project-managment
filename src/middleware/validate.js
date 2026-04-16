function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', details: result.error.errors },
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
