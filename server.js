const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const os=require('os');

const app=express();
const httpServer=http.createServer(app);
const io=new Server(httpServer);
app.use(express.static(__dirname));

/* V0.34 INTERNET — endpoint pour Render / health checks. */
app.get('/health',(req,res)=>{
  res.status(200).json({ok:true,game:'PING!',version:'0.34.3',rooms:rooms ? rooms.size : 0});
});

const rooms=new Map();

function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function makeInitialState(){
  const pingPiles=[];
  for(const color of ['jaune','vert','rouge']){
    const v=shuffle([1,2,3,4,5,6]);
    pingPiles.push({color,cards:v.slice(0,3)});
    pingPiles.push({color,cards:v.slice(3,6)});
  }
  const objectiveDeck=shuffle(Array.from({length:14},(_,i)=>i+1));
  const top=objectiveDeck.shift();
  const bottom=objectiveDeck.shift();
  return {
    pingPiles,
    playerObjectives:{top,bottom},
    objectiveDeck,
    phase:'service',
    localEnergy:7,
    opponentEnergy:7,
    localMovement:7,
    opponentMovement:7,
    opponentPaddleNode:'S',
    localPaddleNode:'S',
    serviceDone:false,
    lastServiceValue:null,
    boardPlays:[],
    blockedColor:null,
    pointEnded:false,
    pointWinnerSide:null,
    pointEndReason:null,
    pointEndMessage:null,
    matchScore:{top:0,bottom:0},
    pointServerSide:'bottom'
  };
}

function makeCode(){
  let c; do{ c=String(Math.floor(1000+Math.random()*9000)); }while(rooms.has(c));
  return c;
}


const MOVE_GRAPH = {
  S:[3,4],
  1:[2,3],
  2:[1,4],
  3:['S',1,4,5],
  4:['S',2,3,6],
  5:[3],
  6:[4]
};

function shortestDistance(from,to){
  if(String(from)===String(to)) return 0;
  const q=[[from,0]];
  const seen=new Set([String(from)]);
  while(q.length){
    const [node,d]=q.shift();
    for(const nxt of MOVE_GRAPH[node] || MOVE_GRAPH[String(node)] || []){
      if(String(nxt)===String(to)) return d+1;
      const key=String(nxt);
      if(!seen.has(key)){
        seen.add(key);
        q.push([nxt,d+1]);
      }
    }
  }
  return Infinity;
}

function responseRuleAllows(color, previousValue, candidateValue){
  if(color==='rouge') return candidateValue >= previousValue;
  if(color==='jaune') return candidateValue <= previousValue;
  if(color==='vert') return Math.abs(candidateValue-previousValue) <= 1;
  return false;
}



const OBJECTIVE_RULES = {
  1:{type:'positions', slots:{4:'rouge',3:'jaune',2:'vert'}},
  2:{type:'positions', slots:{6:'vert',3:'any',1:'rouge'}},
  3:{type:'positions', slots:{5:'vert',4:'rouge',3:'jaune'}},
  4:{type:'positions', slots:{6:'vert',3:'any',1:'jaune'}},
  5:{type:'positions', slots:{6:'rouge',5:'vert',4:'jaune'}},
  6:{type:'positions', slots:{6:'vert',5:'any',2:'jaune'}},
  7:{type:'positions', slots:{6:'vert',5:'rouge',4:'jaune'}},
  8:{type:'positions', slots:{6:'rouge',4:'any',2:'vert'}},
  9:{type:'positions', slots:{6:'rouge',4:'any',1:'vert'}},
  10:{type:'stack', stackPos:5, stackColor:'jaune', stackCount:2, otherPos:2, otherColor:'any'},
  11:{type:'stack', stackPos:4, stackColor:'jaune', stackCount:2, otherPos:6, otherColor:'any'},
  12:{type:'stack', stackPos:2, stackColor:'rouge', stackCount:2, otherPos:5, otherColor:'any'},
  13:{type:'stack', stackPos:2, stackColor:'vert', stackCount:2, otherPos:5, otherColor:'any'},
  14:{type:'stack', stackPos:3, stackColor:'vert', stackCount:2, otherPos:6, otherColor:'any'}
};

function canPayMoveDistance(distance,movementAvailable,energyAvailable){
  if(distance===0) return true;
  for(let moveSpend=1; moveSpend<=distance; moveSpend++){
    const energySpend=distance-moveSpend;
    if(moveSpend<=movementAvailable && energySpend<=energyAvailable) return true;
  }
  return false;
}

function hasLegalResponse(st,side){
  const energy = side==='top' ? st.opponentEnergy : st.localEnergy;
  for(const pile of st.pingPiles){
    if(!pile || !pile.cards || !pile.cards.length) continue;
    if(st.blockedColor && pile.color===st.blockedColor) continue;
    const printed=Number(pile.cards[0]);
    for(let v=1; v<=6; v++){
      const cost=Math.abs(printed-v);
      if(cost<=energy && responseRuleAllows(st.lastPlayedColor,Number(st.lastPlayedValue),v)){
        return true;
      }
    }
  }
  return false;
}

function objectiveStacks(st,side){
  const stacks={1:[],2:[],3:[],4:[],5:[],6:[]};
  for(const play of st.boardPlays||[]){
    if(play.side!==side) continue;
    const v=Number(play.finalValue);
    if(stacks[v]) stacks[v].push(play.color);
  }
  return stacks;
}

