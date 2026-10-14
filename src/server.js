import { env } from './config/env.js';
import app from './app.js';

const PORT = env.port;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${env.nodeEnv}]`);
});
