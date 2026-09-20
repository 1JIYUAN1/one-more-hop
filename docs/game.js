import {RULES,distanceForPower,powerForDistance,seededRandom,nextPlatform,platformX,landingResult,checkpoint,nextCheckpoint} from './game-core.mjs';

// 参数区：浏览器存储键与游戏呈现参数集中定义。无外部请求、文件或密钥。
const CONFIG={storageKey:'one-more-hop.best.v1',medalStorageKey:'one-more-hop.medals.v1',ballRadius:15,flightSeconds:.58,particleLimit:100};
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const TICKET_PERFECTS=2;
const HEROES=[{id:'paper',name:'纸飞机',need:0,bonus:'标准跳跃'},{id:'guard',name:'护航员',need:3,bonus:'开局护航券 ×1'},{id:'ace',name:'靶心手',need:7,bonus:'精准奖励翻倍'}];
const ticketProgress=(progress,perfect,tickets)=>{const next=perfect?progress+1:progress;if(tickets>0||next<TICKET_PERFECTS)return {progress:next,tickets,earned:false};return {progress:0,tickets:1,earned:true}};
const badgeTitle=count=>count>=9?'月球领航员':count>=5?'小火箭驾驶员':count>=3?'纸飞机收集家':'起跳练习生';
function rewardNode(id,className,text,parent){let node=document.getElementById(id);if(node)return node;node=document.createElement('small');node.id=id;node.className=className;node.textContent=text;parent?.append(node);return node;}
const rewardUi={mission:rewardNode('mission','mission','精准落地 0/2 · 赢一张护航券',$('nextsafe').parentElement),ticket:rewardNode('ticket','ticket','护航券 ×0',$('nextsafe').parentElement),medals:rewardNode('medals','medals','0',$('best').parentElement),title:rewardNode('badge-title','badge-title','起跳练习生',$('best').parentElement)};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let W=900,H=510,baseY=330,dpr=1,game,last=0,frame=0,input=null,particles=[],rings=[],trail=[],audio=null,sound=false,best=0,medals=0,heroId='paper',pausedFrom=null;
try{const stored=Number(localStorage.getItem(CONFIG.storageKey));if(Number.isFinite(stored)&&stored>0)best=Math.floor(stored)}catch{}
try{const stored=Number(localStorage.getItem(CONFIG.medalStorageKey));if(Number.isFinite(stored)&&stored>0)medals=Math.floor(stored)}catch{}
try{heroId=localStorage.getItem('one-more-hop.hero.v1')||heroId}catch{}
$('best').textContent=best;
rewardUi.medals.textContent=medals;rewardUi.title.textContent=badgeTitle(medals);
function hero(){return HEROES.find(item=>item.id===heroId&&medals>=item.need)||HEROES[0]}
function renderHeroes(){let box=$('heroes');if(!box){box=document.createElement('div');box.id='heroes';box.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin:10px 0';$('hold').parentElement.prepend(box)}box.replaceChildren(...HEROES.map(item=>{const b=document.createElement('button'),ok=medals>=item.need;b.textContent=ok?`${item.name} · ${item.bonus}`:`${item.name} · ${item.need} 徽章解锁`;b.disabled=!ok;b.className=item.id===hero().id?'main':'';b.onclick=()=>{heroId=item.id;try{localStorage.setItem('one-more-hop.hero.v1',heroId)}catch{}renderHeroes();reset()};return b}))}
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
 $('nextsafe').textContent=game.phase==='checkpoint'?'安全站已到达':`再跳 ${nextCheckpoint(game.step)-game.step} 次到安全站`;
 $('combo').textContent=game.combo?`精准连击 ×${game.combo} · 下次精准 +${20*Math.min(game.combo+1,5)}`:'踩中中心，奖励翻倍';
 rewardUi.mission.textContent=game.tickets?`护航券已就绪 · 本段继续精准可加分`:`精准落地 ${game.missionProgress}/${TICKET_PERFECTS} · 赢一张护航券`;
 rewardUi.ticket.textContent=`护航券 ×${game.tickets}`;
 $('scorehint').textContent=game.phase==='banked'?'已收入本局纪录':game.phase==='lost'?'失足清零 · 历史纪录保留':'到安全站才能带走';
 $('hold').disabled=!['ready','charging'].includes(game.phase);
 const zone=$('chargezone');zone.classList.toggle('hidden',game.step>=3||!['ready','charging'].includes(game.phase));
 const target=game.platforms[game.step+1];if(target){const start=powerForDistance(platformX(target,game.time)-game.ballX-target.width/2+4),end=powerForDistance(platformX(target,game.time)-game.ballX+target.width/2-4);zone.style.left=`${start*100}%`;zone.style.width=`${(end-start)*100}%`;}
}
function clearCharge(){input=null;game.power=0;$('hold').classList.remove('charging');$('chargefill').style.width='0%';$('power').textContent='0%';}
function reset(){
 const rng=seededRandom(Math.floor(Math.random()*4294967296));const start={x:180,width:128,index:0,moving:false,phase:0};
 game={phase:'ready',time:0,score:0,step:0,combo:0,power:0,tickets:hero().id==='guard'?1:0,missionProgress:0,multiplier:1,perfectBonus:0,safeVisits:0,shopRerolls:0,shop:[],owned:{},pool:CARDS.map(card=>[22,20,17,10,9][card.t]),platforms:[start],ballX:start.x,ballY:0,offset:0,camera:start.x-W*.25,rng,flight:null,squash:0,fall:0,shake:0,lostScore:0};
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
 if(!result.safe){
  if(game.tickets>0){game.tickets--;game.step++;game.combo=0;game.offset=0;game.ballY=0;game.squash=1;game.phase='ready';game.flight=null;burst(game.ballX,baseY-15,'#e5fc72',30);rings.push({x:game.ballX,y:baseY,life:1,color:'#e5fc72'});message('护航券救了这一跳！','没有得分，但本局没有结束。');ping(660,.12);while(game.platforms.length<game.step+4){const index=game.platforms.length;game.platforms.push(nextPlatform(game.platforms.at(-1),index,game.rng));}if(checkpoint(game.step)){game.safeVisits++;game.phase='checkpoint';showCheckpoint()}updateHud();return;
  }
  game.phase='falling';game.fall=0;game.lostScore=game.score;message(result.error>0?'贪远了一点。':'就差那么一点。',`距平台边缘还差 ${Math.ceil(Math.abs(result.error)-target.width/2+4)} 格`);ping(145,.18,0,'triangle');return;
 }
 game.step++;game.combo=result.combo;const reward=(result.points+(result.perfect?game.perfectBonus:0))*game.multiplier;game.score+=reward;game.offset=result.error;game.ballY=0;game.squash=1;game.phase='ready';game.flight=null;
 const mission=ticketProgress(game.missionProgress,result.perfect,game.tickets);game.missionProgress=mission.progress;game.tickets=mission.tickets;
 const color=result.perfect?'#e5fc72':'#a5a0ff';burst(game.ballX,baseY-15,color,result.perfect?25:10);rings.push({x:game.ballX,y:baseY,life:1,color});game.shake=result.perfect&&!reduced?3:0;
 if(result.perfect){message(mission.earned?'护航券到手！':game.combo>1?`精准连击 ×${game.combo}`:'正中靶心！',mission.earned?'下一次失误会救回本局。':`+${reward} · 再稳一点，还能翻倍`);ping(520+Math.min(game.combo,5)*90,.12);ping(780+Math.min(game.combo,5)*90,.1,.07)}else{message(`稳稳落地 +${reward}`,game.step===3?'落点辅助结束。接下来凭手感。':game.step<3?'松手时，让虚线落在平台中间':'下一跳，往中心试试。');ping(390,.08)}
 while(game.platforms.length<game.step+4){const index=game.platforms.length;game.platforms.push(nextPlatform(game.platforms.at(-1),index,game.rng));}
 $('chargelabel').textContent='按住蓄力 · 松开起跳';
 if(checkpoint(game.step)){game.safeVisits++;game.phase='checkpoint';showCheckpoint()}
 updateHud();
}
function showOverlay(label,title,score,desc,buttons,note){
 $('resultbuttons').parentElement?.classList.remove('shop-mode');
 $('resultlabel').textContent=label;$('resulttitle').textContent=title;$('resultscore').textContent=score;$('resultdesc').textContent=desc;$('resultnote').textContent=note;
 $('resultbuttons').replaceChildren();for(const item of buttons){const button=document.createElement('button');button.textContent=item.text;button.className=item.main?'main':'';button.onclick=item.action;$('resultbuttons').append(button)}
 $('overlay').classList.remove('hidden');$('feedback').classList.add('hidden');$('resultbuttons').firstElementChild?.focus({preventScroll:true});
}
function hideOverlay(){$('overlay').classList.add('hidden');$('feedback').classList.remove('hidden');}
const TIERS=[{name:'白',icon:'⚪',color:'#d8dce8'},{name:'绿',icon:'🟢',color:'#8ee68d'},{name:'蓝',icon:'🔵',color:'#8cb7ff'},{name:'紫',icon:'🟣',color:'#d29bff'},{name:'金',icon:'🟡',color:'#ffe271'}];
const CARDS=[
 {t:0,n:'稳步前行',d:'立刻 +15 分',a:()=>game.score+=15},{t:0,n:'应急绳',d:'护航券 +1',a:()=>game.tickets++},{t:0,n:'专注呼吸',d:'精准额外 +8 分',a:()=>game.perfectBonus+=8},
 {t:1,n:'顺风',d:'得分倍率 +0.5',a:()=>game.multiplier+=.5},{t:1,n:'双保险',d:'护航券 +2',a:()=>game.tickets+=2},{t:1,n:'热手',d:'精准额外 +18 分',a:()=>game.perfectBonus+=18},
 {t:2,n:'连胜引擎',d:'得分倍率 +1',a:()=>game.multiplier+=1},{t:2,n:'空投补给',d:'立刻 +55 分',a:()=>game.score+=55},{t:2,n:'完美主义',d:'精准额外 +35 分',a:()=>game.perfectBonus+=35},
 {t:3,n:'高空风暴',d:'得分倍率 ×1.8',a:()=>game.multiplier*=1.8},{t:3,n:'救援编队',d:'护航券 +3',a:()=>game.tickets+=3},{t:3,n:'赏金轨迹',d:'立刻 +130 分',a:()=>game.score+=130},
 {t:4,n:'黄金航线',d:'得分倍率 ×3',a:()=>game.multiplier*=3},{t:4,n:'不坠之翼',d:'护航券 +5',a:()=>game.tickets+=5},{t:4,n:'星辰契约',d:'精准额外 +100 分',a:()=>game.perfectBonus+=100}
];
function odds(){const s=game.score;return s<80?[58,29,10,3,0]:s<180?[40,34,19,6,1]:s<360?[24,35,27,11,3]:s<600?[10,29,35,19,7]:[3,16,34,31,16]}
function drawCard(){const weights=odds();for(let attempts=0;attempts<30;attempts++){const roll=game.rng()*100;let sum=0,tier=0;for(;tier<weights.length;tier++){sum+=weights[tier];if(roll<sum)break}const choices=CARDS.map((card,index)=>({card,index})).filter(item=>item.card.t===tier&&game.pool[item.index]>0);if(choices.length){const pick=choices[Math.floor(game.rng()*choices.length)];game.pool[pick.index]--;return {...pick.card,index:pick.index}}}const index=game.pool.findIndex(count=>count>0);if(index<0)return null;game.pool[index]--;return {...CARDS[index],index}}
function returnShop(keep=-1){game.shop.forEach((card,index)=>{if(card&&index!==keep)game.pool[card.index]++});game.shop=[]}
function fillShop(){game.shop=Array.from({length:5},drawCard).filter(Boolean)}
function takeCard(card,slot){const count=(game.owned[card.index]||0)+1;game.owned[card.index]=count;returnShop(slot);card.a();const upgraded=count%3===0;if(upgraded)card.a();message(upgraded?`${card.n} 升到 ${Math.floor(count/3)+1} 星！`:`获得：${card.n}`,upgraded?'集齐三张，本次效果额外触发一次。':card.d);continueRun()}
function showUpgrades(){if(!game.shop.length)fillShop();const picks=game.shop,cost=20+game.shopRerolls*15,buttons=picks.map((card,slot)=>({text:card.n,action:()=>takeCard(card,slot)}));buttons.push({text:`刷新牌店 · ${cost} 分`,action:()=>{if(game.score<cost){message('分数不够刷新。','可以直接选一张继续。');return}game.score-=cost;game.shopRerolls++;returnShop();fillShop();showUpgrades()}});showOverlay('THE SKY SHOP / 云端牌店','航路牌店 · 五选一',`${game.score} 分`, `牌池概率 ${odds().join(' / ')}%`,buttons,`刷新 ${cost} 分 · 买走会减少库存 · 三张同名自动升级`);const cardButtons=[...$('resultbuttons').children];cardButtons.forEach((button,index)=>{if(index===picks.length){button.innerHTML=`刷新五张　<b>${cost} 分</b>`;button.className='shop-refresh';return}const card=picks[index],owned=game.owned[card.index]||0;button.innerHTML=`<span class="shop-art art-${card.t}"></span><b>${card.n}</b><small>${card.d}</small><span class="owned">持有 ${owned}/3 · 余 ${game.pool[card.index]}</span><em>${card.t+1}</em>`;button.className=`shop-card tier-${card.t}`;button.setAttribute('aria-label',`${card.n}，${card.d}`)});$('resultbuttons').parentElement?.classList.add('shop-mode');}
function showCheckpoint(){showOverlay('SAFE POINT / 安全站','见好就收？',game.score,`已经连过 ${game.step} 跳。\n下一安全站在第 ${nextCheckpoint(game.step)} 跳，距离更远。`,[{text:`收手，带走 ${game.score} 分`,main:true,action:bank},{text:'加注，选一项能力 →',action:showUpgrades}],'B 收手 · 选能力后继续 · 没有倒计时，慢慢决定');}
function continueRun(){if(game.phase!=='checkpoint')return;game.missionProgress=0;hideOverlay();game.phase='ready';message('好，再来一跳。',game.step===3?'从这一跳起，不再显示落点辅助':'分数还没落袋，稳住。');updateHud();canvas.focus({preventScroll:true});}
function bank(){if(game.phase!=='checkpoint')return;game.phase='banked';const newRecord=game.score>best;best=Math.max(best,game.score);const gained=game.safeVisits;medals+=gained;let saved=true;try{localStorage.setItem(CONFIG.storageKey,String(best));localStorage.setItem(CONFIG.medalStorageKey,String(medals))}catch{saved=false}$('best').textContent=best;rewardUi.medals.textContent=medals;rewardUi.title.textContent=badgeTitle(medals);renderHeroes();ping(523,.13);ping(659,.13,.12);ping(784,.18,.24);burst(game.ballX,baseY-60,'#e5fc72',45);showOverlay(newRecord?'NEW BEST / 新纪录':'NICELY DONE / 稳稳收下','这次，收得漂亮。',`+${game.score}`,`走过 ${game.step} 座平台，收下 ${gained} 枚安全徽章。`,[{text:'再来一局 ↗',main:true,action:reset}],saved?`R 立即重开 · ${badgeTitle(medals)} · 徽章已保存在本机`:'当前浏览器无法保存纪录；本次页面仍保留');updateHud();}
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
resize();renderHeroes();reset();frame=requestAnimationFrame(tick);
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);audio?.close().catch(()=>{})},{once:true});
