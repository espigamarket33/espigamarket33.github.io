/* Shomav369 · motor de juegos v2 (meta: racha, XP, misiones, logros, skins, récords, efectos y sonido) */
(function(){
'use strict';
const S=window.S={};
const LS=(k,d)=>{try{const v=localStorage.getItem('shv2_'+k);return v?JSON.parse(v):d}catch(e){return d}};
const SV=(k,v)=>{try{localStorage.setItem('shv2_'+k,JSON.stringify(v))}catch(e){}};
S.load=LS;S.save=SV;
const $=(h)=>{const t=document.createElement('template');t.innerHTML=h.trim();return t.content.firstElementChild};
S.el=$;
const esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
S.esc=esc;
S.fmt=n=>Math.floor(n).toLocaleString('es-MX');
S.short=n=>n>=1e9?(n/1e9).toFixed(2)+'B':n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e4?(n/1e3).toFixed(1)+'K':S.fmt(n);
const today=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()};
const dayNum=s=>{const [y,m,d]=s.split('-').map(Number);return Math.round(new Date(y,m-1,d).getTime()/864e5)};

/* ---------- perfil global (compartido entre los 3 juegos) ---------- */
const P=S.profile=LS('profile',{xp:0,lvl:1,gems:0,streak:0,lastDay:'',bestStreak:0,name:'',mute:false,tut:{}});
const saveP=()=>SV('profile',P);
S.need=l=>40+l*20; /* curva suave: cada nivel está siempre cerca */

/* ---------- datos por juego ---------- */
let G,cfg;
S.data=()=>G;
const saveG=()=>SV('g_'+cfg.id,G);S.saveG=saveG;

/* ---------- sonido (WebAudio, sin archivos) ---------- */
let AC=null,master=null;
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=.35;master.connect(AC.destination)}catch(e){}}if(AC&&AC.state==='suspended')AC.resume();return AC}
['pointerdown','touchstart','keydown'].forEach(ev=>addEventListener(ev,()=>ac(),{once:true,passive:true}));
function tone(f,d,type,vol,slide,delay){const a=ac();if(!a||P.mute)return;const t=a.currentTime+(delay||0);const o=a.createOscillator(),g=a.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol||.5,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(master);o.start(t);o.stop(t+d+.05)}
function noise(d,vol,hp){const a=ac();if(!a||P.mute)return;const b=a.createBuffer(1,a.sampleRate*d,a.sampleRate),c=b.getChannelData(0);for(let i=0;i<c.length;i++)c[i]=(Math.random()*2-1)*(1-i/c.length);const s=a.createBufferSource();s.buffer=b;const f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=hp||1200;const g=a.createGain();g.gain.value=vol||.6;s.connect(f);f.connect(g);g.connect(master);s.start()}
const SFX={
 tap:p=>tone(520+(p||0)*40,.07,'square',.18,900+(p||0)*40),
 click:()=>tone(800,.04,'triangle',.25,1200),
 coin:p=>{const b=880*Math.pow(1.059,Math.min(p||0,14));tone(b,.08,'square',.2);tone(b*1.5,.18,'square',.2,null,.07)},
 gem:()=>{[1319,1568,2093].forEach((f,i)=>tone(f,.15,'sine',.3,null,i*.06))},
 hit:()=>{noise(.35,.9,900);tone(220,.4,'sawtooth',.4,40)},
 bad:()=>{tone(330,.15,'square',.25,250);tone(220,.3,'square',.25,150,.14)},
 good:()=>{tone(660,.08,'square',.22);tone(990,.16,'square',.22,null,.08)},
 power:()=>{[523,659,784,1047].forEach((f,i)=>tone(f,.12,'square',.2,null,i*.05))},
 whoosh:()=>{noise(.25,.35,3000)},
 lvl:()=>{[523,659,784,1047,1319].forEach((f,i)=>tone(f,.2,'triangle',.35,null,i*.09))},
 record:()=>{[784,784,784,1047,988,1047,1319].forEach((f,i)=>tone(f,.16,'square',.22,null,[0,.1,.2,.32,.5,.6,.72][i]))},
 chest:()=>{for(let i=0;i<8;i++)tone(800+i*180,.1,'sine',.2,null,i*.05)},
 tick:()=>tone(1400,.03,'square',.12),
 near:()=>{tone(1200,.06,'sine',.25,1800)},
 combo:p=>tone(400+Math.min(p,20)*60,.12,'sawtooth',.18,800+Math.min(p,20)*60)
};
S.sfx=(n,p)=>{try{SFX[n]&&SFX[n](p)}catch(e){}};
S.vib=p=>{try{if(navigator.vibrate)navigator.vibrate(p)}catch(e){}};

