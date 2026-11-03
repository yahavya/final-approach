// Head-up display, drawn in 2D over the 3D view. In the cockpit view the pitch
// ladder and flight-path marker line up with the outside world.

import { clamp, DEG, eulerFrom, FT, KT, qRotateInv } from '../sim/math.js?v=e179301';
import { wheelHeight } from '../sim/gear.js?v=e179301';
import { RUNWAY } from '../game/scenario.js?v=e179301';
import { currentLeg, legSpeed, turnText, turnTo } from '../game/route.js?v=e179301';

const GREEN = '#7dffa0';
const AMBER = '#ffb347';
const RED = '#ff5a4f';

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function text(str, x, y, size = 15, align = 'left', color = GREEN) {
    ctx.font = `600 ${size}px -apple-system, "Helvetica Neue", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Raindrops on the windscreen, each sliding back at its own pace.
  const drops = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.8, r: 1 + Math.random() * 3.5, speed: 0.2 + Math.random() }));

  function windscreenRain(speed, dt) {
    ctx.save();
    for (const d of drops) {
      d.x += (d.x - 0.5) * dt * speed * 0.004 * d.speed;
      d.y -= dt * speed * 0.0012 * d.speed;
      if (d.x < 0 || d.x > 1 || d.y < 0) {
        d.x = Math.random();
        d.y = 0.3 + Math.random() * 0.5;
      }
      const x = d.x * w;
      const y = d.y * h;
      ctx.strokeStyle = 'rgba(220,230,240,0.35)';
      ctx.lineWidth = d.r * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (d.x - 0.5) * d.r * 6, y + d.r * 3);
      ctx.stroke();
    }
    ctx.restore();
  }
  let lastDraw = performance.now();

  function cockpitFrame() {
    // Glareshield and windscreen pillars
    ctx.fillStyle = '#10141a';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.86);
    ctx.quadraticCurveTo(w * 0.5, h * 0.8, w, h * 0.86);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.045, 0);
    ctx.lineTo(0, h * 0.5);
    ctx.closePath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w * 0.955, 0);
    ctx.lineTo(w, h * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function ladder(cx, cy, pitch, bank, ppr, tilt) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-bank);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.5;
    const offset = (pitch - tilt) * ppr;
    for (let deg = -30; deg <= 30; deg += 5) {
      const y = offset - deg * DEG * ppr;
      if (Math.abs(y) > h * 0.3) continue;
      if (deg === 0) {
        line(-w, y, -70, y);
        line(70, y, w, y);
        continue;
      }
      if (deg < 0) ctx.setLineDash([7, 5]);
      line(-55, y, -22, y);
      line(22, y, 55, y);
      ctx.setLineDash([]);
      text(String(Math.abs(deg)), -62, y, 11, 'right');
      text(String(Math.abs(deg)), 62, y, 11, 'left');
    }
    ctx.restore();
  }

  function flightPathMarker(x, y) {
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    line(x - 20, y, x - 7, y);
    line(x + 7, y, x + 20, y);
    line(x, y - 7, x, y - 15);
  }

  function tape(x, y, height, value, step, major, side, label, color, bug) {
    const pxPerUnit = height / (step * 12);
    const dir = side === 'left' ? 1 : -1;
    ctx.strokeStyle = 'rgba(125,255,160,0.55)';
    ctx.lineWidth = 1.5;
    line(x, y - height / 2, x, y + height / 2);
    const first = Math.ceil((value - step * 6) / step) * step;
    for (let v = first; v <= value + step * 6; v += step) {
      if (v < 0) continue;
      const ty = y - (v - value) * pxPerUnit;
      const isMajor = Math.round(v) % major === 0;
      line(x, ty, x + dir * (isMajor ? 12 : 6), ty);
      if (isMajor && Math.abs(ty - y) > 16) {
        text(String(Math.round(v)), x + dir * 18, ty, 12, side === 'left' ? 'left' : 'right', 'rgba(125,255,160,0.8)');
      }
    }
    if (bug != null) {
      const by = clamp(y - (bug - value) * pxPerUnit, y - height / 2, y + height / 2);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2;
      line(x - dir * 2, by, x - dir * 14, by);
    }
    ctx.fillStyle = 'rgba(8,12,16,0.78)';
    const boxW = 76;
    const bx = side === 'left' ? x - boxW - 8 : x + 8;
    ctx.fillRect(bx, y - 16, boxW, 32);
    text(String(Math.round(value)), bx + boxW / 2, y, 20, 'center', color);
    text(label, bx + boxW / 2, y + height / 2 + 14, 11, 'center', 'rgba(125,255,160,0.8)');
  }

  function deviation(x, y, length, value, vertical) {
    // value in -1..1, like the diamonds on an ILS display
    ctx.strokeStyle = 'rgba(125,255,160,0.55)';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(125,255,160,0.55)';
    for (const dot of [-2, -1, 1, 2]) {
      const px = (dot / 2) * (length / 2);
      ctx.beginPath();
      ctx.arc(vertical ? x : x + px, vertical ? y + px : y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const v = clamp(value, -1, 1) * (length / 2);
    const mx = vertical ? x : x + v;
    const my = vertical ? y + v : y;
    ctx.fillStyle = '#ff7df2';
    ctx.beginPath();
    ctx.moveTo(mx, my - 7);
    ctx.lineTo(mx + 7, my);
    ctx.lineTo(mx, my + 7);
    ctx.lineTo(mx - 7, my);
    ctx.closePath();
    ctx.fill();
  }

  function stickBox(x, y, stick) {
    const size = 44;
    ctx.strokeStyle = 'rgba(244,241,234,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    line(x - size / 2, y, x + size / 2, y);
    line(x, y - size / 2, x, y + size / 2);
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(x + (stick.x * size) / 2, y + (stick.y * size) / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function keycap(label, x, y) {
    ctx.font = '700 17px -apple-system, "Helvetica Neue", sans-serif';
    const width = Math.max(32, ctx.measureText(label).width + 18);
    ctx.fillStyle = '#f4f1ea';
    ctx.beginPath();
    ctx.roundRect(x, y - 15, width, 30, 6);
    ctx.fill();
    ctx.fillStyle = '#10141a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + width / 2, y + 1);
    return width;
  }

  function coachPanel(advice) {
    const toneColor = { ok: GREEN, fix: AMBER, flare: AMBER, urgent: RED }[advice.tone] ?? GREEN;
    const rows = advice.actions;
    const panelW = Math.min(w - 32, 380);
    const panelH = 40 + rows.length * 38;
    const x = w / 2 - panelW / 2;
    const y = 14;
    ctx.fillStyle = 'rgba(8,12,16,0.74)';
    ctx.beginPath();
    ctx.roundRect(x, y, panelW, panelH, 10);
    ctx.fill();
    text(advice.stage, w / 2, y + 21, 15, 'center', toneColor);
    rows.forEach((a, i) => {
      const rowY = y + 56 + i * 38;
      const capW = keycap(a.key, x + 18, rowY);
      text(a.text, x + 18 + capW + 12, rowY, 18, 'left', '#f4f1ea');
    });
  }

  /** A diamond on a point in the world, or an arrow at the screen edge if it's out of view. */
  function marker(world, target, color, label, arrowY) {
    const p = world.project(target);
    const margin = 40;
    const off = p.behind || p.x < margin || p.x > w - margin || p.y < margin || p.y > h - margin;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    if (!off) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 12);
      ctx.lineTo(p.x + 12, p.y);
      ctx.lineTo(p.x, p.y + 12);
      ctx.lineTo(p.x - 12, p.y);
      ctx.closePath();
      ctx.stroke();
      text(label, p.x, p.y - 22, 13, 'center', color);
      return;
    }
    const side = p.behind ? (p.x < w / 2 ? 1 : -1) : (p.x < w / 2 ? -1 : 1);
    const ax = w / 2 + side * Math.min(w * 0.42, 460);
    ctx.beginPath();
    ctx.moveTo(ax + side * 18, arrowY);
    ctx.lineTo(ax - side * 6, arrowY - 14);
    ctx.lineTo(ax - side * 6, arrowY + 14);
    ctx.closePath();
    ctx.fill();
    text(label, ax - side * 14, arrowY, 13, side > 0 ? 'right' : 'left', color);
  }

  /** A small moving map, with your direction of travel always pointing up. */
  function navMap(g, runwayShown) {
    const size = 170;
    const x0 = w - 22 - size;
    const y0 = 88;
    const cx0 = x0 + size / 2;
    const cy0 = y0 + size * 0.68;
    const s = g.s;
    const track = Math.atan2(s.vel[2], s.vel[0]);
    const fx = Math.cos(track);
    const fz = Math.sin(track);

    const legs = g.route ? g.route.legs.slice(g.route.final ? g.route.legs.length : g.route.leg) : [];
    const points = legs.map((l) => ({ x: l.x, z: l.z }));
    if (runwayShown) points.push({ x: 0, z: 0 }, { x: RUNWAY.length, z: 0 });
    let range = 1500;
    for (const p of points) range = Math.max(range, Math.hypot(p.x - s.pos[0], p.z - s.pos[2]));
    const scale = (size * 0.56) / range;
    const place = (p) => {
      const dx = p.x - s.pos[0];
      const dz = p.z - s.pos[2];
      return { x: cx0 + (-fz * dx + fx * dz) * scale, y: cy0 - (fx * dx + fz * dz) * scale };
    };

    ctx.save();
    ctx.fillStyle = 'rgba(8,12,16,0.72)';
    ctx.beginPath();
    ctx.roundRect(x0, y0, size, size, 10);
    ctx.fill();
    ctx.clip();

    ctx.strokeStyle = '#ff9df5';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    let from = place({ x: s.pos[0], z: s.pos[2] });
    ctx.moveTo(from.x, from.y);
    for (const p of points) {
      from = place(p);
      ctx.lineTo(from.x, from.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff9df5';
    legs.forEach((l, i) => {
      const p = place(l);
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });

    if (runwayShown) {
      const a = place({ x: 0, z: 0 });
      const b = place({ x: RUNWAY.length, z: 0 });
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 5;
      line(a.x, a.y, b.x, b.y);
      text('RWY', b.x, b.y - 11, 12, 'center');
    }

    // You
    ctx.fillStyle = '#f4f1ea';
    ctx.beginPath();
    ctx.moveTo(cx0, cy0 - 9);
    ctx.lineTo(cx0 + 6, cy0 + 7);
    ctx.lineTo(cx0, cy0 + 3);
    ctx.lineTo(cx0 - 6, cy0 + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Modes without a route (Landing, Air Show) get the same map, runway marker
   * and directions. The directions lead to the extended centerline, then along it.
   */
  function runwayPanel(g, world) {
    const s = g.s;
    const pink = '#ff9df5';
    const km = Math.hypot(s.pos[0], s.pos[2]) / 1000;
    const title = g.mode === 'airshow' ? `SHOW ${g.tricks.total.toLocaleString()}` : 'Runway 12';
    text(title, w - 22, 26, g.mode === 'airshow' ? 18 : 14, 'right', g.mode === 'airshow' ? AMBER : pink);
    const sub = g.mode === 'airshow' ? 'Fly tricks, then land on runway 12 to bank them' : `${km.toFixed(1)} km to the runway`;
    text(sub, w - 22, 48, 13, 'right', g.mode === 'airshow' ? 'rgba(244,241,234,0.8)' : pink);
    if (g.phase === 'approach') {
      const aimX = Math.min(0, s.pos[0] + 2500);
      text(turnText(turnTo(s, aimX, 0)), w - 22, 68, 17, 'right', '#f4f1ea');
      marker(world, [0, 2, 0], GREEN, `RWY ${km.toFixed(km < 10 ? 1 : 0)} km`, h * 0.38);
    }
    if (w >= 900) navMap(g, true);
  }

  function routePanel(g, world) {
    const leg = currentLeg(g);
    const s = g.s;
    const pink = '#ff9df5';
    const runwayShown = !g.route.legs[g.route.legs.length - 1].cruise;
    if (leg) {
      const km = Math.hypot(leg.x - s.pos[0], leg.z - s.pos[2]) / 1000;
      const altText = leg.path ? 'glide path' : `${leg.altFt} ft`;
      text(`Leg ${g.route.leg + 1} of ${g.route.legs.length}: ${leg.name}`, w - 22, 26, 14, 'right', pink);
      text(`${km.toFixed(1)} km · ${altText} · ${legSpeed(leg, g.ac)} kt`, w - 22, 46, 13, 'right', pink);
      if (g.phase === 'approach') text(turnText(turnTo(s, leg.x, leg.z)), w - 22, 68, 17, 'right', '#f4f1ea');
      marker(world, [leg.x, leg.path ? 200 : leg.altFt * FT, leg.z], pink, 'NEXT', h * 0.3);
    } else {
      text('Final approach', w - 22, 26, 14, 'right', pink);
    }
    if (runwayShown) {
      const km = Math.hypot(s.pos[0], s.pos[2]) / 1000;
      if (g.phase === 'approach') marker(world, [0, 2, 0], GREEN, `RWY ${km.toFixed(km < 10 ? 1 : 0)} km`, h * 0.38);
    }
    if (w >= 900) navMap(g, runwayShown);
  }

  function thrustBar(x, y, height, lever, spool, reverse) {
    ctx.strokeStyle = 'rgba(244,241,234,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - height, 14, height);
    ctx.fillStyle = reverse ? AMBER : GREEN;
    ctx.fillRect(x + 1, y - height * spool, 12, height * spool);
    ctx.fillStyle = AMBER;
    ctx.fillRect(x - 4, y - height * lever - 1, 22, 2);
    text(reverse ? 'REV' : 'THR', x + 7, y + 12, 11, 'center', reverse ? AMBER : 'rgba(244,241,234,0.7)');
  }

  const toasts = [];

  return {
    /** A trick pops up in the middle of the screen. */
    trick(name, points, combo) {
      toasts.push({ name, points, combo, at: performance.now() });
      if (toasts.length > 3) toasts.shift();
    },

    clear() {
      ctx.clearRect(0, 0, w, h);
    },

    /** The door alarm, over the normal cockpit view. */
    drawWarning() {
      if (Math.floor(performance.now() / 260) % 2 === 0) {
        ctx.fillStyle = 'rgba(200,24,16,0.2)';
        ctx.fillRect(0, 0, w, h);
      }
      text("SOMEONE'S FORCING THE COCKPIT DOOR", w / 2, h * 0.24, 28, 'center', RED);
      text('Get ready to hammer X', w / 2, h * 0.24 + 36, 20, 'center', '#f4f1ea');
    },

    /** The fight: a tug of war on one bar. */
    drawFight(e, left) {
      ctx.clearRect(0, 0, w, h);
      const pulse = Math.floor(performance.now() / 110) % 2 === 0;
      const barW = Math.min(w - 48, 620);
      const x = w / 2 - barW / 2;
      const y = h - 150;
      ctx.fillStyle = 'rgba(8,12,16,0.8)';
      ctx.beginPath();
      ctx.roundRect(x - 16, y - 66, barW + 32, 118, 12);
      ctx.fill();
      text(pulse ? 'HAMMER X' : 'HAMMER  X', w / 2, y - 34, 32, 'center', '#f4f1ea');
      ctx.fillStyle = 'rgba(255,90,79,0.35)';
      ctx.fillRect(x, y, barW, 22);
      ctx.fillStyle = GREEN;
      ctx.fillRect(x, y, barW * (e.meter / 100), 22);
      text('ATTACKER', x, y + 38, 12, 'left', RED);
      text(`${Math.ceil(left)} s`, w / 2, y + 38, 13, 'center', '#f4f1ea');
      text('YOU WIN AT FULL', x + barW, y + 38, 12, 'right', GREEN);
    },

    /** The fire alarm, seen from the seat. */
    drawFireAlert(row, left) {
      if (Math.floor(performance.now() / 400) % 2 === 0) {
        ctx.fillStyle = 'rgba(200,70,16,0.14)';
        ctx.fillRect(0, 0, w, h);
      }
      text(`FIRE IN THE CABIN, ROW ${row}`, w / 2, h * 0.24, 28, 'center', RED);
      text(`Press V, run back and hold E to put it out · ${Math.ceil(left)} s`, w / 2, h * 0.24 + 36, 18, 'center', '#f4f1ea');
    },

    /** After the fight, looking down at the attacker. */
    drawAftermath() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(8,12,16,0.72)';
      ctx.beginPath();
      ctx.roundRect(w / 2 - 230, 26, 460, 88, 12);
      ctx.fill();
      text('Attacker subdued', w / 2, 56, 30, 'center', GREEN);
      text('Press V once you\'re back in your seat to check on the cabin', w / 2, 92, 14, 'center', '#f4f1ea');
    },

    banner(message) {
      text(message, w / 2, h * 0.24, 20, 'center', AMBER);
    },

    /** The little that's shown while you're out of your seat. */
    drawWalk(g, row, moodName, flying, warning, prompt, talk) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(8,12,16,0.72)';
      ctx.beginPath();
      ctx.roundRect(12, 10, 340, 54, 8);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(w / 2 - 170, h - 60, 340, 32, 8);
      ctx.fill();
      const place = row ? `Row ${row}` : 'Flight deck';
      const status = flying ? `${Math.round(g.s.pos[1] / FT).toLocaleString()} ft · Autopilot on` : 'Parked';
      text(`${place} · ${status}`, 22, 28, 15, 'left', '#f4f1ea');
      text(`${g.passengers.count} passengers · ${moodName} · comfort ${Math.round(g.passengers.comfort)}%`, 22, 50, 13, 'left', 'rgba(244,241,234,0.8)');
      if (warning) {
        ctx.fillStyle = 'rgba(8,12,16,0.72)';
        ctx.beginPath();
        ctx.roundRect(w / 2 - 190, 12, 380, 44, 8);
        ctx.fill();
        text(warning, w / 2, 34, 22, 'center', RED);
      }
      text('↑ ↓ walk   ← → look   V back to your seat', w / 2, h - 44, 14, 'center', '#f4f1ea');
      if (prompt && !talk) {
        ctx.fillStyle = 'rgba(8,12,16,0.72)';
        ctx.beginPath();
        ctx.roundRect(w / 2 - 130, h - 100, 260, 32, 8);
        ctx.fill();
        text(prompt, w / 2, h - 84, 14, 'center', AMBER);
      }
      if (talk) {
        const width = Math.min(w - 32, 560);
        ctx.fillStyle = 'rgba(248,245,238,0.96)';
        ctx.beginPath();
        ctx.roundRect(w / 2 - width / 2, h - 170, width, 92, 12);
        ctx.fill();
        text(`Seat ${talk.who}`, w / 2 - width / 2 + 18, h - 150, 13, 'left', '#6b6f76');
        ctx.font = '600 19px -apple-system, "Helvetica Neue", sans-serif';
        ctx.fillStyle = '#14181f';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`"${talk.line}"`, w / 2 - width / 2 + 18, h - 116, width - 36);
      }
    },

    draw(g, world, stick, advice) {
      ctx.clearRect(0, 0, w, h);
      const s = g.s;
      const e = eulerFrom(s.q);
      const cockpit = world.isCockpit();

      const nowMs = performance.now();
      const dt = Math.min(0.1, (nowMs - lastDraw) / 1000);
      lastDraw = nowMs;
      if (cockpit && g.conditions && g.conditions.storm) windscreenRain(s.V, dt);
      if (cockpit) cockpitFrame();

      const cx = w / 2;
      const cy = h / 2;
      const ppr = h / 2 / Math.tan((world.fov() * DEG) / 2);
      const narrow = w < 720;
      const tapeH = Math.min(h * 0.42, 320);
      const tapeGap = narrow ? w * 0.34 : Math.min(w * 0.27, 340);

      if (cockpit) {
        ladder(cx, cy, e.pitch, e.roll, ppr, world.tilt());
        const noseY = cy - world.tilt() * ppr;
        // Over the ground, so a crosswind shows as the marker sliding sideways.
        const track = qRotateInv(s.q, s.vel);
        const fx = cx + clamp(Math.atan2(track[2], track[0]), -0.3, 0.3) * ppr;
        const fy = noseY + clamp(Math.atan2(-track[1], track[0]), -0.3, 0.3) * ppr;
        if (s.V > 20) flightPathMarker(fx, fy);
      }

      const kt = s.V / KT;
      const altFt = s.pos[1] / FT + g.airport.thresholdElevationFt - 12;
      const vsFpm = s.vel[1] / 0.00508;
      const slow = s.alpha > (g.ac.alphaStall - 3) * DEG;
      const leg = g.route ? currentLeg(g) : null;
      tape(cx - tapeGap, cy, tapeH, kt, 5, 10, 'left', 'KT', slow ? RED : GREEN, leg ? legSpeed(leg, g.ac) : g.ac.approachSpeedKt);
      tape(cx + tapeGap, cy, tapeH, altFt, 50, 100, 'right', 'FT', GREEN);

      const vsColor = vsFpm < -1400 ? RED : GREEN;
      text(`${vsFpm >= 0 ? '+' : '−'}${Math.abs(Math.round(vsFpm / 10) * 10)} fpm`, cx + tapeGap + 8, cy + tapeH / 2 + 34, 15, 'left', vsColor);

      const wheels = wheelHeight(s, g.ac) / FT;
      if (wheels < 2500 && g.phase === 'approach') {
        const rax = cx + (narrow ? 70 : 160);
        text(`${Math.round(wheels)}`, rax, cy + 96, 22, 'center');
        text('RA', rax, cy + 116, 11, 'center', 'rgba(125,255,160,0.8)');
      }

      // Glide path and centerline, full scale at about 0.7 and 2.5 degrees.
      const aimDistance = RUNWAY.aimPoint - s.pos[0];
      const onFinal = !g.route || g.route.leg >= g.route.legs.length - 3;
      if (g.phase === 'approach' && aimDistance > 300 && onFinal) {
        const angle = Math.atan2(s.pos[1] - g.ac.gearHeight, aimDistance) / DEG;
        const toRunway = Math.atan2(-s.pos[2], aimDistance + RUNWAY.length * 0.8) / DEG;
        deviation(cx + tapeGap - 22, cy, tapeH * 0.55, (angle - RUNWAY.glideDeg) / 0.7, true);
        deviation(cx, cy + tapeH / 2 + 14, tapeH * 0.8, toRunway / 2.5, false);
      }

      const bottom = (cockpit ? h * 0.965 : h - 18) - 26;
      stickBox(cx - tapeGap - 56, bottom - 22, stick);
      thrustBar(cx + tapeGap + 40, bottom - 14, 56, g.controls.throttle, s.spool, s.rev > 0.05);

      const gearText = s.gearDown > 0.95 ? 'GEAR DOWN' : s.gearDown < 0.05 ? 'GEAR UP' : 'GEAR MOVING';
      const detents = g.ac.flapDetents;
      const flapIndex = detents.indexOf(g.controls.flap);
      text(g.ac.shortName, cx - tapeGap + 4, bottom - 48, 12, 'left', 'rgba(244,241,234,0.7)');
      text(gearText, cx - tapeGap + 4, bottom - 30, 12, 'left', s.gearDown > 0.95 ? GREEN : AMBER);
      text(`FLAPS ${g.ac.flapNames[flapIndex]}`, cx - tapeGap + 4, bottom - 12, 12, 'left', GREEN);

      const heading = ((g.airport.headingTrue + e.heading / DEG) % 360 + 360) % 360;
      text(`HDG ${String(Math.round(heading) % 360).padStart(3, '0')}`, cx - tapeGap - 8, cy - tapeH / 2 - 14, 13, 'center');
      if (g.conditions) {
        const across = qRotateInv(s.q, s.wind)[2] / KT;
        const side = across > 0 ? 'FROM LEFT' : 'FROM RIGHT';
        text(`WIND ${Math.round(Math.abs(across))} KT ${side}`, cx - tapeGap - 8, cy - tapeH / 2 - 32, 13, 'center', AMBER);
      }
      if (g.route && g.phase !== 'finished') routePanel(g, world);
      else if (!g.route && g.phase !== 'finished' && g.airport.id === 'tlv') runwayPanel(g, world);
      if (g.passengers.count) {
        text(`${g.passengers.count} PAX · COMFORT ${Math.round(g.passengers.comfort)}%`, 22, h - 40, 12, 'left',
          g.passengers.comfort < 50 ? RED : 'rgba(244,241,234,0.75)');
      }

      const chips = [];
      if (s.spoilers > 0.3) chips.push('SPOILERS');
      if (g.controls.brake > 0) chips.push('BRAKES');
      chips.forEach((c, i) => text(c, cx, bottom - 40 + i * 16, 12, 'center', AMBER));

      if (g.fbw && g.fbw.alphaProt) text(g.fbw.alphaFloor ? 'A.FLOOR' : 'ALPHA PROT', cx, cy - 90, 22, 'center', AMBER);
      if (!g.ac.fbw && (s.stall > 0 || s.alpha > (g.ac.alphaStall - 1.5) * DEG)) {
        if (!s.contact.mainL && !s.contact.mainR && Math.floor(performance.now() / 220) % 2 === 0) {
          text('STALL', cx, cy - 90, 32, 'center', RED);
        }
      }
      if (g.tailStruck) text('TAIL STRIKE', cx, cy - 50, 22, 'center', RED);
      if (advice) coachPanel(advice);
      const now = performance.now();
      toasts.forEach((t, i) => {
        const age = (now - t.at) / 1000;
        if (age > 2.6) return;
        const y = h * 0.34 - i * 46 - age * 14;
        ctx.globalAlpha = Math.min(1, (2.6 - age) * 2);
        text(`${t.name.toUpperCase()}  +${t.points}${t.combo > 1 ? `  ×${t.combo}` : ''}`, w / 2, y, 28, 'center', AMBER);
        ctx.globalAlpha = 1;
      });
      if (g.easy && (g.mode !== 'airshow' || g.controls.gearDown) && g.phase !== 'finished') {
        text('EASY: wings, centerline and speed are handled. You fly ↓ ↑, and F to close thrust at 20 ft', cx, bottom - 58, 12, 'center', 'rgba(159,199,255,0.9)');
      }
      if (g.ac.fighter && g.tricks) {
        text(`${g.tricks.felt.toFixed(1)} G`, cx - tapeGap - 8, cy + tapeH / 2 + 34, 15, 'center', g.tricks.felt > 7 ? RED : GREEN);
      }
    },
  };
}