function objectiveComplete(st,side){
  const id=st.playerObjectives && st.playerObjectives[side];
  const rule=OBJECTIVE_RULES[id];
  if(!rule) return false;
  const stacks=objectiveStacks(st,side);

  const slotMatches=(pos,color)=>{
    const stack=stacks[Number(pos)]||[];
    if(!stack.length) return false;
    const visible=stack[stack.length-1];
    return color==='any' ? true : visible===color;
  };

  const stackMatches=(pos,color,count)=>{
    const stack=stacks[Number(pos)]||[];
    if(stack.length<count) return false;
    return stack.slice(-count).every(c=>c===color);
  };

  if(rule.type==='positions'){
    return Object.entries(rule.slots).every(([pos,color])=>slotMatches(pos,color));
  }
  if(rule.type==='stack'){
    return stackMatches(rule.stackPos,rule.stackColor,rule.stackCount) &&
           slotMatches(rule.otherPos,rule.otherColor);
  }
  return false;
}


function resetPointState(st){
  const pingPiles=[];
  for(const color of ['jaune','vert','rouge']){
    const v=shuffle([1,2,3,4,5,6]);
    pingPiles.push({color,cards:v.slice(0,3)});
    pingPiles.push({color,cards:v.slice(3,6)});
  }
  st.pingPiles=pingPiles;

  /* Les objectifs déjà joués ne reviennent pas dans la pioche pendant la partie. */
  if(!Array.isArray(st.objectiveDeck)) st.objectiveDeck=[];
  if(st.objectiveDeck.length>=2){
    st.playerObjectives={
      top:st.objectiveDeck.shift(),
      bottom:st.objectiveDeck.shift()
    };
  }

  st.localEnergy=7;
  st.opponentEnergy=7;
  st.localMovement=7;
  st.opponentMovement=7;
  st.localPaddleNode='S';
  st.opponentPaddleNode='S';

  st.serviceDone=false;
  st.lastServiceValue=null;
  st.lastPlayedColor=null;
  st.lastPlayedValue=null;
  st.blockedColor=null;
  st.boardPlays=[];

  st.pointEnded=false;
  st.pointWinnerSide=null;
  st.pointEndReason=null;
  st.pointEndMessage=null;

  /* Le service change de joueur à chaque point. */
  st.pointServerSide = st.pointServerSide==='bottom' ? 'top' : 'bottom';
  st.phase='service';
}

function markPointEnded(room,r,winnerSide,reason,message){
  const st=r.state;
  if(!st || st.pointEnded) return false;
  st.pointEnded=true;
  st.pointWinnerSide=winnerSide;
  st.pointEndReason=reason;
  st.pointEndMessage=message;
  st.phase='pointEnded';
  io.to(room).emit('freshPointEnded',{
    state:st,
    winnerSide,
    reason,
    message
  });
  return true;
}

function maybeEndBeforeMove(room,r,receivingSide,targetValue){
  const st=r.state;
  const movement=receivingSide==='top' ? st.opponentMovement : st.localMovement;
  const energy=receivingSide==='top' ? st.opponentEnergy : st.localEnergy;
  const node=receivingSide==='top' ? (st.opponentPaddleNode??'S') : (st.localPaddleNode??'S');
  const distance=shortestDistance(node,Number(targetValue));
  if(canPayMoveDistance(distance,movement,energy)) return false;

  const winner=receivingSide==='top' ? 'bottom' : 'top';
  const loserLabel=receivingSide==='top' ? 'J2' : 'J1';
  return markPointEnded(
    room,r,winner,'impossibleMovement',
    `${loserLabel} doit parcourir ${distance} zone(s), mais aucune combinaison déplacement/énergie n’est possible.`
  );
}

function maybeEndAfterMove(room,r,movingSide){
  const st=r.state;
  const movement=movingSide==='top' ? st.opponentMovement : st.localMovement;
  if(movement<=0){
    const winner=movingSide==='top' ? 'bottom' : 'top';
    const loserLabel=movingSide==='top' ? 'J2' : 'J1';
    return markPointEnded(
      room,r,winner,'movementZero',
      `${loserLabel} n’a plus de déplacement.`
    );
  }

  if(!hasLegalResponse(st,movingSide)){
    const winner=movingSide==='top' ? 'bottom' : 'top';
    const loserLabel=movingSide==='top' ? 'J2' : 'J1';
    return markPointEnded(
      room,r,winner,'noLegalResponse',
      `${loserLabel} ne dispose d’aucune réponse légale avec les tuiles et l’énergie restantes.`
    );
  }
  return false;
}


