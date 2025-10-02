// public/game.js (updated)
// NOTE: drop the attack/skill PNGs listed in the instructions into /public/

// ---- canvas + scale ----
let canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");
canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.65;

// ---- signaling / rtc (unchanged) ----
let ws, pc, dataChannel;
let isHost = false;
let candidateQueue = [];
let remoteDescSet = false;

// ---- game state ----
let myChar = null;
let myX = canvas.width * 0.2, myY = canvas.height * 0.5;
let enemyX = canvas.width * 0.8, enemyY = canvas.height * 0.5;
let enemyChar = null;
let myHP = 100, enemyHP = 100;

// ---- movement ----
let joystick = { dx: 0, dy: 0 };

// ---- assets (sprites + attack images) ----
const assetNames = {
  chars: ["mila","gustav","fyero"],
  basic: {
    fyero: "fyero_basic.png",
    gustav: "gustav_basic.png",
    mila: "mila_basic.png"
  },
  skill: {
    fyero: "fyero_skill.png",
    gustav: "gustav_skill.png",
    mila: "mila_skill.png"
  },
  hit: "hit_fx.png"
};
let sprites = {}, basicImgs = {}, skillImgs = {}, hitImg = null;

// load char sprites
assetNames.chars.forEach(name=>{
  sprites[name] = new Image();
  sprites[name].src = name + ".png";
});
// load basic/skill if available (fallback handled later)
Object.keys(assetNames.basic).forEach(k=>{
  basicImgs[k] = new Image();
  basicImgs[k].src = assetNames.basic[k];
});
Object.keys(assetNames.skill).forEach(k=>{
  skillImgs[k] = new Image();
  skillImgs[k].src = assetNames.skill[k];
});
hitImg = new Image(); hitImg.src = assetNames.hit;

// ---- projectiles & effects ----
let projectiles = {}; // id -> {id, kind, owner, x,y,vx,vy,life,ttl}
let nextProjId = 1;
function spawnProjectile(kind, owner, x, y, vx, vy, ttl=2000) {
  const id = (nextProjId++).toString();
  const p = { id, kind, owner, x, y, vx, vy, ttl, born: performance.now() };
  projectiles[id] = p;
  return p;
}

// ---- sync helpers ----
function broadcastDC(obj) {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify(obj));
  }
}

// ---- select char (sends char if channel open) ----
function selectChar(name) {
  myChar = name;
  console.log("🎯 You selected:", name);
  if (dataChannel && dataChannel.readyState === "open") {
    broadcastDC({ type:"char", char: myChar });
  }
}

// ---- connect host/join (kept mostly same as before) ----
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
      pc.ondatachannel = (e) => { dataChannel = e.channel; setupChannel(); };
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
      } else {
        candidateQueue.push(cand);
      }
    }
  };
}

// peer connection & ICE
async function ensurePc() {
  if (pc) return pc;
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws && ws.readyState === 1 && ws.send(JSON.stringify({ candidate: e.candidate }));
    }
  };
  pc.oniceconnectionstatechange = () => { console.log("ICE state:", pc.iceConnectionState); };
  return pc;
}

// data channel handling: extended to handle projectiles & hp
function setupChannel() {
  dataChannel.onopen = () => {
    console.log("✅ DataChannel open");
    if (myChar) broadcastDC({ type:"char", char: myChar });
    // also send current HP to sync
    broadcastDC({ type:"hp_sync", hp: myHP });
  };
  dataChannel.onmessage = (e) => {
    let msg = {};
    try { msg = JSON.parse(e.data); } catch { return; }

    switch(msg.type) {
      case "pos":
        enemyX = msg.x; enemyY = msg.y; break;
      case "char":
        enemyChar = msg.char; break;
      case "spawn": // new projectile from peer
        // msg: {type:"spawn", id, kind, owner, x,y,vx,vy,ttl}
        projectiles[msg.id] = { ...msg, born: performance.now() };
        break;
      case "hp_update":
        // peer telling us they changed our HP (or they changed theirs)
        // We'll assume hp_update: {type:"hp_update", who:"enemy"|"you", hp:val}
        if (msg.who === "enemy") enemyHP = msg.hp;
        if (msg.who === "you") myHP = msg.hp;
        break;
      case "hp_sync":
        // initial sync: peer sends their current HP
        // msg: {type:"hp_sync", hp: <their hp>}
        enemyHP = msg.hp;
        break;
      default:
        console.log("unknown dc msg", msg);
    }
  };
}

