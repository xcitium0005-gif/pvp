// ---- Setup canvas ----
let canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");
canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.65;

// ---- Networking ----
let ws, pc, dataChannel;
let isHost = false;
let candidateQueue = [];
let remoteDescSet = false;

// ---- Game state ----
let myChar = null;
let myX = canvas.width * 0.2, myY = canvas.height * 0.5;
let enemyX = canvas.width * 0.8, enemyY = canvas.height * 0.5;
let enemyChar = null;
let myHP = 100, enemyHP = 100;

// ---- Cooldowns ----
let canAttack = true, canSkill = true;

// ---- Movement ----
let joystick = { dx: 0, dy: 0 };

// ---- Projectiles ----
let projectiles = {};
let nextProjId = 1;

// ---- Select Character ----
function selectChar(name) {
  myChar = name;
  console.log("🎯 You selected:", name);
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({ type:"char", char: myChar }));
  }
}

// ---- Networking Setup ----
function connect(host) {
  isHost = host;
  const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/ws";
  ws = new WebSocket(wsUrl);

  ws.onopen = async () => {
    await ensurePc();
    if (isHost) {
      dataChannel = pc.createDataChannel("game");
      setupChannel();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({ offer }));
    } else {
      pc.ondatachannel = (e) => { dataChannel = e.channel; setupChannel(); };
    }
  };

  ws.onmessage = async (event) => {
    let msg = {};
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.offer && !isHost) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      remoteDescSet = true;
      candidateQueue.forEach(c => pc.addIceCandidate(c));
      candidateQueue = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer }));
    }

    if (msg.answer && isHost) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
      remoteDescSet = true;
      candidateQueue.forEach(c => pc.addIceCandidate(c));
      candidateQueue = [];
    }

    if (msg.candidate) {
      const cand = new RTCIceCandidate(msg.candidate);
      if (remoteDescSet) {
        await pc.addIceCandidate(cand).catch(()=>{});
      } else {
        candidateQueue.push(cand);
      }
    }
  };
}

async function ensurePc() {
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  pc.onicecandidate = (e) => {
    if (e.candidate) ws && ws.readyState === 1 && ws.send(JSON.stringify({ candidate: e.candidate }));
  };
  return pc;
}

function setupChannel() {
  dataChannel.onopen = () => {
    if (myChar) dataChannel.send(JSON.stringify({ type:"char", char: myChar }));
    dataChannel.send(JSON.stringify({ type:"hp_sync", hp: myHP }));
  };
  dataChannel.onmessage = (e) => {
    let msg = JSON.parse(e.data);
    switch(msg.type) {
      case "pos": enemyX = msg.x; enemyY = msg.y; break;
      case "char": enemyChar = msg.char; break;
      case "spawn": projectiles[msg.id] = { ...msg, born: performance.now() }; break;
      case "hp_update": 
        if (msg.target === "enemy") enemyHP = msg.hp;
        if (msg.target === "you") myHP = msg.hp;
        break;
      case "hp_sync": enemyHP = msg.hp; break;
    }
  };
}

function broadcast(obj) {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify(obj));
  }
}

// ---- Combat ----
function spawnProjectile(kind, owner, x, y, vx, vy, ttl=2000) {
  const id = (nextProjId++).toString();
  projectiles[id] = { id, kind, owner, x, y, vx, vy, ttl, born: performance.now() };
  broadcast({ type:"spawn", ...projectiles[id] });
  return projectiles[id];
}

function doAttack() {
  if (!canAttack || !myChar) return;
  canAttack = false;
  setTimeout(()=>canAttack=true, 500); // 0.5s cooldown

  if (myChar === "fyero") spawnProjectile("fyero_basic","you",myX+30,myY,0,0,400);
  if (myChar === "gustav") spawnProjectile("gustav_basic","you",myX,myY,6,0,2000);
  if (myChar === "mila") spawnProjectile("mila_basic","you",myX+30,myY,0,0,200);
}

