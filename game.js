let canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");

let ws;           // signaling
let pc;           // peer connection
let dataChannel;  // WebRTC data channel
let isHost = false;

let myChar = null;
let myX = 100, myY = 200;
let enemyX = 400, enemyY = 200;
let enemyChar = null; // sync enemy character

// === Mobile joystick variables ===
let joystick = { dx: 0, dy: 0 };

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

  // If already connected, send my char choice
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({type:"char", char: myChar}));
  }
}

// === Connect via signaling ===
function connect(host) {
  isHost = host;
  ws = new WebSocket(
    (location.protocol === "https:" ? "wss://" : "ws://") + window.location.host
  );

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
    let msg = JSON.parse(e.data);

    if (msg.type === "pos") {
      enemyX = msg.x;
      enemyY = msg.y;
    }
    if (msg.type === "char") {
      enemyChar = msg.char;
    }
  };

  dataChannel.onopen = () => {
    console.log("Data channel open");
    if (myChar) {
      dataChannel.send(JSON.stringify({type:"char", char: myChar}));
    }
  };
}

// === Joystick UI logic ===
let joy = document.getElementById("joystick");
let stick = document.getElementById("stick");

let centerX = joy.offsetLeft + joy.offsetWidth/2;
let centerY = joy.offsetTop + joy.offsetHeight/2;

function getDistance(x1,y1,x2,y2){
  return Math.sqrt((x2-x1)**2+(y2-y1)**2);
}

joy.addEventListener("touchmove", e=>{
  e.preventDefault();
  let touch = e.touches[0];
  let dx = touch.clientX - centerX;
  let dy = touch.clientY - centerY;

  let dist = getDistance(0,0,dx,dy);
  let maxDist = 40; // max stick radius
  if (dist > maxDist) {
    dx = dx / dist * maxDist;
    dy = dy / dist * maxDist;
  }

  stick.style.left = 40 + dx + "px";
  stick.style.top = 40 + dy + "px";

  joystick.dx = dx/10; // adjust sensitivity
  joystick.dy = dy/10;
});
joy.addEventListener("touchend", e=>{
  e.preventDefault();
  stick.style.left = "40px";
  stick.style.top = "40px";
  joystick.dx = 0;
  joystick.dy = 0;
});

// === Game loop ===
function loop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Move my char
  myX += joystick.dx;
  myY += joystick.dy;

  // Send position
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({type:"pos", x:myX, y:myY}));
  }

  // Draw my char
  if (myChar) {
    ctx.drawImage(sprites[myChar], myX-32, myY-32, 64,64);
  }

  // Draw enemy char (if known)
  if (enemyChar) {
    ctx.drawImage(sprites[enemyChar], enemyX-32, enemyY-32, 64,64);
  }

  requestAnimationFrame(loop);
}
loop();