// ---- attack & skill logic ----
// when player uses attack/skill we spawn a projectile locally and broadcast spawn
function doBasicAttack() {
  if (!myChar) return;
  if (myChar === "fyero") {
    // melee short-lived "fireburst" in front of player
    const vx = 0, vy = 0;
    const p = spawnProjectile("fyero_basic", "you", myX + 30, myY, vx, vy, 400);
    broadcastDC({ type:"spawn", ...p });
  } else if (myChar === "gustav") {
    // long projectile to right for host, to left for joined? use facing: we don't track facing; spawn rightwards
    const vx = 6, vy = 0;
    const p = spawnProjectile("gustav_basic", "you", myX + 10, myY, vx, vy, 3000);
    broadcastDC({ type:"spawn", ...p });
  } else if (myChar === "mila") {
    const p = spawnProjectile("mila_basic", "you", myX + 30, myY, 0, 0, 300);
    broadcastDC({ type:"spawn", ...p });
    // Mila lifesteal handled on hit
  }
}
function doSkill() {
  if (!myChar) return;
  if (myChar === "fyero") {
    const p = spawnProjectile("fyero_skill", "you", myX + 30, myY, 0, 0, 700);
    broadcastDC({ type:"spawn", ...p });
  } else if (myChar === "gustav") {
    // spawn multiple spiral bullets (we'll spawn 6 around)
    for (let i=0;i<6;i++){
      const angle = i*(Math.PI*2/6);
      const vx = Math.cos(angle)*4;
      const vy = Math.sin(angle)*4;
      const p = spawnProjectile("gustav_skill", "you", myX, myY, vx, vy, 2200);
      broadcastDC({ type:"spawn", ...p });
    }
  } else if (myChar === "mila") {
    const p = spawnProjectile("mila_skill", "you", myX+30, myY, 3, 0, 2500);
    broadcastDC({ type:"spawn", ...p });
  }
}

// Hook attack/skill buttons
document.getElementById("attackBtn").addEventListener("click", ()=>{
  doBasicAttack();
});
document.getElementById("skillBtn").addEventListener("click", ()=>{
  doSkill();
});

// ---- joystick UI (kept similar: slower movement) ----
let joy = document.getElementById("joystick");
let stick = document.getElementById("stick");
let centerX = joy.offsetLeft + joy.offsetWidth/2;
let centerY = joy.offsetTop + joy.offsetHeight/2;
joy.addEventListener("touchmove", e=>{
  e.preventDefault();
  let t = e.touches[0];
  let dx = t.clientX - centerX, dy = t.clientY - centerY;
  const max = 40; let d = Math.hypot(dx,dy);
  if (d>max){ dx = dx/d*max; dy = dy/d*max; }
  stick.style.left = 40 + dx + "px";
  stick.style.top  = 40 + dy + "px";
  joystick.dx = dx/20; joystick.dy = dy/20; // slower
},{passive:false});
joy.addEventListener("touchend", e=>{ e.preventDefault(); stick.style.left="40px"; stick.style.top="40px"; joystick.dx=joystick.dy=0; },{passive:false});