/* ---------- efectos: partículas, confeti, flotantes, sacudida ---------- */
let fx,fc,parts=[],fxRun=false;
function fxInit(){fx=$('<canvas id="fx"></canvas>');document.body.appendChild(fx);fc=fx.getContext('2d');const r=()=>{fx.width=innerWidth*devicePixelRatio;fx.height=innerHeight*devicePixelRatio;fc.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)};addEventListener('resize',r);r();document.body.appendChild($('<div id="flash"></div>'));document.body.appendChild($('<div id="toasts"></div>'))}
function fxLoop(){fc.clearRect(0,0,innerWidth,innerHeight);parts=parts.filter(p=>p.life>0);for(const p of parts){p.life-=1/60;p.vx*=p.drag;p.vy=p.vy*p.drag+p.g;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;const a=Math.max(0,Math.min(1,p.life/p.max*1.5));fc.globalAlpha=a;fc.save();fc.translate(p.x,p.y);fc.rotate(p.rot);if(p.emoji){fc.font=p.s+'px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';fc.textAlign='center';fc.textBaseline='middle';fc.fillText(p.emoji,0,0)}else if(p.conf){fc.fillStyle=p.c;fc.fillRect(-p.s/2,-p.s/4,p.s,p.s/2)}else{fc.fillStyle=p.c;fc.shadowColor=p.c;fc.shadowBlur=10;fc.beginPath();fc.arc(0,0,p.s*a,0,7);fc.fill()}fc.restore()}fc.globalAlpha=1;if(parts.length)requestAnimationFrame(fxLoop);else fxRun=false}
function addP(p){parts.push(p);if(!fxRun){fxRun=true;requestAnimationFrame(fxLoop)}}
const PAL=['#FFD400','#ff3ea5','#29e6ff','#3dff8a','#ffffff','#ff8a00'];
S.burst=(x,y,o)=>{o=o||{};const n=o.n||18,cs=o.colors||PAL;for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=(o.speed||6)*(.4+Math.random());addP({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-(o.up||1),g:o.g??.18,drag:.96,s:o.size||(3+Math.random()*4),c:cs[i%cs.length],life:.6+Math.random()*.6,max:1,rot:0,vr:0,emoji:o.emoji})}};
S.confetti=(n)=>{n=n||140;for(let i=0;i<n;i++){addP({x:Math.random()*innerWidth,y:-20-Math.random()*innerHeight*.5,vx:(Math.random()-.5)*4,vy:2+Math.random()*4,g:.06,drag:.99,s:8+Math.random()*8,c:PAL[i%PAL.length],life:3+Math.random()*1.5,max:4,rot:Math.random()*6,vr:(Math.random()-.5)*.3,conf:true})}};
S.float=(x,y,t,c,size)=>{const e=$('<div class="floater"></div>');e.textContent=t;e.style.left=x+'px';e.style.top=y+'px';e.style.color=c||'#FFD400';if(size)e.style.fontSize=size+'px';document.body.appendChild(e);setTimeout(()=>e.remove(),1000)};
S.shake=(el)=>{el=el||document.body;el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake')};
S.flash=(c,a)=>{const f=document.getElementById('flash');f.style.transition='none';f.style.background=c||'#fff';f.style.opacity=a||.5;requestAnimationFrame(()=>{f.style.transition='opacity .4s';f.style.opacity=0})};
S.banner=(t,sub)=>{const b=$('<div class="banner"></div>');b.innerHTML=(sub?'<small>'+esc(sub)+'</small>':'')+esc(t);document.body.appendChild(b);setTimeout(()=>b.remove(),1900)};
S.countTo=(el,to,ms)=>{const from=+(el.dataset.v||0);el.dataset.v=to;const st=performance.now();ms=ms||600;const f=t=>{const k=Math.min(1,(t-st)/ms),e=1-Math.pow(1-k,3);el.textContent=S.fmt(from+(to-from)*e);if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)};
S.toast=(icon,head,txt)=>{const t=$('<div class="toast"><div class="ic"></div><div><b></b><span></span></div></div>');t.querySelector('.ic').textContent=icon;t.querySelector('b').textContent=head;t.querySelector('span').textContent=txt;document.getElementById('toasts').appendChild(t);setTimeout(()=>t.remove(),3300)};

/* ---------- modales ---------- */
S.modal=(html,opt)=>{opt=opt||{};const m=$('<div class="modal"><div class="box">'+(opt.close!==false?'<button class="x" aria-label="Cerrar">✕</button>':'')+html+'</div></div>');document.body.appendChild(m);const close=()=>{m.remove();opt.onClose&&opt.onClose()};m.close=close;const x=m.querySelector('.x');if(x)x.onclick=()=>{S.sfx('click');close()};if(opt.close!==false)m.addEventListener('click',e=>{if(e.target===m)close()});return m};

/* ---------- barra superior ---------- */
let bar;
function barInit(){bar=$('<div id="sbar"><a class="pill only-site" href="index.html" style="text-decoration:none;color:#fff">←</a><div class="lv"><div class="lvb"><span id="sLv">1</span></div><div class="xpw"><div class="xpt" id="sXt"></div><div class="xpbar"><div id="sXb"></div></div></div></div><span class="pill btnp" id="sStreak" title="Racha diaria">🔥 <span id="sSt">0</span></span><span class="pill" id="sGems" title="Gemas del juego">💎 <span id="sGm">0</span></span><button class="pill btnp" id="sMute" style="color:#fff">🔊</button></div>');document.body.insertBefore(bar,document.body.firstChild);
 bar.querySelector('#sMute').onclick=()=>{P.mute=!P.mute;saveP();updBar();if(!P.mute)S.sfx('click')};
 bar.querySelector('#sStreak').onclick=()=>dailyModal(false);
 updBar()}
function updBar(){if(!bar)return;const n=S.need(P.lvl);bar.querySelector('#sLv').textContent=P.lvl;bar.querySelector('.lvb').style.setProperty('--pct',(P.xp/n*100)+'%');bar.querySelector('#sXb').style.width=(P.xp/n*100)+'%';bar.querySelector('#sXt').textContent='Nivel '+P.lvl+' · faltan '+(n-P.xp)+' XP';bar.querySelector('#sSt').textContent=P.streak;bar.querySelector('#sGm').textContent=S.fmt(P.gems);bar.querySelector('#sMute').textContent=P.mute?'🔇':'🔊'}
S.updBar=updBar;
S.addGems=(n,x,y)=>{P.gems+=n;saveP();updBar();const g=document.getElementById('sGems');if(g){g.classList.remove('bump');void g.offsetWidth;g.classList.add('bump')}if(x!=null)S.float(x,y,'+'+n+' 💎','#29e6ff')};
S.spend=n=>{if(P.gems<n)return false;P.gems-=n;saveP();updBar();return true};
S.addXP=(n)=>{P.xp+=Math.round(n);let up=false;while(P.xp>=S.need(P.lvl)){P.xp-=S.need(P.lvl);P.lvl++;up=true;const r=10+P.lvl*5;P.gems+=r;setTimeout(()=>{S.sfx('lvl');S.confetti(90);S.banner('¡NIVEL '+P.lvl+'!','SUBISTE DE NIVEL');S.toast('⬆️','Nivel '+P.lvl,'+'+r+' 💎 de premio');checkSkinUnlocks()},300)}saveP();updBar();return up};

/* ---------- racha diaria con premios crecientes ---------- */
const DAILY=[10,15,25,35,50,75,'🎁'];
function dailyCheck(){const t=today();if(P.lastDay===t)return false;const diff=P.lastDay?dayNum(t)-dayNum(P.lastDay):99;const broke=P.lastDay&&diff>1;P.streak=diff===1?P.streak+1:1;P.bestStreak=Math.max(P.bestStreak||0,P.streak);P.lastDay=t;P.claimed=false;saveP();updBar();dailyModal(true,broke);return true}
function dailyModal(fresh,broke){const idx=(Math.max(1,P.streak)-1)%7;let cells='';DAILY.forEach((r,i)=>{cells+='<div class="day '+(i<idx?'done ':'')+(i===idx?'now ':'')+(i===6?'d7':'')+'">Día '+(i+1)+'<b>'+(r==='🎁'?'🎁':'💎')+'</b>'+(r==='🎁'?'Cofre sorpresa':r)+'</div>'});
 const can=!P.claimed;const m=S.modal('<div class="big-emoji">🔥</div><h2>Racha de '+P.streak+' día'+(P.streak==1?'':'s')+'</h2><p class="muted">'+(broke?'Tu racha se reinició. ¡Hoy empiezas otra vez!':'Entra cada día y el premio crece. El día 7 hay cofre.')+'</p><div class="days">'+cells+'</div>'+(can?'<button class="btn big" id="dClaim">¡Recoger premio!</button>':'<p class="muted">Ya recogiste el premio de hoy. Vuelve mañana por el siguiente.</p>')+'<p class="muted" style="margin-top:10px">Las gemas 💎 son del juego y no tienen valor en dinero.</p>');
 const b=m.querySelector('#dClaim');if(b)b.onclick=()=>{P.claimed=true;saveP();const r=DAILY[idx];const rc=b.getBoundingClientRect();m.close();if(r==='🎁')S.chest('Cofre del día 7',2);else{S.sfx('gem');S.burst(rc.left+rc.width/2,rc.top,{n:30});S.addGems(r,innerWidth/2,innerHeight/2);S.addXP(10)}}}
S.daily=()=>dailyModal(false);

/* ---------- cofre sorpresa (recompensa variable) ---------- */
S.chest=(title,tier)=>new Promise(res=>{tier=tier||1;const m=S.modal('<h2>'+esc(title||'¡Cofre sorpresa!')+'</h2><p class="muted">Toca el cofre para abrirlo</p><div class="rays" style="margin:30px 0"><span class="chest" id="chB">🎁</span></div><div id="chR" style="min-height:70px"></div>',{close:false});
 const ch=m.querySelector('#chB');let taps=0;ch.onclick=()=>{taps++;S.sfx('tap',taps*3);S.vib(20);ch.style.transform='scale('+(1+taps*.12)+') rotate('+(taps%2?-10:10)+'deg)';if(taps<3)return;ch.onclick=null;
  const r=Math.random();let gems,label;const k=tier;if(r<.05){gems=150*k;label='¡PREMIO MAYOR!'}else if(r<.2){gems=60*k;label='¡Súper premio!'}else if(r<.5){gems=25*k;label='¡Buen premio!'}else{gems=10*k;label='¡Premio!'}
  ch.textContent='✨';S.sfx('chest');S.vib([30,40,60]);const rc=ch.getBoundingClientRect();S.burst(rc.left+rc.width/2,rc.top+rc.height/2,{n:60,speed:9});if(gems>=60*k)S.confetti(120);
  m.querySelector('#chR').innerHTML='<div style="font-size:14px;color:var(--y);font-weight:900">'+label+'</div><div class="score-big">+'+gems+' 💎</div><button class="btn" id="chOk">¡Genial!</button>';
  S.addGems(gems);S.addXP(15);m.querySelector('#chOk').onclick=()=>{m.close();res(gems)}}});

/* ---------- estadísticas, misiones y logros ---------- */
function dayMissions(){const t=today();if(G.mis&&G.mis.day===t)return;let seed=dayNum(t)*9301+cfg.id.length*49297;const rnd=()=>(seed=(seed*9301+49297)%233280)/233280;const pool=[...cfg.missions];const pick=[];while(pick.length<3&&pool.length)pick.push(pool.splice(Math.floor(rnd()*pool.length),1)[0].id);G.mis={day:t,list:pick.map(id=>({id,p:0,done:false}))};saveG()}
const mDef=id=>cfg.missions.find(m=>m.id===id);
function missionProg(stat,v,isMax){let ch=false;for(const m of G.mis.list){const d=mDef(m.id);if(!d||m.done||d.stat!==stat)continue;if(d.max)m.p=Math.max(m.p,isMax?v:m.p);else if(!isMax)m.p+=v;else continue;if(m.p>=d.goal){m.p=d.goal;m.done=true;ch=true;const g=d.gems||15;setTimeout(()=>{S.sfx('good');S.toast('🎯','¡Misión cumplida!',d.txt+' · +'+g+' 💎 +'+(d.xp||25)+' XP');S.addGems(g);S.addXP(d.xp||25);if(G.mis.list.every(x=>x.done)){setTimeout(()=>{S.toast('🏆','¡Las 3 misiones!','Te ganaste un cofre sorpresa');S.chest('Cofre de misiones',2)},1500)}},200)}}return ch}
S.add=(stat,n)=>{n=n??1;G.st[stat]=(G.st[stat]||0)+n;missionProg(stat,n,false);checkAch();saveG()};
S.max=(stat,v)=>{G.st['max_'+stat]=Math.max(G.st['max_'+stat]||0,v);missionProg(stat,v,true);checkAch();saveG()};
S.stat=k=>G.st[k]||0;
function checkAch(){for(const a of cfg.achievements){if(G.ach[a.id])continue;let ok=false;try{ok=a.test(G.st,G)}catch(e){}if(ok){G.ach[a.id]=Date.now();saveG();setTimeout(()=>{S.sfx('power');S.vib([20,30,20]);S.toast(a.icon,'¡Logro desbloqueado!',a.name+' · +20 💎');S.addGems(20);S.addXP(30)},400)}}}
S.checkAch=checkAch;

/* ---------- skins / temas ---------- */
function checkSkinUnlocks(){if(!cfg||!cfg.skins)return;for(const s of cfg.skins){if(s.lvl&&P.lvl>=s.lvl&&!G.sk.own.includes(s.id)){G.sk.own.push(s.id);saveG();S.toast(s.icon,'¡Skin nueva!',s.name+' ya es tuya');S.add('skins',1)}}}
S.skin=()=>G.sk.eq;
function skinsHTML(){return cfg.skins.map(s=>{const own=G.sk.own.includes(s.id),eq=G.sk.eq===s.id;return '<div class="row'+(own?'':' lock')+'"><div class="ic">'+s.icon+'</div><div class="tx"><b>'+esc(s.name)+'</b><small>'+(own?(eq?'Equipada ✓':'Tuya'):(s.lvl?'Se desbloquea en nivel '+s.lvl:s.cost+' 💎'))+'</small></div>'+(own?(eq?'':'<button class="btn sec sm" data-eq="'+s.id+'">Usar</button>'):(s.cost?'<button class="btn sm" data-buy="'+s.id+'" '+(P.gems<s.cost?'disabled':'')+'>Comprar</button>':''))+'</div>'}).join('')}

/* ---------- récords ---------- */
S.submit=(score,board)=>{board=board||'main';const lb=G.lb[board]=G.lb[board]||[];const prev=lb.length?lb[0].s:0;const e={n:P.name||'Tú',s:Math.floor(score),d:Date.now(),me:1};lb.forEach(x=>delete x.me);lb.push(e);lb.sort((a,b)=>b.s-a.s);G.lb[board]=lb.slice(0,10);saveG();const rank=G.lb[board].indexOf(e)+1;return{best:score>prev&&score>0,prev,rank,diff:prev-score}};
S.best=(board)=>{const lb=G.lb[board||'main'];return lb&&lb.length?lb[0].s:0};
S.lbHTML=(board)=>{const lb=G.lb[board||'main']||[];if(!lb.length)return '<p class="muted">Aún no hay puntajes. ¡Juega y pon el primero!</p>';return '<table class="lb">'+lb.map((r,i)=>'<tr class="'+(r.me?'me':'')+'"><td>'+(i<3?['🥇','🥈','🥉'][i]:(i+1)+'.')+' '+esc(r.n)+'</td><td>'+S.fmt(r.s)+'</td></tr>').join('')+'</table>'};

/* ---------- pantalla de resultado con "Otra vez" ---------- */
S.result=(o)=>{const r=S.submit(o.score,o.board);let msg='';
 if(r.best){msg='<div class="rec">🏆 ¡NUEVO RÉCORD!</div>'+(r.prev?'<p class="muted" style="margin-top:6px">Superaste tu récord anterior de '+S.fmt(r.prev)+'</p>':'')}
 else if(r.diff>0){msg='<p class="near">'+(o.score>=r.prev*.7?'😱 ¡Casi! Te faltaron '+S.fmt(r.diff)+' '+(o.unit||'puntos')+' para tu récord':'Tu récord es '+S.fmt(r.prev)+'. ¡Tú puedes!')+'</p>'}
 else msg='<p class="near">Igualaste tu récord 😮</p>';
 const xp=Math.round(o.xp||0);
 const m=S.modal('<div style="font-size:14px;letter-spacing:3px;color:var(--c);font-weight:900">'+esc(o.title||'FIN DE LA PARTIDA')+'</div><div class="score-big" id="rSc">0</div>'+msg+'<div class="card" style="text-align:left;margin-top:10px">'+(o.lines||[]).map(l=>'<div style="display:flex;justify-content:space-between;padding:3px 0"><span>'+l[0]+'</span><b>'+l[1]+'</b></div>').join('')+'<div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--g)"><span>⭐ XP ganada</span><b>+'+xp+'</b></div><div class="pbar" style="height:10px;margin-top:8px"><div id="rXb" style="width:'+(P.xp/S.need(P.lvl)*100)+'%;background:linear-gradient(90deg,var(--c),var(--g));transition:width 1s"></div></div><div class="muted" id="rXt" style="margin-top:4px"></div></div>'+(o.extra||'')+(P.name?'':'<input class="name" id="rNm" maxlength="14" placeholder="Escribe tu nombre para la tabla">')+'<button class="btn big" id="rAgain" style="margin-top:12px">🔁 Otra vez</button><button class="btn sec" id="rMenu" style="margin-top:12px;width:100%">Menú</button>',{close:false});
 S.countTo(m.querySelector('#rSc'),o.score,900);
 setTimeout(()=>{S.addXP(xp);const n=S.need(P.lvl);m.querySelector('#rXb').style.width=(P.xp/n*100)+'%';m.querySelector('#rXt').textContent='Nivel '+P.lvl+' · ¡solo te faltan '+(n-P.xp)+' XP para el nivel '+(P.lvl+1)+'!'},500);
 if(r.best){setTimeout(()=>{S.sfx('record');S.confetti(160);S.vib([40,60,40,60,120])},700)}else S.sfx(o.score>0?'good':'bad');
 const nm=m.querySelector('#rNm');const saveName=()=>{if(nm&&nm.value.trim()){P.name=nm.value.trim().slice(0,14);saveP();const lb=G.lb[o.board||'main'];lb.forEach(x=>{if(x.me)x.n=P.name});saveG()}};
 m.querySelector('#rAgain').onclick=()=>{saveName();S.sfx('click');m.close();o.again&&o.again()};
 m.querySelector('#rMenu').onclick=()=>{saveName();S.sfx('click');m.close();o.menu&&o.menu()};
 if(o.chest)setTimeout(()=>S.chest(o.chest,1),1400);
 return r};

/* ---------- menú de metajuego (misiones, logros, skins, récords) ---------- */
S.metaTabs=(el,boards)=>{const done=G.mis.list.filter(m=>m.done).length,achN=Object.keys(G.ach).length;const canBuy=cfg.skins.some(s=>!G.sk.own.includes(s.id)&&s.cost&&P.gems>=s.cost);
 el.innerHTML='<div class="tabs"><button class="tab" data-t="mis"><b>🎯</b>Misiones'+(done<3?'<span class="dot">'+(3-done)+'</span>':'')+'</button><button class="tab" data-t="ach"><b>🏅</b>Logros<span class="muted" style="display:block;font-size:10px">'+achN+'/'+cfg.achievements.length+'</span></button><button class="tab" data-t="sk"><b>🎨</b>Skins'+(canBuy?'<span class="dot">!</span>':'')+'</button><button class="tab" data-t="lb"><b>🏆</b>Récords</button></div>';
 el.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{S.sfx('click');openTab(b.dataset.t,boards,()=>S.metaTabs(el,boards))})};
