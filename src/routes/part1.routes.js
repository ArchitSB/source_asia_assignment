const { Router } = require('express');
const { handleRequest, handleStats } = require('../controllers/part1.controller');

const router = Router();

router.post('/request', handleRequest);
router.get('/stats', handleStats);

module.exports = router;
