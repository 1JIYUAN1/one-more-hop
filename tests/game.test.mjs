import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from '../docs/game-core.mjs';

// 参数区：仅读取本项目源码；全部交互在内存替身中运行，不控制浏览器。
const PATHS={gameSource:new URL('../docs/game.js',import.meta.url)};
test('蓄力距离单调且受限，反算可复现目标距离',()=>{assert.equal(core.distanceForPower(-1),60);assert.equal(core.distanceForPower(2),360);for(const d of [100,172,202,240,340])assert.ok(Math.abs(core.distanceForPower(core.powerForDistance(d))-d)<1e-8)});
test('精准连击递增，普通落地中断连击，落空不得分',()=>{const p={x:200,width:100,moving:false};assert.equal(core.landingResult(200,p,0,0).points,20);assert.equal(core.landingResult(200,p,0,1).points,40);assert.equal(core.landingResult(230,p,0,4).combo,0);assert.equal(core.landingResult(255,p,0,4).points,0);assert.equal(core.landingResult(200,p,0,30).points,100)});
test('仅在实际每第三跳提供安全站',()=>{assert.equal(core.checkpoint(0),false);assert.equal(core.checkpoint(3),true);assert.equal(core.checkpoint(4),false);assert.equal(core.checkpoint(99),true)});
test('大量生成的平台从最差合法落脚点仍可到达，安全站不移动',()=>{for(let seed=0;seed<30;seed++){const rng=core.seededRandom(seed);let p={x:180,width:128,moving:false};for(let i=1;i<=150;i++){const next=core.nextPlatform(p,i,rng),gap=next.x-p.x;assert.ok(gap-p.width/2-38>=core.RULES.minDistance);assert.ok(gap+p.width/2+38<=360);if(core.checkpoint(i))assert.equal(next.moving,false);assert.ok(next.width>=48);p=next}}});
test('移动平台按当前时刻判定，不能用静态位置作弊',()=>{const p={x:200,width:48,moving:true,phase:Math.PI/2};assert.equal(core.platformX(p,0),219);assert.equal(core.landingResult(180,p,0,0).safe,false);assert.equal(core.landingResult(219,p,0,0).perfect,true)});

function harness(){
 const elements=new Map(),saved=new Map(),handlers={};
 class Element{
  constructor(){this.children=[];this.style={};this.disabled=false;this.textContent='';this.className='';this.classList={add(){},remove(){},toggle(){return true}}}
  get firstElementChild(){return this.children[0]} getBoundingClientRect(){return {width:900,height:510}} getContext(){return new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(obj,key)=>obj[key]??(()=>{})})} setAttribute(){} focus(){} append(child){this.children.push(child)} replaceChildren(){this.children=[]} addEventListener(name,fn){handlers[name]=fn}setPointerCapture(){}
 }
 const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement(){return new Element()},addEventListener(){},hidden:false};
 document.getElementById('station').children=Array.from({length:3},()=>new Element());
 const context=vm.createContext({...core,document,window:{addEventListener(){}},matchMedia:()=>({matches:true}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},HTMLButtonElement:Element,localStorage:{getItem:key=>saved.get(key),setItem:(key,val)=>saved.set(key,val)},performance:{now:()=>clock},Math,console});
 let clock=0;const source=readFileSync(PATHS.gameSource,'utf8').replace(/^import[^\n]+\n/,'');vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context),advance=ms=>{clock+=ms;run(`tick(${clock})`)};
 return {run,advance,saved,elements,perfectJump(){const ms=run('powerForDistance(platformX(game.platforms[game.step+1],game.time)-game.ballX)*RULES.chargeMs');run("startCharge('keyboard','space')");clock+=ms;run('releaseCharge()');for(let i=0;i<50;i++)advance(16)}};
}
test('完整流程：三次精准落地、安全站、收手、重开、落空不损坏纪录',()=>{const h=harness();h.perfectJump();h.perfectJump();h.perfectJump();assert.equal(h.run('game.phase'),'checkpoint');assert.equal(h.run('game.score'),120);h.run('bank()');assert.equal(h.run('game.phase'),'banked');assert.equal([...h.saved.values()][0],'120');h.run('reset()');h.run("startCharge('keyboard','space');releaseCharge()");for(let i=0;i<120;i++)h.advance(16);assert.equal(h.run('game.phase'),'lost');assert.equal(h.run('game.score'),0);assert.equal(h.run('best'),120)});
test('继续冒险保留分数；暂停取消蓄力且可以恢复',()=>{const h=harness();h.perfectJump();h.perfectJump();h.perfectJump();h.run('continueRun()');assert.equal(h.run('game.phase'),'ready');assert.equal(h.run('game.score'),120);h.run("startCharge('keyboard','space');pause()");assert.equal(h.run('game.phase'),'paused');assert.equal(h.run('input'),null);h.run('resume()');assert.equal(h.run('game.phase'),'ready');assert.equal(h.run('game.score'),120)});