/* V0.25 BOT : siège J2/top, objectifs des deux joueurs visibles. */
function botLog(room,text){io.to(room).emit('freshBotLog',{text});}
function botVisiblePiles(st){
 return (st.pingPiles||[]).map((p,i)=>({
  pileIndex:i,
  color:p&&p.color||'',
  visibleValue:p&&p.cards&&p.cards.length?Number(p.cards[0]):null,
  remaining:p&&p.cards?p.cards.length:0,
  blocked:!!(st.blockedColor&&p&&p.color===st.blockedColor)
 }));
}
function botAnalysis(room,kind,st,data,difficulty='easy'){
 io.to(room).emit('freshBotAnalysis',{
  kind,difficulty,
  at:new Date().toISOString(),
  state:{
   phase:st.phase,pointServerSide:st.pointServerSide,
   botEnergy:st.opponentEnergy,botMovement:st.opponentMovement,
   playerEnergy:st.localEnergy,playerMovement:st.localMovement,
   botPaddle:st.opponentPaddleNode,playerPaddle:st.localPaddleNode,
   botObjective:st.playerObjectives&&st.playerObjectives.top,
   playerObjective:st.playerObjectives&&st.playerObjectives.bottom,
   blockedColor:st.blockedColor,lastPlayedColor:st.lastPlayedColor,lastPlayedValue:st.lastPlayedValue,
   botProgress:botProgress(st,'top'),playerProgress:botProgress(st,'bottom'),
   visiblePiles:botVisiblePiles(st)
  },
  data
 });
}
function botBonus(st,side,color,v){
 const id=st.playerObjectives&&st.playerObjectives[side],r=OBJECTIVE_RULES[id]; if(!r)return 0;
 if(r.type==='positions'){const n=r.slots[v];return n&&(n==='any'||n===color)?24:0;}
 let x=0;if(+r.stackPos===+v&&r.stackColor===color)x+=26;
 if(+r.otherPos===+v&&(r.otherColor==='any'||r.otherColor===color))x+=18;return x;
}
function botProgress(st,side){
 const id=st.playerObjectives&&st.playerObjectives[side],r=OBJECTIVE_RULES[id];if(!r)return 0;
 const s=objectiveStacks(st,side);if(r.type==='positions'){let n=0;for(const[p,c]of Object.entries(r.slots)){const a=s[+p]||[];if(a.length&&(c==='any'||a[a.length-1]===c))n++;}return n;}
 let n=0,a=s[+r.stackPos]||[],run=0;for(let i=a.length-1;i>=0&&a[i]===r.stackColor;i--)run++;n+=Math.min(run,r.stackCount);
 const b=s[+r.otherPos]||[];if(b.length&&(r.otherColor==='any'||b[b.length-1]===r.otherColor))n++;return n;
}
function botEasyShot(st,isService){
 const a=[];for(let i=0;i<st.pingPiles.length;i++){const p=st.pingPiles[i];if(!p||!p.cards.length)continue;
  if(!isService&&st.blockedColor===p.color)continue;const printed=+p.cards[0];
  for(let v=1;v<=6;v++){const cost=Math.abs(printed-v);if(cost>st.opponentEnergy)continue;
   if(!isService&&!responseRuleAllows(st.lastPlayedColor,+st.lastPlayedValue,v))continue;
   const own=botBonus(st,'top',p.color,v),opp=botBonus(st,'bottom',p.color,v);
   a.push({pileIndex:i,color:p.color,printedValue:printed,finalValue:v,cost,score:own-.30*opp-3*cost,own,opp,mode:'easy'});
  }}
 a.sort((x,y)=>y.score-x.score||x.cost-y.cost||x.pileIndex-y.pileIndex||x.finalValue-y.finalValue);
 return {choice:a[0]||null,count:a.length,options:a.map((o,rank)=>({...o,rank:rank+1}))};
}


function botObjectiveNeed(st,side){
 const id=st.playerObjectives&&st.playerObjectives[side],r=OBJECTIVE_RULES[id];
 if(!r)return 99;
 if(r.type==='positions')return Object.keys(r.slots||{}).length;
 return Number(r.stackCount||0)+1;
}

function botBottomImmediateObjectiveWins(st,shot){
 /* Après le coup du BOT, combien de réponses légales de J1
    complèteraient immédiatement son objectif ? */
 const testBase=JSON.parse(JSON.stringify(st));
 testBase.lastPlayedColor=shot.color;
 testBase.lastPlayedValue=shot.finalValue;
 testBase.blockedColor=shot.color;
 let wins=0, legal=0;

 for(let i=0;i<testBase.pingPiles.length;i++){
  const p=testBase.pingPiles[i];
  if(!p||!p.cards||!p.cards.length)continue;
  if(testBase.blockedColor===p.color)continue;
  const printed=Number(p.cards[0]);

  for(let v=1;v<=6;v++){
   const cost=Math.abs(printed-v);
   if(cost>testBase.localEnergy)continue;
   if(!responseRuleAllows(testBase.lastPlayedColor,Number(testBase.lastPlayedValue),v))continue;
   legal++;

   const s=JSON.parse(JSON.stringify(testBase));
   s.pingPiles[i].cards.shift();
   s.localEnergy-=cost;
   s.lastPlayedColor=p.color;
   s.lastPlayedValue=v;
   s.blockedColor=p.color;
   s.boardPlays.push({
    type:'bottomResponse',side:'bottom',pileIndex:i,color:p.color,
    printedValue:printed,finalValue:v,cost
   });
   if(objectiveComplete(s,'bottom'))wins++;
  }
 }
 return {wins,legal};
}

function botIncomingRiskAfterShot(st,shot){
 /* Estimation d'un échange à l'avance :
    parmi les réponses légales de J1, quelle distance le BOT pourrait-il devoir
    couvrir ensuite, avec ses ressources restantes après son propre coup ? */
 const energyAfter=st.opponentEnergy-shot.cost;
 const movementAfter=st.opponentMovement;
 let worstDistance=0, unaffordable=0, replies=0;

 for(let i=0;i<st.pingPiles.length;i++){
  const p=st.pingPiles[i];
  if(!p||!p.cards||!p.cards.length)continue;
  if(p.color===shot.color)continue;
  const printed=Number(p.cards[0]);

  for(let v=1;v<=6;v++){
   const cost=Math.abs(printed-v);
   if(cost>st.localEnergy)continue;
   if(!responseRuleAllows(shot.color,Number(shot.finalValue),v))continue;
   replies++;
   const d=shortestDistance(st.opponentPaddleNode??'S',v);
   if(Number.isFinite(d)) worstDistance=Math.max(worstDistance,d);
   if(!canPayMoveDistance(d,movementAfter,energyAfter)) unaffordable++;
  }
 }
 return {worstDistance,unaffordable,replies};
}

function botFutureReach(st,target,moveSpend,energySpend){
 const movementAfter=st.opponentMovement-moveSpend;
 const energyAfter=st.opponentEnergy-energySpend;
 let reachable=0;
 for(let v=1;v<=6;v++){
  const d=shortestDistance(target,v);
  if(canPayMoveDistance(d,movementAfter,energyAfter))reachable++;
 }
 return {movementAfter,energyAfter,reachable,totalCapacity:movementAfter+energyAfter};
}

