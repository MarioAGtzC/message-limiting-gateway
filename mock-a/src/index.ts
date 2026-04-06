import express, { Request, Response } from 'express';
import { faker } from '@faker-js/faker';
import { query } from 'express-validator';
import validateFields from './validateFields';

const app = express();
app.use(express.json());

app.post('/simulate', [
  query('count').optional().isInt({ min: 1 }).withMessage('count debe ser un entero mayor a 0'),
  validateFields,
], async (req: Request, res: Response) => {
  const count = parseInt(req.query.count as string) || 100000;
  
  res.status(202).json({ message: `Simulando ráfaga de ${count} mensajes` })

  console.time('rafaga');
  for (let i = 0; i < count; i++) {
    fetch('http://localhost:3001/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: i,
        content: 'Test message',
        recipient: '+521234567890'
      })
    });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  console.timeEnd('rafaga');
});

app.listen(3002, () => {
  console.log('Mock A corriendo en puerto 3002')
});