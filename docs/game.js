import {RULES,distanceForPower,powerForDistance,seededRandom,nextPlatform,platformX,landingResult,checkpoint,nextCheckpoint,checkpointRange} from './game-core.mjs?v=20260921-1';

// 参数区：浏览器存储键与游戏呈现参数集中定义。无外部请求、文件或密钥。
const CONFIG={storageKey:'one-more-hop.best.v1',medalStorageKey:'one-more-hop.medals.v1',ballRadius:15,flightSeconds:.58,particleLimit:100};
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const TICKET_PERFECTS=2;
const HEROES=[{id:'paper',name:'纸飞机',need:0,bonus:'标准跳跃'},{id:'guard',name:'护航员',need:3,bonus:'开局护航券 ×1'},{id:'ace',name:'靶心手',need:7,bonus:'精准奖励翻倍'}];
const ANOMALIES={calm:{id:'calm',name:'平稳航路',desc:'没有额外规则'},wind:{id:'wind',name:'侧风带',desc:'每次起跳会被横向推移 18 格'},needle:{id:'needle',name:'窄门',desc:'精准区域缩小一半'},blackout:{id:'blackout',name:'禁援区',desc:'护航券在本航段无法生效'}};
const anomalyForSegment=segment=>segment%6===2?ANOMALIES.wind:segment%6===4?ANOMALIES.needle:segment%6===0?ANOMALIES.blackout:ANOMALIES.calm;
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
function renderHeroes(){
 let box=$('heroes');if(!box){box=document.createElement('section');box.id='heroes';$('hold').parentElement.prepend(box)}box.className='craft-picker';
 const copy=document.createElement('div');copy.className='craft-copy';copy.innerHTML=`<b>起飞机体</b><small>每抵达一个安全站获得 1 枚徽章 · 当前 ${medals} 枚</small>`;
 const options=document.createElement('div');options.id='hero-options';options.className='craft-options';
 for(const item of HEROES){const b=document.createElement('button'),ok=medals>=item.need,missing=Math.max(0,item.need-medals);b.heroKey=item.id;b.innerHTML=ok?`<b>${item.name}</b><small>${item.bonus}</small><em>${item.id===hero().id?'使用中':'可选择'}</em>`:`<b>${item.name}</b><small>${item.bonus}</small><em>再抵达 ${missing} 个安全站</em>`;b.disabled=!ok;b.className=item.id===hero().id?'selected':'';b.onclick=()=>{if(game&&game.step>0&&!['lost','banked'].includes(game.phase)){message('本局已经起飞。','机体只能在开局或结算后更换。');return}heroId=item.id;try{localStorage.setItem('one-more-hop.hero.v1',heroId)}catch{}renderHeroes();reset()};options.append(b)}box.replaceChildren(copy,options);updateHeroAvailability();
}
function updateHeroAvailability(){const options=$('hero-options');if(!options)return;const running=game&&game.step>0&&!['lost','banked'].includes(game.phase);for(const button of options.children){const item=HEROES.find(hero=>hero.id===button.heroKey);button.disabled=running||!item||medals<item.need}}
function resize(){const rect=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);W=Math.max(560,rect.width);H=rect.height*W/rect.width;baseY=H*.64;canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);}
new ResizeObserver(resize).observe(canvas);
function ping(frequency=440,duration=.09,delay=0,type='sine'){
 if(!sound||!audio)return;const start=audio.currentTime+delay,osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.085,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(gain);gain.connect(audio.destination);osc.start(start);osc.stop(start+duration+.02);
}
function message(main,sub=''){ $('feedbackmain').textContent=main;$('feedbacksub').textContent=sub;}
function updateHud(){
 $('score').textContent=game.score;$('coins').textContent=game.coins;$('level').textContent=`第 ${game.step} 跳`;
 const stopped=['checkpoint','banked'].includes(game.phase),range=checkpointRange(stopped?Math.max(0,game.step-1):game.step),progress=stopped?range.length:range.progress;
 if($('station').children.length!==range.length)$('station').replaceChildren(...Array.from({length:range.length},()=>document.createElement('i')));
 [...$('station').children].forEach((dot,i)=>dot.classList.toggle('on',i<progress));
 $('nextsafe').textContent=game.phase==='checkpoint'?'安全站已到达':`再跳 ${nextCheckpoint(game.step)-game.step} 次到安全站`;
 $('route').textContent=`航段 ${game.segment} · ${game.anomaly.name}`;$('route').classList.toggle('danger',game.anomaly.id!=='calm');
 $('combo').textContent=game.combo?`精准连击 ×${game.combo} · 下次精准 +${20*Math.min(game.combo+1,5)}`:'踩中中心，奖励翻倍';
 rewardUi.mission.textContent=game.tickets?`护航券已就绪 · 本段继续精准可加分`:`精准落地 ${game.missionProgress}/${TICKET_PERFECTS} · 赢一张护航券`;
 rewardUi.ticket.textContent=`护航券 ×${game.tickets}`;
 $('scorehint').textContent=game.phase==='banked'?'已收入本局纪录':game.phase==='lost'?'失足清零 · 历史纪录保留':'到安全站才能带走';
 $('hold').disabled=!['ready','charging'].includes(game.phase);
 const zone=$('chargezone');zone.classList.toggle('hidden',game.step>=3||!['ready','charging'].includes(game.phase));
 const target=game.platforms[game.step+1];if(target){const width=effectiveWidth(target),drift=game.anomaly.id==='wind'?windDrift():0,start=powerForDistance(platformX(target,game.time)-game.ballX-width/2+4-drift),end=powerForDistance(platformX(target,game.time)-game.ballX+width/2-4-drift);zone.style.left=`${start*100}%`;zone.style.width=`${(end-start)*100}%`;}
 renderLoadout();updateHeroAvailability();if(document.body)document.body.className=game.anomaly.id==='calm'?'':`anomaly-${game.anomaly.id}`;
}
function clearCharge(){input=null;game.power=0;$('hold').classList.remove('charging');$('chargefill').style.width='0%';$('power').textContent='0%';}
function reset(){
 const rng=seededRandom(Math.floor(Math.random()*4294967296));const start={x:180,width:128,index:0,moving:false,phase:0};
 game={phase:'ready',time:0,score:0,coins:2,step:0,combo:0,power:0,tickets:hero().id==='guard'?1:0,missionProgress:0,safeVisits:0,segment:1,anomaly:anomalyForSegment(1),segmentPerfects:0,segmentRescued:false,shopRerolls:0,shop:[],loadout:[],platforms:[start],ballX:start.x,ballY:0,offset:0,camera:start.x-W*.25,rng,flight:null,squash:0,fall:0,shake:0,lostScore:0,lastCoinGain:0};
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
 const p=Math.min(1,(performance.now()-input.started)/RULES.chargeMs),distance=distanceForPower(p),drift=game.anomaly.id==='wind'?windDrift():0;game.phase='jumping';
 game.flight={start:game.ballX,end:game.ballX+distance+drift,elapsed:0,duration:CONFIG.flightSeconds+.12*p,height:95+70*p,power:p,distance,drift};game.ballY=0;
 clearCharge();$('chargelabel').textContent='飞行中…';ping(270+p*200,.1);updateHud();
}
function cancelCharge(){if(game.phase==='charging'){clearCharge();game.phase='ready';$('chargelabel').textContent='按住蓄力 · 松开起跳';updateHud();}}
function burst(x,y,color,count){if(reduced)return;for(let i=0;i<count&&particles.length<CONFIG.particleLimit;i++)particles.push({x,y,vx:(Math.random()-.5)*170,vy:-Math.random()*150-25,life:1,color,size:2+Math.random()*3});}
function ownedCard(id){return game.loadout.find(card=>card.id===id)}
function cardLevel(id){return ownedCard(id)?.level||0}
function effectiveWidth(platform){return platform.width+cardLevel('steady')*7}
function perfectRadiusFor(platform){let radius=Math.min(RULES.perfectRadius,effectiveWidth(platform)*.16);if(cardLevel('needle'))radius*=Math.max(.55,1-cardLevel('needle')*.15);if(game.anomaly.id==='needle')radius*=.5;return radius}
function windDrift(){return game.segment%2?18:-18}
function scoreLanding(result,target,flight){
 let add=result.points+Math.max(0,Math.round((flight.distance-160)/45)),mult=hero().id==='ace'&&result.perfect?2:1,coins=0;
 const edge=result.safe&&Math.abs(result.error)>=effectiveWidth(target)*.30,full=flight.power>=.82,triggers=[];
 for(const state of game.loadout){
  const level=state.level;let hit=false;
  if(state.id==='steady'&&Math.abs(result.error)>target.width/2-4){add+=5*level;hit=true}
  else if(state.id==='focus'&&result.perfect){add+=8*level;hit=true}
  else if(state.id==='edge_coin'&&edge){coins+=level;hit=true}
  else if(state.id==='full_charge'&&full){add+=12*level;hit=true}
  else if(state.id==='combo_engine'&&result.perfect&&result.combo>1){mult+=.12*result.combo*level;hit=true}
  else if(state.id==='needle'&&result.perfect){mult*=1.35+.2*level;hit=true}
  else if(state.id==='long_engine'&&full){mult*=1.25+.2*level;hit=true}
  else if(state.id==='cliff'&&edge){mult*=1.35+.2*level;hit=true}
  else if(state.id==='storm'&&target.moving){mult*=1.6+.2*level;hit=true}
  else if(state.id==='glass'){mult*=1.45+.15*level;hit=true}
  else if(state.id==='gold_echo'&&result.perfect&&result.combo>=3){mult*=1.7+.3*level;hit=true}
  else if(state.id==='mint'&&result.perfect&&result.combo%3===0){coins+=level;hit=true}
  else if(state.id==='anomaly'&&game.anomaly.id!=='calm'){mult*=1.6+.25*level;hit=true}
  if(hit)triggers.push(state.id)
 }
 return {reward:Math.max(1,Math.round(add*mult)),add,mult,coins,edge,full,triggers};
}
function pulseTriggers(ids){if(!ids.length)return;renderLoadout();for(const node of $('loadout').children)if(ids.includes(node.cardId))node.classList.add('triggered');if(typeof setTimeout==='function')setTimeout(()=>renderLoadout(),650)}
function arriveCheckpoint(){const before=medals,lifeline=cardLevel('lifeline');if(!game.tickets&&lifeline&&game.segmentPerfects>=Math.max(1,3-lifeline))game.tickets=1;game.safeVisits++;medals++;try{localStorage.setItem(CONFIG.medalStorageKey,String(medals))}catch{}rewardUi.medals.textContent=medals;rewardUi.title.textContent=badgeTitle(medals);const unlocked=HEROES.filter(item=>item.need>before&&item.need<=medals);game.lastUnlock=unlocked.map(item=>item.name).join('、');renderHeroes();game.shopRerolls=0;game.shop=[];const interest=Math.min(3,Math.floor(game.coins/5)+cardLevel('interest')),clean=game.segmentRescued?0:2,perfect=Math.min(3,game.segmentPerfects),routeBonus=cardLevel('route_mint')*2;game.lastCoinGain=4+clean+perfect+interest+routeBonus;game.coins+=game.lastCoinGain;game.phase='checkpoint';showCheckpoint()}
function land(){
 const target=game.platforms[game.step+1],judged={...target,width:effectiveWidth(target)},result=landingResult(game.ballX,judged,game.time,game.combo);
 if(result.safe){result.perfect=Math.abs(result.error)<=perfectRadiusFor(target);result.combo=result.perfect?game.combo+1:0;result.points=result.perfect?20*Math.min(result.combo,5):10}
 if(!result.safe){
  const rescueBlocked=game.anomaly.id==='blackout'||cardLevel('glass')>0;
  if(game.tickets>0&&!rescueBlocked){game.tickets--;game.step++;game.combo=0;game.segmentRescued=true;game.offset=0;game.ballY=0;game.squash=1;game.phase='ready';game.flight=null;burst(game.ballX,baseY-15,'#e5fc72',30);rings.push({x:game.ballX,y:baseY,life:1,color:'#e5fc72'});message('护航券救了这一跳！','本航段失去无伤航币，但航程继续。');ping(660,.12);while(game.platforms.length<game.step+4){const index=game.platforms.length;game.platforms.push(nextPlatform(game.platforms.at(-1),index,game.rng));}if(checkpoint(game.step))arriveCheckpoint();updateHud();return;
  }
  game.phase='falling';game.fall=0;game.lostScore=game.score;message(rescueBlocked&&game.tickets?'禁援规则生效。':result.error>0?'贪远了一点。':'就差那么一点。',`距平台边缘还差 ${Math.ceil(Math.abs(result.error)-effectiveWidth(target)/2+4)} 格`);ping(145,.18,0,'triangle');return;
 }
 const flight=game.flight,scored=scoreLanding(result,target,flight);game.step++;game.combo=result.combo;game.segmentPerfects+=result.perfect?1:0;game.score+=scored.reward;game.coins+=scored.coins;game.offset=result.error;game.ballY=0;game.squash=1;game.phase='ready';game.flight=null;
 const mission=ticketProgress(game.missionProgress,result.perfect,game.tickets);game.missionProgress=mission.progress;game.tickets=mission.tickets;
 const color=result.perfect?'#e5fc72':'#a5a0ff';burst(game.ballX,baseY-15,color,result.perfect?25:10);rings.push({x:game.ballX,y:baseY,life:1,color});game.shake=result.perfect&&!reduced?3:0;
 const triggerNames=scored.triggers.map(id=>cardById(id).n).join(' · '),formula=scored.mult>1.01?`${scored.add} × ${scored.mult.toFixed(2)} = ${scored.reward}`:`本跳 +${scored.reward}`;
 if(result.perfect){message(mission.earned?'护航券到手！':game.combo>1?`精准连击 ×${game.combo}`:'正中靶心！',`${formula}${scored.coins?` · 航币 +${scored.coins}`:''}${triggerNames?` · ${triggerNames}`:''}`);ping(520+Math.min(game.combo,5)*90,.12);ping(780+Math.min(game.combo,5)*90,.1,.07)}else{message(scored.edge?`擦边落地 +${scored.reward}`:`稳稳落地 +${scored.reward}`,`${formula}${scored.coins?` · 航币 +${scored.coins}`:''}${triggerNames?` · ${triggerNames}`:''}`);ping(390,.08)}
 pulseTriggers(scored.triggers);
 while(game.platforms.length<game.step+4){const index=game.platforms.length;game.platforms.push(nextPlatform(game.platforms.at(-1),index,game.rng));}
 $('chargelabel').textContent='按住蓄力 · 松开起跳';
 if(checkpoint(game.step))arriveCheckpoint();
 updateHud();
}
function showOverlay(label,title,score,desc,buttons,note){
 $('resultbuttons').parentElement?.classList.remove('shop-mode');
 $('shoploadout').classList.add('hidden');
 $('resultlabel').textContent=label;$('resulttitle').textContent=title;$('resultscore').textContent=score;$('resultdesc').textContent=desc;$('resultnote').textContent=note;
 $('resultbuttons').replaceChildren();for(const item of buttons){const button=document.createElement('button');button.textContent=item.text;button.className=item.main?'main':'';button.onclick=item.action;$('resultbuttons').append(button)}
 $('overlay').classList.remove('hidden');$('feedback').classList.add('hidden');$('resultbuttons').firstElementChild?.focus({preventScroll:true});
}
function hideOverlay(){$('overlay').classList.add('hidden');$('feedback').classList.remove('hidden');}
const TIERS=[{name:'白',icon:'⚪',color:'#d8dce8'},{name:'绿',icon:'🟢',color:'#8ee68d'},{name:'蓝',icon:'🔵',color:'#8cb7ff'},{name:'紫',icon:'🟣',color:'#d29bff'},{name:'金',icon:'🟡',color:'#ffe271'}];
const CARDS=[
 {id:'steady',t:0,n:'稳压翼',tag:'容错',price:4,d:l=>`平台有效宽度 +${7*l} 格`},
 {id:'focus',t:0,n:'焦点镜',tag:'精准',price:4,d:l=>`精准时飞行值 +${8*l}`},
 {id:'edge_coin',t:0,n:'擦边奖券',tag:'擦边',price:4,d:l=>`擦边落地获得 ${l} 航币`},
 {id:'full_charge',t:1,n:'满弦',tag:'远航',price:5,d:l=>`蓄力 ≥82% 时飞行值 +${12*l}`},
 {id:'combo_engine',t:1,n:'连击仪',tag:'精准',price:5,d:l=>`精准连击每层倍率 +${Math.round(12*l)}%`},
 {id:'lifeline',t:1,n:'备用索',tag:'救援',price:5,d:l=>`每段完成 ${Math.max(1,3-l)} 次精准且无券时补 1 张`},
 {id:'needle',t:2,n:'针尖航线',tag:'精准·风险',price:7,d:l=>`精准区缩小，精准倍率 ×${(1.35+.2*l).toFixed(2)}`},
 {id:'long_engine',t:2,n:'远航引擎',tag:'远航',price:7,d:l=>`蓄力 ≥82% 时倍率 ×${(1.25+.2*l).toFixed(2)}`},
 {id:'cliff',t:2,n:'悬崖舞者',tag:'擦边',price:7,d:l=>`擦边落地倍率 ×${(1.35+.2*l).toFixed(2)}`},
 {id:'route_mint',t:2,n:'航路税印',tag:'经济',price:7,d:l=>`每到安全站额外获得 ${2*l} 航币`},
 {id:'storm',t:3,n:'风暴猎手',tag:'移动平台',price:9,d:l=>`落在移动平台时倍率 ×${(1.6+.2*l).toFixed(2)}`},
 {id:'glass',t:3,n:'玻璃机翼',tag:'高风险',price:9,d:l=>`所有得分 ×${(1.45+.15*l).toFixed(2)}，护航券失效`},
 {id:'interest',t:3,n:'复利导航',tag:'经济',price:9,d:l=>`每站利息额外 +${l} 航币`},
 {id:'gold_echo',t:4,n:'黄金回声',tag:'精准',price:12,d:l=>`精准连击 ≥3 时倍率 ×${(1.7+.3*l).toFixed(2)}`},
 {id:'mint',t:4,n:'航币铸机',tag:'经济',price:12,d:l=>`每第 3 次精准获得 ${l} 航币`},
 {id:'anomaly',t:4,n:'逆风奇迹',tag:'异常航路',price:12,d:l=>`异常航路中倍率 ×${(1.6+.25*l).toFixed(2)}`}
];
function cardById(id){return CARDS.find(card=>card.id===id)}
function odds(){const s=game.safeVisits+1;return s<2?[62,29,8,1,0]:s<4?[42,34,18,5,1]:s<6?[25,34,27,11,3]:[12,27,32,22,7]}
function cardPrice(card){const owned=ownedCard(card.id);return card.price+(owned?.level||0)}
function drawCard(excluded=[]){const weights=odds(),available=CARDS.filter(card=>!excluded.includes(card.id)&&cardLevel(card.id)<3);for(let attempts=0;attempts<40;attempts++){const roll=game.rng()*100;let sum=0,tier=0;for(;tier<weights.length;tier++){sum+=weights[tier];if(roll<sum)break}const choices=available.filter(card=>card.t===tier);if(choices.length)return choices[Math.floor(game.rng()*choices.length)]}return available[Math.floor(game.rng()*available.length)]}
function fillShop(){game.shop=[];while(game.shop.length<5){const card=drawCard(game.shop.map(item=>item.id));if(!card)break;game.shop.push(card)}}
function renderLoadout(root=$('loadout'),sellMode=false){
 const nodes=game.loadout.map(state=>{const def=cardById(state.id),node=document.createElement(sellMode?'button':'div'),refund=Math.max(1,Math.ceil(def.price*.55*state.level));node.className=`loadout-card tier-${def.t}`;node.cardId=state.id;node.innerHTML=`<b>${def.n}</b><small>${def.tag} · ${state.copies}/3</small><em>${'★'.repeat(state.level)}</em>${sellMode?`<span>卖 ${refund}</span>`:''}`;if(sellMode)node.onclick=()=>sellCard(state.id);return node});
 if(!sellMode)while(nodes.length<5){const empty=document.createElement('div');empty.className='loadout-empty';empty.textContent='+';nodes.push(empty)}
 if(sellMode&&!nodes.length){const empty=document.createElement('span');empty.textContent='暂无航标';nodes.push(empty)}root.replaceChildren(...nodes);
}
function sellCard(id){const index=game.loadout.findIndex(card=>card.id===id);if(index<0)return;const state=game.loadout[index],def=cardById(id),refund=Math.max(1,Math.ceil(def.price*.55*state.level));game.loadout.splice(index,1);game.coins+=refund;renderLoadout();renderLoadout($('shoploadout'),true);$('resultscore').textContent=`${game.coins} 航币`;$('resultnote').textContent=`已出售 ${def.n}，返还 ${refund} 航币。`}
function takeCard(card){const price=cardPrice(card),owned=ownedCard(card.id);if(game.coins<price){$('resultnote').textContent=`还差 ${price-game.coins} 航币。可以出售旧牌或跳过。`;return}if(!owned&&game.loadout.length>=5){$('resultnote').textContent='航标槽已满。先点击上方已装备航标出售一张。';return}game.coins-=price;let state=owned,upgraded=false;if(!state){state={id:card.id,level:1,copies:1};game.loadout.push(state)}else{state.copies++;if(state.copies>=3&&state.level<3){state.level++;state.copies=0;upgraded=true}}message(upgraded?`${card.n} 升到 ${state.level} 星！`:`装上：${card.n}`,card.d(state.level));continueRun()}
function refreshShop(){const cost=3+game.shopRerolls;if(game.coins<cost){$('resultnote').textContent=`刷新需要 ${cost} 航币，目前只有 ${game.coins}。`;return}game.coins-=cost;game.shopRerolls++;fillShop();showUpgrades()}
function showUpgrades(){
 if(!game.shop.length)fillShop();const picks=game.shop,cost=3+game.shopRerolls,buttons=picks.map(card=>({text:card.n,action:()=>takeCard(card)}));buttons.push({text:`刷新 · ${cost} 航币`,action:refreshShop},{text:'跳过商店，继续',action:continueRun});
 showOverlay('THE SKY SHOP / 云端牌店','为下一段选一张航标',`${game.coins} 航币`,`下一航段：${anomalyForSegment(game.safeVisits+1).name} · ${anomalyForSegment(game.safeVisits+1).desc}`,buttons,`稀有度 ${odds().join(' / ')}% · 刷新逐次涨价，每站复位 · 同名三张升星`);
 $('shoploadout').classList.remove('hidden');renderLoadout($('shoploadout'),true);const cardButtons=[...$('resultbuttons').children];cardButtons.forEach((button,index)=>{if(index===picks.length){button.innerHTML=`刷新五张　<b>${cost} 航币</b>`;button.className='shop-refresh';return}if(index===picks.length+1){button.className='shop-skip';return}const card=picks[index],owned=ownedCard(card.id),price=cardPrice(card),level=owned?.level||1;button.innerHTML=`<span class="tag">${card.tag}</span><span class="price">◈ ${price}</span><span class="shop-art art-${card.t}"></span><b>${card.n}</b><small>${card.d(level)}</small><span class="owned">${owned?`已装备 ${'★'.repeat(owned.level)} · ${owned.copies}/3`:'新航标'}</span><em>${card.t+1}</em>`;button.className=`shop-card tier-${card.t}${game.coins<price?' locked':''}`;button.setAttribute('aria-label',`${card.n}，${card.d(level)}，价格 ${price} 航币`)});$('resultbuttons').parentElement?.classList.add('shop-mode');
}
function showCheckpoint(){const nextSegment=game.safeVisits+1,next=anomalyForSegment(nextSegment),unlock=game.lastUnlock?` · 解锁 ${game.lastUnlock}`:'';showOverlay('SAFE POINT / 安全站','见好就收？',game.score,`航段 ${game.segment} 完成：航币 +${game.lastCoinGain}，安全徽章 +1${unlock}。\n下一段：${next.name} · ${next.desc}`, [{text:`收手，带走 ${game.score} 分`,main:true,action:bank},{text:`进入牌店 · ${game.coins} 航币 →`,action:showUpgrades}],`徽章抵达即保存 · B 收手 · C 进入牌店`);}
function continueRun(){if(game.phase!=='checkpoint')return;game.segment=game.safeVisits+1;game.anomaly=anomalyForSegment(game.segment);game.segmentPerfects=0;game.segmentRescued=false;game.missionProgress=0;game.shop=[];hideOverlay();game.phase='ready';message(game.anomaly.id==='calm'?'好，再来一跳。':`${game.anomaly.name} 开始。`,game.anomaly.desc);updateHud();canvas.focus({preventScroll:true});}
function bank(){if(game.phase!=='checkpoint')return;game.phase='banked';const newRecord=game.score>best;best=Math.max(best,game.score);let saved=true;try{localStorage.setItem(CONFIG.storageKey,String(best));localStorage.setItem(CONFIG.medalStorageKey,String(medals))}catch{saved=false}$('best').textContent=best;rewardUi.medals.textContent=medals;rewardUi.title.textContent=badgeTitle(medals);renderHeroes();ping(523,.13);ping(659,.13,.12);ping(784,.18,.24);burst(game.ballX,baseY-60,'#e5fc72',45);showOverlay(newRecord?'NEW BEST / 新纪录':'NICELY DONE / 稳稳收下','这次，收得漂亮。',`+${game.score}`,`走过 ${game.step} 座平台，本局抵达 ${game.safeVisits} 个安全站；徽章已经沿途保存。`,[{text:'再来一局 ↗',main:true,action:reset}],saved?`R 立即重开 · ${badgeTitle(medals)} · 徽章已保存在本机`:'当前浏览器无法保存纪录；本次页面仍保留');updateHud();}
function lose(){game.phase='lost';const lostScore=game.lostScore;game.score=0;const desc=game.step?`过了 ${game.step} 跳，${lostScore} 分没能带走。\n历史最高 ${best} 分，还在。`:'第一跳没站稳。\n按住约半秒，再松手试试。';renderHeroes();showOverlay('SO CLOSE / 差一点','再来一次？',0,desc,[{text:'再来一局 ↗',main:true,action:reset}],'R 立即重开 · 已抵达安全站的徽章不会丢');updateHud();}
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
 else if(event.code==='KeyC'&&game.phase==='checkpoint'){event.preventDefault();showUpgrades()}
 else if(event.code==='Escape'){event.preventDefault();game.phase==='paused'?resume():pause()}
});
document.addEventListener('keyup',event=>{if(event.code==='Space'&&input?.kind==='keyboard'){event.preventDefault();releaseCharge()}});
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
$('sound').onclick=()=>{sound=!sound;if(sound){try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});ping(660,.09)}catch{sound=false}}$('sound').textContent=`音效 ${sound?'开':'关'}`;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效')};
$('help').onclick=()=>{const showing=$('rules').classList.toggle('hidden')===false;$('help').setAttribute('aria-expanded',String(showing));if(showing)pause()};
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fill()}
function drawPlatform(p){
 const x=platformX(p,game.time)-game.camera;if(x< -p.width||x>W+p.width)return;
 const safe=checkpoint(p.index),current=p.index===game.step,next=p.index===game.step+1,w=effectiveWidth(p);
 const body=safe?'#747d46':current?'#6157b3':'#454267',top=safe?'#d6ed7a':current?'#a092f4':'#7f77bf';
 ctx.globalAlpha=p.index>game.step+1?.45:1;
 ellipse(x,baseY+42,w*.55,10,'#0f1224');
 ctx.fillStyle=body;ctx.fillRect(x-w/2,baseY,w,24);ellipse(x,baseY+24,w/2,15,body);ellipse(x,baseY,w/2,15,top);
 ctx.strokeStyle=safe?'#edffa8':'#b4a9ff';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,baseY,w/2-.7,14.3,0,0,Math.PI*2);ctx.stroke();
 ellipse(x,baseY,perfectRadiusFor(p),4.2,next?'#eaff99':'#c4b8ff');
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
   const drift=game.anomaly.id==='wind'?windDrift():0,end=game.ballX+distanceForPower(game.power)+drift,ok=Math.abs(end-platformX(next,game.time))<=effectiveWidth(next)/2-4;
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
resize();renderHeroes();reset();
if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('preview')==='shop'){game.phase='checkpoint';game.safeVisits=3;game.segment=3;game.coins=26;game.score=360;showUpgrades();updateHud()}
frame=requestAnimationFrame(tick);
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);audio?.close().catch(()=>{})},{once:true});
