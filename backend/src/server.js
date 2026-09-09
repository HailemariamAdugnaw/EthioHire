const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { createSocket } = require('./config/socket');
const { startWorkers } = require('./workers/queues');

const server = http.createServer(app);
createSocket(server);
startWorkers();

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`EthioHire API listening on port ${env.port}`);
});
