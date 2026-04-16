const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/projects', require('./projects'));
router.use('/', require('./issues'));
router.use('/', require('./sprints'));
router.use('/', require('./comments'));
router.use('/', require('./activity'));
router.use('/', require('./notifications'));
router.use('/', require('./watchers'));
router.use('/', require('./search'));

module.exports = router;
