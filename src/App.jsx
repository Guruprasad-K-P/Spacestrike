import { useState, useEffect, useRef, useCallback } from "react";

const W = window.innerWidth;
const H = window.innerHeight;
const COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#f87171", "#38bdf8"];

function rand(a, b) { return a + Math.random() * (b - a); }

// ── tiny components ──────────────────────────────────────────────────────────

function BgStars() {
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
      {/* body */}
      <div style={{
        position: "absolute", left: 12, top: 0,
        width: 16, height: 40, background: "linear-gradient(180deg,#a78bfa,#60a5fa)",
        clipPath: "polygon(50% 0%,100% 100%,0% 100%)", borderRadius: 4,
      }} />
      {/* wings */}
      <div style={{
        position: "absolute", left: 0, top: 20,
        width: 40, height: 18,
        background: "linear-gradient(90deg,#38bdf8,#a78bfa,#38bdf8)",
        clipPath: "polygon(0% 100%,30% 0%,70% 0%,100% 100%)",
      }} />
      {/* engine glow */}
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
      {/* alien body */}
      <div style={{
        width: 44, height: 36,
        background: `radial-gradient(circle at 50% 40%, ${c}cc, ${c}44)`,
        border: `1.5px solid ${c}`,
        borderRadius: "50% 50% 40% 40%",
        boxShadow: `0 0 12px ${c}88`,
        position: "relative",
      }}>
        {/* eyes */}
        <div style={{ position: "absolute", top: 10, left: 8, width: 8, height: 8, background: "white", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: 10, right: 8, width: 8, height: 8, background: "white", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: 12, left: 10, width: 4, height: 4, background: "#111", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: 12, right: 10, width: 4, height: 4, background: "#111", borderRadius: "50%" }} />
        {/* tentacles */}
        {[-12, -4, 4, 12].map((tx, i) => (
          <div key={i} style={{
            position: "absolute", bottom: -10, left: 22 + tx - 2,
            width: 4, height: 12, background: c,
            borderRadius: "0 0 4px 4px",
            animation: `tentacle 0.6s ${i * 0.15}s ease-in-out infinite alternate`,
          }} />
        ))}
      </div>
      {/* HP bar */}
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

// ── main game ─────────────────────────────────────────────────────────────────

let bulletId = 0, enemyId = 0, explId = 0, floatId = 0;

export default function App() {
  const [phase, setPhase] = useState("menu"); // menu | playing | gameover
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(0);

  // game objects stored in refs to avoid re-render overhead
  const shipX = useRef(W / 2);
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

  // render trigger
  const [, forceRender] = useState(0);
  const tick = useRef(0);

  const startGame = () => {
    shipX.current = W / 2;
    bullets.current = [];
    enemies.current = [];
    explosions.current = [];
    floatingTexts.current = [];
    scoreRef.current = 0;
    livesRef.current = 3;
    levelRef.current = 1;
    setScore(0); setLives(3); setLevel(1);
    setPhase("playing");
  };

  const endGame = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    setHighScore(h => Math.max(h, scoreRef.current));
    setPhase("gameover");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const onKey = (e) => { keys.current[e.code] = e.type === "keydown"; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    // touch / mouse move for ship
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      shipX.current = Math.max(30, Math.min(W - 30, clientX));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });

    // tap to shoot on mobile
    const onTap = () => { lastShot.current = 0; };
    window.addEventListener("touchstart", onTap, { passive: true });

    const SHIP_Y = H - 90;
    const SHIP_SPEED = 6;
    const BULLET_SPEED = 10;
    const BULLET_COOLDOWN = 220;

    const loop = (ts) => {
      // move ship
      if (keys.current["ArrowLeft"] || keys.current["KeyA"])
        shipX.current = Math.max(30, shipX.current - SHIP_SPEED);
      if (keys.current["ArrowRight"] || keys.current["KeyD"])
        shipX.current = Math.min(W - 30, shipX.current + SHIP_SPEED);

      // auto-shoot (space or auto on desktop)
      if ((keys.current["Space"] || keys.current["KeyZ"] || true) && ts - lastShot.current > BULLET_COOLDOWN) {
        bullets.current.push({ id: bulletId++, x: shipX.current, y: SHIP_Y - 10 });
        lastShot.current = ts;
      }

      // move bullets
      bullets.current = bullets.current
        .map(b => ({ ...b, y: b.y - BULLET_SPEED }))
        .filter(b => b.y > -20);

      // spawn enemies
      const spawnRate = Math.max(600, 1800 - levelRef.current * 120);
      if (ts - lastEnemy.current > spawnRate) {
        const cols = Math.min(3 + levelRef.current, 7);
        for (let i = 0; i < cols; i++) {
          enemies.current.push({
            id: enemyId++,
            x: rand(40, W - 40),
            y: -30,
            vy: rand(1.2, 2 + levelRef.current * 0.3),
            hp: 1 + Math.floor(levelRef.current / 3),
            maxHp: 1 + Math.floor(levelRef.current / 3),
            type: Math.floor(rand(0, 4)),
          });
        }
        lastEnemy.current = ts;
      }

      // move enemies
      enemies.current = enemies.current.map(e => ({ ...e, y: e.y + e.vy }));

      // enemy reaches bottom → lose life
      const reached = enemies.current.filter(e => e.y > H + 20);
      if (reached.length > 0) {
        enemies.current = enemies.current.filter(e => e.y <= H + 20);
        livesRef.current -= reached.length;
        setLives(livesRef.current);
        if (livesRef.current <= 0) { endGame(); return; }
      }

      // bullet ↔ enemy collision
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

      // level up every 300 pts
      const newLevel = 1 + Math.floor(scoreRef.current / 300);
      if (newLevel !== levelRef.current) {
        levelRef.current = newLevel;
        setLevel(newLevel);
        floatingTexts.current.push({ id: floatId++, x: W / 2 - 50, y: H / 2, text: `Level ${newLevel}!`, color: "#fbbf24", ts });
      }

      // expire explosions & floats
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
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchstart", onTap);
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
    }}>
      <style>{`
        @keyframes engineFlicker { 0%{opacity:1;transform:scaleY(1)} 100%{opacity:0.6;transform:scaleY(0.7)} }
        @keyframes tentacle { 0%{transform:rotate(-15deg)} 100%{transform:rotate(15deg)} }
        @keyframes explode { 0%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0)} }
        @keyframes floatUp { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-60px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px #a78bfa88,0 0 60px #a78bfa22} 50%{box-shadow:0 0 40px #a78bfacc,0 0 80px #a78bfa55} }
      `}</style>

      <BgStars />

      {/* ── MENU ── */}
      {phase === "menu" && (
        <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:0 }}>
          <div style={{ fontSize:52,fontWeight:900,letterSpacing:"0.06em",
            background:"linear-gradient(90deg,#a78bfa,#60a5fa,#34d399,#f472b6,#a78bfa)",
            backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            animation:"shimmer 2s linear infinite",marginBottom:8,textAlign:"center" }}>
            🚀 Space Shooter
          </div>
          <p style={{ color:"rgba(200,200,255,0.6)",fontSize:15,marginBottom:32,textAlign:"center",letterSpacing:"0.04em" }}>
            Move mouse · Auto-fires · Survive!
          </p>
          <div style={{ color:"rgba(200,200,255,0.5)",fontSize:13,marginBottom:24,textAlign:"center",lineHeight:1.8 }}>
            ← → Arrow keys or mouse to move<br/>
            Destroy aliens before they reach you<br/>
            Level up every 300 points
          </div>
          {highScore > 0 && (
            <div style={{ color:"#fbbf24",fontSize:14,marginBottom:20,textShadow:"0 0 8px #fbbf24" }}>
              🏆 Best: {highScore}
            </div>
          )}
          <button onClick={startGame} style={{
            padding:"16px 56px",fontSize:20,fontWeight:700,border:"none",
            borderRadius:50,cursor:"pointer",
            background:"linear-gradient(135deg,#a78bfa,#60a5fa)",
            color:"white",animation:"float 3s ease-in-out infinite, glow 2s ease-in-out infinite",
            letterSpacing:"0.05em",
          }}>▶ Start Game</button>
        </div>
      )}

      {/* ── PLAYING ── */}
      {phase === "playing" && (
        <>
          {/* HUD */}
          <div style={{ position:"absolute",top:0,left:0,right:0,padding:"14px 24px",
            display:"flex",justifyContent:"space-between",alignItems:"center",
            background:"rgba(0,0,0,0.3)",backdropFilter:"blur(8px)",zIndex:20 }}>
            <div style={{ color:"#a78bfa",fontWeight:700,fontSize:16,textShadow:"0 0 8px #a78bfa" }}>
              ⭐ {score}
            </div>
            <div style={{ color:"#fbbf24",fontWeight:600,fontSize:14,letterSpacing:"0.08em" }}>
              LEVEL {level}
            </div>
            <div style={{ fontSize:18 }}>
              {[...Array(3)].map((_, i) => (
                <span key={i} style={{ opacity: i < lives ? 1 : 0.15, marginLeft:4 }}>❤️</span>
              ))}
            </div>
          </div>

          {/* game objects */}
          {bullets.current.map(b => <Bullet key={b.id} {...b} />)}
          {enemies.current.map(e => <Enemy key={e.id} {...e} />)}
          {explosions.current.map(e => <Explosion key={e.id} {...e} />)}
          {floatingTexts.current.map(f => <FloatingText key={f.id} {...f} />)}
          <Ship x={shipX.current} y={SHIP_Y} />

          {/* controls hint */}
          <div style={{ position:"absolute",bottom:16,left:0,right:0,textAlign:"center",
            color:"rgba(255,255,255,0.2)",fontSize:12 }}>
            ← → Move · Auto-fires
          </div>
        </>
      )}

      {/* ── GAME OVER ── */}
      {phase === "gameover" && (
        <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",
          justifyContent:"center",flexDirection:"column",gap:8 }}>
          <div style={{ fontSize:48,fontWeight:900,color:"#f87171",
            textShadow:"0 0 30px #f87171",marginBottom:8 }}>Game Over</div>
          <div style={{ fontSize:22,color:"#a78bfa",fontWeight:700,
            textShadow:"0 0 12px #a78bfa",marginBottom:4 }}>Score: {score}</div>
          {score >= highScore && score > 0 && (
            <div style={{ color:"#fbbf24",fontSize:16,textShadow:"0 0 8px #fbbf24",marginBottom:8 }}>
              🏆 New High Score!
            </div>
          )}
          {score < highScore && (
            <div style={{ color:"rgba(200,200,255,0.5)",fontSize:14,marginBottom:8 }}>
              Best: {highScore}
            </div>
          )}
          <div style={{ color:"rgba(200,200,255,0.5)",fontSize:14,marginBottom:28 }}>
            Reached Level {level}
          </div>
          <button onClick={startGame} style={{
            padding:"14px 48px",fontSize:18,fontWeight:700,border:"none",
            borderRadius:50,cursor:"pointer",marginBottom:12,
            background:"linear-gradient(135deg,#a78bfa,#60a5fa)",
            color:"white",animation:"float 3s ease-in-out infinite",
          }}>▶ Play Again</button>
          <button onClick={() => setPhase("menu")} style={{
            padding:"10px 32px",fontSize:14,fontWeight:600,
            border:"1px solid rgba(167,139,250,0.4)",borderRadius:50,cursor:"pointer",
            background:"transparent",color:"rgba(200,200,255,0.7)",
          }}>Main Menu</button>
        </div>
      )}
    </div>
  );
}