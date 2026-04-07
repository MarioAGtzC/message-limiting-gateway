import express from 'express';
import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 3001;
app.use(express.json());

const limiter = rateLimit({
  windowMs: 1000,
  max: 100,
  statusCode: 429,
  message: { error: 'Rate limit exceeded' },
});

app.post('/send-message', limiter, (req, res) => {
  res.status(200).json({ success: true })
});

app.listen(PORT, () => {
  console.log(`Mock C corriendo en puerto ${PORT}`)
});