const { Server } = require('socket.io');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('join:interview', ({ roomId }) => socket.join(`interview:${roomId}`));
    socket.on('signal', ({ roomId, payload }) => {
      socket.to(`interview:${roomId}`).emit('signal', payload);
    });
  });
}

function createSocket(server) {
  const io = new Server(server, { cors: { origin: '*' } });
  registerSocketHandlers(io);
  return io;
}

module.exports = { createSocket };