function botIntermediateShot(st,isService){
 const a=[];
 const playerProgress=botProgress(st,'bottom');
 const playerNeed=botObjectiveNeed(st,'bottom');
 const playerUrgent=playerProgress>=Math.max(0,playerNeed-1);

 for(let i=0;i<st.pingPiles.length;i++){
  const p=st.pingPiles[i]; if(!p||!p.cards.length) continue;
  if(!isService&&st.blockedColor===p.color) continue;
  const printed=+p.cards[0];

  for(let v=1;v<=6;v++){
   const cost=Math.abs(printed-v);
   if(cost>st.opponentEnergy) continue;
   if(!isService&&!responseRuleAllows(st.lastPlayedColor,+st.lastPlayedValue,v)) continue;

   const own=botBonus(st,'top',p.color,v);
   const legacyOpp=botBonus(st,'bottom',p.color,v);
   const energyAfter=st.opponentEnergy-cost;

   const oppDistance=shortestDistance(st.localPaddleNode??'S',v);
   const oppCanPay=canPayMoveDistance(oppDistance,st.localMovement,st.localEnergy);
   const pressure=oppCanPay ? oppDistance*4 : 120;

   let survivalPenalty=0;
   if(energyAfter<=0) survivalPenalty+=28;
   else if(energyAfter===1) survivalPenalty+=17;
   else if(energyAfter===2) survivalPenalty+=9;
   else if(energyAfter===3) survivalPenalty+=3;

   if(st.opponentMovement<=2 && energyAfter<=2) survivalPenalty+=18;
   else if(st.opponentMovement<=3 && energyAfter<=2) survivalPenalty+=9;

   /* V2 : défense réelle de l'objectif adverse.
      On regarde si CE coup laisse à J1 une réponse qui gagne immédiatement par objectif. */
   const threat=botBottomImmediateObjectiveWins(st,{color:p.color,finalValue:v,cost});
   let objectiveDefense=0;
   if(threat.wins>0){
    objectiveDefense -= playerUrgent ? 85*threat.wins : 38*threat.wins;
   }else if(playerUrgent && threat.legal>0){
    objectiveDefense += 20;
   }

   /* V2 : anticipation d'un échange.
      Un coup est moins bon s'il ouvre des réponses que le BOT ne pourrait
      ensuite plus réceptionner avec ses ressources restantes. */
   const incoming=botIncomingRiskAfterShot(st,{color:p.color,finalValue:v,cost});
   let futurePenalty=0;
   futurePenalty += incoming.unaffordable*18;
   if(incoming.worstDistance>=3 && st.opponentMovement+energyAfter<=3) futurePenalty+=16;
   else if(incoming.worstDistance>=2 && st.opponentMovement+energyAfter<=2) futurePenalty+=12;

   const score =
      own
      - 0.20*legacyOpp
      - 3.0*cost
      - survivalPenalty
      + pressure
      + objectiveDefense
      - futurePenalty;

   a.push({
     pileIndex:i,color:p.color,printedValue:printed,finalValue:v,cost,
     score,own,opp:legacyOpp,energyAfter,oppDistance,oppCanPay,pressure,
     survivalPenalty,playerProgress,playerNeed,playerUrgent,
     immediatePlayerObjectiveWins:threat.wins,
     playerLegalReplies:threat.legal,
     incomingWorstDistance:incoming.worstDistance,
     incomingUnaffordableReplies:incoming.unaffordable,
     futurePenalty,
     objectiveDefense,
     mode:'intermediate_v2'
   });
  }
 }
 a.sort((x,y)=>y.score-x.score||x.cost-y.cost||x.pileIndex-y.pileIndex||x.finalValue-y.finalValue);
 return {choice:a[0]||null,count:a.length,options:a.map((o,rank)=>({...o,rank:rank+1}))};
}

function botShot(st,isService,difficulty='easy'){
 return String(difficulty).startsWith('intermediate') ? botIntermediateShot(st,isService) : botEasyShot(st,isService);
}
function botEasyMoveChoice(st,target){
 const d=shortestDistance(st.opponentPaddleNode??'S',target);if(!Number.isFinite(d))return null;
 if(d===0)return{choice:{targetValue:+target,moveSpend:0,energySpend:0,distance:0,mode:'easy'},options:[{targetValue:+target,moveSpend:0,energySpend:0,distance:0,rank:1,mode:'easy'}]};
 const a=[];for(let m=1;m<=d;m++){let e=d-m;if(m<=st.opponentMovement&&e<=st.opponentEnergy)a.push({targetValue:+target,moveSpend:m,energySpend:e,distance:d,mode:'easy'});}
 a.sort((x,y)=>x.energySpend-y.energySpend||y.moveSpend-x.moveSpend);
 return {choice:a[0]||null,options:a.map((o,rank)=>({...o,rank:rank+1}))};
}

