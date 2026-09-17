import {RULES,distanceForPower,powerForDistance,seededRandom,nextPlatform,platformX,landingResult,checkpoint} from './game-core.mjs';

// 参数区：浏览器存储键与游戏呈现参数集中定义。无外部请求、文件或密钥。
const CONFIG={storageKey:'one-more-hop.best.v1',ballRadius:15,flightSeconds:.58,particleLimit:100};
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let W=900,H=510,baseY=330,dpr=1,game,last=0,frame=0,input=null,particles=[],rings=[],trail=[],audio=null,sound=false,best=0,pausedFrom=null;
try{const stored=Number(localStorage.getItem(CONFIG.storageKey));if(Number.isFinite(stored)&&stored>0)best=Math.floor(stored)}catch{}
$('best').textContent=best;
function resize(){const rect=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);W=Math.max(560,rect.width);H=rect.height*W/rect.width;baseY=H*.64;canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);}
new ResizeObserver(resize).observe(canvas);
function ping(frequency=440,duration=.09,delay=0,type='sine'){
 if(!sound||!audio)return;const start=audio.currentTime+delay,osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.085,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(gain);gain.connect(audio.destination);osc.start(start);osc.stop(start+duration+.02);
}
function message(main,sub=''){ $('feedbackmain').textContent=main;$('feedbacksub').textContent=sub;}
function updateHud(){
 $('score').textContent=game.score;$('level').textContent=`第 ${game.step} 跳`;
 const progress=game.step%3||((game.phase==='checkpoint'||game.phase==='banked')?3:0);
 [...$('station').children].forEach((dot,i)=>dot.classList.toggle('on',i<progress));
 $('nextsafe').textContent=game.phase==='checkpoint'?'安全站已到达':`再跳 ${3-game.step%3} 次到安全站`;
 $('combo').textContent=game.combo?`精准连击 ×${game.combo} · 下次精准 +${20*Math.min(game.combo+1,5)}`:'踩中中心，奖励翻倍';
 $('scorehint').textContent=game.phase==='banked'?'已收入本局纪录':game.phase==='lost'?'失足清零 · 历史纪录保留':'到安全站才能带走';
 $('hold').disabled=!['ready','charging'].includes(game.phase);
 const zone=$('chargezone');zone.classList.toggle('hidden',game.step>=3||!['ready','charging'].includes(game.phase));
 const target=game.platforms[game.step+1];if(target){const start=powerForDistance(platformX(target,game.time)-game.ballX-target.width/2+4),end=powerForDistance(platformX(target,game.time)-game.ballX+target.width/2-4);zone.style.left=`${start*100}%`;zone.style.width=`${(end-start)*100}%`;}
}
function clearCharge(){input=null;game.power=0;$('hold').classList.remove('charging');$('chargefill').style.width='0%';$('power').textContent='0%';}
function reset(){
 const rng=seededRandom(Math.floor(Math.random()*4294967296));const start={x:180,width:128,index:0,moving:false,phase:0};
 game={phase:'ready',time:0,score:0,step:0,combo:0,power:0,ballX:start.x,ballY:0,offset:0,camera:start.x-W*.25,platforms:[start],rng,flight:null,squash:0,fall:0,shake:0,lostScore:0};
 for(let i=1;i<=3;i++)game.platforms.push(nextPlatform(game.platforms.at(-1),i,rng));
 particles=[];rings=[];trail=[];pausedFrom=null;clearCharge();hideOverlay();message('第一跳，找找手感。','亮色区域是落点辅助 · 前 3 跳有效');updateHud();
}
function startCharge(kind,id){
 if(game.phase!=='ready'||input)return;
 input={kind,id,started:performance.now()};game.phase='charging';$('hold').classList.add('charging');$('chargelabel').textContent='松手，跳！';
 if(sound&&audio?.state==='suspended')audio.resume().catch(()=>{});
}
function releaseCharge(){
 if(game.phase!=='charging'||!input)return;
 const p=Math.min(1,(performance.now()-input.started)/RULES.chargeMs),distance=distanceForPower(p);game.phase='jumping';
 game.flight={start:game.ballX,end:game.ballX+distance,elapsed:0,duration:CONFIG.flightSeconds+.12*p,height:95+70*p};game.ballY=0;
 clearCharge();$('chargelabel').textContent='飞行中…';ping(270+p*200,.1);updateHud();
}
function cancelCharge(){if(game.phase==='charging'){clearCharge();game.phase='ready';$('chargelabel').textContent='按住蓄力 · 松开起跳';updateHud();}}
function burst(x,y,color,count){if(reduced)return;for(let i=0;i<count&&particles.length<CONFIG.particleLimit;i++)particles.push({x,y,vx:(Math.random()-.5)*170,vy:-Math.random()*150-25,life:1,color,size:2+Math.random()*3});}
function land(){
 const target=game.platforms[game.step+1],result=landingResult(game.ballX,target,game.time,game.combo);
 if(!result.safe){game.phase='falling';game.fall=0;game.lostScore=game.score;message(result.error>0?'贪远了一点。':'就差那么一点。',`距平台边缘还差 ${Math.ceil(Math.abs(result.error)-target.width/2+4)} 格`);ping(145,.18,0,'triangle');return;}
 game.step++;game.combo=result.combo;game.score+=result.points;game.offset=result.error;game.ballY=0;game.squash=1;game.phase='ready';game.flight=null;
 const color=result.perfect?'#e5fc72':'#a5a0ff';burst(game.ballX,baseY-15,color,result.perfect?25:10);rings.push({x:game.ballX,y:baseY,life:1,color});game.shake=result.perfect&&!reduced?3:0;
 if(result.perfect){message(game.combo>1?`精准连击 ×${game.combo}`:'正中靶心！',`+${result.points} · 再稳一点，还能翻倍`);ping(520+Math.min(game.combo,5)*90,.12);ping(780+Math.min(game.combo,5)*90,.1,.07)}else{message(`稳稳落地 +${result.points}`,game.step===3?'落点辅助结束。接下来凭手感。':game.step<3?'松手时，让虚线落在平台中间':'下一跳，往中心试试。');ping(390,.08)}
 while(game.platforms.length<game.step+4){const index=game.platforms.length;game.platforms.push(nextPlatform(game.platforms.at(-1),index,game.rng));}
 $('chargelabel').textContent='按住蓄力 · 松开起跳';
 if(checkpoint(game.step)){game.phase='checkpoint';showCheckpoint()}
 updateHud();
}
function showOverlay(label,title,score,desc,buttons,note){
 $('resultlabel').textContent=label;$('resulttitle').textContent=title;$('resultscore').textContent=score;$('resultdesc').textContent=desc;$('resultnote').textContent=note;
 $('resultbuttons').replaceChildren();for(const item of buttons){const button=document.createElement('button');button.textContent=item.text;button.className=item.main?'main':'';button.onclick=item.action;$('resultbuttons').append(button)}
 $('overlay').classList.remove('hidden');$('feedback').classList.add('hidden');$('resultbuttons').firstElementChild?.focus({preventScroll:true});
}
function hideOverlay(){$('overlay').classList.add('hidden');$('feedback').classList.remove('hidden');}
function showCheckpoint(){showOverlay('SAFE POINT / 安全站','见好就收？',game.score,`已经连过 ${game.step} 跳。\n继续跳，这些分数也会跟着冒险。`,[{text:`收手，带走 ${game.score} 分`,main:true,action:bank},{text:'再跳一次 →',action:continueRun}],'B 收手 · C 继续 · 没有倒计时，慢慢决定');}
function continueRun(){if(game.phase!=='checkpoint')return;hideOverlay();game.phase='ready';message('好，再来一跳。',game.step===3?'从这一跳起，不再显示落点辅助':'分数还没落袋，稳住。');updateHud();canvas.focus({preventScroll:true});}
function bank(){if(game.phase!=='checkpoint')return;game.phase='banked';const newRecord=game.score>best;best=Math.max(best,game.score);let saved=true;try{localStorage.setItem(CONFIG.storageKey,String(best))}catch{saved=false}$('best').textContent=best;ping(523,.13);ping(659,.13,.12);ping(784,.18,.24);burst(game.ballX,baseY-60,'#e5fc72',45);showOverlay(newRecord?'NEW BEST / 新纪录':'NICELY DONE / 稳稳收下','这次，收得漂亮。',`+${game.score}`,`走过 ${game.step} 座平台，这些分数属于你。`,[{text:'再来一局 ↗',main:true,action:reset}],saved?'R 立即重开 · 最高收获已保存在本机':'当前浏览器无法保存纪录；本次页面仍保留');updateHud();}
function lose(){game.phase='lost';const lostScore=game.lostScore;game.score=0;const desc=game.step?`过了 ${game.step} 跳，${lostScore} 分没能带走。\n历史最高 ${best} 分，还在。`:'第一跳没站稳。\n按住约半秒，再松手试试。';showOverlay('SO CLOSE / 差一点','再来一次？',0,desc,[{text:'再来一局 ↗',main:true,action:reset}],'R 立即重开 · 不用等，不用看广告');updateHud();}
function pause(){if(['paused','banked','lost','checkpoint'].includes(game.phase))return;cancelCharge();pausedFrom=game.phase;game.phase='paused';showOverlay('PAUSED / 暂停','歇一下，也挺好。',game.score,'回来时，这一跳还在。',[{text:'继续游戏',main:true,action:resume}],'Esc 继续');updateHud();}
function resume(){if(game.phase!=='paused')return;game.phase=pausedFrom||'ready';pausedFrom=null;hideOverlay();updateHud();canvas.focus({preventScroll:true});}
for(const surface of [canvas,$('hold')]){
 surface.addEventListener('pointerdown',event=>{if(event.button!==0||input)return;event.preventDefault();surface.focus({preventScroll:true});startCharge('pointer',event.pointerId);if(input)surface.setPointerCapture(event.pointerId)});
 surface.addEventListener('pointerup',event=>{if(input?.kind==='pointer'&&input.id===event.pointerId){event.preventDefault();releaseCharge()}});
 surface.addEventListener('pointercancel',event=>{if(input?.id===event.pointerId)cancelCharge()});
 surface.addEventListener('lostpointercapture',event=>{if(input?.id===event.pointerId)cancelCharge()});surface.addEventListener('contextmenu',event=>event.preventDefault());
}
document.addEventListener('keydown',event=>{
 if(event.code==='Space'){
  if(event.target instanceof HTMLButtonElement&&event.target!==$('hold'))return;
  event.preventDefault();if(!event.repeat)startCharge('keyboard','space');
 }else if(event.code==='KeyR'&&['lost','banked'].includes(game.phase)){event.preventDefault();reset();canvas.focus({preventScroll:true})}
 else if(event.code==='KeyB'&&game.phase==='checkpoint'){event.preventDefault();bank()}
 else if(event.code==='KeyC'&&game.phase==='checkpoint'){event.preventDefault();continueRun()}
 else if(event.code==='Escape'){event.preventDefault();game.phase==='paused'?resume():pause()}
});
document.addEventListener('keyup',event=>{if(event.code==='Space'&&input?.kind==='keyboard'){event.preventDefault();releaseCharge()}});
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
$('sound').onclick=()=>{sound=!sound;if(sound){try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});ping(660,.09)}catch{sound=false}}$('sound').textContent=`音效 ${sound?'开':'关'}`;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效')};
$('help').onclick=()=>{const showing=$('rules').classList.toggle('hidden')===false;$('help').setAttribute('aria-expanded',String(showing));if(showing)pause()};
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fill()}
function drawPlatform(p){
 const x=platformX(p,game.time)-game.camera;if(x< -p.width||x>W+p.width)return;
 const safe=checkpoint(p.index),current=p.index===game.step,next=p.index===game.step+1,w=p.width;
 const body=safe?'#747d46':current?'#6157b3':'#454267',top=safe?'#d6ed7a':current?'#a092f4':'#7f77bf';
 ctx.globalAlpha=p.index>game.step+1?.45:1;
 ellipse(x,baseY+42,w*.55,10,'#0f1224');
 ctx.fillStyle=body;ctx.fillRect(x-w/2,baseY,w,24);ellipse(x,baseY+24,w/2,15,body);ellipse(x,baseY,w/2,15,top);
 ctx.strokeStyle=safe?'#edffa8':'#b4a9ff';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,baseY,w/2-.7,14.3,0,0,Math.PI*2);ctx.stroke();
 ellipse(x,baseY,Math.min(RULES.perfectRadius,w*.16),4.2,next?'#eaff99':'#c4b8ff');
 if(next){ctx.fillStyle=safe?'#e5fc72':'#bbb5df';ctx.font='12px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText(safe?'安全站':p.moving?'移动平台':String(p.index).padStart(2,'0'),x,baseY+69);}
 ctx.globalAlpha=1;
}
function render(dt){
 ctx.clearRect(0,0,W,H);const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#171c32');bg.addColorStop(.55,'#242846');bg.addColorStop(1,'#20203d');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 // 抽象网格与轨迹都是游戏空间的几何辅助，不使用外部美术资源。
 ctx.strokeStyle='#b0aaff08';ctx.lineWidth=1;const drift=game.camera*.15%70;
 for(let x=-drift;x<W;x+=70){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
 for(let y=25;y<H;y+=70){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
 ctx.save();if(game.shake>0){ctx.translate((Math.random()-.5)*game.shake,(Math.random()-.5)*game.shake);game.shake=Math.max(0,game.shake-dt*18)}
 const next=game.platforms[game.step+1];
 if(next&&game.step<3&&['ready','charging'].includes(game.phase)){
  const targetX=platformX(next,game.time)-game.camera;
  ctx.strokeStyle='#e5fc7220';ctx.setLineDash([3,8]);ctx.beginPath();ctx.moveTo(game.ballX-game.camera,baseY-1);ctx.lineTo(targetX,baseY-1);ctx.stroke();ctx.setLineDash([]);
  if(game.phase==='charging'){
   const end=game.ballX+distanceForPower(game.power),ok=Math.abs(end-platformX(next,game.time))<=next.width/2-4;
   for(let i=1;i<=16;i++){const t=i/16;ellipse(game.ballX-game.camera+(end-game.ballX)*t,baseY-CONFIG.ballRadius-Math.sin(t*Math.PI)*115,2,2,ok?'#e5fc7290':'#c1b8ef80')}
   ellipse(end-game.camera,baseY,8,3,ok?'#e5fc72':'#d1bee0');
  }
 }
 for(const p of game.platforms.slice(Math.max(0,game.step-3),game.step+4))drawPlatform(p);
 for(const r of rings){ctx.strokeStyle=r.color;ctx.globalAlpha=r.life*.6;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(r.x-game.camera,r.y,20+(1-r.life)*42,5+(1-r.life)*13,0,0,Math.PI*2);ctx.stroke();if(game.phase!=='paused')r.life-=dt*1.8}rings=rings.filter(r=>r.life>0);ctx.globalAlpha=1;
 const x=game.ballX-game.camera,y=baseY-CONFIG.ballRadius-game.ballY;
 if(game.phase==='jumping'&&!reduced){trail.push({x:game.ballX,y,life:1});if(trail.length>14)trail.shift()}else if(trail.length)trail.shift();
 trail.forEach((p,i)=>{ellipse(p.x-game.camera,p.y,CONFIG.ballRadius*i/trail.length*.65,CONFIG.ballRadius*i/trail.length*.65,`rgba(229,252,114,${i/trail.length*.16})`)});
 if(!['lost'].includes(game.phase)){
  ellipse(x,baseY+2,Math.max(5,18-game.ballY*.04),4,'#0003');
  const charge=game.phase==='charging'?game.power:0,squash=charge*.32+game.squash*.25;
  ctx.save();ctx.translate(x,y+charge*5);ctx.scale(1+squash,1-squash*.65);
  ctx.shadowColor='#e5fc72';ctx.shadowBlur=game.phase==='charging'?16+charge*16:14;
  const ball=ctx.createRadialGradient(-5,-7,1,0,0,20);ball.addColorStop(0,'#f7ffc7');ball.addColorStop(.5,'#e5fc72');ball.addColorStop(1,'#b6cf46');ellipse(0,0,CONFIG.ballRadius,CONFIG.ballRadius,ball);ctx.shadowBlur=0;
  // 小球的方向指示点，帮助玩家识别朝向。
  ellipse(5,-2,2,2,'#3a452a');ctx.restore();
 }
 for(const p of particles){if(game.phase!=='paused'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=250*dt;p.life-=dt*1.2}ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.fillRect(p.x-game.camera,p.y,p.size,p.size)}particles=particles.filter(p=>p.life>0);ctx.globalAlpha=1;ctx.restore();
}
function tick(now){
 const dt=Math.min((now-last)/1000||.016,.04);last=now;
 if(game.phase!=='paused')game.time+=dt;
 if(['ready','charging','checkpoint'].includes(game.phase)){const current=game.platforms[game.step];game.ballX=platformX(current,game.time)+game.offset;game.ballY=0;}
 if(game.phase==='charging'&&input){game.power=Math.min(1,(now-input.started)/RULES.chargeMs);$('chargefill').style.width=`${game.power*100}%`;$('power').textContent=`${Math.round(game.power*100)}%`;}
 if(game.phase==='jumping'){const f=game.flight;f.elapsed+=dt;const t=Math.min(1,f.elapsed/f.duration);game.ballX=f.start+(f.end-f.start)*t;game.ballY=Math.sin(t*Math.PI)*f.height;if(t>=1)land();}
 if(game.phase==='falling'){game.fall+=dt;game.ballY=-480*game.fall*game.fall;if(game.fall>.65)lose()}
 if(game.phase!=='paused'){game.camera+=(game.ballX-W*.25-game.camera)*(1-Math.exp(-dt*7));game.squash=Math.max(0,game.squash-dt*5)}
 if(game.step<3&&game.phase==='ready')updateHud();render(dt);frame=requestAnimationFrame(tick);
}
resize();reset();frame=requestAnimationFrame(tick);
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);audio?.close().catch(()=>{})},{once:true});
