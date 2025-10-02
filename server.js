const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const PORT = process.env.PORT || 3000;
const app = express();

// Serve static files from /public (game.html, game.js, images)
app.use(express.static(path.join(__dirname, "public")));

// Always serve game.html on root
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "game.html"));
});

const server = app.listen(PORT, () => {
  console.log("✅ Server running on port " + PORT);
});

// ---- WebSocket signaling (on /ws) ----
const wss = new WebSocket.Server({ server, path: "/ws" });
let clients = [];

wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("🔌 New WS client connected. Total:", clients.length);

  ws.on("message", (msg) => {
    // Forward to everyone except sender (simple 1v1 broadcast)
    clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(msg.toString());
      }
    });
  });

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
    console.log("🔌 WS client disconnected. Total:", clients.length);
  });
});
