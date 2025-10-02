let canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");

let ws;           // signaling
let pc;           // peer connection
let dataChannel;  // WebRTC data channel
let isHost = false;

let myChar = null;
let myX = 100, myY = 200;
let enemyX = 400, enemyY = 200;

// === Mobile joystick variables ===
let joystick = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };

// === Character images ===
let sprites = {};
["mila","gustav","fyero"].forEach(name=>{
  sprites[name] = new Image();
  sprites[name].src = name + ".png";
});

// === Select character ===
function selectChar(name) {
  myChar = name;
  console.log("Selected:", name);
}

// === Connect via signaling ===
function connect(host) {
  isHost = host;
  ws = new WebSocket("wss://" + window.location.host); // Render uses same domain
  ws.onmessage = async (event) => {
    let msg = JSON.parse(event.data);

    if (msg.offer && !isHost) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      let answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer }));
    }
    if (msg.answer && isHost) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
    }
    if (msg.candidate) {
      try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch(e) {}
    }
  };

  // Create WebRTC connection
  pc = new RTCPeerConnection();
  pc.onicecandidate = (e) => {
    if (e.candidate) ws.send(JSON.stringify({ candidate: e.candidate }));
  };

  if (isHost) {
    dataChannel = pc.createDataChannel("game");
    setupChannel();
    pc.createOffer().then(o => pc.setLocalDescription(o).then(()=>ws.send(JSON.stringify({offer:o}))));
  } else {
    pc.ondatachannel = (e) => { dataChannel = e.channel; setupChannel(); };
  }
}

// === Data channel handler ===
function setupChannel() {
  dataChannel.onmessage = (e) => {
    let pos = JSON.parse(e.data);
    enemyX = pos.x;
    enemyY = pos.y;
  };
}

// === Joystick control ===
canvas.addEventListener("touchstart", e=>{
  joystick.active = true;
  joystick.startX = e.touches[0].clientX;
  joystick.startY = e.touches[0].clientY;
});
canvas.addEventListener("touchmove", e=>{
  if (!joystick.active) return;
  let dx = e.touches[0].clientX - joystick.startX;
  let dy = e.touches[0].clientY - joystick.startY;
  joystick.dx = dx/30; joystick.dy = dy/30;
});
canvas.addEventListener("touchend", e=>{
  joystick.active = false;
  joystick.dx = joystick.dy = 0;
});

// === Game loop ===
function loop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Move my char
  myX += joystick.dx;
  myY += joystick.dy;

  // Send position
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({x:myX,y:myY}));
  }

  // Draw my char
  if (myChar) ctx.drawImage(sprites[myChar], myX-32, myY-32, 64,64);

  // Draw enemy
  ctx.drawImage(sprites["mila"], enemyX-32, enemyY-32, 64,64); // placeholder, you can sync enemy's char later

  requestAnimationFrame(loop);
}
loop();
