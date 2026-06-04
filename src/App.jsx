import { useState, useEffect, useRef, useCallback } from "react";

// ── Audio Engine (Web Audio API - no files needed) ──────────────────────────
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  _play(type, freq, dur, vol = 0.3, shape = "square") {
    if (!this.enabled || !this.ctx) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this.ctx.destination);
      o.type = shape; o.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (type === "shoot") {
        o.frequency.exponentialRampToValueAtTime(freq * 0.3, this.ctx.currentTime + dur);
      } else if (type === "explode") {
        o.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + dur);
      } else if (type === "levelup") {
        o.frequency.setValueAtTime(440, this.ctx.currentTime);
        o.frequency.setValueAtTime(550, this.ctx.currentTime + 0.1);
        o.frequency.setValueAtTime(660, this.ctx.currentTime + 0.2);
        o.frequency.setValueAtTime(880, this.ctx.currentTime + 0.3);
      }
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  }
  shoot()   { this._play("shoot",   800,  0.12, 0.15, "sawtooth"); }
  explode() { this._play("explode", 200,  0.35, 0.4,  "sawtooth"); }
  hit()     { this._play("hit",     300,  0.1,  0.2,  "square");   }
  levelup() { this._play("levelup", 440,  0.5,  0.35, "sine");     }
  die()     { this._play("explode", 120,  0.6,  0.5,  "sawtooth"); }
  gameover(){ 
    if (!this.enabled || !this.ctx) return;
    [200, 160, 120, 80].forEach((f, i) => {
      setTimeout(() => this._play("explode", f, 0.4, 0.4, "sawtooth"), i * 180);
    });
  }
}
const sfx = new SoundEngine();

// ── Canvas-based Game (single canvas = best mobile perf) ───────────────────
const SHIP_SPEED = 5;
const BULLET_SPEED = 12;
const BULLET_COOLDOWN = 180;
const COLORS = ["#f87171","#fb923c","#f472b6","#38bdf8","#a78bfa","#34d399","#fbbf24"];

function rand(a, b) { return a + Math.random() * (b - a); }

let bulletId = 0, enemyId = 0, explId = 0, floatId = 0;

