require('dotenv').config();
const http = require('http');
const app = require('./app');
const { init } = require('./sockets');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
init(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run: lsof -ti :${PORT} | xargs kill -9`);
    process.exit(1);
  } else {
    throw err;
  }
});
