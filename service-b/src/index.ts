import express from 'express';
import { envs } from './config/envs';
import router from './routes';
import './config/worker';

const app = express();
const port = envs.PORT || 3000;

app.use(express.json());

app.use('/', router);

app.listen(port, () => {
  console.log(`Service B corriendo en puerto: ${port}`);
});