// ---- update loop: move, simulate projectiles, collision, draw ----
function loop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // move
  myX = Math.max(32, Math.min(canvas.width-32, myX + joystick.dx));
  myY = Math.max(32, Math.min(canvas.height-32, myY + joystick.dy));

  // send pos
  if (dataChannel && dataChannel.readyState === "open") {
    broadcastDC({ type:"pos", x: myX, y: myY });
  }

  // simulate projectiles
  const now = performance.now();
  for (const id of Object.keys(projectiles)) {
    const p = projectiles[id];
    const age = now - p.born;
    // TTL expiration
    if (age > p.ttl) { delete projectiles[id]; continue; }
    // move
    p.x += p.vx;
    p.y += p.vy;

    // collision checks: projectile hit enemy (owner 'you' hits enemy; owner 'enemy' hits you)
    // For simplicity: if owner === "you", then hitting enemy; else hitting you
    if (p.owner === "you") {
      const dx = enemyX - p.x, dy = enemyY - p.y;
      if (Math.hypot(dx,dy) < 30 + 16) { // hit threshold
        // apply damage depending on kind
        let dmg = 0;
        if (p.kind === "fyero_basic") dmg = 12;
        if (p.kind === "fyero_skill") dmg = 22;
        if (p.kind === "gustav_basic") dmg = 10;
        if (p.kind === "gustav_skill") dmg = 18;
        if (p.kind === "mila_basic") dmg = 8;
        if (p.kind === "mila_skill") dmg = 20;

        // If mila lifesteal on basic
        if (p.kind === "mila_basic") {
          myHP = Math.min(100, myHP + 6); // lifesteal amount
        }

        enemyHP = Math.max(0, enemyHP - dmg);
        // broadcast hp change (tell opponent what their HP is)
        broadcastDC({ type:"hp_update", who:"enemy", hp: enemyHP });
        // create small hit effect (we just keep projectile then delete)
        delete projectiles[id];
        continue;
      }
    } else if (p.owner === "enemy") {
      const dx = myX - p.x, dy = myY - p.y;
      if (Math.hypot(dx,dy) < 30 + 16) {
        let dmg = 0;
        if (p.kind === "fyero_basic") dmg = 12;
        if (p.kind === "fyero_skill") dmg = 22;
        if (p.kind === "gustav_basic") dmg = 10;
        if (p.kind === "gustav_skill") dmg = 18;
        if (p.kind === "mila_basic") dmg = 8;
        if (p.kind === "mila_skill") dmg = 20;

        // If enemy used Mila basic and hit us, they should heal — but that heal already applied on their side; we just reduce our HP
        myHP = Math.max(0, myHP - dmg);
        broadcastDC({ type:"hp_update", who:"you", hp: myHP });
        delete projectiles[id];
        continue;
      }
    }
  }

  // draw arena (simple)
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(60, 60, canvas.width - 120, canvas.height - 140);

  // draw players
  if (enemyChar) {
    const img = sprites[enemyChar];
    if (img && img.complete) ctx.drawImage(img, enemyX-32, enemyY-32, 64,64);
    else { ctx.fillStyle="orange"; ctx.beginPath(); ctx.arc(enemyX,enemyY,20,0,Math.PI*2); ctx.fill(); }
  }
  if (myChar) {
    const img = sprites[myChar];
    if (img && img.complete) ctx.drawImage(img, myX-32, myY-32, 64,64);
    else { ctx.fillStyle="cyan"; ctx.beginPath(); ctx.arc(myX,myY,20,0,Math.PI*2); ctx.fill(); }
  }

  // draw projectiles
  for (const id of Object.keys(projectiles)) {
    const p = projectiles[id];
    // choose image by kind
    let drew = false;
    if (p.kind.startsWith("fyero")) {
      const img = (p.kind==="fyero_basic") ? basicImgs["fyero"] : skillImgs["fyero"];
      if (img && img.complete) { ctx.drawImage(img, p.x-24, p.y-24, 48,48); drew = true; }
    }
    if (!drew && p.kind.startsWith("gustav")) {
      const img = (p.kind==="gustav_basic") ? basicImgs["gustav"] : skillImgs["gustav"];
      if (img && img.complete) { ctx.drawImage(img, p.x-16, p.y-12, 32,24); drew = true; }
    }
    if (!drew && p.kind.startsWith("mila")) {
      const img = (p.kind==="mila_basic") ? basicImgs["mila"] : skillImgs["mila"];
      if (img && img.complete) { ctx.drawImage(img, p.x-24, p.y-24, 48,48); drew = true; }
    }
    if (!drew) {
      // fallback
      ctx.fillStyle = p.owner==="you" ? "white" : "black";
      ctx.beginPath(); ctx.arc(p.x,p.y,8,0,Math.PI*2); ctx.fill();
    }
  }

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

// utility: spawn projectile wrapper for local + mark owner properly
function spawnProjectile(kind, owner, x, y, vx, vy, ttl=2000) {
  const id = (nextProjId++).toString();
  const p = { id, kind, owner, x, y, vx, vy, ttl, born: performance.now() };
  projectiles[id] = p;
  return p;
}

// expose some globals used above
let projectilesRef = projectiles; // just alias (unused)
let nextProjId = 1;
