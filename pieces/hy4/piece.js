export const title = "The Glass Astrarium — Passacaglia in Three Verses";

export function start({ audioContext: ac, canvas, duration, random }) {
  const ctx = canvas.getContext("2d"), W = canvas.width || 1080, H = canvas.height || 1350,
        TAU = Math.PI * 2, CX = W / 2, CY = H * 0.445;
  const cl = (x,a,b) => x<a?a:x>b?b:x;
  const sm = (a,b,x) => { const u=cl((x-a)/(b-a),0,1); return u*u*(3-2*u); };
  const bump = (x,a,b,c) => sm(a,b,x)*(1-sm(b,c,x));
  const hsl = (h,s,l,a) => `hsla(${((h%360)+360)%360},${s}%,${l}%,${cl(a==null?1:a,0,1)})`;
  const mf = m => 440*2**((m-69)/12), pol = (r,a) => [Math.cos(a)*r,Math.sin(a)*r];
  if (ac.state === "suspended" && ac.resume) ac.resume();
  const D = duration>0?duration:15, B = D/24, t0 = ac.currentTime+.06, at = b => t0+b*B;

  const NT=4096, nz=new Float32Array(NT);
  for(let i=0;i<NT;i++) nz[i]=random()*2-1;
  const N=i=>nz[i&(NT-1)];
  const mw=a=>ac.createPeriodicWave(new Float32Array(a.length),Float32Array.from(a));
  const WG=mw([0,1,.3,.13,.055,.021,.008]), WR=mw([0,1,.16,.55,.1,.3,.06,.15,.03]), WB=mw([0,1,.34,.1,.04]);

  const bus=ac.createGain(), comp=ac.createDynamicsCompressor(), master=ac.createGain();
  comp.threshold.value=-18; comp.knee.value=20; comp.ratio.value=4; comp.attack.value=.004; comp.release.value=.25;
  bus.connect(comp); comp.connect(master);
  const conv=ac.createConvolver(), wet=ac.createGain(), dry=ac.createGain();
  conv.buffer=impulse(2.9,2.4); conv.normalize=true; wet.gain.value=.3; dry.gain.value=.8;
  master.connect(dry); dry.connect(ac.destination); master.connect(conv); conv.connect(wet); wet.connect(ac.destination);
  const delay=ac.createDelay(1); delay.delayTime.value=B*.75;
  const dlp=ac.createBiquadFilter(), dfb=ac.createGain(), dw=ac.createGain();
  dlp.type="lowpass"; dlp.frequency.value=2600; dfb.gain.value=.3; dw.gain.value=.26;
  delay.connect(dlp); dlp.connect(dfb); dfb.connect(delay); delay.connect(dw); dw.connect(bus);
  const lfo=ac.createOscillator(), vib=ac.createGain(), sink=ac.createGain();
  lfo.frequency.value=5.15; vib.gain.value=3.2; sink.gain.value=0;
  lfo.connect(vib); vib.connect(sink); sink.connect(bus); lfo.start(t0); lfo.stop(t0+D+1);

  const mg=master.gain;
  mg.setValueAtTime(.0001,t0); mg.linearRampToValueAtTime(.86,at(.55));
  mg.setValueAtTime(.86,at(17)); mg.linearRampToValueAtTime(1,at(20.2));
  mg.setValueAtTime(1,at(20.85)); mg.linearRampToValueAtTime(.2,at(21.03));
  mg.setValueAtTime(.2,at(21.82)); mg.linearRampToValueAtTime(.8,at(22.25));
  mg.setValueAtTime(.8,at(22.8)); mg.linearRampToValueAtTime(.0001,at(23.95));

  // One memory, shared by the scheduler and the renderer.
  const notes=[[],[],[],[],[]], ev=[];
  const reg=(v,when,dB,m,amp)=>{const t=when-t0; notes[v].push({t,m}); ev.push({t,v,m,a:amp,s:random()});};
  function pitch(v,t){const L=notes[v];if(!L.length)return 0;let i=0;while(i+1<L.length&&L[i+1].t<=t)i++;
    const c=L[i],n=L[i+1];let m=c.m;if(n){const g=.26*B;if(t>n.t-g){const u=cl((t-(n.t-g))/g,0,1);m=c.m+(n.m-c.m)*u*u*(3-2*u);}}return m;}

  let R=1;
  const VR=[150,250,345], SPD=[TAU/8,-TAU/16,TAU/24], PH=[.45,2.15,4.25], MID=[58,68,80];
  const pos=(vi,tt)=>{const a=-Math.PI/2+(tt/B)*SPD[vi]+PH[vi], r=(VR[vi]+(pitch(vi+1,tt)-MID[vi])*2.4)*R;
    return [Math.cos(a)*r,Math.sin(a)*r];};

  function impulse(sec,dec){
    const sr=ac.sampleRate,len=Math.max(1,Math.floor(sr*sec)),buf=ac.createBuffer(2,len,sr);
    for(let c=0;c<2;c++){const d=buf.getChannelData(c);let l=0,l2=0;
      for(let i=0;i<len;i++){const n=N(i+c*1337+(i>>3));l+=.25*(n-l);l2+=.055*(l-l2);d[i]=(l2*1.7+n*.13)*Math.pow(1-i/len,dec);}
      [.009,.017,.029,.043,.061,.083,.107,.137].forEach((tp,k)=>{const i=Math.floor(sr*tp*(1+c*.09));if(i<len)d[i]+=(.4-k*.043)*(k%2?-1:1);});
      const fa=Math.floor(sr*.005);for(let i=0;i<fa&&i<len;i++)d[i]*=i/fa;}
    return buf;
  }
  function adsr(g,when,dur,peak,a,d,sus,r){
    const A=Math.min(a,dur*.3),Dd=Math.min(d,dur*.3),Rl=Math.min(r,dur*.5),hold=Math.max(A+Dd+.01,dur-Rl),p=g.gain;
    p.setValueAtTime(.0001,when);p.linearRampToValueAtTime(peak,when+A);
    p.linearRampToValueAtTime(peak*sus,when+A+Dd);p.setValueAtTime(peak*sus,when+hold);
    p.exponentialRampToValueAtTime(.0001,when+dur);
  }
  function send(node,p){if(p&&ac.createStereoPanner){const sp=ac.createStereoPanner();sp.pan.value=cl(p,-1,1);node.connect(sp);sp.connect(bus);}else node.connect(bus);}
  const COLL=[57,58,60,61,62,63,64,65,67,69,70,72,73,74,76,77,79,81,82,84,85,86,88];
  function step(from,to){const i=COLL.indexOf(from),j=COLL.indexOf(to);if(i<0||j<0)return from;
    if(j>i)return COLL[Math.min(i+1,j)];if(j<i)return COLL[Math.max(i-1,j)];
    return COLL[cl(i+(random()<.5?1:-1),0,COLL.length-1)];}

  // Voices: bowed glass, hollow reed, ground, inharmonic bell, escapement pip.
  function glass(when,dB,m,amp,p){const dur=dB*B,F=mf(m),lp=ac.createBiquadFilter(),g=ac.createGain();
    lp.type="lowpass";lp.Q.value=.6;lp.frequency.setValueAtTime(5200,when);lp.frequency.exponentialRampToValueAtTime(1700,when+dur);
    adsr(g,when,dur,amp,.16*B,.26*B,.7,.75*B);
    for(let k=0;k<2;k++){const o=ac.createOscillator();o.setPeriodicWave(WG);o.frequency.value=F;o.detune.value=k?6.5:-2;
      vib.connect(o.detune);o.connect(lp);o.start(when);o.stop(when+dur+.06);}
    lp.connect(g);send(g,p);reg(3,when,dB,m,amp);}
  function reed(when,dB,m,amp,p){const dur=dB*B,lp=ac.createBiquadFilter(),g=ac.createGain(),o=ac.createOscillator();
    lp.type="lowpass";lp.Q.value=.9;lp.frequency.setValueAtTime(2400,when);lp.frequency.exponentialRampToValueAtTime(1050,when+dur);
    adsr(g,when,dur,amp,.06*B,.22*B,.62,.42*B);
    o.setPeriodicWave(WR);o.frequency.value=mf(m);vib.connect(o.detune);o.connect(lp);lp.connect(g);send(g,p);
    o.start(when);o.stop(when+dur+.05);reg(2,when,dB,m,amp);}
  function bass(when,m,dB,coda){const dur=dB*B,F=mf(m),peak=coda?.16:.12,lp=ac.createBiquadFilter(),g=ac.createGain(),
    o=ac.createOscillator(),sub=ac.createOscillator(),sg=ac.createGain();
    lp.type="lowpass";lp.frequency.value=coda?520:250;lp.Q.value=.7;adsr(g,when,dur,peak,.12*B,.3*B,.78,B);
    o.setPeriodicWave(WB);o.frequency.value=F;sub.type="sine";sub.frequency.value=F/2;sg.gain.value=.55;
    o.connect(lp);sub.connect(sg);sg.connect(lp);lp.connect(g);send(g,0);
    o.start(when);sub.start(when);o.stop(when+dur+.05);sub.stop(when+dur+.05);reg(0,when,dB,m,peak);}
  const RA=[1,2.004,3.013,4.21],PA=[1,.4,.2,.09];
  function bell(when,m,amp,p,dB,fx,v){when=Math.max(t0,when+(random()-.5)*.016*B);const F=mf(m),dur=dB*B,mix=ac.createGain();mix.gain.value=1;
    for(let k=0;k<4;k++){const o=ac.createOscillator(),g=ac.createGain(),end=dur*Math.max(.28,1-k*.19);
      o.type="sine";o.frequency.value=F*RA[k];g.gain.setValueAtTime(.0001,when);
      g.gain.linearRampToValueAtTime(amp*PA[k],when+.004*B);g.gain.exponentialRampToValueAtTime(.0001,when+end);
      o.connect(g);g.connect(mix);o.start(when);o.stop(when+end+.03);}
    send(mix,p);if(fx>0){const s=ac.createGain();s.gain.value=fx;mix.connect(s);s.connect(delay);}reg(v,when,dB,m,amp);}
  function pip(when,amp){const o=ac.createOscillator(),g=ac.createGain();o.type="sine";o.frequency.value=2637;
    g.gain.setValueAtTime(.0001,when);g.gain.linearRampToValueAtTime(amp,when+.003);
    g.gain.exponentialRampToValueAtTime(.0001,when+.1);o.connect(g);send(g,0);o.start(when);o.stop(when+.13);}

  // Eight-beat ground: D D F G A G Eb C# -> D. Three verses, a caesura, a return.
  const GROUND=[38,38,41,43,45,43,39,37], CH=[
    [50,53,57,60],[50,53,57,60],[53,57,60,65],[55,58,62,67],
    [57,61,64,69],[55,58,62,67],[51,55,58,63],[49,52,55,58]];
  for(let b=0;b<=20;b++)bass(at(b),GROUND[b%8],.98,false);
  bass(at(22),38,2.2,true);
  const CAN=[[0,2,74],[2,2,77],[4,2,81],[6,1,79],[7,1,76],[8,2,81],[10,2,84],[12,1,82],[13,1,81],
    [14,1,82],[15,1,79],[16,1.5,84],[17.5,.5,86],[18,1,88],[19,1,86],[20,1,85],[22,2.15,74]];
  for(const [b,d,m] of CAN)glass(at(b),d,m,b<8?.085:b<16?.098:b<22?.112:.09,cl(-.28+.56*b/24+.08*Math.sin(b*.7),-.6,.6));
  reed(at(0),2,62,.05,-.32);reed(at(4),2,69,.055,-.32);reed(at(7),1,61,.046,-.32);
  const ALT=[62,65,65,67,69,67,63,61,62,65,69,70,73,70,70,67,69,72,74,70,73,74];
  for(let b=8;b<=20;b++){const t=ALT[b],nx=ALT[b+1],mid=step(t,nx),a=b<16?.062:.075;
    reed(at(b),.5,t,a,-.34);if(b>=18)reed(at(b+.25),.25,step(t,mid),a*.45,-.34);
    reed(at(b+.5),.5,mid,a*.8,-.34);if(b>=18)reed(at(b+.75),.25,step(mid,nx),a*.45,-.34);}
  reed(at(22),2.15,74,.052,-.30);
  const O2=[0,2],O3=[0,2,1],O4=[0,2,1,3];
  for(let b=0;b<=20;b++){let n,offs,ord,amp;
    if(b<8){if(b!==0&&b!==4&&b!==7)continue;n=2;offs=[0,.5];ord=O2;amp=.052;}
    else if(b<16){n=3;offs=[0,1/3,2/3];ord=O3;amp=.07;}
    else{n=4;offs=[0,.25,.5,.75];ord=O4;amp=.082;}
    const set=CH[b%8];for(let k=0;k<n;k++){let m=set[(ord[k]+b)%set.length];if(n===4&&k===3&&b%2===0)m+=12;
      bell(at(b+offs[k]),m,amp*(.85+.3*random()),k%2?.48:-.48,1.5,.22,1);}}
  for(let b=16;b<=20;b++){const set=CH[b%8].map(m=>m+24),c=b===20?5:3;
    for(let k=0;k<c;k++){const off=cl(.12+k*(.8/c)+(random()-.5)*.07,0,.95),m=set[(random()*set.length)|0]+(random()<.28?12:0);
      bell(at(b+off),m,.03+.022*random(),(random()-.5)*1.5,1.9,.55,4);}}
  bell(at(21.05),86,.045,0,3.2,.7,4);
  [62,65,69,74].forEach((m,i)=>bell(at(22+i*.42),m,.055-i*.007,i%2?.4:-.4,2.4,.4,1));
  [[22.35,86],[22.8,81],[23.25,74]].forEach(([b,m],i)=>bell(at(b),m,.038-i*.008,(i-1)*.4,2.6,.6,4));
  [0,8,16].forEach((b,i)=>bell(at(b),[38,43,45][i],.055,0,2.6,.18,0));
  for(let b=0;b<=23;b++)pip(at(b),.0045+.002*b/24);

  // Breathing air and a felt low D.
  const alen=Math.floor(ac.sampleRate*3),abuf=ac.createBuffer(1,alen,ac.sampleRate),ad=abuf.getChannelData(0);let alp=0;
  for(let i=0;i<alen;i++){const n=N(i*3+77);alp+=.12*(n-alp);ad[i]=alp*3+n*.15;}
  const air=ac.createBufferSource(),abp=ac.createBiquadFilter(),ag=ac.createGain();
  air.buffer=abuf;air.loop=true;abp.type="bandpass";abp.Q.value=.6;air.connect(abp);abp.connect(ag);send(ag,0);
  ag.gain.setValueAtTime(.0001,t0);ag.gain.linearRampToValueAtTime(.012,at(8));ag.gain.linearRampToValueAtTime(.03,at(16));
  ag.gain.linearRampToValueAtTime(.055,at(20.5));ag.gain.linearRampToValueAtTime(.075,at(21.2));
  ag.gain.linearRampToValueAtTime(.02,at(22.5));ag.gain.linearRampToValueAtTime(.0001,at(24.1));
  abp.frequency.setValueAtTime(320,t0);abp.frequency.linearRampToValueAtTime(1400,at(20.5));abp.frequency.linearRampToValueAtTime(380,at(24));
  air.start(t0);air.stop(at(24.2));
  const drone=ac.createOscillator(),dg=ac.createGain();drone.type="sine";drone.frequency.value=mf(38);
  dg.gain.setValueAtTime(.0001,t0);dg.gain.linearRampToValueAtTime(.018,at(8));dg.gain.linearRampToValueAtTime(.03,at(20));
  dg.gain.linearRampToValueAtTime(.01,at(22));dg.gain.linearRampToValueAtTime(.0001,at(24));
  drone.connect(dg);send(dg,0);drone.start(t0);drone.stop(at(24.2));

  // The astrarium: one revolution of the hand is the whole piece.
  const stars=[],motes=[],grain=[];
  for(let i=0;i<230;i++)stars.push({x:random()*W,y:random()*H,r:.35+random()*1.5,a:.05+random()*.3,
    ph:random()*TAU,sp:.3+random()*.9,d:.25+random()*.7});
  for(let i=0;i<64;i++)motes.push({x:random()*W,y:random()*H,s:.2+random()*.8,r:.6+random()*1.7,
    ph:random()*TAU,a:.04+random()*.12});
  for(let i=0;i<420;i++)grain.push([(random()*W)|0,(random()*H)|0]);
  const hueAt=p=>p<.33?222+10*Math.sin(p*10):p<.66?222+(36-222)*((p-.33)/.33):
    p<.87?36+(346-36)*((p-.66)/.21):346+(222-346)*((p-.87)/.13);

  function draw(){
    const t=ac.currentTime-t0,p=cl(t/D,0,1),b=t/B,hue=hueAt(p),
      build=sm(0,.78,p),climax=bump(p,.66,.84,.93),hush=bump(p,.862,.882,.906),collapse=sm(.925,1,p),
      bright=(.3+.62*build+.42*climax)*(1-.72*hush),fade=1-collapse,A=bright*fade,
      verse=p<1/3?0:p<2/3?1:2;
    R=1-.1*collapse;
    ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#04070e");bg.addColorStop(.52,"#080c16");bg.addColorStop(1,"#03050a");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    const gl=ctx.createRadialGradient(CX,CY,0,CX,CY,640);
    gl.addColorStop(0,hsl(hue,62,24,.3*bright));gl.addColorStop(.45,hsl(hue,58,13,.14*bright));gl.addColorStop(1,hsl(hue,50,8,0));
    ctx.fillStyle=gl;ctx.fillRect(0,0,W,H);
    for(const s of stars){const tw=.55+.45*Math.sin(t*s.sp+s.ph);let x=(s.x+t*3.4*(1-s.d))%W;if(x<0)x+=W;
      ctx.globalAlpha=s.a*tw*(.45+.55*bright);ctx.fillStyle="#cfe0ff";ctx.beginPath();ctx.arc(x,s.y,s.r,0,TAU);ctx.fill();}
    ctx.globalAlpha=1;
    for(const m of motes){let y=(m.y-t*9*m.s)%H;if(y<0)y+=H;const x=m.x+14*Math.sin(t*.35*m.s+m.ph);
      ctx.fillStyle=hsl(hue,45,78,m.a*bright*(.6+.4*Math.sin(t*1.3+m.ph)));
      ctx.beginPath();ctx.arc(x,y,m.r,0,TAU);ctx.fill();}
    ctx.save();ctx.translate(CX,CY);ctx.globalCompositeOperation="lighter";
    const Ro=430*R;
    ctx.lineWidth=1;ctx.strokeStyle=hsl(hue,32,62,.13*A);ctx.beginPath();ctx.arc(0,0,Ro,0,TAU);ctx.stroke();
    for(let v=0;v<3;v++){const a0=-Math.PI/2+v*TAU/3+.03,a1=-Math.PI/2+(v+1)*TAU/3-.03;
      ctx.strokeStyle=hsl(hue+v*16,50,68,(v<=verse?.32:.09)*A);ctx.lineWidth=v===verse?2.2:1.1;
      ctx.beginPath();ctx.arc(0,0,Ro+11,a0,a1);ctx.stroke();}
    for(let i=0;i<24;i++){const a=-Math.PI/2+i*TAU/24,major=i%8===0,on=i<=b,
      q0=pol(Ro-(major?18:9),a),q1=pol(Ro+(major?7:3),a);
      ctx.strokeStyle=hsl(hue,52,on?80:48,(on?.55:.16)*A);ctx.lineWidth=major?1.9:1;
      ctx.beginPath();ctx.moveTo(q0[0],q0[1]);ctx.lineTo(q1[0],q1[1]);ctx.stroke();}
    const ha=-Math.PI/2+b/24*TAU;
    for(let k=0;k<26;k++){const a1=ha-k*.022,a0=a1-.026;ctx.strokeStyle=hsl(hue,85,84,(1-k/26)*.26*A);
      ctx.lineWidth=2.6*(1-k/26)+.35;ctx.beginPath();ctx.arc(0,0,Ro-5,a0,a1);ctx.stroke();}
    const hq=pol(Ro-6,ha);ctx.strokeStyle=hsl(hue,80,90,.62*A);ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(hq[0],hq[1]);ctx.stroke();
    ctx.shadowBlur=16;ctx.shadowColor=hsl(hue,90,80,.9);ctx.fillStyle=hsl(hue,90,94,.9*A);
    ctx.beginPath();ctx.arc(hq[0],hq[1],4.2,0,TAU);ctx.fill();ctx.shadowBlur=0;
    for(let v=0;v<3;v++){ctx.strokeStyle=hsl(hue+v*18,34,58,.1*A);ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(0,0,VR[v]*R,0,TAU);ctx.stroke();
      let started=false;ctx.beginPath();
      for(let k=34;k>=0;k--){const tt=t-k*.048;if(tt<0)continue;const q=pos(v,tt);
        if(!started){ctx.moveTo(q[0],q[1]);started=true;}else ctx.lineTo(q[0],q[1]);}
      ctx.strokeStyle=hsl(hue+v*18,70,72,(.13+.16*climax)*A);ctx.lineWidth=1.4;ctx.stroke();}
    const PP=[pos(0,t),pos(1,t),pos(2,t)];
    for(let i=0;i<3;i++){const a=PP[i],c=PP[(i+1)%3],mx=(a[0]+c[0])*.5,my=(a[1]+c[1])*.5;
      ctx.strokeStyle=hsl(hue+38,60,74,(.1+.16*climax)*A);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.quadraticCurveTo(mx*.3,my*.3,c[0],c[1]);ctx.stroke();}
    for(let v=0;v<3;v++){const q=PP[v];ctx.shadowBlur=20;ctx.shadowColor=hsl(hue+v*18,90,72,.75);
      ctx.fillStyle=hsl(hue+v*18,88,86,.92*A);ctx.beginPath();ctx.arc(q[0],q[1],4+1.3*Math.sin(t*2.2+v),0,TAU);ctx.fill();
      ctx.shadowBlur=0;ctx.fillStyle=hsl(0,0,100,.55*A);ctx.beginPath();ctx.arc(q[0],q[1],1.5,0,TAU);ctx.fill();}
    let pulse=0;for(const e of ev)if(e.v===0&&t-e.t>=0&&t-e.t<.55)pulse=Math.max(pulse,1-(t-e.t)/.55);
    const cg=ctx.createRadialGradient(0,0,0,0,0,95*R);
    cg.addColorStop(0,hsl(hue,85,80,.42*bright));cg.addColorStop(.42,hsl(hue,75,55,.16*bright));cg.addColorStop(1,hsl(hue,70,40,0));
    ctx.fillStyle=cg;ctx.beginPath();ctx.arc(0,0,95*R,0,TAU);ctx.fill();
    for(const e of ev){if(e.v!==0)continue;const age=t-e.t;if(age<0||age>1.15)continue;
      ctx.strokeStyle=hsl(hue,72,78,(1-age/1.15)*.28*bright*fade);ctx.lineWidth=1.2;
      ctx.beginPath();ctx.arc(0,0,(30+age*250)*R,0,TAU);ctx.stroke();}
    const gi=((Math.floor(b)%8)+8)%8;
    for(let i=0;i<8;i++){const q=pol(64*R,-Math.PI/2+i*TAU/8+t*.1),on=i===gi;
      ctx.fillStyle=hsl(hue,72,on?94:60,(on?.95:.26)*bright*fade);
      ctx.beginPath();ctx.arc(q[0],q[1],on?5.4:2.5,0,TAU);ctx.fill();}
    ctx.fillStyle=hsl(hue,60,90,(.6+.35*pulse)*bright);ctx.beginPath();ctx.arc(0,0,(13+7*pulse)*R,0,TAU);ctx.fill();
    for(const e of ev){if(e.v===0)continue;const age=t-e.t;if(age<0||age>.85)continue;
      let q;if(e.v===4){const a=-Math.PI/2+(e.m-74)/26*TAU+e.s*.6;q=pol(405*R,a);}else q=pos(e.v-1,e.t);
      const rr=3+age*52,al=(1-age/.85)*cl(e.a*9,0,.8)*bright*fade;
      ctx.strokeStyle=hsl(hue+(e.v-1)*20+22,82,82,al);ctx.lineWidth=1.1;
      ctx.beginPath();ctx.arc(q[0],q[1],rr,0,TAU);ctx.stroke();
      ctx.fillStyle=hsl(hue+(e.v-1)*20+22,90,90,al*.7);ctx.beginPath();ctx.arc(q[0],q[1],1.6,0,TAU);ctx.fill();}
    if(collapse>.001){ctx.strokeStyle=hsl(hue,60,92,collapse*.4);ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(0,0,(28+430*collapse)*R,0,TAU);ctx.stroke();
      ctx.shadowBlur=30;ctx.shadowColor=hsl(hue,80,90,.9);ctx.fillStyle=hsl(hue,20,100,.5+.5*collapse);
      ctx.beginPath();ctx.arc(0,0,3.2,0,TAU);ctx.fill();ctx.shadowBlur=0;}
    ctx.restore();
    const vg=ctx.createRadialGradient(CX,CY,H*.18,CX,CY,H*.85);
    vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,.72)");ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
    ctx.fillStyle="rgba(230,238,255,.03)";const go=(t*7)%H;
    for(const g of grain){let y=g[1]+go;if(y>=H)y-=H;ctx.fillRect(g[0],y,1,1);}
    ctx.textBaseline="alphabetic";
    ctx.textAlign="left";ctx.font="500 16px 'Helvetica Neue',Helvetica,Arial,sans-serif";
    if("letterSpacing" in ctx)ctx.letterSpacing="6px";ctx.fillStyle="rgba(214,228,248,.34)";ctx.fillText("ASTRARIUM",64,66);
    ctx.textAlign="right";ctx.font="12px ui-monospace,Menlo,Consolas,monospace";
    if("letterSpacing" in ctx)ctx.letterSpacing="2px";ctx.fillStyle="rgba(198,214,238,.3)";
    ctx.fillText(String(Math.min(24,Math.max(0,Math.floor(b)+1))).padStart(2,"0")+" / 24",W-64,66);
    const by=H-158;ctx.strokeStyle="rgba(206,222,244,.13)";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(64,by);ctx.lineTo(W-64,by);ctx.stroke();
    ctx.textAlign="center";ctx.font="italic 36px 'Iowan Old Style',Palatino,'Times New Roman',serif";
    if("letterSpacing" in ctx)ctx.letterSpacing="0px";ctx.fillStyle="rgba(238,242,252,.88)";ctx.fillText("The Glass Astrarium",CX,by+56);
    ctx.font="12px 'Helvetica Neue',Helvetica,Arial,sans-serif";
    if("letterSpacing" in ctx)ctx.letterSpacing="4px";ctx.fillStyle="rgba(200,216,240,.38)";
    ctx.fillText("PASSACAGLIA IN THREE VERSES",CX,by+92);
    for(let i=0;i<3;i++){const on=i===verse;ctx.fillStyle=on?hsl(hue,75,82,.9):"rgba(200,216,240,.2)";
      ctx.beginPath();ctx.arc(CX+(i-1)*24,by+124,on?3.4:2.2,0,TAU);ctx.fill();}
  }
  draw();
  if(typeof requestAnimationFrame==="function"){
    const loop=()=>{draw();if(ac.currentTime-t0<D+.5)requestAnimationFrame(loop);};requestAnimationFrame(loop);
  }else{const iv=setInterval(()=>{if(ac.currentTime-t0>D+.5)clearInterval(iv);else draw();},16);}
}
