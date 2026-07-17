import { Router } from 'express';
import { extractJob } from '../controllers/extractController.js';
import { validateExtractionRequest } from '../middleware/validate.js';

const router = Router();
router.post('/', validateExtractionRequest, extractJob);
export default router;

