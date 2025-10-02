// mila.js
// Mila’s attacks, skill (toward enemy), lifesteal, and helpers for the fast-HP rules.

export function milaBasicAttack(state, broadcast) {
  state.lastAttackTime = performance.now(); // reset invis timer
  const id = (state.nextProjId++).toString();
  const slash = {
    id,
    kind: "mila_slash",
    owner: "you",          // from my perspective
    x: state.myX + 40,     // just in front
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

  // Aim the giant orb toward current enemy position
  const dx = state.enemyX - state.myX;
  const dy = state.enemyY - state.myY;
  const len = Math.hypot(dx, dy) || 1;
  const vx = (dx / len) * 2; // very slow
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

// Return damage dealt (fast-HP system)
export function milaOnHit(proj, state) {
  if (proj.kind === "mila_slash") {
    // Lifesteal +1 up to Mila max (4)
    state.myHP = Math.min(state.myMaxHP, state.myHP + 1);
    return 1;
  }
  if (proj.kind === "mila_energy") {
    return 2;
  }
  return 0;
}