function botIntermediateMoveChoice(st,target){
 const d=shortestDistance(st.opponentPaddleNode??'S',target);if(!Number.isFinite(d))return null;
 if(d===0)return{choice:{targetValue:+target,moveSpend:0,energySpend:0,distance:0,score:0,mode:'intermediate_v2'},options:[{targetValue:+target,moveSpend:0,energySpend:0,distance:0,score:0,rank:1,mode:'intermediate_v2'}]};

 const a=[];
 for(let m=1;m<=d;m++){
  const e=d-m;
  if(m>st.opponentMovement || e>st.opponentEnergy) continue;

  const future=botFutureReach(st,+target,m,e);
  const movementAfter=future.movementAfter;
  const energyAfter=future.energyAfter;

  let risk=0;

  /* Survie immédiate : le déplacement à zéro perd le point. */
  if(movementAfter<=0) risk+=1000;
  else if(movementAfter===1) risk+=95;
  else if(movementAfter===2) risk+=38;
  else if(movementAfter===3) risk+=15;
  else if(movementAfter===4) risk+=5;

  if(energyAfter<=0) risk+=32;
  else if(energyAfter===1) risk+=18;
  else if(energyAfter===2) risk+=9;
  else if(energyAfter===3) risk+=4;

  /* V2 : capacité réelle au prochain échange.
     On valorise le nombre de positions 1..6 que le BOT pourrait encore réceptionner. */
  risk += (6-future.reachable)*14;

  /* La somme des deux réserves doit rester suffisante pour encaisser une distance 3.
     Ce n'est pas une garantie, mais une vraie marge de sécurité. */
  if(future.totalCapacity<3) risk+=45;
  else if(future.totalCapacity===3) risk+=15;

  /* Léger équilibrage seulement : on évite les réserves très déséquilibrées
     sans forcer un partage artificiel 50/50. */
  risk += Math.abs(movementAfter-energyAfter)*1.2;

  a.push({
    targetValue:+target,moveSpend:m,energySpend:e,distance:d,
    movementAfter,energyAfter,futureReachablePositions:future.reachable,
    totalCapacity:future.totalCapacity,score:-risk,risk,mode:'intermediate_v2'
  });
 }
 a.sort((x,y)=>x.risk-y.risk || y.futureReachablePositions-x.futureReachablePositions || y.movementAfter-x.movementAfter || y.energyAfter-x.energyAfter);
 return {choice:a[0]||null,options:a.map((o,rank)=>({...o,rank:rank+1}))};
}

function botMoveChoice(st,target,difficulty='easy'){
 return String(difficulty).startsWith('intermediate') ? botIntermediateMoveChoice(st,target) : botEasyMoveChoice(st,target);
}
function botService(room,r){
 const st=r.state;if(!r.botMode||st.pointEnded||st.serviceDone||st.pointServerSide!=='top'||st.phase!=='service')return;
 const z=botShot(st,true,r.botDifficulty),c=z.choice;if(!c)return;botAnalysis(room,'service',st,{chosen:c,options:z.options||[]},r.botDifficulty);const p=st.pingPiles[c.pileIndex];p.cards.shift();st.opponentEnergy-=c.cost;st.serviceDone=true;
 st.lastServiceValue=c.finalValue;st.lastPlayedColor=p.color;st.lastPlayedValue=c.finalValue;st.phase='bottomMove';
 const action={type:'service',side:'top',pileIndex:c.pileIndex,color:p.color,printedValue:c.printedValue,finalValue:c.finalValue,cost:c.cost};st.boardPlays.push(action);
 botLog(room,`Service : ${c.color} ${c.printedValue} → ${c.finalValue}, coût ${c.cost}. ${z.count} choix évalués. Il vise son objectif ${st.playerObjectives.top} et voit votre objectif ${st.playerObjectives.bottom}.`);
 io.to(room).emit('freshServiceApplied',{state:st,action});
}
function botMove(room,r){
 const st=r.state;if(!r.botMode||st.pointEnded||st.phase!=='topMove')return;const mz=botMoveChoice(st,+st.lastPlayedValue,r.botDifficulty),m=mz&&mz.choice;
 if(!m){markPointEnded(room,r,'bottom','impossibleMovement','Le BOT ne peut pas payer le déplacement requis.');return;}
 botAnalysis(room,'move',st,{targetValue:+st.lastPlayedValue,chosen:m,options:mz.options||[]},r.botDifficulty);
 st.opponentMovement-=m.moveSpend;st.opponentEnergy-=m.energySpend;st.opponentPaddleNode=m.targetValue;const ended=maybeEndAfterMove(room,r,'top');if(!ended)st.phase='topResponse';
 botLog(room,m.distance===0?`Réception ${m.targetValue} : déjà en position.`:`Réception ${m.targetValue} : distance ${m.distance} → ${m.moveSpend} déplacement + ${m.energySpend} énergie.`);
 io.to(room).emit('freshTopMoveApplied',{state:st,action:{type:'topMove',targetValue:m.targetValue,moveSpend:m.moveSpend,energySpend:m.energySpend,distance:m.distance}});
 if(!ended)setTimeout(()=>botResponse(room,r),350);
}
function botResponse(room,r){
 const st=r.state;if(!r.botMode||st.pointEnded||st.phase!=='topResponse')return;const before=botProgress(st,'top'),z=botShot(st,false,r.botDifficulty),c=z.choice;
 if(!c){markPointEnded(room,r,'bottom','noLegalResponse','Le BOT n’a aucune réponse légale.');return;}
 botAnalysis(room,'response',st,{chosen:c,options:z.options||[]},r.botDifficulty);
 const p=st.pingPiles[c.pileIndex];p.cards.shift();st.opponentEnergy-=c.cost;st.lastPlayedColor=p.color;st.lastPlayedValue=c.finalValue;st.blockedColor=p.color;
 const action={type:'topResponse',side:'top',pileIndex:c.pileIndex,color:p.color,printedValue:c.printedValue,finalValue:c.finalValue,cost:c.cost};st.boardPlays.push(action);
 const after=botProgress(st,'top');let e=null;
 if(objectiveComplete(st,'top'))e={winner:'top',reason:'objective',message:'Le BOT complète son objectif.'};
 else if(!hasLegalResponse(st,'bottom'))e={winner:'top',reason:'noLegalResponse',message:'Vous n’avez aucune réponse légale.'};
 else{const d=shortestDistance(st.localPaddleNode??'S',c.finalValue);if(!canPayMoveDistance(d,st.localMovement,st.localEnergy))e={winner:'top',reason:'impossibleMovement',message:`Vous devez parcourir ${d} zone(s), mais ne pouvez pas payer le déplacement.`};}
 if(e){st.pointEnded=true;st.pointWinnerSide=e.winner;st.pointEndReason=e.reason;st.pointEndMessage=e.message;st.phase='pointEnded';}else st.phase='bottomMove';
 botLog(room,`Réponse : ${c.color} ${c.printedValue} → ${c.finalValue}, coût ${c.cost}. ${z.count} choix légaux. Progression de son objectif : ${before} → ${after}.`);
 io.to(room).emit('freshTopResponseApplied',{state:st,action});if(e)io.to(room).emit('freshPointEnded',{state:st,winnerSide:e.winner,reason:e.reason,message:e.message});
}
function scheduleBot(room,r){if(!r||!r.botMode||!r.state||r.state.pointEnded)return;
 if(r.state.phase==='service'&&r.state.pointServerSide==='top')setTimeout(()=>botService(room,r),550);
 else if(r.state.phase==='topMove')setTimeout(()=>botMove(room,r),550);
}

