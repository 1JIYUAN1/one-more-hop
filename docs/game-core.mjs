// 参数区：游戏数值集中定义；无外部输入输出路径。
export const RULES={chargeMs:1100,minDistance:60,distanceRange:300,checkpointEvery:3,perfectRadius:12};
export const distanceForPower=p=>RULES.minDistance+Math.max(0,Math.min(1,p))*RULES.distanceRange;
export const powerForDistance=d=>Math.max(0,Math.min(1,(d-RULES.minDistance)/RULES.distanceRange));
export function seededRandom(seed){let x=seed>>>0;return ()=>{x+=0x6D2B79F5;let t=Math.imul(x^x>>>15,1|x);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296}}
export function nextPlatform(previous,index,rng=Math.random){const gap=index<=3?[172,202,184][index-1]:155+rng()*85;const width=index<=3?[112,98,88][index-1]:Math.max(48,88-index*1.35+rng()*20);return {x:previous.x+gap,width,index,moving:index>=10&&index%3!==0&&rng()<.3,phase:rng()*Math.PI*2};}
export function platformX(p,time){return p.x+(p.moving?Math.sin(time*1.6+p.phase)*19:0)}
export function landingResult(x,platform,time,combo){const error=x-platformX(platform,time);const safe=Math.abs(error)<=platform.width/2-4;const perfect=safe&&Math.abs(error)<=Math.min(RULES.perfectRadius,platform.width*.16);const nextCombo=perfect?combo+1:0;return {safe,perfect,error,combo:nextCombo,points:safe?(perfect?20*Math.min(nextCombo,5):10):0};}
export function checkpoint(step){return step>0&&step%RULES.checkpointEvery===0}
