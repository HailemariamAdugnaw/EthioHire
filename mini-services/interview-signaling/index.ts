/**
 * EthioHire — Interview signaling mini-service (socket.io)
 *
 * Relays WebRTC offers/answers/ICE candidates and in-room chat between
 * candidate and interviewer inside a private room per interview.
 *
 * Local dev:  bun run dev            (port 3031)
 * Docker:     has its own Dockerfile (mini-services/interview-signaling)
 * Frontend:   io("/?XTransformPort=3031", { path: "/" })  — or NEXT_PUBLIC_SIGNALING_URL
 */
import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy/the gateway forwards on this path
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

/** roomId -> Map<socketId, { name, role }> */
const rooms = new Map();

io.on("connection", (socket) => {
  console.log(`[signaling] connected: ${socket.id}`);

  socket.on("join-room", ({ room, name }) => {
    if (!room) return;
    if (!rooms.has(room)) rooms.set(room, new Map());
    const peers = rooms.get(room);
    peers.set(socket.id, { name: name || "Guest" });
    socket.join(room);

    const list = [...peers.entries()].map(([id, p]) => ({ id, name: p.name }));
    // everyone in the room gets an updated peer list
    io.to(room).emit("room-peers", { peers: list.filter((p) => p.id !== socket.id) });
    console.log(`[signaling] ${socket.id} (${name}) joined ${room} — peers: ${list.length}`);
  });

  // WebRTC signaling relay (offer / answer / ice)
  socket.on("signal", ({ room, data }) => {
    if (!room || !data) return;
    socket.to(room).emit("signal", { from: socket.id, data });
  });

  // in-room chat
  socket.on("chat", ({ room, from, text }) => {
    if (!room || !text) return;
    io.to(room).emit("chat", { from: from || "Guest", text: String(text).slice(0, 2000), at: Date.now() });
  });

  socket.on("disconnect", () => {
    for (const [room, peers] of rooms.entries()) {
      if (peers.has(socket.id)) {
        peers.delete(socket.id);
        socket.to(room).emit("peer-left", { id: socket.id });
        if (peers.size === 0) rooms.delete(room);
      }
    }
    console.log(`[signaling] disconnected: ${socket.id}`);
  });

  socket.on("error", (e) => console.error(`[signaling] socket error (${socket.id}):`, e));
});

const PORT = 3031;
httpServer.listen(PORT, () => console.log(`[signaling] listening on :${PORT}`));

process.on("SIGTERM", () => httpServer.close(() => process.exit(0)));
process.on("SIGINT", () => httpServer.close(() => process.exit(0)));
