import 'dotenv/config';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import extractRouter from './routes/extract.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.ALLOWED_EXTENSION_ORIGINS || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
app.use('/api/extract', extractRouter);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.message === 'Origin is not allowed by CORS' ? 403 : 500)
    .json({ success: false, error: 'Internal server error' });
});

app.listen(port, () => console.log(`AI Job Parser API listening on port ${port}`));