io.on('connection',socket=>{
  socket.on('createRoom',({name,opponentType})=>{
    const room=makeCode(), state=makeInitialState();
    const botMode=opponentType==='bot_easy' || opponentType==='bot_intermediate' || opponentType==='bot';
    const botDifficulty=opponentType==='bot_intermediate' ? 'intermediate_v2' : (botMode ? 'easy' : null);
    const players=[{id:socket.id,name,seat:'host'}];
    if(botMode) players.push({id:'BOT',name:String(botDifficulty).startsWith('intermediate')?'BOT Intermédiaire V2':'BOT Facile',seat:'joiner',isBot:true});
    rooms.set(room,{state,host:socket.id,players,botMode,botDifficulty});
    socket.join(room);
    socket.emit('roomCreated',{room,seat:'host',name,state,botMode,botDifficulty});
    if(botMode) io.to(room).emit('roomReady',{
      room,state,
      players:players.map(p=>({name:p.name,seat:p.seat,isBot:!!p.isBot})),
      botMode,botDifficulty
    });
  });

  socket.on('joinRoom',({name,room})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    if(r.botMode) return socket.emit('roomError','Cette salle est une partie contre le bot.');
    if(r.players.length>=2) return socket.emit('roomError','Salle déjà complète.');
    r.players.push({id:socket.id,name,seat:'joiner'});
    socket.join(room);
    socket.emit('roomJoined',{room,seat:'joiner',name,state:r.state});
    io.to(room).emit('roomReady',{room,state:r.state,players:r.players.map(p=>({name:p.name,seat:p.seat}))});
  });

  /*
    FRESH V0.5 — première action autoritaire.
    Le service initial appartient au créateur (côté logique bottom).
    Le client n'enlève plus lui-même la tuile : il demande au serveur,
    qui valide, modifie l'état commun, puis diffuse le résultat aux deux écrans.
  */
  socket.on('freshServiceAction',({room,pileIndex,finalValue})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    if(r.players.length!==2) return socket.emit('roomError','Le second joueur n’est pas encore connecté.');
    const player=r.players.find(p=>p.id===socket.id);
    if(!player) return socket.emit('roomError','Joueur introuvable.');
    const serviceSide = player.seat==='host' ? 'bottom' : 'top';
    const st=r.state;
    if(!st || st.pointEnded || st.serviceDone) return;
    if(serviceSide!==st.pointServerSide) return socket.emit('roomError','Ce n’est pas à vous de servir.');
    if(st.phase!=='service') return;
    pileIndex=Number(pileIndex);
    finalValue=Number(finalValue);
    if(!Number.isInteger(pileIndex) || pileIndex<0 || pileIndex>=st.pingPiles.length) return;
    if(!Number.isInteger(finalValue) || finalValue<1 || finalValue>6) return;

    const pile=st.pingPiles[pileIndex];
    if(!pile || !pile.cards || !pile.cards.length) return;
    const printedValue=Number(pile.cards[0]);
    const cost=Math.abs(printedValue-finalValue);
    const energyAvailable = serviceSide==='bottom' ? st.localEnergy : st.opponentEnergy;
    if(cost>energyAvailable) return socket.emit('roomError','Énergie insuffisante.');

    pile.cards.shift();
    if(serviceSide==='bottom') st.localEnergy-=cost;
    else st.opponentEnergy-=cost;

    st.serviceDone=true;
    st.lastServiceValue=finalValue;
    st.lastPlayedColor=pile.color;
    st.lastPlayedValue=finalValue;
    st.phase = serviceSide==='bottom' ? 'topMove' : 'bottomMove';
    const action={
      type:'service',
      side:serviceSide,
      pileIndex,
      color:pile.color,
      printedValue,
      finalValue,
      cost
    };
    st.boardPlays.push(action);
    io.to(room).emit('freshServiceApplied',{state:st,action});
    scheduleBot(room,r);
  });

  /*
    FRESH V0.6 — décision de déplacement du joueur 2.
    Le joueur 2 envoie seulement son choix. Le serveur vérifie la distance,
    les ressources disponibles, déplace officiellement sa raquette,
    puis diffuse le résultat aux deux clients.
  */
  socket.on('freshTopMoveAction',({room,targetValue,moveSpend,energySpend})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    const player=r.players.find(p=>p.id===socket.id);
    if(!player || player.seat!=='joiner') return socket.emit('roomError','Ce déplacement appartient au joueur 2.');

    const st=r.state;
    if(!st || st.pointEnded || st.phase!=='topMove') return;

    targetValue=Number(targetValue);
    moveSpend=Number(moveSpend);
    energySpend=Number(energySpend);

    /*
      La cible de déplacement est toujours la DERNIÈRE valeur jouée.
      Au premier échange, lastPlayedValue == lastServiceValue.
      Aux échanges suivants, lastServiceValue reste la valeur du service initial
      et ne doit plus servir de référence.
    */
    if(targetValue!==Number(st.lastPlayedValue)) return socket.emit('roomError','Cible de déplacement incorrecte.');

    const distance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);
    if(!Number.isFinite(distance)) return socket.emit('roomError','Déplacement impossible.');

    if(distance===0){
      if(moveSpend!==0 || energySpend!==0) return socket.emit('roomError','Aucune dépense nécessaire.');
    }else{
      if(!Number.isInteger(moveSpend) || moveSpend<1) return socket.emit('roomError','Au moins 1 déplacement est requis.');
      if(!Number.isInteger(energySpend) || energySpend<0) return socket.emit('roomError','Dépense énergie invalide.');
      if(moveSpend+energySpend!==distance) return socket.emit('roomError','Répartition invalide.');
      if(moveSpend>st.opponentMovement || energySpend>st.opponentEnergy) return socket.emit('roomError','Ressources insuffisantes.');
    }

    st.opponentMovement-=moveSpend;
    st.opponentEnergy-=energySpend;
    st.opponentPaddleNode=targetValue;

    const endedAfterMove = maybeEndAfterMove(room,r,'top');
    if(!endedAfterMove) st.phase='topResponse';

    io.to(room).emit('freshTopMoveApplied',{
      state:st,
      action:{type:'topMove',targetValue,moveSpend,energySpend,distance}
    });
  });


  /*
    FRESH V0.7 — réponse du joueur 2.
    Le serveur valide la tuile, la valeur finale et le coût d'énergie.
    Après la réponse, la couleur jouée devient immédiatement la couleur interdite
    pour le joueur suivant, puis la main passe au déplacement de J1.
  */
  socket.on('freshTopResponseAction',({room,pileIndex,finalValue})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    const player=r.players.find(p=>p.id===socket.id);
    if(!player || player.seat!=='joiner') return socket.emit('roomError','Cette réponse appartient au joueur 2.');

    const st=r.state;
    if(!st || st.pointEnded || st.phase!=='topResponse') return;

    pileIndex=Number(pileIndex);
    finalValue=Number(finalValue);
    if(!Number.isInteger(pileIndex) || pileIndex<0 || pileIndex>=st.pingPiles.length) return;
    if(!Number.isInteger(finalValue) || finalValue<1 || finalValue>6) return;

    const pile=st.pingPiles[pileIndex];
    if(!pile || !pile.cards || !pile.cards.length) return;
    if(st.blockedColor && pile.color===st.blockedColor) return socket.emit('roomError','Cette couleur est interdite.');

    const printedValue=Number(pile.cards[0]);
    const cost=Math.abs(printedValue-finalValue);
    if(cost>st.opponentEnergy) return socket.emit('roomError','Énergie insuffisante.');
    if(!responseRuleAllows(st.lastPlayedColor,Number(st.lastPlayedValue),finalValue)){
      return socket.emit('roomError','Valeur de réponse interdite.');
    }

    pile.cards.shift();
    st.opponentEnergy-=cost;
    st.lastPlayedColor=pile.color;
    st.lastPlayedValue=finalValue;
    st.blockedColor=pile.color;

    const action={
      type:'topResponse',
      side:'top',
      pileIndex,
      color:pile.color,
      printedValue,
      finalValue,
      cost
    };
    st.boardPlays.push(action);

    let endSpec=null;
    if(objectiveComplete(st,'top')){
      endSpec={winner:'top',reason:'objective',message:'J2 a rempli son objectif.'};
    }else{
      const distance=shortestDistance(st.localPaddleNode??'S',finalValue);
      if(!canPayMoveDistance(distance,st.localMovement,st.localEnergy)){
        endSpec={
          winner:'top',
          reason:'impossibleMovement',
          message:`J1 doit parcourir ${distance} zone(s), mais aucune combinaison déplacement/énergie n’est possible.`
        };
      }
    }

    if(endSpec){
      st.pointEnded=true;
      st.pointWinnerSide=endSpec.winner;
      st.pointEndReason=endSpec.reason;
      st.pointEndMessage=endSpec.message;
      st.phase='pointEnded';
    }else{
      st.phase='bottomMove';
    }

    io.to(room).emit('freshTopResponseApplied',{state:st,action});
    if(endSpec){
      io.to(room).emit('freshPointEnded',{
        state:st,winnerSide:endSpec.winner,reason:endSpec.reason,message:endSpec.message
      });
    }
  });


  /*
    FRESH V0.12 — déplacement de J1 après la réponse de J2.
    Cette étape était encore exécutée seulement dans le navigateur de J1.
  */
  socket.on('freshBottomMoveAction',({room,targetValue,moveSpend,energySpend})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    if(socket.id!==r.host) return socket.emit('roomError','Ce déplacement appartient au joueur 1.');

    const st=r.state;
    if(!st || st.pointEnded || st.phase!=='bottomMove') return;

    targetValue=Number(targetValue);
    moveSpend=Number(moveSpend);
    energySpend=Number(energySpend);

    if(targetValue!==Number(st.lastPlayedValue)) return socket.emit('roomError','Cible de déplacement incorrecte.');

    const distance=shortestDistance(st.localPaddleNode ?? 'S',targetValue);
    if(!Number.isFinite(distance)) return socket.emit('roomError','Déplacement impossible.');

    if(distance===0){
      if(moveSpend!==0 || energySpend!==0) return socket.emit('roomError','Aucune dépense nécessaire.');
    }else{
      if(!Number.isInteger(moveSpend) || moveSpend<1) return socket.emit('roomError','Au moins 1 déplacement est requis.');
      if(!Number.isInteger(energySpend) || energySpend<0) return socket.emit('roomError','Dépense énergie invalide.');
      if(moveSpend+energySpend!==distance) return socket.emit('roomError','Répartition invalide.');
      if(moveSpend>st.localMovement || energySpend>st.localEnergy) return socket.emit('roomError','Ressources insuffisantes.');
    }

    st.localMovement-=moveSpend;
    st.localEnergy-=energySpend;
    st.localPaddleNode=targetValue;

    const endedAfterMove = maybeEndAfterMove(room,r,'bottom');
    if(!endedAfterMove) st.phase='bottomResponse';

    io.to(room).emit('freshBottomMoveApplied',{
      state:st,
      action:{type:'bottomMove',targetValue,moveSpend,energySpend,distance}
    });
  });

  /*
    Réponse de J1 : le serveur la valide puis renvoie la main à J2.
    C'est ce broadcast qui doit déclencher le NOUVEAU popup de déplacement chez J2.
  */
  socket.on('freshBottomResponseAction',({room,pileIndex,finalValue})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    if(socket.id!==r.host) return socket.emit('roomError','Cette réponse appartient au joueur 1.');

    const st=r.state;
    if(!st || st.pointEnded || st.phase!=='bottomResponse') return;

    pileIndex=Number(pileIndex);
    finalValue=Number(finalValue);
    if(!Number.isInteger(pileIndex) || pileIndex<0 || pileIndex>=st.pingPiles.length) return;
    if(!Number.isInteger(finalValue) || finalValue<1 || finalValue>6) return;

    const pile=st.pingPiles[pileIndex];
    if(!pile || !pile.cards || !pile.cards.length) return;
    if(st.blockedColor && pile.color===st.blockedColor) return socket.emit('roomError','Cette couleur est interdite.');

    const printedValue=Number(pile.cards[0]);
    const cost=Math.abs(printedValue-finalValue);
    if(cost>st.localEnergy) return socket.emit('roomError','Énergie insuffisante.');
    if(!responseRuleAllows(st.lastPlayedColor,Number(st.lastPlayedValue),finalValue)){
      return socket.emit('roomError','Valeur de réponse interdite.');
    }

    pile.cards.shift();
    st.localEnergy-=cost;
    st.lastPlayedColor=pile.color;
    st.lastPlayedValue=finalValue;
    st.blockedColor=pile.color;

    const action={
      type:'bottomResponse',
      side:'bottom',
      pileIndex,
      color:pile.color,
      printedValue,
      finalValue,
      cost
    };
    st.boardPlays.push(action);

    let endSpec=null;
    if(objectiveComplete(st,'bottom')){
      endSpec={winner:'bottom',reason:'objective',message:'J1 a rempli son objectif.'};
    }else{
      const distance=shortestDistance(st.opponentPaddleNode??'S',finalValue);
      if(!canPayMoveDistance(distance,st.opponentMovement,st.opponentEnergy)){
        endSpec={
          winner:'bottom',
          reason:'impossibleMovement',
          message:`J2 doit parcourir ${distance} zone(s), mais aucune combinaison déplacement/énergie n’est possible.`
        };
      }
    }

    if(endSpec){
      st.pointEnded=true;
      st.pointWinnerSide=endSpec.winner;
      st.pointEndReason=endSpec.reason;
      st.pointEndMessage=endSpec.message;
      st.phase='pointEnded';
    }else{
      st.phase='topMove';
    }

    io.to(room).emit('freshBottomResponseApplied',{state:st,action});
    scheduleBot(room,r);
    if(endSpec){
      io.to(room).emit('freshPointEnded',{
        state:st,winnerSide:endSpec.winner,reason:endSpec.reason,message:endSpec.message
      });
    }
  });


  /*
    FRESH V0.16 — validation autoritaire de la fin de point.
    Le premier clic reçu attribue le point UNE SEULE FOIS, puis le serveur
    prépare le point suivant et inverse le joueur qui sert.
  */
  socket.on('freshConfirmPointEnd',({room})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    const st=r.state;
    if(!st || !st.pointEnded || st.phase!=='pointEnded') return;

    const winner=st.pointWinnerSide;
    if(winner!=='top' && winner!=='bottom') return;

    if(!st.matchScore) st.matchScore={top:0,bottom:0};
    st.matchScore[winner]=Math.min(4,(Number(st.matchScore[winner])||0)+1);

    /* A 4 points, on arrête la partie : pas de nouveau point. */
    if(st.matchScore[winner]>=4){
      st.phase='matchEnded';
      st.pointEnded=false;
      io.to(room).emit('freshMatchWon',{
        state:st,
        winnerSide:winner
      });
      return;
    }

    resetPointState(st);

    io.to(room).emit('freshNextPoint',{
      state:st,
      previousWinnerSide:winner,
      pointServerSide:st.pointServerSide
    });
    scheduleBot(room,r);
  });

});

/*
  V0.34 INTERNET
  - en local : port 3000 ;
  - sur Render : utilise automatiquement process.env.PORT ;
  - écoute sur 0.0.0.0 pour les connexions externes.
*/
const PORT=Number(process.env.PORT)||3000;
httpServer.listen(PORT,'0.0.0.0',()=>{
  console.log('PING! — V0.34.3 GitHub + Render + BOTs');
  console.log('-----------------------------------');
  console.log(`Port d'écoute : ${PORT}`);

  if(!process.env.PORT){
    console.log(`Local : http://localhost:${PORT}`);
    for(const list of Object.values(os.networkInterfaces())){
      for(const n of list||[]){
        if(n.family==='IPv4'&&!n.internal) console.log(`Réseau local : http://${n.address}:${PORT}`);
      }
    }
  }else{
    console.log('Mode hébergé : utilise l’URL publique fournie par Render.');
  }
});
