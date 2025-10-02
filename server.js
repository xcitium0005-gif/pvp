const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

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

console.log("Signaling server running");