function openTab(t,boards,refresh){let h='';
 if(t==='mis'){h='<div class="big-emoji">🎯</div><h2>Misiones de hoy</h2><p class="muted">Cumple las 3 y gana un cofre sorpresa. Mañana hay misiones nuevas.</p>'+G.mis.list.map(m=>{const d=mDef(m.id);return '<div class="row'+(m.done?' ok':'')+'"><div class="ic">'+(m.done?'✅':d.icon||'🎯')+'</div><div class="tx"><b>'+esc(d.txt)+'</b><small>'+S.fmt(m.p)+' / '+S.fmt(d.goal)+' · +'+(d.gems||15)+' 💎</small><div class="pbar"><div style="width:'+(m.p/d.goal*100)+'%"></div></div></div></div>'}).join('')}
 if(t==='ach'){h='<div class="big-emoji">🏅</div><h2>Logros</h2><p class="muted">'+Object.keys(G.ach).length+' de '+cfg.achievements.length+' desbloqueados</p>'+cfg.achievements.map(a=>'<div class="row'+(G.ach[a.id]?' ok':' lock')+'"><div class="ic">'+a.icon+'</div><div class="tx"><b>'+esc(a.name)+'</b><small>'+esc(a.desc)+'</small></div></div>').join('')}
 if(t==='sk'){h='<div class="big-emoji">🎨</div><h2>Skins</h2><p class="muted">Tienes '+S.fmt(P.gems)+' 💎 (gemas del juego)</p><div id="skL">'+skinsHTML()+'</div>'}
 if(t==='lb'){h='<div class="big-emoji">🏆</div><h2>Récords</h2>'+(boards||[['main','Mejores puntajes']]).map(b=>'<h3 style="text-align:left;margin:12px 0 4px">'+b[1]+'</h3>'+S.lbHTML(b[0])).join('')+'<p class="muted" style="margin-top:10px">Tabla de este celular.</p><input class="name" id="lbNm" maxlength="14" placeholder="Tu nombre" style="margin-top:10px" value="'+esc(P.name)+'">'}
 const m=S.modal(h,{onClose:()=>{const n=document.getElementById('lbNm');refresh&&refresh()}});
 const nm=m.querySelector('#lbNm');if(nm)nm.onchange=()=>{P.name=nm.value.trim().slice(0,14);saveP()};
 const sk=m.querySelector('#skL');if(sk)sk.onclick=e=>{const eq=e.target.dataset.eq,buy=e.target.dataset.buy;if(eq){G.sk.eq=eq;saveG();S.sfx('good');cfg.onSkin&&cfg.onSkin(eq)}if(buy){const s=cfg.skins.find(x=>x.id===buy);if(S.spend(s.cost)){G.sk.own.push(buy);G.sk.eq=buy;saveG();S.sfx('power');S.confetti(60);S.add('skins',1);cfg.onSkin&&cfg.onSkin(buy)}}sk.innerHTML=skinsHTML()}}