// ── React Shell ─────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState("menu");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const phaseRef = useRef("menu");

  // game state refs
  const gameState = useRef({
    shipX: 0, shipY: 0,
    bullets: [], enemies: [], explosions: [], floats: [],
    keys: {}, lastShot: 0, lastEnemy: 0,
    score: 0, lives: 3, level: 1,
    W: 0, H: 0,
    touchX: null, isShooting: false,
  });
  const animRef = useRef(null);
  const canvasCtxRef = useRef(null);

  // ── Drawing helpers ───────────────────────────────────────────────────────
  const drawShip = useCallback((ctx, x, y) => {
    const s = gameState.current;
    const scale = Math.min(s.W, s.H) / 600;
    const sz = 28 * Math.max(scale, 0.7);
    // engine flame
    const flicker = 0.7 + Math.random() * 0.6;
    const grad = ctx.createLinearGradient(x, y + sz * 0.6, x, y + sz * 1.4 * flicker);
    grad.addColorStop(0, "#fbbf24"); grad.addColorStop(0.5, "#f87171"); grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.moveTo(x - sz * 0.25, y + sz * 0.6);
    ctx.lineTo(x, y + sz * 1.4 * flicker);
    ctx.lineTo(x + sz * 0.25, y + sz * 0.6);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // wings
    ctx.beginPath();
    ctx.moveTo(x - sz, y + sz * 0.5);
    ctx.lineTo(x - sz * 0.15, y - sz * 0.2);
    ctx.lineTo(x - sz * 0.15, y + sz * 0.6);
    ctx.closePath();
    const wgL = ctx.createLinearGradient(x - sz, y, x, y);
    wgL.addColorStop(0,"#38bdf8"); wgL.addColorStop(1,"#a78bfa");
    ctx.fillStyle = wgL; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + sz, y + sz * 0.5);
    ctx.lineTo(x + sz * 0.15, y - sz * 0.2);
    ctx.lineTo(x + sz * 0.15, y + sz * 0.6);
    ctx.closePath();
    const wgR = ctx.createLinearGradient(x, y, x + sz, y);
    wgR.addColorStop(0,"#a78bfa"); wgR.addColorStop(1,"#38bdf8");
    ctx.fillStyle = wgR; ctx.fill();
    // body
    const bodyGrad = ctx.createLinearGradient(x, y - sz, x, y + sz * 0.6);
    bodyGrad.addColorStop(0,"#a78bfa"); bodyGrad.addColorStop(1,"#60a5fa");
    ctx.beginPath();
    ctx.moveTo(x, y - sz);
    ctx.lineTo(x + sz * 0.35, y + sz * 0.6);
    ctx.lineTo(x - sz * 0.35, y + sz * 0.6);
    ctx.closePath();
    ctx.fillStyle = bodyGrad; ctx.fill();
    // cockpit
    ctx.beginPath();
    ctx.ellipse(x, y - sz * 0.25, sz * 0.12, sz * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#c7d2fe88"; ctx.fill();
  }, []);

  const drawBullet = useCallback((ctx, x, y) => {
    const grad = ctx.createLinearGradient(x, y - 14, x, y + 4);
    grad.addColorStop(0,"#fff"); grad.addColorStop(1,"#a78bfa");
    ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 14, 4, 18, 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.shadowBlur = 0;
  }, []);

  const drawEnemy = useCallback((ctx, enemy, ts) => {
    const { x, y, hp, maxHp, type, id } = enemy;
    const s = gameState.current;
    const scale = Math.min(s.W, s.H) / 600;
    const sz = 22 * Math.max(scale, 0.7);
    const c = COLORS[type % COLORS.length];
    const wobble = Math.sin(ts * 0.003 + id) * 2;
    // body
    ctx.save();
    ctx.shadowColor = c; ctx.shadowBlur = 12;
    const bodyGrad = ctx.createRadialGradient(x, y + wobble - sz * 0.2, sz * 0.1, x, y + wobble, sz);
    bodyGrad.addColorStop(0, c + "dd"); bodyGrad.addColorStop(1, c + "44");
    ctx.beginPath();
    ctx.ellipse(x, y + wobble, sz, sz * 0.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad; ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.shadowBlur = 0;
    // eyes
    ctx.fillStyle = "white";
    ctx.beginPath(); ctx.arc(x - sz * 0.28, y + wobble - sz * 0.1, sz * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + sz * 0.28, y + wobble - sz * 0.1, sz * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(x - sz * 0.24, y + wobble - sz * 0.08, sz * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + sz * 0.24, y + wobble - sz * 0.08, sz * 0.09, 0, Math.PI * 2); ctx.fill();
    // tentacles
    const tentaclePhase = ts * 0.005;
    for (let i = -1.5; i <= 1.5; i++) {
      const tx = x + i * sz * 0.4;
      const swing = Math.sin(tentaclePhase + i) * 5;
      ctx.beginPath();
      ctx.moveTo(tx, y + wobble + sz * 0.7);
      ctx.quadraticCurveTo(tx + swing, y + wobble + sz * 1.1, tx + swing * 0.5, y + wobble + sz * 1.4);
      ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.stroke();
    }
    // HP bar
    const barW = sz * 2.2, barH = 4;
    const barX = x - barW / 2, barY = y + wobble + sz * 1.5;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
    const pct = hp / maxHp;
    ctx.fillStyle = pct > 0.5 ? "#34d399" : pct > 0.25 ? "#fbbf24" : "#f87171";
    ctx.roundRect(barX, barY, barW * pct, barH, 2); ctx.fill();
    ctx.restore();
  }, []);

  const drawExplosion = useCallback((ctx, expl, ts) => {
    const progress = (ts - expl.ts) / 600;
    if (progress >= 1) return;
    const alpha = 1 - progress;
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + expl.seed;
      const dist = expl.radii[i] * progress * 50;
      const px = expl.x + Math.cos(angle) * dist;
      const py = expl.y + Math.sin(angle) * dist;
      const r = expl.sizes[i] * (1 - progress * 0.5);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.shadowColor = COLORS[i % COLORS.length];
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.restore();
  }, []);

  const drawFloat = useCallback((ctx, f, ts) => {
    const progress = (ts - f.ts) / 800;
    if (progress >= 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = f.color;
    ctx.font = `bold ${f.big ? 22 : 16}px 'Segoe UI', sans-serif`;
    ctx.shadowColor = f.color; ctx.shadowBlur = 8;
    ctx.fillText(f.text, f.x, f.y - progress * 55);
    ctx.restore();
  }, []);

  // ── Main game loop ─────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    sfx.init();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width; const H = canvas.height;
    const s = gameState.current;
    s.W = W; s.H = H;
    s.shipX = W / 2; s.shipY = H - 90;
    s.bullets = []; s.enemies = []; s.explosions = []; s.floats = [];
    s.keys = {}; s.lastShot = 0; s.lastEnemy = 0; s.touchX = null;
    s.score = 0; s.lives = 3; s.level = 1;
    bulletId = 0; enemyId = 0; explId = 0; floatId = 0;
    setScore(0); setLives(3); setLevel(1);
    phaseRef.current = "playing";
    setPhase("playing");
  }, []);

  const endGame = useCallback(() => {
    sfx.gameover();
    cancelAnimationFrame(animRef.current);
    setHighScore(h => Math.max(h, gameState.current.score));
    phaseRef.current = "gameover";
    setPhase("gameover");
  }, []);

  // ── Canvas game loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvasCtxRef.current = ctx;
    const s = gameState.current;

    // Stars (static, generated once)
    const stars = Array.from({ length: 80 }, () => ({
      x: rand(0, s.W), y: rand(0, s.H), r: rand(0.5, 2), o: rand(0.2, 0.8),
    }));

    // Input
    const onKey = e => { s.keys[e.code] = e.type === "keydown"; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const onMouseMove = e => { s.touchX = Math.max(30, Math.min(s.W - 30, e.clientX)); };
    window.addEventListener("mousemove", onMouseMove);

    const onTouchMove = e => {
      e.preventDefault();
      s.touchX = Math.max(30, Math.min(s.W - 30, e.touches[0].clientX));
    };
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });

    const onTouchStart = e => {
      s.touchX = Math.max(30, Math.min(s.W - 30, e.touches[0].clientX));
      s.lastShot = 0; // force immediate shot
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });

    const SHIP_Y = s.H - 90;
    s.shipY = SHIP_Y;

    const loop = (ts) => {
      if (phaseRef.current !== "playing") return;

      // ── Update ──────────────────────────────────────────────────────────
      // Move ship
      if (s.keys["ArrowLeft"] || s.keys["KeyA"]) s.shipX = Math.max(30, s.shipX - SHIP_SPEED);
      if (s.keys["ArrowRight"] || s.keys["KeyD"]) s.shipX = Math.min(s.W - 30, s.shipX + SHIP_SPEED);
      if (s.touchX !== null) {
        const diff = s.touchX - s.shipX;
        s.shipX += diff * 0.18; // smooth follow
      }

      // Shoot
      if (ts - s.lastShot > BULLET_COOLDOWN) {
        s.bullets.push({ id: bulletId++, x: s.shipX, y: SHIP_Y - 18 });
        sfx.shoot();
        s.lastShot = ts;
      }

      // Move bullets
      for (let i = s.bullets.length - 1; i >= 0; i--) {
        s.bullets[i].y -= BULLET_SPEED;
        if (s.bullets[i].y < -20) s.bullets.splice(i, 1);
      }

      // Spawn enemies — hard caps to preserve performance at all levels
      const MAX_ENEMIES = 8;
      const spawnRate = Math.max(900, 1800 - s.level * 60); // floor at 900ms
      if (ts - s.lastEnemy > spawnRate && s.enemies.length < MAX_ENEMIES) {
        const cols = Math.min(2 + Math.floor(s.level / 2), 3); // max 3 per wave
        const slots = Math.min(cols, MAX_ENEMIES - s.enemies.length);
        const minGap = Math.floor(s.W / 4); // spread evenly, big gap
        const used = [];
        for (let i = 0; i < slots; i++) {
          let ex, tries = 0;
          do { ex = rand(55, s.W - 55); tries++; } while (tries < 30 && used.some(u => Math.abs(u - ex) < minGap));
          used.push(ex);
          const hp = 1 + Math.floor(s.level / 4);
          const maxSpd = Math.min(1.5 + s.level * 0.12, 3.2); // speed capped at 3.2
          s.enemies.push({
            id: enemyId++, x: ex, y: -35,
            vy: rand(1.0, maxSpd),
            hp, maxHp: hp, type: Math.floor(rand(0, 4)),
          });
        }
        s.lastEnemy = ts;
      }

      // Move enemies
      for (const e of s.enemies) e.y += e.vy;

      // Enemies reaching bottom
      let lostLives = 0;
      for (let i = s.enemies.length - 1; i >= 0; i--) {
        if (s.enemies[i].y > s.H + 30) {
          s.enemies.splice(i, 1);
          lostLives++;
        }
      }
      if (lostLives > 0) {
        s.lives -= lostLives;
        sfx.die();
        setLives(s.lives);
        if (s.lives <= 0) { endGame(); return; }
      }

      // Bullet-enemy collision
      const hitBullets = new Set();
      for (let ei = s.enemies.length - 1; ei >= 0; ei--) {
        const enemy = s.enemies[ei];
        for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
          const b = s.bullets[bi];
          if (!hitBullets.has(b.id) && Math.abs(b.x - enemy.x) < 28 && Math.abs(b.y - enemy.y) < 28) {
            hitBullets.add(b.id);
            enemy.hp -= 1;
            if (enemy.hp <= 0) {
              s.explosions.push({
                id: explId++, x: enemy.x, y: enemy.y, ts,
                seed: Math.random() * Math.PI * 2,
                radii: Array.from({length:8}, () => rand(0.5, 1)),
                sizes: Array.from({length:8}, () => rand(4, 10)),
              });
              sfx.explode();
              const pts = (1 + Math.floor(s.level / 2)) * 10;
              s.score += pts;
              setScore(s.score);
              s.floats.push({ id: floatId++, x: enemy.x - 12, y: enemy.y, text: `+${pts}`, color: "#34d399", ts, big: false });
              s.enemies.splice(ei, 1);
            } else {
              sfx.hit();
            }
            break;
          }
        }
      }
      // Remove hit bullets
      for (let i = s.bullets.length - 1; i >= 0; i--) {
        if (hitBullets.has(s.bullets[i].id)) s.bullets.splice(i, 1);
      }

      // Level up
      const newLevel = 1 + Math.floor(s.score / 300);
      if (newLevel !== s.level) {
        s.level = newLevel;
        setLevel(newLevel);
        sfx.levelup();
        s.floats.push({ id: floatId++, x: s.W / 2 - 55, y: s.H / 2 - 30, text: `⬆ LEVEL ${newLevel}!`, color: "#fbbf24", ts, big: true });
      }

      // Expire
      const now = ts;
      s.explosions = s.explosions.filter(e => now - e.ts < 600);
      s.floats = s.floats.filter(f => now - f.ts < 800);

      // ── Draw ─────────────────────────────────────────────────────────────
      // Background
      const bg = ctx.createRadialGradient(s.W * 0.5, s.H * 0.6, 0, s.W * 0.5, s.H * 0.6, s.H);
      bg.addColorStop(0, "#0f0c2e"); bg.addColorStop(1, "#050510");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, s.W, s.H);

      // Stars
      for (const star of stars) {
        ctx.globalAlpha = star.o;
        ctx.fillStyle = "white";
        ctx.fillRect(star.x, star.y, star.r, star.r);
      }
      ctx.globalAlpha = 1;

      // Game objects
      for (const expl of s.explosions) drawExplosion(ctx, expl, ts);
      for (const b of s.bullets) drawBullet(ctx, b.x, b.y);
      for (const e of s.enemies) drawEnemy(ctx, e, ts);
      drawShip(ctx, s.shipX, SHIP_Y);
      for (const f of s.floats) drawFloat(ctx, f, ts);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchstart", onTouchStart);
    };
  }, [phase, endGame, drawShip, drawBullet, drawEnemy, drawExplosion, drawFloat]);

  // ── Canvas resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gameState.current.W = canvas.width;
      gameState.current.H = canvas.height;
      gameState.current.shipY = canvas.height - 90;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const toggleSound = () => {
    sfx.enabled = !sfx.enabled;
    setSoundOn(sfx.enabled);
    if (sfx.enabled) sfx.init();
  };

  // ── UI Overlays ────────────────────────────────────────────────────────────
  const isMobile = window.innerWidth < 600;

  return (
    <div style={{ width:"100vw", height:"100vh", overflow:"hidden", position:"relative",
      background:"#050510", fontFamily:"'Segoe UI',sans-serif", userSelect:"none", touchAction:"none" }}>
      <style>{`
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px #a78bfa88}50%{box-shadow:0 0 40px #a78bfacc}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes fadeIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {/* Canvas — always mounted for resize handling */}
      <canvas ref={canvasRef} style={{ position:"absolute", inset:0, display: phase === "playing" ? "block" : "none" }} />

      {/* Sound toggle */}
      <button onClick={toggleSound} style={{
        position:"absolute", top:14, right:16, zIndex:100,
        background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)",
        borderRadius:8, color:"white", fontSize:18, padding:"6px 10px", cursor:"pointer",
      }}>{soundOn ? "🔊" : "🔇"}</button>

      {/* ── MENU ── */}
      {phase === "menu" && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
          justifyContent:"center", flexDirection:"column",
          background:"radial-gradient(ellipse at 50% 60%, #0f0c2e 0%, #050510 100%)" }}>
          {/* Stars bg */}
          {Array.from({length:60}).map((_,i) => (
            <div key={i} style={{
              position:"absolute",
              left:`${rand(0,100)}%`, top:`${rand(0,100)}%`,
              width: rand(1,3), height: rand(1,3),
              background:"white", borderRadius:"50%", opacity: rand(0.2, 0.8),
              pointerEvents:"none",
            }}/>
          ))}
          <div style={{ animation:"float 3s ease-in-out infinite", marginBottom:6, fontSize:isMobile?52:68 }}>🚀</div>
          <div style={{
            fontSize: isMobile ? 32 : 48, fontWeight:900, letterSpacing:"0.06em",
            background:"linear-gradient(90deg,#a78bfa,#60a5fa,#34d399,#f472b6,#a78bfa)",
            backgroundSize:"200% auto", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            animation:"shimmer 2s linear infinite", marginBottom:10, textAlign:"center",
          }}>Space Shooter</div>
          <p style={{ color:"rgba(200,200,255,0.55)", fontSize: isMobile ? 13 : 15,
            marginBottom:28, textAlign:"center", lineHeight:1.8, padding:"0 24px" }}>
            Move mouse or touch · Auto-fires · Survive the alien invasion!<br/>
            🎵 Sound effects included — turn up the volume!
          </p>
          {highScore > 0 && (
            <div style={{ color:"#fbbf24", fontSize:15, marginBottom:20,
              textShadow:"0 0 8px #fbbf24", animation:"pulse 2s ease infinite" }}>
              🏆 Best Score: {highScore}
            </div>
          )}
          <button onClick={() => { sfx.init(); startGame(); }} style={{
            padding: isMobile ? "14px 44px" : "16px 56px",
            fontSize: isMobile ? 18 : 20, fontWeight:700, border:"none",
            borderRadius:50, cursor:"pointer",
            background:"linear-gradient(135deg,#a78bfa,#60a5fa)",
            color:"white", animation:"float 3s ease-in-out infinite, glow 2s ease-in-out infinite",
            letterSpacing:"0.05em", touchAction:"manipulation",
          }}>▶ Start Game</button>
          <p style={{ color:"rgba(255,255,255,0.2)", fontSize:11, marginTop:20, textAlign:"center" }}>
            Keyboard: ←→ or A/D to move
          </p>
        </div>
      )}

      {/* ── HUD (playing) ── */}
      {phase === "playing" && (
        <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:10,
          padding:"10px 16px", display:"flex", justifyContent:"space-between", alignItems:"center",
          background:"rgba(0,0,0,0.35)", backdropFilter:"blur(6px)" }}>
          <div style={{ color:"#a78bfa", fontWeight:700, fontSize: isMobile ? 15 : 17,
            textShadow:"0 0 8px #a78bfa" }}>⭐ {score}</div>
          <div style={{ color:"#fbbf24", fontWeight:700, fontSize: isMobile ? 13 : 15,
            letterSpacing:"0.08em" }}>LVL {level}</div>
          <div style={{ fontSize: isMobile ? 16 : 20 }}>
            {[...Array(3)].map((_,i) => (
              <span key={i} style={{ opacity: i < lives ? 1 : 0.15, marginLeft: 3 }}>❤️</span>
            ))}
          </div>
        </div>
      )}

      {/* ── GAME OVER ── */}
      {phase === "gameover" && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
          justifyContent:"center", flexDirection:"column", gap:8,
          background:"radial-gradient(ellipse at 50% 50%, #1a0a0a 0%, #050510 100%)",
          animation:"fadeIn 0.4s ease-out" }}>
          {Array.from({length:40}).map((_,i) => (
            <div key={i} style={{
              position:"absolute", left:`${rand(0,100)}%`, top:`${rand(0,100)}%`,
              width:rand(1,2.5), height:rand(1,2.5), background:"white",
              borderRadius:"50%", opacity:rand(0.15,0.6), pointerEvents:"none",
            }}/>
          ))}
          <div style={{ fontSize: isMobile ? 40 : 52, fontWeight:900, color:"#f87171",
            textShadow:"0 0 30px #f87171", marginBottom:4 }}>Game Over</div>
          <div style={{ fontSize: isMobile ? 20 : 26, color:"#a78bfa", fontWeight:700,
            textShadow:"0 0 12px #a78bfa" }}>Score: {score}</div>
          {score > 0 && score >= highScore && (
            <div style={{ color:"#fbbf24", fontSize:16, textShadow:"0 0 8px #fbbf24",
              animation:"pulse 1s ease infinite" }}>🏆 New High Score!</div>
          )}
          {score < highScore && (
            <div style={{ color:"rgba(200,200,255,0.45)", fontSize:13 }}>Best: {highScore}</div>
          )}
          <div style={{ color:"rgba(200,200,255,0.45)", fontSize:13, marginBottom:24 }}>
            Reached Level {level}
          </div>
          <button onClick={startGame} style={{
            padding: isMobile ? "13px 40px" : "14px 48px",
            fontSize: isMobile ? 17 : 19, fontWeight:700, border:"none",
            borderRadius:50, cursor:"pointer", marginBottom:10,
            background:"linear-gradient(135deg,#a78bfa,#60a5fa)", color:"white",
            animation:"float 3s ease-in-out infinite", touchAction:"manipulation",
          }}>▶ Play Again</button>
          <button onClick={() => { phaseRef.current = "menu"; setPhase("menu"); }} style={{
            padding:"9px 28px", fontSize:13, fontWeight:600, borderRadius:50, cursor:"pointer",
            border:"1px solid rgba(167,139,250,0.4)", background:"transparent",
            color:"rgba(200,200,255,0.65)", touchAction:"manipulation",
          }}>Main Menu</button>
        </div>
      )}
    </div>
  );
}
