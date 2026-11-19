export const title = "The Bathypelagic Harp";

export function start({ audioContext: ac, canvas, duration, random }) {
  const ctx = canvas.getContext("2d");
  const D = duration || 15;
  const tick = D / 56;
  const sr = ac.sampleRate;
  const tau = Math.PI * 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  const connect = (a, b) => { a.connect(b); return b; };
  const gain = value => {
    const g = ac.createGain();
    g.gain.value = value;
    return g;
  };

  const master = gain(0.85);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -15;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.012;
  comp.release.value = 0.14;
  connect(connect(master, comp), ac.destination);

  const room = ac.createConvolver();
  const ir = ac.createBuffer(2, Math.ceil(sr * 1.65), sr);
  for (let ch = 0; ch < 2; ch++) {
    const a = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < a.length; i++) {
      lp += 0.32 * (random() * 2 - 1 - lp);
      a[i] = lp * Math.exp(-4.8 * i / sr) * Math.min(1, i / (sr * 0.025));
    }
  }
  room.buffer = ir;
  connect(connect(room, gain(0.23)), master);

  const stems = [];
  for (const pan of [-0.73, -0.38, 0, 0.38, 0.73]) {
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    connect(p, master);
    connect(p, room);
    stems.push(p);
  }

  const strings = new Map();
  function stringBuffer(note, bass) {
    const key = note + "/" + bass;
    if (strings.has(key)) return strings.get(key);
    const f = hz(note);
    const period = sr / f - 0.5;
    const whole = Math.floor(period), frac = period - whole;
    const ring = new Float32Array(whole + 2);
    let lp = 0;
    for (let j = 0; j < ring.length; j++) {
      lp += (bass ? 0.34 : 0.74) * (random() * 2 - 1 - lp);
      ring[j] = 0.78 * lp + 0.35 * sin(tau * j / ring.length);
    }
    const b = ac.createBuffer(1, Math.ceil(sr * (bass ? 1.95 : 1.55)), sr);
    const a = b.getChannelData(0);
    let w = 0, prev = 0;
    for (let i = 0; i < a.length; i++) {
      const i1 = (w + ring.length - whole) % ring.length;
      const v = (1 - frac) * ring[i1] + frac * ring[(i1 + ring.length - 1) % ring.length];
      const smooth = (v + prev) * 0.5;
      ring[w] = i < whole ? ring[w] : smooth * (bass ? 0.994 : 0.996);
      prev = v;
      w = (w + 1) % ring.length;
      const t = i / sr;
      const body = bass
        ? 0.56 * sin(tau * f * t) * Math.exp(-2.9 * t)
        : 0.25 * sin(tau * f * t) * Math.exp(-3.9 * t)
          + 0.115 * sin(tau * f * 2.006 * t) * Math.exp(-6 * t)
          + 0.08 * sin(tau * f * 3.97 * t) * Math.exp(-15 * t);
      a[i] = (0.72 * v + body) * Math.min(1, t * 640) * Math.min(1, (a.length - i) / (sr * 0.08));
    }
    strings.set(key, b);
    return b;
  }

  const reed = ac.createPeriodicWave(
    new Float32Array(9),
    new Float32Array([0, 1, 0.21, 0.38, 0.075, 0.12, 0.032, 0.045, 0.012])
  );
  const actions = [];
  const flashes = [];
  function pluck(pos, note, amp, lane, bass = false) {
    const buf = stringBuffer(note, bass);
    actions.push(base => {
      const src = ac.createBufferSource();
      src.buffer = buf;
      connect(connect(src, gain(amp)), stems[lane]);
      src.start(base + pos * tick);
    });
    flashes.push({ pos, s: bass ? 0 : (lane - 2) * 0.36 + (random() - 0.5) * 0.12, q: bass ? 0.81 : 0.25 + random() * 0.42, amp });
  }

  function sing(pos, note, length, strength, scoop = 0.35) {
    actions.push(base => {
      const t = base + pos * tick;
      const len = length * tick;
      const o = ac.createOscillator(), v = ac.createOscillator();
      o.setPeriodicWave(reed);
      o.frequency.setValueAtTime(hz(note - scoop), t);
      o.frequency.exponentialRampToValueAtTime(hz(note), t + Math.min(0.078, len * 0.3));
      v.frequency.value = 5.15;
      const depth = gain(0);
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(11, t + len * 0.82);
      connect(connect(v, depth), o.detune);
      const e = gain(0.0001);
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(strength, t + Math.min(0.062, len * 0.26));
      e.gain.linearRampToValueAtTime(strength * 0.76, t + len * 0.76);
      e.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.085);
      connect(connect(o, e), stems[2]);
      o.start(t); v.start(t);
      o.stop(t + len + 0.09); v.stop(t + len + 0.09);
    });
    flashes.push({ pos, s: (note - 73) / 27, q: 0.14, amp: strength + 0.15 });
  }

  const noise = ac.createBuffer(1, Math.ceil(sr * 0.26), sr);
  const ns = noise.getChannelData(0);
  for (let i = 0; i < ns.length; i++) ns[i] = random() * 2 - 1;
  function brush(pos, accent, lane) {
    actions.push(base => {
      const t = base + pos * tick;
      const src = ac.createBufferSource();
      src.buffer = noise;
      const filter = ac.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(accent ? 1800 : 6400, t);
      filter.frequency.exponentialRampToValueAtTime(accent ? 870 : 4200, t + 0.11);
      filter.Q.value = accent ? 0.85 : 1.5;
      const e = gain(0.0001);
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(accent ? 0.14 : 0.062, t + (accent ? 0.009 : 0.003));
      e.gain.exponentialRampToValueAtTime(0.0001, t + (accent ? 0.18 : 0.075));
      connect(connect(connect(src, filter), e), stems[lane]);
      src.start(t);
    });
  }

  // Eight measures in seven. The harp trades its last three pulses with the reed.
  const chords = [
    [38, 57, 64, 65, 69], [43, 59, 62, 64, 69],
    [34, 57, 60, 65, 69], [33, 55, 61, 64, 70],
    [39, 55, 62, 65, 69], [43, 58, 62, 65, 69],
    [33, 55, 61, 65, 70], [38, 57, 62, 64, 71]
  ];
  const order = [1, 3, 2, 4, 1, 3, 2];
  for (let bar = 0; bar < 8; bar++) {
    const b = bar * 7, c = chords[bar];
    pluck(b, c[0], 0.54, 2, true);
    if (bar < 7) pluck(b + 4.03, c[0] + (bar === 3 || bar === 6 ? 12 : 7), 0.32, 1, true);
    const count = bar === 7 ? 4 : 7;
    for (let j = 0; j < count; j++) {
      const n = order[(j + (bar % 3 === 2 ? 2 : 0)) % 7];
      const lane = [2, 0, 3, 1, 4][n];
      pluck(b + j + (j % 2 ? 0.065 : 0.025), c[n], j === 0 || j === 4 ? 0.35 : 0.25, lane);
      if (bar >= 4 && bar <= 6 && (j === 3 || j === 6))
        pluck(b + j + 0.55, c[n] + 12, 0.185, 4 - lane);
    }
    if (bar < 7) {
      brush(b + 2.04, true, 1);
      brush(b + 4.53, false, 4);
      brush(b + 6.06, bar >= 4, 3);
    }
  }
  const melody = [
    [0.48,69,1.25],[2,76,1.62],[4,77,0.9],[5,76,1.68],
    [7.1,71,2.48],[10,69,0.76],[11,74,2.65],
    [14.5,69,1.22],[16,76,1.62],[18,77,0.87],[19,81,1.65],
    [21,79,1.46],[22.55,76,0.8],[24,73,2.05],[26.5,70,0.43],[27.05,69,0.85],
    [28,67,1.37],[29.5,74,0.87],[30.5,77,1.28],[32,81,2.48],
    [35,82,1.7],[37,81,0.92],[38,77,0.83],[39,74,1.52],[41,70,0.85],
    [42,69,0.92],[43,73,0.85],[44,76,0.87],[45,79,0.85],[46,82,1.28],[47.5,81,1.28],
    [49,77,1.48],[50.55,76,0.83],[51.55,74,3.24]
  ];
  melody.forEach(([p,n,l], i) => sing(p,n,l,0.16 + (l > 1.4 ? 0.047 : 0), i === 18 ? 1.2 : 0.34));
  pluck(51.58, 74, 0.33, 3);
  pluck(51.66, 50, 0.24, 2, true);
  flashes.sort((a,b) => a.pos - b.pos);

  const dust = Array.from({ length: 150 }, () => ({
    x: random() * 1080, y: random() * 1350, z: random(), phase: random() * tau
  }));
  const sea = ctx.createLinearGradient(0, 0, 800, 1350);
  sea.addColorStop(0, "#163e4b"); sea.addColorStop(0.41, "#082735"); sea.addColorStop(1, "#020e1b");
  const light = ctx.createRadialGradient(380, 45, 20, 380, 45, 1000);
  light.addColorStop(0, "rgba(111,207,174,.2)"); light.addColorStop(1, "rgba(17,66,88,0)");
  const origin = ac.currentTime + 0.046;
  for (const make of actions) make(origin);
  master.gain.setValueAtTime(0.85, origin);
  master.gain.setValueAtTime(0.85, origin + D * 0.947);
  master.gain.exponentialRampToValueAtTime(0.0001, origin + D - 0.012);

  function frame() {
    const t = clamp(ac.currentTime - origin, 0, D), beat = t / tick;
    const phase = beat * tau / 14;
    const yaw = 0.28 * sin(phase * 0.47 - 0.6);
    const roll = -0.14 + 0.13 * sin(phase * 0.56);
    const lift = 0.12 * cos(phase * 0.5);
    const cx = 540 + 48 * sin(phase * 0.39 - 0.4);
    const cy = 668 + 56 * cos(phase * 0.36) - beat * 0.65;
    const active = flashes.filter(f => f.pos <= beat && beat - f.pos < 3.8);
    function project(x,y,z) {
      const X = x * cos(yaw) - z * sin(yaw);
      const Z = z * cos(yaw) + x * sin(yaw);
      const Y = Z * (0.83 + lift) - y * 0.71;
      const k = 1 + y * 0.00042 - Z * 0.00012;
      return [cx + (X * cos(roll) - Y * sin(roll)) * k, cy + (X * sin(roll) + Y * cos(roll)) * k];
    }
    function surface(s,q) {
      const a = abs(s), side = Math.sign(s);
      const lo = -215 + 239 * Math.pow(a,1.49);
      const hi = 24 * a + 211 * Math.pow(1-a,1.66) - 27 * sin(tau*a)*(1-a);
      const z = lo + (hi - lo) * q;
      const y = 62 * Math.exp(-a*a*27) * sin(Math.PI*q)
        + 28 * sin(Math.PI*q) * (1-a)
        + a*a*(104 * sin(phase - 2.7*a - 1.22*q + side*0.18) + 17 * sin(2*phase - 4*a));
      return project(s * (460 - 13 * cos(Math.PI*q)), y, z);
    }
    function line(points,color,width,close=false) {
      ctx.beginPath();
      ctx.moveTo(points[0][0],points[0][1]);
      for (let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
      if(close) ctx.closePath();
      ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
    }
    function dot(p,r,c) {
      ctx.beginPath(); ctx.arc(p[0],p[1],r,0,tau); ctx.fillStyle=c; ctx.fill();
    }
    ctx.save();
    ctx.setTransform(canvas.width / 1080,0,0,canvas.height / 1350,0,0);
    ctx.fillStyle=sea; ctx.fillRect(0,0,1080,1350);
    ctx.fillStyle=light; ctx.fillRect(0,0,1080,1350);
    for (let j=0;j<30;j++) {
      const y=j*48-75;
      const path=[];
      for(let i=0;i<=42;i++){
        const x=i*27;
        path.push([x,y + 21*sin(x*0.005+j*0.21+t*0.13) + 12*cos(x*0.009-j*0.33) + 48*sin(x*0.0018+j*0.25)]);
      }
      line(path,`rgba(104,183,178,${0.037+0.018*cos(j)})`,1.4);
    }
    for (const d of dust) {
      const x = d.x + 17 * sin(t*0.22+d.phase), y = (d.y + t*(4+d.z*13)) % 1360;
      dot([x,y],0.7+1.75*d.z,`rgba(166,225,207,${0.12+0.36*d.z*d.z})`);
    }

    // The tail is a tapering chain. Its lateral wave follows the stroke of the wings.
    const tail = [];
    for(let i=0;i<=76;i++){
      const u=i/76;
      tail.push(project(126*u*u*sin(phase*0.78-u*4.4),17*(1-u)+28*u*sin(phase-u*3),175+470*u));
    }
    for(let i=1;i<tail.length;i++){
      line([tail[i-1],tail[i]], i%5===0 ? "#dba679" : "#477b7c", 1+11*(1-i/76)**2);
    }

    for (const side of [-1,1]) {
      const N=42, M=16;
      const grid=Array.from({length:N+1},(_,i)=>Array.from({length:M+1},(_,j)=>surface(side*i/N,j/M)));
      for(let i=N-1;i>=0;i--){
        const a=(i+0.5)/N;
        let resonance=0;
        for(const f of active){
          const age=beat-f.pos;
          const dist=abs(side*a-f.s);
          resonance+=Math.exp(-abs(dist-age*0.33)*14-age*1.1)*f.amp*1.7;
        }
        for(let j=0;j<M;j++){
          const q=j/M;
          const ridge=0.5+0.5*cos(phase-3*a-2*q+side*0.22);
          const edge=0.5+0.5*sin(i*1.69+j*0.32);
          const gleam=clamp(resonance+0.16*edge,0,1);
          const r=Math.round(14+22*ridge+106*gleam+29*q);
          const g=Math.round(54+48*ridge+53*gleam+13*edge);
          const b=Math.round(66+41*ridge+12*gleam+14*edge);
          ctx.fillStyle=`rgb(${r},${g},${b})`;
          const p=grid[i][j], p1=grid[i+1][j], p2=grid[i+1][j+1], p3=grid[i][j+1];
          ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.fill();
        }
        line(grid[i],`rgba(251,${Math.round(170+gleamColor(resonance))},130,${0.24+0.42*clamp(resonance,0,1)})`,i%4===0?2.8:1.1);
        if(i%3===0) dot(grid[i][2],1.8+resonance,"#f5cb97");
      }
      for(const j of [0,1,4,8,12,15,16]){
        line(grid.map(row=>row[j]),j===0?"#f3c298":j===16?"#78a6a1":"rgba(154,222,202,.42)",j===0?3.6:1.25);
      }
    }
    function gleamColor(v){return 60*clamp(v,0,1);}
    // Twin cephalic fins curl inward like the scrolls of an instrument.
    for(const side of [-1,1]){
      const horn=[];
      for(let i=0;i<=32;i++){
        const u=i/32;
        horn.push(project(side*(50+25*sin(Math.PI*u)-16*u*u),17+24*u*u,-182-81*u+8*sin(phase)*u));
      }
      for(let i=1;i<horn.length;i++)
        line([horn[i-1],horn[i]],i%5===1?"#f5bc8e":"#609e9b",15*(1-i/36)+1.4);
      const eye=surface(side*0.118,0.105);
      dot(eye,8.1,"#06202b"); dot(eye,4.4,"#ffce9c"); dot([eye[0]+1.1,eye[1]-1.1],1.8,"#fff7db");
    }
    for(let j=1;j<18;j++){
      const q=j/19, w=0.023+0.062*sin(q*Math.PI);
      line([surface(-w,q),surface(0,q+0.035),surface(w,q)],"rgba(247,208,154,.8)",2);
    }
    for(const f of active){
      const age=beat-f.pos;
      if(age>2.2)continue;
      const p=surface(f.s,f.q), k=Math.exp(-2.4*age);
      ctx.strokeStyle=`rgba(255,218,164,${0.66*k})`; ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.ellipse(p[0],p[1],4+age*24,2+age*13,roll,0,tau); ctx.stroke();
      dot(p,1.5+4*k,`rgba(255,238,189,${k})`);
    }
    ctx.restore();
    if(t<D) requestAnimationFrame(frame);
  }
  frame();
}