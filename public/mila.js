// mila.js
// Mila’s attacks, skills, lifesteal, knockback, invisibility

export function milaBasicAttack(state, broadcast) {
  state.lastAttackTime = performance.now(); // reset invisibility timer
  const id = (state.nextProjId++).toString();
  const slash = {
    id,
    kind: "mila_slash",
    owner: "you",
    x: state.myX + 40,
    y: state.myY,
    vx: 0, vy: 0,
    ttl: 200,
    born: performance.now()
  };
  state.projectiles[id] = slash;
  broadcast({ type:"spawn", ...slash });
}

export function milaSkill(state, broadcast) {
  state.lastAttackTime = performance.now();

  // Direction toward enemy
  const dx = state.enemyX - state.myX;
  const dy = state.enemyY - state.myY;
  const len = Math.hypot(dx, dy) || 1;
  const vx = (dx / len) * 2; // slow orb
  const vy = (dy / len) * 2;

  const id = (state.nextProjId++).toString();
  const orb = {
    id,
    kind: "mila_energy",
    owner: "you",
    x: state.myX,
    y: state.myY,
    vx, vy,
    ttl: 5000,
    born: performance.now()
  };
  state.projectiles[id] = orb;
  broadcast({ type:"spawn", ...orb });
}

export function milaOnHit(proj, state) {
  if (proj.kind === "mila_slash") {
    // Lifesteal
    state.myHP = Math.min(100, state.myHP + 5);
    return 8; // damage
  }
  if (proj.kind === "mila_energy") {
    return 30; // heavy damage
  }
  return 0;
}

export function milaApplyKnockback(state, proj, distance=80) {
  const dx = state.myX - proj.x;
  const dy = state.myY - proj.y;
  const len = Math.hypot(dx, dy) || 1;
  state.myX += (dx / len) * distance;
  state.myY += (dy / len) * distance;
}
