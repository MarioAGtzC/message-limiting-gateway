import express from 'express';
import rateLimit from 'express-rate-limit';

const app = express();
app.use(express.json());

// const limiter = rateLimit({
//   windowMs: 1000, // 1 segundo
//   max: 10, // 10 peticiones por segundo
//   statusCode: 429,
//   message: { error: 'Rate limit exceeded' },
// });

app.post('/send-message', (req, res) => {
  res.status(200).json({ success: true })
});

app.listen(3001, () => {
  console.log('Mock C corriendo en puerto 3001')
});