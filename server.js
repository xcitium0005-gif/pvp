const express = require("express");
const WebSocket = require("ws");
const path = require("path");

const PORT = process.env.PORT || 3000;
const app = express();

// Serve everything in /public
app.use(express.static(path.join(__dirname, "public")));

// ✅ Force / to return game.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "game.html"));
});

const server = app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

// WebSocket signaling
const wss = new WebSocket.Server({ server });

let clients = [];

wss.on("connection", (ws) => {
  clients.push(ws);
  console.log("New client connected");

  ws.on("message", (msg) => {
    clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(msg.toString());
      }
    });
  });

  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
    console.log("Client disconnected");
  });
});
