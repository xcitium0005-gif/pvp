let canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");

// Auto-scale canvas
canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.65;

// --- signaling / rtc ---
let ws, pc, dataChannel;
let isHost = false;
let candidateQueue = [];
let remoteDescSet = false;

// --- game state ---
let myChar = null;
let myX = 150, myY = 200;
let enemyX = 400, enemyY = 200;
let enemyChar = null;
let myHP = 100, enemyHP = 100;

// --- joystick ---
let joystick = { dx: 0, dy: 0 };

// --- assets ---
let sprites = {};
["mila","gustav","fyero"].forEach(name=>{
  sprites[name] = new Image();
  sprites[name].src = name + ".png";
});

// === Select character ===
function selectChar(name) {
  myChar = name;
  console.log("🎯 You selected:", name);
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({ type:"char", char: myChar }));
  }
}

// === Connect (Host/Join) ===
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

  ws.onmessage = async (event) => {
    let msg = {};
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.offer && !isHost) {
      console.log("📩 Got offer");
      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      remoteDescSet = true;
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
      remoteDescSet = true;
      candidateQueue.forEach(c => pc.addIceCandidate(c));
      candidateQueue = [];
    }

    if (msg.candidate) {
      const cand = new RTCIceCandidate(msg.candidate);
      if (remoteDescSet) {
        await pc.addIceCandidate(cand).catch(e => console.warn("ICE add fail:", e));
        console.log("➕ Added ICE candidate");
      } else {
        console.log("🕐 Queued ICE candidate");
        candidateQueue.push(cand);
      }
    }
  };
}

// === PeerConnection ===
async function ensurePc() {
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  pc.onicecandidate = (e) => {
    if (e.candidate) ws && ws.readyState === 1 && ws.send(JSON.stringify({ candidate: e.candidate }));
  };
  return pc;
}

// === Data channel ===
function setupChannel() {
  dataChannel.onopen = () => {
    console.log("✅ DataChannel open");
    if (myChar) dataChannel.send(JSON.stringify({ type:"char", char: myChar }));
  };
  dataChannel.onmessage = (e) => {
    let msg = JSON.parse(e.data);
    if (msg.type === "pos") {
      enemyX = msg.x; enemyY = msg.y;
    } else if (msg.type === "char") {
      enemyChar = msg.char;
    } else if (msg.type === "attack") {
      let dx = myX - msg.x, dy = myY - msg.y;
      if (Math.hypot(dx,dy) < 80) {
        myHP = Math.max(0, myHP - 10);
        console.log("💥 Got hit! My HP:", myHP);
      }
    } else if (msg.type === "skill") {
      let dx = myX - msg.x, dy = myY - msg.y;
      if (Math.hypot(dx,dy) < 150) {
        myHP = Math.max(0, myHP - 20);
        console.log("✨ Skill hit! My HP:", myHP);
      }
    }
  };
}

// === Combat buttons ===
document.getElementById("attackBtn").addEventListener("click", () => {
  if (dataChannel?.readyState === "open") {
    dataChannel.send(JSON.stringify({ type:"attack", x: myX, y: myY }));
  }
  console.log("🗡️ Attack!");
});

document.getElementById("skillBtn").addEventListener("click", () => {
  if (dataChannel?.readyState === "open") {
    dataChannel.send(JSON.stringify({ type:"skill", x: myX, y: myY }));
  }
  console.log("✨ Skill used!");
});

// === Joystick ===
let joy = document.getElementById("joystick");
let stick = document.getElementById("stick");
let centerX = joy.offsetLeft + joy.offsetWidth/2;
let centerY = joy.offsetTop + joy.offsetHeight/2;

joy.addEventListener("touchmove", e=>{
  e.preventDefault();
  let t = e.touches[0];
  let dx = t.clientX - centerX;
  let dy = t.clientY - centerY;
  const max = 40;
  let d = Math.hypot(dx,dy);
  if (d > max) { dx = dx/d*max; dy = dy/d*max; }
  stick.style.left = 40 + dx + "px";
  stick.style.top  = 40 + dy + "px";
  joystick.dx = dx/20; // slower movement
  joystick.dy = dy/20;
},{passive:false});

joy.addEventListener("touchend", e=>{
  e.preventDefault();
  stick.style.left = "40px"; stick.style.top = "40px";
  joystick.dx = joystick.dy = 0;
},{passive:false});

// === Game loop ===
function loop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Movement
  myX = Math.max(32, Math.min(canvas.width-32, myX + joystick.dx));
  myY = Math.max(32, Math.min(canvas.height-32, myY + joystick.dy));

  // Send position
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({ type:"pos", x: myX, y: myY }));
  }

  // Draw me
  if (myChar) ctx.drawImage(sprites[myChar], myX-32, myY-32, 64,64);
  // Draw enemy
  if (enemyChar) ctx.drawImage(sprites[enemyChar], enemyX-32, enemyY-32, 64,64);

  // HP bars
  drawHP(myX, myY, myHP);
  drawHP(enemyX, enemyY, enemyHP);

  requestAnimationFrame(loop);
}
loop();

function drawHP(x,y,hp) {
  ctx.fillStyle = "red";
  ctx.fillRect(x-30, y-50, 60, 6);
  ctx.fillStyle = "lime";
  ctx.fillRect(x-30, y-50, (hp/100)*60, 6);
}
