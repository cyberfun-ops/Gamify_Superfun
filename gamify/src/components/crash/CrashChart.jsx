import { useEffect, useRef } from 'react';

const GROWTH_RATE = 0.07;
const PAD = { top: 24, right: 28, bottom: 44, left: 56 };
const STARS = 100;
const TRAIL = 40;

/* ── Starfield ──────────────────────────────────────────────────────────── */
function makeStars(W, H) {
  return Array.from({ length: STARS }, () => ({
    x: Math.random() * W,
    y: Math.random() * H * 0.9,
    r: Math.random() * 1.3 + 0.2,
    a: Math.random() * 0.6 + 0.2,
    sp: Math.random() * 2 + 0.5,
    ph: Math.random() * Math.PI * 2,
  }));
}

/* ── Kite (nose → right at angle 0) ────────────────────────────────────── */
// cx,cy = spar intersection (where diagonal and spine cross)
const KX = { nose: 30, back: -21, cx: 5 };
const KY = { top: -23, bot: 23 };
const KITE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#fbbf24'];

function kite(ctx, x, y, angle, alpha = 1, phase = 0, cutString = false) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  // ── 4 colored panels (triangles from spar intersection) ──
  const panels = [
    [[KX.cx,0],[KX.nose,0],[KX.cx,KY.top]],
    [[KX.cx,0],[KX.cx,KY.top],[KX.back,0]],
    [[KX.cx,0],[KX.back,0],[KX.cx,KY.bot]],
    [[KX.cx,0],[KX.cx,KY.bot],[KX.nose,0]],
  ];
  panels.forEach(([a,b,c], i) => {
    ctx.beginPath();
    ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]);
    ctx.closePath();
    ctx.fillStyle = KITE_COLORS[i];
    ctx.fill();
  });

  // outline
  ctx.beginPath();
  ctx.moveTo(KX.nose,0); ctx.lineTo(KX.cx,KY.top);
  ctx.lineTo(KX.back,0); ctx.lineTo(KX.cx,KY.bot);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth   = 0.9;
  ctx.stroke();

  // cross spars
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth   = 0.7;
  ctx.beginPath(); ctx.moveTo(KX.back,0); ctx.lineTo(KX.nose,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(KX.cx,KY.top); ctx.lineTo(KX.cx,KY.bot); ctx.stroke();

  // ── wavy tail ──
  const TAIL = 56;
  const SEGMENTS = 16;
  ctx.strokeStyle = 'rgba(255,215,60,0.85)';
  ctx.lineWidth   = 1.6;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  for (let i = 0; i <= SEGMENTS; i++) {
    const t  = i / SEGMENTS;
    const tx = KX.back - t * TAIL;
    const ty = Math.sin(phase + t * Math.PI * 2.8) * 5.5 * t;
    i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
  }
  ctx.stroke();

  // bow decorations
  for (const tp of [0.28, 0.56, 0.84]) {
    const tx = KX.back - tp * TAIL;
    const ty = Math.sin(phase + tp * Math.PI * 2.8) * 5.5 * tp;
    const bc = tp < 0.4 ? '#f59e0b' : tp < 0.7 ? '#ec4899' : '#a78bfa';
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(Math.cos(phase + tp * Math.PI * 2.8) * 0.45);
    ctx.fillStyle = bc;
    ctx.beginPath(); ctx.ellipse(-4, 0, 5.5, 3.0, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 4, 0, 5.5, 3.0, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 2.0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // dangling cut string end (only after crash)
  if (cutString) {
    const csLen = 32;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth   = 0.9;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const t  = i / 8;
      const tx = KX.cx + t * csLen;
      const ty = KY.bot + Math.sin(phase * 2 + t * Math.PI) * 4 * t;
      i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/* ── Component ──────────────────────────────────────────────────────────── */
export default function CrashChart({ status, multiplier, elapsed, crashPoint, timeRemaining }) {
  const canvasRef  = useRef(null);
  const animRef    = useRef(null);

  // live refs — read by rAF loop without re-registration
  const R = useRef({ status, multiplier, elapsed, crashPoint, timeRemaining });
  useEffect(() => {
    R.current = { status, multiplier, elapsed, crashPoint, timeRemaining };
  });

  // animation state
  const stars       = useRef(null);
  const trail       = useRef([]);
  const crashAnim   = useRef(null);
  const prevStatus  = useRef(null);
  const bettingRef  = useRef(null); // { startTs, initialRemain } — set when betting begins
  const smoothAng   = useRef(0);    // exponentially smoothed kite angle
  const lastMultRef = useRef({ mult: NaN, elSec: 0, ts: 0 }); // client-side tick interpolation

  /* ── animation loop — set up ONCE ──────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function draw() {
      const { status, multiplier, crashPoint } = R.current;
      const W = canvas.width, H = canvas.height;
      const iW = W - PAD.left - PAD.right;
      const iH = H - PAD.top  - PAD.bottom;
      if (iW <= 0 || iH <= 0) return;

      const now = performance.now() / 1000;

      /* status transition housekeeping */
      if (prevStatus.current !== status) {
        if (status !== 'crashed')                              crashAnim.current = null;
        if (status === 'betting' || status === 'idle' || !status) trail.current = [];
        if (status === 'betting') {
          bettingRef.current = {
            startTs:       performance.now(),
            initialRemain: R.current.timeRemaining ?? 10000,
          };
        }
        if (status === 'running') {
          smoothAng.current = 0;
          lastMultRef.current = { mult: NaN, elSec: 0, ts: performance.now() };
        }
        prevStatus.current = status;
      }

      /* ── background ─────────────────────────────────────────── */
      ctx.fillStyle = '#0b0c10';
      ctx.fillRect(0, 0, W, H);

      /* vignette */
      const vig = ctx.createLinearGradient(0, H * 0.5, 0, H);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      /* ── stars ──────────────────────────────────────────────── */
      if (!stars.current) stars.current = makeStars(W, H);
      for (const s of stars.current) {
        const tw = 0.4 + 0.6 * Math.sin(now * s.sp + s.ph);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a * tw})`;
        ctx.fill();
      }

      /* ── grid ───────────────────────────────────────────────── */
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth   = 1;
      for (let i = 1; i <= 4; i++) {
        const gy = PAD.top + (iH * i) / 4;
        ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(PAD.left + iW, gy); ctx.stroke();
        const gx = PAD.left + (iW * i) / 4;
        ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, PAD.top + iH); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(PAD.left, PAD.top);
      ctx.lineTo(PAD.left, PAD.top + iH);
      ctx.lineTo(PAD.left + iW, PAD.top + iH);
      ctx.stroke();

      /* ── BETTING / STARTING / IDLE ──────────────────────────── */
      if (status === 'betting' || status === 'starting' || status === 'idle' || !status) {
        const baseY = PAD.top + iH;

        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(PAD.left, baseY - 1);
        ctx.lineTo(PAD.left + iW * 0.55, baseY - 1);
        ctx.stroke();
        ctx.setLineDash([]);

        const px = PAD.left + 44, py = baseY - 20;

        const gg = ctx.createRadialGradient(px, baseY, 0, px, baseY, 40);
        gg.addColorStop(0, 'rgba(255,140,30,0.28)');
        gg.addColorStop(1, 'rgba(255,140,30,0)');
        ctx.beginPath(); ctx.ellipse(px, baseY, 40, 12, 0, 0, Math.PI * 2);
        ctx.fillStyle = gg; ctx.fill();

        kite(ctx, px, py, 0, 1, now * 1.5);

        if (status === 'starting') {
          /* wind swirl particles lifting the kite */
          for (let p = 0; p < 8; p++) {
            const age = ((now * 1.8 + p * 0.35) % 1);
            const wx  = px - 10 + Math.cos(p * 1.1 + now * 2) * 28 * age;
            const wy  = py - age * 22 + Math.sin(p * 0.9 + now * 3) * 6;
            ctx.beginPath();
            ctx.arc(wx, wy, 2.8 * (1 - age), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180,220,255,${0.6 * (1 - age)})`;
            ctx.fill();
          }
        }

        ctx.textAlign = 'center';
        if (status === 'betting') {
          const total   = 10000;
          // Compute live countdown from when the betting phase started
          const bet     = bettingRef.current;
          const elapsed_ms = bet ? performance.now() - bet.startTs : 0;
          const remain  = Math.max(0, (bet?.initialRemain ?? total) - elapsed_ms);
          const secs    = Math.ceil(remain / 1000);
          const pct     = remain / total; // 1 → 0 as time runs out

          // Label above bar
          ctx.font      = 'bold 16px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText('Place your bet before takeoff!', W / 2, H / 2 - 32);

          // Progress bar dimensions
          const barW  = Math.min(iW * 0.65, 320);
          const barH  = 18;
          const barX  = W / 2 - barW / 2;
          const barY  = H / 2 - 9;
          const r     = barH / 2;

          // Track (background)
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          ctx.roundRect(barX, barY, barW, barH, r);
          ctx.fill();

          // Fill — color shifts green → amber → red as time runs out
          const hue   = pct > 0.5 ? 120 : pct > 0.25 ? 40 : 0;
          const sat   = pct > 0.5 ? 70  : pct > 0.25 ? 85 : 90;
          const lum   = 50;
          const fillW = Math.max(r * 2, barW * pct); // keep min width for round ends
          const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
          barGrad.addColorStop(0,   `hsla(${hue},${sat}%,${lum+12}%,0.95)`);
          barGrad.addColorStop(1,   `hsla(${hue},${sat}%,${lum}%,0.85)`);
          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(barX, barY, fillW, barH, r);
          ctx.fill();

          // Shimmer sweep
          const shim = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
          const sp   = (performance.now() / 900) % 1;
          shim.addColorStop(Math.max(0, sp - 0.15), 'rgba(255,255,255,0)');
          shim.addColorStop(sp,                      'rgba(255,255,255,0.22)');
          shim.addColorStop(Math.min(1, sp + 0.15), 'rgba(255,255,255,0)');
          ctx.fillStyle = shim;
          ctx.beginPath();
          ctx.roundRect(barX, barY, fillW, barH, r);
          ctx.fill();

          // Countdown number centred in bar
          ctx.textAlign  = 'center';
          ctx.font       = `bold 12px system-ui, sans-serif`;
          ctx.fillStyle  = 'rgba(255,255,255,0.9)';
          ctx.fillText(`${secs}s`, W / 2, barY + barH / 2 + 4.5);

        } else if (status === 'starting') {
          ctx.font = 'bold 22px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText('Preparing for takeoff…', W / 2, H / 2);
        } else {
          ctx.font = 'bold 18px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillText('Connecting…', W / 2, H / 2);
        }
        return;
      }

      /* ── RUNNING / CRASHED ───────────────────────────────────── */
      const isCrashed = status === 'crashed';

      // Smooth 60fps interpolation between 50ms server ticks.
      // For running: detect each server tick (multiplier change), then extrapolate
      // forward using the known exponential formula so the kite glides continuously.
      // For crashed: use the fixed crashPoint — no interpolation needed.
      let elSec, curMult;
      if (isCrashed) {
        curMult = crashPoint ?? multiplier;
        elSec   = Math.log(Math.max(curMult, 1.0001)) / GROWTH_RATE;
      } else {
        const serverMult = multiplier ?? 1;
        // New server tick arrived — anchor the interpolation to this point
        if (serverMult !== lastMultRef.current.mult) {
          lastMultRef.current = {
            mult:  serverMult,
            elSec: Math.log(Math.max(serverMult, 1.0001)) / GROWTH_RATE,
            ts:    performance.now(),
          };
        }
        // Extrapolate forward from the last anchor; cap at 120ms to prevent runaway on lag
        const timeSince = (performance.now() - lastMultRef.current.ts) / 1000;
        elSec   = lastMultRef.current.elSec + Math.min(timeSince, 0.12);
        curMult = Math.pow(Math.E, GROWTH_RATE * elSec);
      }

      if (elSec <= 0) return;

      // Fixed time window — curve grows left→right, expands only when game runs long
      const MIN_WIN  = 10; // seconds always visible on x-axis
      const visTime  = Math.max(MIN_WIN, elSec * 1.15);

      const maxM  = Math.max(curMult * 1.25, 2);
      const steps = Math.max(80, Math.floor(elSec * 25));

      // Linear Y scale → exponential curve looks curved (not a straight line)
      const toY = (m) => PAD.top + iH - ((m - 1) / (maxM - 1)) * iH;
      // Fixed-window X scale → curve tip starts left and grows rightward
      const toX = (t) => PAD.left + (t / visTime) * iW;

      const tipX = toX(elSec);
      const tipY = toY(curMult);

      const dt     = Math.max(0.3, elSec * 0.04); // wide window keeps angle stable at takeoff
      const t0     = Math.max(0, elSec - dt);
      const rawAng = Math.atan2(
        toY(Math.pow(Math.E, GROWTH_RATE * elSec)) - toY(Math.pow(Math.E, GROWTH_RATE * t0)),
        toX(elSec) - toX(t0)
      );
      // Blend toward raw angle each frame (lower = smoother, higher = more responsive)
      smoothAng.current += 0.12 * (rawAng - smoothAng.current);
      const ang = smoothAng.current;

      /* update contrail */
      if (!isCrashed) {
        trail.current.push({ x: tipX, y: tipY });
        if (trail.current.length > TRAIL) trail.current.shift();
      }

      /* ── fill ───────────────────────────────────────────────── */
      const fillG = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + iH);
      if (isCrashed) {
        fillG.addColorStop(0, 'rgba(239,68,68,0.18)');
        fillG.addColorStop(1, 'rgba(239,68,68,0.0)');
      } else {
        fillG.addColorStop(0,   'rgba(255,120,30,0.28)');
        fillG.addColorStop(0.7, 'rgba(255,100,20,0.06)');
        fillG.addColorStop(1,   'rgba(0,0,0,0)');
      }
      ctx.beginPath();
      ctx.moveTo(PAD.left, PAD.top + iH);
      for (let i = 0; i <= steps; i++) {
        const t = (elSec * i) / steps;
        const m = Math.pow(Math.E, GROWTH_RATE * t);
        if (m > maxM * 1.05) break;
        ctx.lineTo(toX(t), toY(m));
      }
      ctx.lineTo(tipX, PAD.top + iH);
      ctx.closePath();
      ctx.fillStyle = fillG;
      ctx.fill();

      /* ── curve bloom + core ─────────────────────────────────── */
      const cColor = isCrashed ? '#ef4444' : '#ff7c28';
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= steps; i++) {
        const t = (elSec * i) / steps;
        const m = Math.pow(Math.E, GROWTH_RATE * t);
        if (m > maxM * 1.05) break;
        first ? ctx.moveTo(toX(t), toY(m)) : ctx.lineTo(toX(t), toY(m));
        first = false;
      }
      ctx.strokeStyle = isCrashed ? 'rgba(239,68,68,0.3)' : 'rgba(255,124,40,0.3)';
      ctx.lineWidth   = 9;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.stroke();
      ctx.strokeStyle = cColor;
      ctx.lineWidth   = 2.8;
      ctx.shadowColor = cColor;
      ctx.shadowBlur  = 10;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      /* ── y-axis labels ──────────────────────────────────────── */
      const ticks = [1, 1.5, 2, 3, 5, 10, 20, 50].filter(m => m <= maxM * 1.05);
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.lineWidth = 1;
      for (const m of ticks) {
        const y = toY(m);
        if (y < PAD.top - 4 || y > PAD.top + iH + 4) continue;
        ctx.fillStyle   = 'rgba(255,255,255,0.28)';
        ctx.fillText(`${m < 2 ? m.toFixed(1) : m.toFixed(0)}x`, PAD.left - 6, y + 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.beginPath(); ctx.moveTo(PAD.left - 4, y); ctx.lineTo(PAD.left, y); ctx.stroke();
      }

      /* ── contrail ───────────────────────────────────────────── */
      const tr = trail.current;
      for (let i = 1; i < tr.length; i++) {
        const p = i / tr.length;
        ctx.beginPath();
        ctx.arc(tr[i].x, tr[i].y, 3.5 * p, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,150,50,${0.22 * p})`;
        ctx.fill();
      }

      if (!isCrashed) {
        /* halo */
        const halo = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 38);
        halo.addColorStop(0, 'rgba(255,140,40,0.22)');
        halo.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.beginPath(); ctx.arc(tipX, tipY, 38, 0, Math.PI * 2);
        ctx.fillStyle = halo; ctx.fill();

        /* kite string from origin to kite tip */
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        ctx.lineWidth   = 0.9;
        ctx.setLineDash([4, 7]);
        ctx.beginPath();
        ctx.moveTo(PAD.left, PAD.top + iH);
        const midSX = (PAD.left + tipX) / 2;
        const midSY = (PAD.top + iH + tipY) / 2 + 18;
        ctx.quadraticCurveTo(midSX, midSY, tipX, tipY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        kite(ctx, tipX, tipY, ang, 1, now * 2.2);

        /* multiplier */
        ctx.textAlign   = 'center';
        ctx.font        = 'bold 54px system-ui, sans-serif';
        ctx.shadowColor = 'rgba(255,130,30,0.75)';
        ctx.shadowBlur  = 28;
        ctx.fillStyle   = '#ffffff';
        ctx.fillText(`${curMult.toFixed(2)}x`, W / 2, PAD.top + iH * 0.37);
        ctx.shadowBlur  = 0;
        ctx.font        = '13px system-ui, sans-serif';
        ctx.fillStyle   = 'rgba(255,255,255,0.28)';
        ctx.fillText('Cash out before it flies away!', W / 2, PAD.top + iH * 0.37 + 32);

      } else {
        /* crash animation */
        if (!crashAnim.current) {
          crashAnim.current = { t0: performance.now(), x: tipX, y: tipY, angle: ang };
        }
        const cr  = crashAnim.current;
        const age = (performance.now() - cr.t0) / 1000;

        for (let r = 0; r < 4; r++) {
          const prog = Math.min(Math.max(0, age - r * 0.09) / 0.55, 1);
          if (prog <= 0) continue;
          ctx.beginPath();
          ctx.arc(cr.x, cr.y, prog * 62, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,${110 - r * 18},30,${(1 - prog) * 0.9})`;
          ctx.lineWidth   = 3.5 * (1 - prog * 0.55);
          ctx.stroke();
        }

        const PA = [0,40,80,120,160,200,240,280,320,360];
        for (let i = 0; i < PA.length; i++) {
          const a   = (PA[i] * Math.PI) / 180;
          const spd = 28 + (i % 4) * 17;
          const pg  = Math.min(age / 0.85, 1);
          ctx.beginPath();
          ctx.arc(cr.x + Math.cos(a)*spd*pg, cr.y + Math.sin(a)*spd*pg, 4.5*(1-pg*0.7), 0, Math.PI*2);
          ctx.fillStyle = i%3===0 ? `rgba(255,220,60,${1-pg})`
                        : i%3===1 ? `rgba(255,100,20,${1-pg})`
                        :           `rgba(239,68,68,${1-pg})`;
          ctx.fill();
        }

        /* string-snap sparks at crash point */
        for (let s = 0; s < 8; s++) {
          const snapAge = Math.min(age / 0.4, 1);
          const sa = (s / 8) * Math.PI * 2;
          const sd = 14 + s * 4;
          ctx.beginPath();
          ctx.arc(
            cr.x + Math.cos(sa) * sd * snapAge,
            cr.y + Math.sin(sa) * sd * snapAge,
            2.5 * (1 - snapAge), 0, Math.PI * 2
          );
          ctx.fillStyle = `rgba(255,255,180,${(1 - snapAge) * 0.9})`;
          ctx.fill();
        }

        /* kite floats upward freely (string cut) */
        const fa = Math.max(0, 1 - age * 0.65);
        if (fa > 0) {
          kite(
            ctx,
            cr.x + age * 18,
            cr.y - age * 75,
            cr.angle - age * 6,
            fa, now * 3.5, true   // cutString=true → dangling string end
          );
        }

        ctx.textAlign   = 'center';
        ctx.font        = 'bold 40px system-ui, sans-serif';
        ctx.shadowColor = 'rgba(239,68,68,0.9)';
        ctx.shadowBlur  = 30;
        ctx.fillStyle   = '#ef4444';
        ctx.fillText(`${(crashPoint ?? curMult).toFixed(2)}x`, W/2, PAD.top + iH*0.37);
        ctx.shadowBlur  = 0;
      }
    }

    function loop() { draw(); animRef.current = requestAnimationFrame(loop); }
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  /* ── canvas resize ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      stars.current = null;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  return <canvas ref={canvasRef} className="crash-chart" />;
}
