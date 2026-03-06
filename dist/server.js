import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { GameManager } from "./game.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const game = new GameManager();
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
io.on("connection", (socket) => {
    let joinedRoom = null;
    socket.on("join-room", (payload, ack) => {
        const roomId = sanitizeRoomId(payload.roomId);
        const name = (payload.name ?? "").trim();
        if (!roomId) {
            ack?.({ ok: false, error: "Room ID is required." });
            return;
        }
        socket.join(roomId);
        joinedRoom = roomId;
        game.addPlayer(roomId, socket.id, name || `Player-${socket.id.slice(0, 4)}`);
        broadcastRoomState(roomId);
        ack?.({ ok: true, roomId, playerId: socket.id });
    });
    socket.on("start-hand", (_payload, ack) => {
        if (!joinedRoom) {
            ack?.({ ok: false, error: "Join a room first." });
            return;
        }
        const result = game.startHand(joinedRoom);
        if (!result.ok) {
            ack?.(result);
            return;
        }
        broadcastRoomState(joinedRoom);
        ack?.({ ok: true });
    });
    socket.on("action", (payload, ack) => {
        if (!joinedRoom) {
            ack?.({ ok: false, error: "Join a room first." });
            return;
        }
        if (!payload.action) {
            ack?.({ ok: false, error: "Action is required." });
            return;
        }
        const result = game.act(joinedRoom, socket.id, payload.action, payload.raiseAmount);
        if (!result.ok) {
            ack?.(result);
            return;
        }
        broadcastRoomState(joinedRoom);
        ack?.({ ok: true });
    });
    socket.on("request-state", () => {
        if (!joinedRoom)
            return;
        socket.emit("state", game.publicState(joinedRoom, socket.id));
    });
    socket.on("disconnect", () => {
        if (!joinedRoom)
            return;
        game.markDisconnected(joinedRoom, socket.id);
        broadcastRoomState(joinedRoom);
    });
});
const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Poker server running at http://localhost:${port}`);
});
function sanitizeRoomId(value) {
    return (value ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8);
}
function broadcastRoomState(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room)
        return;
    for (const socketId of room) {
        io.to(socketId).emit("state", game.publicState(roomId, socketId));
    }
}
