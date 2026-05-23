const { Router } = require('express');
const {
  handleCreateProduct,
  handleListProducts,
  handleGetProduct,
  handleAppendMedia,
} = require('../controllers/part2.controller');

const router = Router();

router.post('/', handleCreateProduct);
router.get('/', handleListProducts);
router.get('/:id', handleGetProduct);
router.post('/:id/media', handleAppendMedia);

module.exports = router;
