import { Router } from 'express';
import { body, param } from 'express-validator';
import validateFields from '../middlewares/validateFields';
import { processMessage, getMessage, getStats } from '../controllers/messages.controller';

const router = Router();

router.get('/', getStats);

router.get('/:id', [
  param('id').isString().notEmpty().withMessage('id es requerido'),
  validateFields
], getMessage);

router.post('/', [
  body('id').isString().notEmpty().withMessage('id es requerido'),
  body('content').isString().notEmpty().withMessage('content es requerido'),
  body('recipient').isString().notEmpty().withMessage('recipient es requerido'),
  validateFields
], processMessage);

export default router;