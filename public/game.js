// game.js
import { milaBasicAttack, milaSkill, milaOnHit } from "./mila.js";

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
export let state = {
  myChar: null,
  myX: canvas.width * 0.2,
  myY: canvas.height * 0.5,
  enemyX: canvas.width * 0.8,
  enemyY: canvas.height * 0.5,
  enemyChar: null,
  myHP: 5,     // baseline, adjusted on selection
  enemyHP: 5,
  projectiles: {},
  nextProjId: 1,
  lastAttackTime: 0
};

// ---- Cooldowns ----
let canAttack = true, canSkill = true;

// ---- Movement ----
let joystick = { dx: 0, dy: 0 };

// ---- Sprites ----
let sprites = {};
["mila","gustav","fyero"].forEach(name=>{
  sprites[name] = new Image();
  sprites[name].src = name + ".png";
});
let milaSlash = new Image(); milaSlash.src = "mila_slash.png";
let milaEnergy = new Image(); milaEnergy.src = "mila_energy.png";

// ---- Select Character ----
window.selectChar = function(name) {
  state.myChar = name;
  if (name==="mila") state.myHP = 4;
  if (name==="gustav") state.myHP = 5;
  if (name==="fyero") state.myHP = 6;

  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify({ type:"char", char: state.myChar }));
  }
};

// ---- Networking ----
window.connect = function(host) {
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
};

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
    if (state.myChar) dataChannel.send(JSON.stringify({ type:"char", char: state.myChar }));
    dataChannel.send(JSON.stringify({ type:"hp_sync", hp: state.myHP }));
  };
  dataChannel.onmessage = (e) => {
    let msg = JSON.parse(e.data);
    switch(msg.type) {
      case "pos": state.enemyX = msg.x; state.enemyY = msg.y; break;
      case "char": state.enemyChar = msg.char; break;
      case "spawn": state.projectiles[msg.id] = { ...msg, born: performance.now() }; break;
      case "hp_update": 
        if (msg.target === "enemy") state.enemyHP = msg.hp;
        if (msg.target === "you") {
          state.myHP = msg.hp;
          if (msg.knockback) {
            state.myX += msg.knockback.dx;
            state.myY += msg.knockback.dy;
          }
        }
        break;
      case "hp_sync": state.enemyHP = msg.hp; break;
    }
  };
}

function broadcast(obj) {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify(obj));
  }
}

// ---- Combat ----
function doAttack() {
  if (!canAttack || !state.myChar) return;
  canAttack = false;
  setTimeout(()=>canAttack=true, 500);

  if (state.myChar === "mila") milaBasicAttack(state, broadcast);
}

function doSkill() {
  if (!canSkill || !state.myChar) return;
  canSkill = false;
  setTimeout(()=>canSkill=true, 8000);

  if (state.myChar === "mila") milaSkill(state, broadcast);
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
  state.myX = Math.max(32, Math.min(canvas.width-32, state.myX+joystick.dx));
  state.myY = Math.max(32, Math.min(canvas.height-32, state.myY+joystick.dy));

  // send position
  broadcast({ type:"pos", x: state.myX, y: state.myY });

  // simulate projectiles
  const now = performance.now();
  for (let id of Object.keys(state.projectiles)) {
    const p = state.projectiles[id];
    if (now - p.born > p.ttl) { delete state.projectiles[id]; continue; }
    p.x += p.vx; p.y += p.vy;

    if (p.owner==="you") {
      const dx=state.enemyX-p.x, dy=state.enemyY-p.y;
      if (Math.hypot(dx,dy)<80) { 
        let dmg = milaOnHit(p,state);
        state.enemyHP=Math.max(0,state.enemyHP-dmg);

        let kb = null;
        if (p.kind==="mila_energy") {
          const len=Math.hypot(dx,dy)||1;
          kb = { dx:(dx/len)*80, dy:(dy/len)*80 };
        }

        broadcast({type:"hp_update",target:"enemy",hp:state.enemyHP,knockback:kb});
        delete state.projectiles[id];
      }
    }
  }

  // draw arena
  ctx.fillStyle="#2a2a2a"; ctx.fillRect(60,60,canvas.width-120,canvas.height-140);

  // draw enemy (invisible if Mila idle >3s)
  if (state.enemyChar) {
    if (state.enemyChar==="mila" && (performance.now()-state.lastAttackTime>3000)) {
      // fully invisible to me
    } else {
      ctx.drawImage(sprites[state.enemyChar], state.enemyX-64, state.enemyY-64, 128,128);
    }
  }

  // draw my player (Mila sees herself semi-transparent if invisible)
  if (state.myChar) {
    if (state.myChar==="mila") {
      const invisible = (performance.now()-state.lastAttackTime>3000);
      if (invisible) ctx.globalAlpha=0.5;
      ctx.drawImage(sprites[state.myChar], state.myX-64, state.myY-64, 128,128);
      ctx.globalAlpha=1.0;
    } else {
      ctx.drawImage(sprites[state.myChar], state.myX-64, state.myY-64, 128,128);
    }
  }

  // draw projectiles
  for (let id in state.projectiles) {
    let p=state.projectiles[id];
    if (p.kind==="mila_slash") ctx.drawImage(milaSlash,p.x-32,p.y-32,64,64);
    if (p.kind==="mila_energy") ctx.drawImage(milaEnergy,p.x-128,p.y-128,256,256);
  }

  // HP bars
  drawHP(state.myX,state.myY,state.myHP);
  drawHP(state.enemyX,state.enemyY,state.enemyHP);

  // End conditions
  if (state.myHP <= 0) {
    ctx.fillStyle="white"; ctx.font="40px Arial";
    ctx.fillText("💀 You Lose!", canvas.width/2-100, canvas.height/2);
  }
  if (state.enemyHP <= 0) {
    ctx.fillStyle="yellow"; ctx.font="40px Arial";
    ctx.fillText("🏆 You Win!", canvas.width/2-100, canvas.height/2);
  }

  requestAnimationFrame(loop);
}
loop();

function drawHP(x,y,hp){
  ctx.fillStyle="red"; ctx.fillRect(x-30,y-70,60,6);
  ctx.fillStyle="lime"; ctx.fillRect(x-30,y-70,(hp/6)*60,6); // max 6
}
