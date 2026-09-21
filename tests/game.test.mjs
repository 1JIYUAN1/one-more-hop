import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from '../docs/game-core.mjs';

// 参数区：仅读取本项目源码；全部交互在内存替身中运行，不控制浏览器。
const PATHS={gameSource:new URL('../docs/game.js',import.meta.url)};
test('蓄力距离单调且受限，反算可复现目标距离',()=>{assert.equal(core.distanceForPower(-1),60);assert.equal(core.distanceForPower(2),360);for(const d of [100,172,202,240,340])assert.ok(Math.abs(core.distanceForPower(core.powerForDistance(d))-d)<1e-8)});
test('精准连击递增，普通落地中断连击，落空不得分',()=>{const p={x:200,width:100,moving:false};assert.equal(core.landingResult(200,p,0,0).points,20);assert.equal(core.landingResult(200,p,0,1).points,40);assert.equal(core.landingResult(230,p,0,4).combo,0);assert.equal(core.landingResult(255,p,0,4).points,0);assert.equal(core.landingResult(200,p,0,30).points,100)});
test('安全站间隔随进度递增',()=>{assert.equal(core.checkpoint(3),true);assert.equal(core.checkpoint(7),true);assert.equal(core.checkpoint(12),true);assert.equal(core.checkpoint(6),false);assert.equal(core.nextCheckpoint(3),7)});
test('安全站区间能给出航段长度与当前进度',()=>{assert.deepEqual(core.checkpointRange(0),{start:0,end:3,length:3,progress:0,stage:1});assert.deepEqual(core.checkpointRange(2),{start:0,end:3,length:3,progress:2,stage:1});assert.deepEqual(core.checkpointRange(3),{start:3,end:7,length:4,progress:0,stage:2});assert.deepEqual(core.checkpointRange(8),{start:7,end:12,length:5,progress:1,stage:3})});
test('大量生成的平台从最差合法落脚点仍可到达',()=>{for(let seed=0;seed<30;seed++){const rng=core.seededRandom(seed);let p={x:180,width:128,moving:false};for(let i=1;i<=150;i++){const next=core.nextPlatform(p,i,rng),gap=next.x-p.x;assert.ok(gap-p.width/2-38>=core.RULES.minDistance);assert.ok(gap+p.width/2+38<=360);assert.ok(next.width>=48);p=next}}});
test('移动平台按当前时刻判定，不能用静态位置作弊',()=>{const p={x:200,width:48,moving:true,phase:Math.PI/2};assert.equal(core.platformX(p,0),219);assert.equal(core.landingResult(180,p,0,0).safe,false);assert.equal(core.landingResult(219,p,0,0).perfect,true)});
test('两次精准落地只奖励一张护航券，徽章称号按累计数升级',()=>{let state=core.ticketProgress(0,true,0);assert.deepEqual(state,{progress:1,tickets:0,earned:false});state=core.ticketProgress(state.progress,true,state.tickets);assert.deepEqual(state,{progress:0,tickets:1,earned:true});assert.equal(core.ticketProgress(1,true,1).tickets,1);assert.equal(core.badgeTitle(0),'起跳练习生');assert.equal(core.badgeTitle(3),'纸飞机收集家');assert.equal(core.badgeTitle(9),'月球领航员')});

function harness(){
 const elements=new Map(),saved=new Map(),handlers={};
 class Element{
  constructor(){this.children=[];this.style={};this.disabled=false;this.textContent='';this.className='';this.classList={add(){},remove(){},toggle(){return true}}}
  get firstElementChild(){return this.children[0]} getBoundingClientRect(){return {width:900,height:510}} getContext(){return new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(obj,key)=>obj[key]??(()=>{})})} setAttribute(){} focus(){} append(child){this.children.push(child)} replaceChildren(){this.children=[]} addEventListener(name,fn){handlers[name]=fn}setPointerCapture(){}
 }
 const document={body:new Element(),getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement(){return new Element()},addEventListener(){},hidden:false};
 document.getElementById('station').children=Array.from({length:3},()=>new Element());
 const context=vm.createContext({...core,document,window:{addEventListener(){}},matchMedia:()=>({matches:true}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},HTMLButtonElement:Element,localStorage:{getItem:key=>saved.get(key),setItem:(key,val)=>saved.set(key,val)},performance:{now:()=>clock},Math,console});
 let clock=0;const source=readFileSync(PATHS.gameSource,'utf8').replace(/^import[^\n]+\n/,'');vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context),advance=ms=>{clock+=ms;run(`tick(${clock})`)};
 return {run,advance,saved,elements,perfectJump(){const ms=run('powerForDistance(platformX(game.platforms[game.step+1],game.time)-game.ballX)*RULES.chargeMs');run("startCharge('keyboard','space')");clock+=ms;run('releaseCharge()');for(let i=0;i<50;i++)advance(16)}};
}
test('完整流程：抵达安全站立即保存徽章，收手保存纪录，落空不损坏纪录',()=>{const h=harness();h.perfectJump();h.perfectJump();h.perfectJump();assert.equal(h.run('game.phase'),'checkpoint');const score=h.run('game.score');assert.ok(score>=120);assert.ok(h.run('game.coins')>2);assert.equal(h.run('medals'),1);assert.equal(h.saved.get('one-more-hop.medals.v1'),'1');h.run('bank()');assert.equal(h.run('game.phase'),'banked');assert.equal(h.run('medals'),1);assert.equal(h.saved.get('one-more-hop.best.v1'),String(score));h.run('reset()');h.run("startCharge('keyboard','space');releaseCharge()");for(let i=0;i<120;i++)h.advance(16);assert.equal(h.run('game.phase'),'lost');assert.equal(h.run('game.score'),0);assert.equal(h.run('best'),score);assert.equal(h.run('medals'),1)});
test('继续冒险保留航程分并进入下一段异常规则；暂停取消蓄力且可以恢复',()=>{const h=harness();h.perfectJump();h.perfectJump();h.perfectJump();const score=h.run('game.score');h.run('continueRun()');assert.equal(h.run('game.phase'),'ready');assert.equal(h.run('game.score'),score);assert.equal(h.run('game.segment'),2);assert.equal(h.run('game.anomaly.id'),'wind');h.run("startCharge('keyboard','space');pause()");assert.equal(h.run('game.phase'),'paused');assert.equal(h.run('input'),null);h.run('resume()');assert.equal(h.run('game.phase'),'ready');assert.equal(h.run('game.score'),score)});
test('购买航标只花航币并占一个槽位；同名三张会真正升为二星',()=>{const h=harness();h.run('game.phase="checkpoint";game.coins=100;game.score=321');for(let i=0;i<3;i++)h.run('game.phase="checkpoint";takeCard(CARDS[0])');assert.equal(h.run('game.score'),321);assert.equal(h.run('game.loadout.length'),1);assert.equal(h.run('game.loadout[0].level'),2);assert.equal(h.run('game.loadout[0].copies'),0);assert.ok(h.run('game.coins')<100)});
