// mila.js
// Handles Mila's attacks & skill

export function milaBasicAttack(state, broadcast) {
  // Create slash projectile
  const id = (state.nextProjId++).toString();
  const slash = {
    id,
    kind: "mila_slash",
    owner: "you",
    x: state.myX + 40,  // in front of her
    y: state.myY,
    vx: 0,
    vy: 0,
    ttl: 200,           // lasts 0.2s
    born: performance.now()
  };
  state.projectiles[id] = slash;
  broadcast({ type: "spawn", ...slash });
}

export function milaSkill(state, broadcast) {
  // Giant slow energy orb
  const id = (state.nextProjId++).toString();
  const orb = {
    id,
    kind: "mila_energy",
    owner: "you",
    x: state.myX,
    y: state.myY,
    vx: 2,  // very slow speed
    vy: 0,
    ttl: 5000, // lasts 5s
    born: performance.now()
  };
  state.projectiles[id] = orb;
  broadcast({ type: "spawn", ...orb });
}

export function milaOnHit(proj, state, broadcast) {
  if (proj.kind === "mila_slash") {
    // Lifesteal: heal 5
    state.myHP = Math.min(100, state.myHP + 5);
    broadcast({ type: "hp_update", target: "you", hp: state.myHP });
    return 8; // damage
  }
  if (proj.kind === "mila_energy") {
    // Heavy hit + knockback
    applyKnockback(state, proj, 80);
    return 30;
  }
  return 0;
}

// Knockback utility
function applyKnockback(state, proj, distance) {
  const dx = state.myX - proj.x;
  const dy = state.myY - proj.y;
  const len = Math.hypot(dx, dy) || 1;
  state.myX += (dx / len) * distance;
  state.myY += (dy / len) * distance;
}
