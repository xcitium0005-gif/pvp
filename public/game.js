let canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");

// --- signaling / rtc ---
let ws;
let pc;
let dataChannel;
let isHost = false;
let candidateQueue = [];   // NEW: hold ICE candidates until remote desc is set
let remoteDescSet = false; // NEW: flag when setRemoteDescription is done

// --- game state ---
let myChar = null;
let myX = 100, myY = 200;
let enemyX = 400, enemyY = 200;
let enemyChar = null;

// --- joystick state ---
let joystick = { dx: 0, dy: 0 };

// --- assets ---
let sprites = {};
["mila","gustav","fyero"].forEach(name=>{
  sprites[name] = new Image();
  sprites[name].src = name + ".png";
});

// --- select character ---
function selectChar(name) {
  myChar = name;
  console.log("🎯 You selected:", name);

  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({type:"char", char: myChar}));
  }
}

// --- connect host/join ---
function connect(host) {
  isHost = host;
  console.log(isHost ? "🟢 Hosting..." : "🟣 Joining...");

  const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/ws";
  ws = new WebSocket(wsUrl);

  ws.onopen = async () => {
    console.log("✅ Connected to signaling server:", wsUrl);

    await ensurePc();

    if (isHost) {
      dataChannel = pc.createDataChannel("game");
      setupChannel();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({ offer }));
      console.log("📤 Sent offer");
    } else {
      pc.ondatachannel = (e) => {
        dataChannel = e.channel;
        setupChannel();
      };
    }
  };

  ws.onerror = (err) => console.error("❌ WebSocket error", err);

  ws.onmessage = async (event) => {
    let msg = {};
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.offer && !isHost) {
      console.log("📩 Got offer");
      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      remoteDescSet = true; // mark
      // flush queued ICE
      candidateQueue.forEach(c => pc.addIceCandidate(c));
      candidateQueue = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer }));
      console.log("📤 Sent answer");
    }

    if (msg.answer && isHost) {
      console.log("📩 Got answer");
      await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
      remoteDescSet = true; // mark
      // flush queued ICE
      candidateQueue.forEach(c => pc.addIceCandidate(c));
      candidateQueue = [];
    }

    if (msg.candidate) {
      const cand = new RTCIceCandidate(msg.candidate);
      if (remoteDescSet) {
        try {
          await pc.addIceCandidate(cand);
          console.log("➕ Added ICE candidate");
        } catch (e) {
          console.warn("⚠️ ICE add failed", e);
        }
      } else {
        console.log("🕐 Queued ICE candidate (waiting for remote desc)");
        candidateQueue.push(cand);
      }
    }
  };
}

// --- ensure PeerConnection exists ---
async function ensurePc() {
  if (pc) return pc;

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws && ws.readyState === 1 && ws.send(JSON.stringify({ candidate: e.candidate }));
      console.log("📤 Sent ICE candidate");
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log("ICE state:", pc.iceConnectionState);
  };

  return pc;
}

// --- data channel handlers ---
function setupChannel() {
  dataChannel.onopen = () => {
    console.log("✅ DataChannel open");
    if (myChar) {
      dataChannel.send(JSON.stringify({type:"char", char: myChar}));
    }
  };
  dataChannel.onerror = (err) => console.error("❌ DataChannel error", err);
  dataChannel.onclose = () => console.log("🔻 DataChannel closed");

  dataChannel.onmessage = (e) => {
    let msg = {};
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === "pos") {
      enemyX = msg.x;
      enemyY = msg.y;
    } else if (msg.type === "char") {
      enemyChar = msg.char;
    }
  };
}

// --- joystick UI ---
let joy = document.getElementById("joystick");
let stick = document.getElementById("stick");

let centerX = joy.offsetLeft + joy.offsetWidth/2;
let centerY = joy.offsetTop + joy.offsetHeight/2;

function dist(x1,y1,x2,y2){ return Math.hypot(x2-x1, y2-y1); }

joy.addEventListener("touchmove", e=>{
  e.preventDefault();
  let t = e.touches[0];
  let dx = t.clientX - centerX;
  let dy = t.clientY - centerY;

  const max = 40;
  const d = dist(0,0,dx,dy);
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }

  stick.style.left = 40 + dx + "px";
  stick.style.top  = 40 + dy + "px";

  joystick.dx = dx/10;
  joystick.dy = dy/10;
}, { passive:false });

joy.addEventListener("touchend", e=>{
  e.preventDefault();
  stick.style.left = "40px";
  stick.style.top  = "40px";
  joystick.dx = 0; joystick.dy = 0;
}, { passive:false });

// --- game loop ---
function loop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  myX = Math.max(32, Math.min(canvas.width - 32,  myX + joystick.dx));
  myY = Math.max(32, Math.min(canvas.height - 32, myY + joystick.dy));

  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({ type:"pos", x: myX, y: myY }));
  }

  if (myChar) ctx.drawImage(sprites[myChar], myX-32, myY-32, 64,64);
  if (enemyChar) ctx.drawImage(sprites[enemyChar], enemyX-32, enemyY-32, 64,64);

  requestAnimationFrame(loop);
}
loop();
