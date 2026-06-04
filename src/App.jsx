import { useState, useEffect, useRef, useCallback } from "react";

// ── responsive dimensions ──────────────────────────────────────────────────
function getDims() {
  return { W: window.innerWidth, H: window.innerHeight };
}

const COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#f87171", "#38bdf8"];

function rand(a, b) { return a + Math.random() * (b - a); }

// ── Sound Engine (Web Audio API) ───────────────────────────────────────────
function createSoundEngine() {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function playShoot() {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(880, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
      osc.start(c.currentTime); osc.stop(c.currentTime + 0.1);
    } catch (_) {}
  }

  function playExplode() {
    try {
      const c = getCtx();
      const bufSize = c.sampleRate * 0.3;
      const buf = c.createBuffer(1, bufSize, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = c.createBufferSource();
      src.buffer = buf;
      const gain = c.createGain();
      const filter = c.createBiquadFilter();
      filter.type = "bandpass"; filter.frequency.value = 300;
      src.connect(filter); filter.connect(gain); gain.connect(c.destination);
      gain.gain.setValueAtTime(0.4, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
      src.start(c.currentTime); src.stop(c.currentTime + 0.3);
    } catch (_) {}
  }

  function playLevelUp() {
    try {
      const c = getCtx();
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.connect(gain); gain.connect(c.destination);
        osc.type = "sine";
        const t = c.currentTime + i * 0.1;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.15);
      });
    } catch (_) {}
  }

  function playHit() {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
      osc.start(c.currentTime); osc.stop(c.currentTime + 0.12);
    } catch (_) {}
  }

  return { playShoot, playExplode, playLevelUp, playHit };
}

const sound = createSoundEngine();

// ── tiny components ──────────────────────────────────────────────────────────

function BgStars({ W, H }) {
  const stars = useRef([...Array(120)].map(() => ({
    x: rand(0, 100), y: rand(0, 100),
    s: rand(1, 3), o: rand(0.2, 0.8),
  }))).current;
  return (
    <>
      {stars.map((s, i) => (
        <div key={i} style={{
          position: "absolute", left: `${s.x}%`, top: `${s.y}%`,
          width: s.s, height: s.s, borderRadius: "50%",
          background: "white", opacity: s.o, pointerEvents: "none",
        }} />
      ))}
    </>
  );
}

function Ship({ x, y }) {
  return (
    <div style={{
      position: "absolute", left: x - 20, top: y - 28,
      width: 40, height: 56, pointerEvents: "none",
    }}>
      <div style={{
        position: "absolute", left: 12, top: 0,
        width: 16, height: 40, background: "linear-gradient(180deg,#a78bfa,#60a5fa)",
        clipPath: "polygon(50% 0%,100% 100%,0% 100%)", borderRadius: 4,
      }} />
      <div style={{
        position: "absolute", left: 0, top: 20,
        width: 40, height: 18,
        background: "linear-gradient(90deg,#38bdf8,#a78bfa,#38bdf8)",
        clipPath: "polygon(0% 100%,30% 0%,70% 0%,100% 100%)",
      }} />
      <div style={{
        position: "absolute", left: 14, top: 38,
        width: 12, height: 18,
        background: "linear-gradient(180deg,#fbbf24,#f87171,transparent)",
        borderRadius: "0 0 50% 50%",
        animation: "engineFlicker 0.15s ease-in-out infinite alternate",
      }} />
    </div>
  );
}

function Bullet({ x, y }) {
  return (
    <div style={{
      position: "absolute", left: x - 2, top: y - 8,
      width: 4, height: 16, borderRadius: 4,
      background: "linear-gradient(180deg,#fff,#a78bfa)",
      boxShadow: "0 0 8px #a78bfa, 0 0 20px #a78bfa88",
      pointerEvents: "none",
    }} />
  );
}