S.openTab=openTab;

/* ---------- tutorial de primera vez ---------- */
S.tutorial=(force)=>new Promise(res=>{if(P.tut[cfg.id]&&!force)return res();let i=0;const st=cfg.tutorial;const m=S.modal('<div id="tuB"></div>',{close:false});const draw=()=>{const s=st[i];m.querySelector('#tuB').innerHTML='<div class="muted">Paso '+(i+1)+' de '+st.length+'</div><div class="big-emoji" style="margin:14px 0">'+s.icon+'</div><h2>'+esc(s.title)+'</h2><p style="opacity:.85;margin:8px 0 18px">'+s.txt+'</p><button class="btn big" id="tuN">'+(i<st.length-1?'Siguiente →':'¡A jugar!')+'</button>';m.querySelector('#tuN').onclick=()=>{S.sfx('click');i++;if(i<st.length)draw();else{P.tut[cfg.id]=1;saveP();m.close();res()}}};draw()});

/* ---------- arranque ---------- */
S.init=(c)=>{cfg=c;G=LS('g_'+c.id,null)||{st:{},ach:{},lb:{},sk:{own:[],eq:''},mis:null};G.st=G.st||{};G.ach=G.ach||{};G.lb=G.lb||{};G.sk=G.sk||{own:[],eq:''};
 if(c.skins){c.skins.forEach(s=>{if(!s.cost&&!s.lvl&&!G.sk.own.includes(s.id))G.sk.own.push(s.id)});if(!G.sk.eq)G.sk.eq=c.skins[0].id}
 dayMissions();fxInit();if(c.bar!==false)barInit();checkSkinUnlocks();saveG();
 setTimeout(dailyCheck,350);
 return G};
})();