function doSkill() {
  if (!canSkill || !myChar) return;
  canSkill = false;
  setTimeout(()=>canSkill=true, 5000); // 5s cooldown

  if (myChar === "fyero") spawnProjectile("fyero_skill","you",myX+30,myY,0,0,700);
  if (myChar === "gustav") {
    for (let i=0;i<6;i++) {
      const angle = i*(Math.PI*2/6);
      spawnProjectile("gustav_skill","you",myX,myY,Math.cos(angle)*4,Math.sin(angle)*4,2200);
    }
  }
  if (myChar === "mila") spawnProjectile("mila_skill","you",myX+30,myY,2,0,2500);
}

// ---- Buttons ----
document.getElementById("attackBtn").addEventListener("click", doAttack);
document.getElementById("skillBtn").addEventListener("click", doSkill);

// ---- Joystick ----
let joy = document.getElementById("joystick");
let stick = document.getElementById("stick");
let centerX = joy.offsetLeft + joy.offsetWidth/2;
let centerY = joy.offsetTop + joy.offsetHeight/2;

joy.addEventListener("touchmove", e=>{
  e.preventDefault();
  let t = e.touches[0];
  let dx = t.clientX - centerX, dy = t.clientY - centerY;
  const max = 40, d = Math.hypot(dx,dy);
  if (d>max) { dx = dx/d*max; dy = dy/d*max; }
  stick.style.left = 40+dx+"px";
  stick.style.top = 40+dy+"px";
  joystick.dx = dx/20; joystick.dy = dy/20;
},{passive:false});
joy.addEventListener("touchend", e=>{
  e.preventDefault();
  stick.style.left="40px"; stick.style.top="40px";
  joystick.dx=joystick.dy=0;
},{passive:false});

// ---- Game Loop ----
function loop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // movement
  myX = Math.max(32, Math.min(canvas.width-32, myX+joystick.dx));
  myY = Math.max(32, Math.min(canvas.height-32, myY+joystick.dy));

  // send position
  broadcast({ type:"pos", x: myX, y: myY });

  // simulate projectiles
  const now = performance.now();
  for (let id of Object.keys(projectiles)) {
    const p = projectiles[id];
    if (now - p.born > p.ttl) { delete projectiles[id]; continue; }
    p.x += p.vx; p.y += p.vy;

    // collisions
    if (p.owner==="you") {
      const dx=enemyX-p.x, dy=enemyY-p.y;
      if (Math.hypot(dx,dy)<40) { enemyHP=Math.max(0,enemyHP-10); broadcast({type:"hp_update",target:"enemy",hp:enemyHP}); delete projectiles[id]; }
    } else if (p.owner==="enemy") {
      const dx=myX-p.x, dy=myY-p.y;
      if (Math.hypot(dx,dy)<40) { myHP=Math.max(0,myHP-10); broadcast({type:"hp_update",target:"you",hp:myHP}); delete projectiles[id]; }
    }
  }

  // draw arena
  ctx.fillStyle="#2a2a2a"; ctx.fillRect(60,60,canvas.width-120,canvas.height-140);

  // draw players
  if (enemyChar) { ctx.fillStyle="orange"; ctx.beginPath(); ctx.arc(enemyX,enemyY,20,0,2*Math.PI); ctx.fill(); }
  if (myChar) { ctx.fillStyle="cyan"; ctx.beginPath(); ctx.arc(myX,myY,20,0,2*Math.PI); ctx.fill(); }

  // draw projectiles (fallback if no images)
  ctx.fillStyle="white";
  for (let id in projectiles) {
    let p=projectiles[id];
    ctx.beginPath(); ctx.arc(p.x,p.y,8,0,2*Math.PI); ctx.fill();
  }

  // HP bars
  drawHP(myX,myY,myHP);
  drawHP(enemyX,enemyY,enemyHP);

  requestAnimationFrame(loop);
}
loop();

function drawHP(x,y,hp){
  ctx.fillStyle="red"; ctx.fillRect(x-30,y-50,60,6);
  ctx.fillStyle="lime"; ctx.fillRect(x-30,y-50,(hp/100)*60,6);
}