function Enemy({ x, y, hp, maxHp, type }) {
  const colors = ["#f87171", "#fb923c", "#f472b6", "#38bdf8"];
  const c = colors[type % colors.length];
  const pct = hp / maxHp;
  return (
    <div style={{ position: "absolute", left: x - 22, top: y - 18, pointerEvents: "none" }}>
      <div style={{
        width: 44, height: 36,
        background: `radial-gradient(circle at 50% 40%, ${c}cc, ${c}44)`,
        border: `1.5px solid ${c}`,
        borderRadius: "50% 50% 40% 40%",
        boxShadow: `0 0 12px ${c}88`,
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 10, left: 8, width: 8, height: 8, background: "white", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: 10, right: 8, width: 8, height: 8, background: "white", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: 12, left: 10, width: 4, height: 4, background: "#111", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: 12, right: 10, width: 4, height: 4, background: "#111", borderRadius: "50%" }} />
        {[-12, -4, 4, 12].map((tx, i) => (
          <div key={i} style={{
            position: "absolute", bottom: -10, left: 22 + tx - 2,
            width: 4, height: 12, background: c,
            borderRadius: "0 0 4px 4px",
            animation: `tentacle 0.6s ${i * 0.15}s ease-in-out infinite alternate`,
          }} />
        ))}
      </div>
      <div style={{ marginTop: 3, width: 44, height: 4, background: "#ffffff22", borderRadius: 2 }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: pct > 0.5 ? "#34d399" : pct > 0.25 ? "#fbbf24" : "#f87171", borderRadius: 2, transition: "width 0.1s" }} />
      </div>
    </div>
  );
}

function Explosion({ x, y }) {
  return (
    <div style={{ position: "absolute", left: x - 30, top: y - 30, pointerEvents: "none" }}>
      {[...Array(10)].map((_, i) => {
        const angle = (i / 10) * 2 * Math.PI;
        const dist = rand(15, 40);
        return (
          <div key={i} style={{
            position: "absolute",
            width: rand(4, 10), height: rand(4, 10),
            borderRadius: "50%",
            background: COLORS[i % COLORS.length],
            left: 30 + Math.cos(angle) * dist,
            top: 30 + Math.sin(angle) * dist,
            boxShadow: `0 0 8px ${COLORS[i % COLORS.length]}`,
            animation: `explode ${rand(0.4, 0.8)}s ease-out forwards`,
          }} />
        );
      })}
    </div>
  );
}

function FloatingText({ x, y, text, color }) {
  return (
    <div style={{
      position: "absolute", left: x, top: y,
      color, fontWeight: 700, fontSize: 18,
      textShadow: `0 0 8px ${color}`,
      animation: "floatUp 0.8s ease-out forwards",
      pointerEvents: "none", whiteSpace: "nowrap",
    }}>{text}</div>
  );
}

// ── Mobile joystick ─────────────────────────────────────────────────────────
function MobileControls({ onMove }) {
  const joystickRef = useRef(null);
  const activeTouch = useRef(null);
  const basePos = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    activeTouch.current = touch.identifier;
    basePos.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (e) => {
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === activeTouch.current) {
        const dx = e.touches[i].clientX - basePos.current.x;
        onMove(dx);
        break;
      }
    }
  };

  const handleTouchEnd = () => {
    activeTouch.current = null;
    onMove(0);
  };

  return (
    <div
      ref={joystickRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
        width: 120, height: 50,
        background: "rgba(167,139,250,0.15)",
        border: "1px solid rgba(167,139,250,0.3)",
        borderRadius: 25,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(167,139,250,0.6)", fontSize: 12, letterSpacing: "0.05em",
        userSelect: "none", touchAction: "none", zIndex: 30,
      }}
    >
      ← DRAG →
    </div>
  );
}

// ── main game ─────────────────────────────────────────────────────────────────

let bulletId = 0, enemyId = 0, explId = 0, floatId = 0;

