const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const PORT = process.env.PORT || 3000;
const app = express();

// Serve everything in /public
app.use(express.static(path.join(__dirname, "public")));

// Always serve game.html on /
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "game.html"));
});

const server = app.listen(PORT, () => {
  console.log("✅ Server running on port " + PORT);
});

// ---- WebSocket signaling (on /ws) ----
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("🔌 New WS client connected");

  ws.on("message", (msg) => {
    console.log("📩 Received signaling message:", msg.toString());

    // Broadcast message to ALL clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("🔻 WS client disconnected");
  });
});