export default function App() {
  const [dims, setDims] = useState(getDims);
  const [phase, setPhase] = useState("menu");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const { W, H } = dims;

  // Detect mobile & handle resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || "ontouchstart" in window);
      setDims(getDims());
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // game objects stored in refs
  const shipX = useRef(W / 2);
  const joystickDx = useRef(0);
  const bullets = useRef([]);
  const enemies = useRef([]);
  const explosions = useRef([]);
  const floatingTexts = useRef([]);
  const keys = useRef({});
  const lastShot = useRef(0);
  const lastEnemy = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const levelRef = useRef(1);
  const animRef = useRef(null);
  const shootSoundCooldown = useRef(0);

  const [, forceRender] = useState(0);
  const tick = useRef(0);

  const startGame = () => {
    // Unlock audio context on user gesture
    sound.playShoot && (() => { try { sound.playShoot(); } catch (_) {} })();
    shipX.current = W / 2;
    bullets.current = [];
    enemies.current = [];
    explosions.current = [];
    floatingTexts.current = [];
    scoreRef.current = 0;
    livesRef.current = 3;
    levelRef.current = 1;
    joystickDx.current = 0;
    setScore(0); setLives(3); setLevel(1);
    setPhase("playing");
  };

  const endGame = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    setHighScore(h => Math.max(h, scoreRef.current));
    setPhase("gameover");
  }, []);

  // Joystick handler
  const handleJoystickMove = useCallback((dx) => {
    joystickDx.current = dx;
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const currentW = window.innerWidth;
    const currentH = window.innerHeight;

    const onKey = (e) => { keys.current[e.code] = e.type === "keydown"; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    // Mouse move for desktop
    const onMouseMove = (e) => {
      shipX.current = Math.max(30, Math.min(currentW - 30, e.clientX));
    };
    window.addEventListener("mousemove", onMouseMove);

    // Touch move on the game area (non-joystick) for direct tap control
    const onTouchMove = (e) => {
      const t = e.touches[0];
      shipX.current = Math.max(30, Math.min(currentW - 30, t.clientX));
    };
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    const SHIP_Y = currentH - 90;
    const SHIP_SPEED = 5;
    const BULLET_SPEED = 11;
    const BULLET_COOLDOWN = 220;

    const loop = (ts) => {
      const W_ = currentW;
      const H_ = currentH;

      // Move ship — keyboard or joystick
      if (keys.current["ArrowLeft"] || keys.current["KeyA"])
        shipX.current = Math.max(30, shipX.current - SHIP_SPEED);
      if (keys.current["ArrowRight"] || keys.current["KeyD"])
        shipX.current = Math.min(W_ - 30, shipX.current + SHIP_SPEED);

      // Joystick drag
      if (Math.abs(joystickDx.current) > 5) {
        const speed = Math.min(Math.abs(joystickDx.current) * 0.08, 9);
        shipX.current = Math.max(30, Math.min(W_ - 30,
          shipX.current + (joystickDx.current > 0 ? speed : -speed)
        ));
      }

      // Auto-shoot
      if (ts - lastShot.current > BULLET_COOLDOWN) {
        bullets.current.push({ id: bulletId++, x: shipX.current, y: SHIP_Y - 10 });
        lastShot.current = ts;
        if (ts - shootSoundCooldown.current > 200) {
          sound.playShoot();
          shootSoundCooldown.current = ts;
        }
      }

      // Move bullets
      bullets.current = bullets.current
        .map(b => ({ ...b, y: b.y - BULLET_SPEED }))
        .filter(b => b.y > -20);

      // Spawn enemies
      const spawnRate = Math.max(600, 1800 - levelRef.current * 120);
      if (ts - lastEnemy.current > spawnRate) {
        const cols = Math.min(3 + levelRef.current, 7);
        for (let i = 0; i < cols; i++) {
          enemies.current.push({
            id: enemyId++,
            x: rand(40, W_ - 40),
            y: -30,
            vy: rand(1.2, 2 + levelRef.current * 0.3),
            hp: 1 + Math.floor(levelRef.current / 3),
            maxHp: 1 + Math.floor(levelRef.current / 3),
            type: Math.floor(rand(0, 4)),
          });
        }
        lastEnemy.current = ts;
      }

      // Move enemies
      enemies.current = enemies.current.map(e => ({ ...e, y: e.y + e.vy }));

      // Enemy reaches bottom → lose life
      const reached = enemies.current.filter(e => e.y > H_ + 20);
      if (reached.length > 0) {
        enemies.current = enemies.current.filter(e => e.y <= H_ + 20);
        livesRef.current -= reached.length;
        setLives(livesRef.current);
        sound.playHit();
        if (livesRef.current <= 0) { endGame(); return; }
      }

      // Bullet ↔ enemy collision
      const hitBullets = new Set();
      enemies.current = enemies.current.filter(enemy => {
        const hit = bullets.current.find(
          b => !hitBullets.has(b.id) && Math.abs(b.x - enemy.x) < 26 && Math.abs(b.y - enemy.y) < 26
        );
        if (hit) {
          hitBullets.add(hit.id);
          enemy.hp -= 1;
          if (enemy.hp <= 0) {
            explosions.current.push({ id: explId++, x: enemy.x, y: enemy.y, ts });
            sound.playExplode();
            const pts = (1 + Math.floor(levelRef.current / 2)) * 10;
            scoreRef.current += pts;
            setScore(scoreRef.current);
            floatingTexts.current.push({ id: floatId++, x: enemy.x - 10, y: enemy.y, text: `+${pts}`, color: "#34d399", ts });
            return false;
          }
        }
        return true;
      });
      bullets.current = bullets.current.filter(b => !hitBullets.has(b.id));

      // Level up
      const newLevel = 1 + Math.floor(scoreRef.current / 300);
      if (newLevel !== levelRef.current) {
        levelRef.current = newLevel;
        setLevel(newLevel);
        sound.playLevelUp();
        floatingTexts.current.push({ id: floatId++, x: W_ / 2 - 50, y: H_ / 2, text: `Level ${newLevel}!`, color: "#fbbf24", ts });
      }

      // Expire
      explosions.current = explosions.current.filter(e => ts - e.ts < 700);
      floatingTexts.current = floatingTexts.current.filter(f => ts - f.ts < 800);

      tick.current++;
      forceRender(tick.current);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [phase, endGame]);

  const SHIP_Y = H - 90;

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: "radial-gradient(ellipse at 50% 60%, #0f0c2e 0%, #050510 100%)",
      overflow: "hidden", position: "relative",
      fontFamily: "'Segoe UI', sans-serif",
      userSelect: "none",
      touchAction: "none",
    }}>
      <style>{`
        @keyframes engineFlicker { 0%{opacity:1;transform:scaleY(1)} 100%{opacity:0.6;transform:scaleY(0.7)} }
        @keyframes tentacle { 0%{transform:rotate(-15deg)} 100%{transform:rotate(15deg)} }
        @keyframes explode { 0%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0)} }
        @keyframes floatUp { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-60px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes shimmer {
          0%{background-position:-200% center}
          100%{background-position:200% center}
        }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px #a78bfa88,0 0 60px #a78bfa22} 50%{box-shadow:0 0 40px #a78bfacc,0 0 80px #a78bfa55} }
        
        .game-title {
          font-size: clamp(28px, 7vw, 56px);
          font-weight: 900;
          letter-spacing: 0.05em;
          text-align: center;
          line-height: 1.1;
          margin-bottom: 8px;
          white-space: nowrap;
          background: linear-gradient(90deg,#a78bfa,#60a5fa,#34d399,#f472b6,#a78bfa);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 2s linear infinite;
        }

        @media (max-width: 400px) {
          .game-title { font-size: 24px; letter-spacing: 0.02em; }
        }
      `}</style>

      <BgStars W={W} H={H} />

      {/* ── MENU ── */}
      {phase === "menu" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 0,
          padding: "0 20px",
        }}>
          <h1 className="game-title">🚀 Space Shooter</h1>

          <p style={{
            color: "rgba(200,200,255,0.6)", fontSize: "clamp(12px,3vw,15px)",
            marginBottom: 24, textAlign: "center", letterSpacing: "0.04em",
          }}>
            {isMobile ? "Drag to move · Auto-fires · Survive!" : "Move mouse · Auto-fires · Survive!"}
          </p>

          <div style={{
            color: "rgba(200,200,255,0.5)", fontSize: "clamp(11px,2.5vw,13px)",
            marginBottom: 24, textAlign: "center", lineHeight: 1.8,
          }}>
            {isMobile ? (
              <>Drag the bar at the bottom to move<br />Destroy aliens before they reach you<br />Level up every 300 points</>
            ) : (
              <>← → Arrow keys or mouse to move<br />Destroy aliens before they reach you<br />Level up every 300 points</>
            )}
          </div>

          {highScore > 0 && (
            <div style={{ color: "#fbbf24", fontSize: 14, marginBottom: 20, textShadow: "0 0 8px #fbbf24" }}>
              🏆 Best: {highScore}
            </div>
          )}

          <button
            onClick={startGame}
            style={{
              padding: "14px 48px", fontSize: "clamp(16px,4vw,20px)",
              fontWeight: 700, border: "none", borderRadius: 50, cursor: "pointer",
              background: "linear-gradient(135deg,#a78bfa,#60a5fa)",
              color: "white",
              animation: "float 3s ease-in-out infinite, glow 2s ease-in-out infinite",
              letterSpacing: "0.05em",
              touchAction: "manipulation",
            }}
          >▶ Start Game</button>
        </div>
      )}

      {/* ── PLAYING ── */}
      {phase === "playing" && (
        <>
          {/* HUD */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            padding: "12px 16px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)", zIndex: 20,
          }}>
            <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: "clamp(13px,3.5vw,16px)", textShadow: "0 0 8px #a78bfa" }}>
              ⭐ {score}
            </div>
            <div style={{ color: "#fbbf24", fontWeight: 600, fontSize: "clamp(12px,3vw,14px)", letterSpacing: "0.08em" }}>
              LEVEL {level}
            </div>
            <div style={{ fontSize: "clamp(14px,3.5vw,18px)" }}>
              {[...Array(3)].map((_, i) => (
                <span key={i} style={{ opacity: i < lives ? 1 : 0.15, marginLeft: 4 }}>❤️</span>
              ))}
            </div>
          </div>

          {/* Game objects */}
          {bullets.current.map(b => <Bullet key={b.id} {...b} />)}
          {enemies.current.map(e => <Enemy key={e.id} {...e} />)}
          {explosions.current.map(e => <Explosion key={e.id} {...e} />)}
          {floatingTexts.current.map(f => <FloatingText key={f.id} {...f} />)}
          <Ship x={shipX.current} y={SHIP_Y} />

          {/* Mobile joystick */}
          {isMobile && <MobileControls onMove={handleJoystickMove} />}

          {/* Desktop hint */}
          {!isMobile && (
            <div style={{
              position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center",
              color: "rgba(255,255,255,0.2)", fontSize: 12,
            }}>
              ← → Move · Auto-fires
            </div>
          )}
        </>
      )}

      {/* ── GAME OVER ── */}
      {phase === "gameover" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 8,
          padding: "0 20px",
        }}>
          <div style={{
            fontSize: "clamp(36px,10vw,48px)", fontWeight: 900, color: "#f87171",
            textShadow: "0 0 30px #f87171", marginBottom: 8, textAlign: "center",
          }}>Game Over</div>
          <div style={{ fontSize: "clamp(18px,5vw,22px)", color: "#a78bfa", fontWeight: 700, textShadow: "0 0 12px #a78bfa", marginBottom: 4 }}>
            Score: {score}
          </div>
          {score >= highScore && score > 0 && (
            <div style={{ color: "#fbbf24", fontSize: 16, textShadow: "0 0 8px #fbbf24", marginBottom: 8 }}>
              🏆 New High Score!
            </div>
          )}
          {score < highScore && (
            <div style={{ color: "rgba(200,200,255,0.5)", fontSize: 14, marginBottom: 8 }}>
              Best: {highScore}
            </div>
          )}
          <div style={{ color: "rgba(200,200,255,0.5)", fontSize: 14, marginBottom: 28 }}>
            Reached Level {level}
          </div>
          <button onClick={startGame} style={{
            padding: "14px 48px", fontSize: "clamp(15px,4vw,18px)", fontWeight: 700,
            border: "none", borderRadius: 50, cursor: "pointer", marginBottom: 12,
            background: "linear-gradient(135deg,#a78bfa,#60a5fa)",
            color: "white", animation: "float 3s ease-in-out infinite",
            touchAction: "manipulation",
          }}>▶ Play Again</button>
          <button onClick={() => setPhase("menu")} style={{
            padding: "10px 32px", fontSize: 14, fontWeight: 600,
            border: "1px solid rgba(167,139,250,0.4)", borderRadius: 50, cursor: "pointer",
            background: "transparent", color: "rgba(200,200,255,0.7)",
            touchAction: "manipulation",
          }}>Main Menu</button>
        </div>
      )}
    </div>
  );
}
