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
const characterState=require('./character-state-dev');
const installCharacterSelection=require('./server-personnages-dev');

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
    pointServerSide:'bottom',
    characterMode:'on',
    characters:characterState.createCharacters(),
    characterPowers:{
      top:{mathieu_energy_only:{used:false,active:false},mathieu_reduce1:{used:false,active:false},mathieu_free_move:{used:false,active:false},jeanne_pm1:{used:false,active:false},jeanne_pm2:{used:false,active:false},jeanne_free_value:{used:false,active:false}},
      bottom:{mathieu_energy_only:{used:false,active:false},mathieu_reduce1:{used:false,active:false},mathieu_free_move:{used:false,active:false},jeanne_pm1:{used:false,active:false},jeanne_pm2:{used:false,active:false},jeanne_free_value:{used:false,active:false}}
    },
    mathieuExhaustion:{top:null,bottom:null},
    jeanneExhaustion:{top:null,bottom:null}
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
  /* Règle du plateau : le passage direct 5 <-> 6 coûte exactement 2 déplacements. */
  if((String(from)==='5' && String(to)==='6') || (String(from)==='6' && String(to)==='5')) return 2;
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
  /* Si Mathieu a déjà déclenché son pouvoir 3, son FILET est consommé
     même si le point s'est terminé avant le lancer d'épuisement. */
  if(st.mathieuExhaustion){
    for(const side of ['top','bottom']){
      const x=st.mathieuExhaustion[side];
      if(x && x.stage!=='done'){x.stage='done';x.used=true;}
    }
  }
  if(st.jeanneExhaustion){
    for(const side of ['top','bottom']){
      const x=st.jeanneExhaustion[side];
      if(x && x.stage!=='done'){x.stage='done';x.used=true;}
    }
  }

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
 const nextCharacterPower=botNextPower(st);
 const powerConsidered=data?.powerConsidered||null;
 const selectedPower=data?.characterPower||null;
 const normalScore=Number.isFinite(data?.normalScore)?data.normalScore:null;
 const powerScore=Number.isFinite(data?.powerScore)?data.powerScore:null;
 let powerDecision='NON APPLICABLE';
 if(!botCharactersEnabled(st)) powerDecision='PERSONNAGE/POUVOIRS NON ACTIFS';
 else if(selectedPower) powerDecision=data?.powerForced?'UTILISÉ — seul coup possible':'UTILISÉ';
 else if(powerConsidered) powerDecision='CONSERVÉ';
 else if(!nextCharacterPower) powerDecision='AUCUN POUVOIR RESTANT';
 io.to(room).emit('freshBotAnalysis',{
  kind,difficulty,
  at:new Date().toISOString(),
  botCharacter:st?.characters?.top||null,
  nextCharacterPower,
  powerConsidered,
  selectedPower,
  normalScore,
  powerScore,
  powerDecision,
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

/* BOT PERSONNAGES — couche de décision inspirée du simulateur V3.
   Le moteur Facile/Intermédiaire reste inchangé : cette couche compare son
   meilleur coup normal au meilleur coup rendu possible par le prochain pouvoir. */
function botCharactersEnabled(st){
 return st?.characterMode==='on' && ['mathieu','jeanne'].includes(st?.characters?.top);
}
function botNextPower(st){
 if(!botCharactersEnabled(st))return null;
 const ps=st.characterPowers?.top||{};
 if(st.characters.top==='mathieu'){
   if(!ps.mathieu_energy_only?.used)return 'mathieu_energy_only';
   if(!ps.mathieu_reduce1?.used)return 'mathieu_reduce1';
   if(!ps.mathieu_free_move?.used)return 'mathieu_free_move';
 }else{
   if(!ps.jeanne_pm1?.used)return 'jeanne_pm1';
   if(!ps.jeanne_pm2?.used)return 'jeanne_pm2';
   if(!ps.jeanne_free_value?.used)return 'jeanne_free_value';
 }
 return null;
}
function botPowerStage(power){
 if(power==='mathieu_energy_only'||power==='jeanne_pm1')return 0;
 if(power==='mathieu_reduce1'||power==='jeanne_pm2')return 1;
 return 2;
}
function botPowerReserve(st,power){
 const stage=botPowerStage(power);
 const hint=Math.min(4-(Number(st.matchScore?.top)||0),4-(Number(st.matchScore?.bottom)||0));
 return (stage===0?10:stage===1?14:18)*Math.min(1,Math.max(.35,hint/4));
}
function botVirtualShotResult(st,shot,moveSpend=0,moveEnergy=0){
 if(!shot)return null;
 const s=JSON.parse(JSON.stringify(st));
 s.opponentMovement-=moveSpend;s.opponentEnergy-=moveEnergy;
 const p=s.pingPiles[shot.pileIndex];
 if(!p||!p.cards?.length)return null;
 p.cards.shift();s.opponentEnergy-=shot.cost;
 s.boardPlays.push({type:'botEval',side:'top',pileIndex:shot.pileIndex,color:shot.color,printedValue:shot.printedValue,finalValue:shot.finalValue,cost:shot.cost});
 const progress=botProgress(s,'top');
 const finish=objectiveComplete(s,'top');
 const oppDistance=shortestDistance(s.localPaddleNode??'S',shot.finalValue);
 return {progress,finish,oppDistance,movementAfter:s.opponentMovement,energyAfter:s.opponentEnergy};
}
function botV3LikeScore(st,shot,moveSpend=0,moveEnergy=0){
 const f=botVirtualShotResult(st,shot,moveSpend,moveEnergy);
 if(!f)return -Infinity;
 return 1000*(f.finish?1:0)+22*f.progress+4*f.oppDistance+1.2*f.movementAfter+.8*f.energyAfter-.7*shot.cost;
}
function botJeanneCandidates(st,isService,power,difficulty){
 const discount=power==='jeanne_pm1'?1:(power==='jeanne_pm2'?2:6);
 const v=JSON.parse(JSON.stringify(st));
 v.opponentEnergy=Math.min(13,st.opponentEnergy+discount);
 const z=botShot(v,isService,difficulty);
 const out=[];
 for(const raw of z.options||[]){
   const actualCost=power==='jeanne_free_value'?0:Math.max(0,Math.abs(raw.printedValue-raw.finalValue)-discount);
   if(actualCost>st.opponentEnergy)continue;
   const shot={...raw,cost:actualCost,power};
   shot.powerScore=botV3LikeScore(st,shot);
   out.push(shot);
 }
 out.sort((a,b)=>b.powerScore-a.powerScore||a.cost-b.cost||a.pileIndex-b.pileIndex||a.finalValue-b.finalValue);
 return out;
}
function botChooseJeanneShot(st,isService,difficulty){
 const normal=botShot(st,isService,difficulty),normalChoice=normal.choice;
 if(!botCharactersEnabled(st)||st.characters.top!=='jeanne')return {choice:normalChoice,normal,power:null};
 const power=botNextPower(st);
 if(!power||!power.startsWith('jeanne_'))return {choice:normalChoice,normal,power:null};
 const pacts=botJeanneCandidates(st,isService,power,difficulty),best=pacts[0]||null;
 if(!best)return {choice:normalChoice,normal,power:null};
 if(!normalChoice)return {choice:best,normal,power,forced:true,powerScore:best.powerScore,normalScore:-Infinity};
 const normalScore=botV3LikeScore(st,normalChoice);
 let powerScore=best.powerScore;
 if(power==='jeanne_free_value'&&!botVirtualShotResult(st,best)?.finish)powerScore-=180;
 const use=powerScore>normalScore+botPowerReserve(st,power);
 return {choice:use?best:normalChoice,normal,power:use?power:null,powerConsidered:power,powerScore,normalScore,forced:false};
}
function botMathieuPayments(st,power){
 const raw=shortestDistance(st.opponentPaddleNode??'S',Number(st.lastPlayedValue));
 if(!Number.isFinite(raw))return [];
 let d=raw;
 if(power==='mathieu_reduce1')d=Math.max(0,raw-1);
 if(power==='mathieu_free_move')return [{moveSpend:0,energySpend:0,distance:0,rawDistance:raw}];
 if(power==='mathieu_energy_only'){
   return raw<=st.opponentEnergy?[{moveSpend:0,energySpend:raw,distance:raw,rawDistance:raw}]:[];
 }
 if(d===0)return [{moveSpend:0,energySpend:0,distance:0,rawDistance:raw}];
 const out=[];
 for(let m=1;m<=d;m++){const e=d-m;if(m<=st.opponentMovement&&e<=st.opponentEnergy)out.push({moveSpend:m,energySpend:e,distance:d,rawDistance:raw});}
 return out;
}
function botEvaluateMoveAndReply(st,payment,difficulty){
 const s=JSON.parse(JSON.stringify(st));
 s.opponentMovement-=payment.moveSpend;s.opponentEnergy-=payment.energySpend;s.opponentPaddleNode=Number(st.lastPlayedValue);s.phase='topResponse';
 const z=botShot(s,false,difficulty),shot=z.choice;
 if(!shot)return {score:-Infinity,payment,shot:null,finish:false};
 const score=botV3LikeScore(s,shot);
 const f=botVirtualShotResult(s,shot);
 return {score,payment,shot,finish:!!f?.finish};
}
function botChooseMathieuMove(st,target,difficulty){
 const normal=botMoveChoice(st,target,difficulty),normalMove=normal&&normal.choice;
 if(!botCharactersEnabled(st)||st.characters.top!=='mathieu')return {choice:normalMove,normal,power:null};
 const power=botNextPower(st);
 if(!power||!power.startsWith('mathieu_'))return {choice:normalMove,normal,power:null};
 let normalEval=null;
 if(normalMove)normalEval=botEvaluateMoveAndReply(st,normalMove,difficulty);
 const evals=botMathieuPayments(st,power).map(p=>botEvaluateMoveAndReply(st,p,difficulty)).filter(x=>Number.isFinite(x.score));
 evals.sort((a,b)=>b.score-a.score||a.payment.energySpend-b.payment.energySpend||b.payment.moveSpend-a.payment.moveSpend);
 const best=evals[0]||null;
 if(!best)return {choice:normalMove,normal,power:null};
 if(!normalMove)return {choice:{...best.payment,power},normal,power,forced:true,powerScore:best.score,normalScore:-Infinity};
 let powerScore=best.score;
 if(power==='mathieu_free_move'&&!best.finish)powerScore-=180;
 const normalScore=normalEval?.score??-Infinity;
 const use=powerScore>normalScore+botPowerReserve(st,power);
 return {choice:use?{...best.payment,power}:normalMove,normal,power:use?power:null,powerConsidered:power,powerScore,normalScore,forced:false};
}
function botActivatePower(st,power){
 const p=st.characterPowers?.top?.[power];if(!p||p.used)return false;
 p.used=true;p.active=true;
 if(power==='mathieu_free_move')st.mathieuExhaustion.top={stage:'first'};
 if(power==='jeanne_free_value')st.jeanneExhaustion.top={stage:'first'};
 return true;
}
function botPowerLabel(power){
 return ({mathieu_energy_only:'Mathieu P1',mathieu_reduce1:'Mathieu P2',mathieu_free_move:'Mathieu P3',jeanne_pm1:'Jeanne P1',jeanne_pm2:'Jeanne P2',jeanne_free_value:'Jeanne P3'})[power]||power;
}
function botPowerDiagnostic(room,st,kind,pick){
 const character=st?.characters?.top||'AUCUN';
 const next=botNextPower(st);
 const considered=pick?.powerConsidered||null;
 const chosen=pick?.power||null;
 const normal=Number.isFinite(pick?.normalScore)?pick.normalScore.toFixed(1):(pick?.normalScore===-Infinity?'aucun coup':'n/a');
 const powered=Number.isFinite(pick?.powerScore)?pick.powerScore.toFixed(1):'n/a';
 const reserve=considered?botPowerReserve(st,considered).toFixed(1):'n/a';
 let reason;
 if(!botCharactersEnabled(st)) reason='PERSONNAGE/POUVOIRS NON ACTIFS';
 else if(chosen) reason=pick?.forced?'UTILISÉ — seul coup possible':'UTILISÉ — gain suffisant';
 else if(considered) reason='CONSERVÉ — gain insuffisant';
 else if(!next) reason='AUCUN POUVOIR RESTANT';
 else reason='NON APPLICABLE À CETTE PHASE';
 botLog(room,`BOT DIAG [${kind}] — personnage=${character} ; prochain=${next?botPowerLabel(next):'aucun'} ; évalué=${considered?botPowerLabel(considered):'non'} ; normal=${normal} ; pouvoir=${powered} ; réserve=${reserve} ; décision=${reason}.`);
}
function botResolveExhaustion(room,r,kind){
 const st=r.state,x=kind==='mathieu'?st.mathieuExhaustion?.top:st.jeanneExhaustion?.top;
 const phase=kind==='mathieu'?'mathieuExhaustion':'jeanneExhaustion';
 if(!r.botMode||st.pointEnded||st.phase!==phase||!x||x.stage!=='roll')return;
 const roll=1+Math.floor(Math.random()*6),lost=kind==='mathieu'?roll<=3:roll>=4;
 x.stage='done';x.used=true;
 botLog(room,`BOT ${kind==='mathieu'?'Mathieu':'Jeanne'} — épuisement : D6 = ${roll} → ${lost?'POINT PERDU':'continue'}.`);
 if(lost){
   st.pointEnded=true;st.pointWinnerSide='bottom';st.pointEndReason=kind+'Exhaustion';
   st.pointEndMessage=`Le BOT ${kind==='mathieu'?'Mathieu':'Jeanne'} échoue à son jet d’épuisement (D6 = ${roll}).`;
   st.phase='pointEnded';
 }else st.phase=x.resume;
 io.to(room).emit(kind==='mathieu'?'freshMathieuRollResult':'freshJeanneRollResult',{state:st,side:'top',roll,lost});
 if(lost)io.to(room).emit('freshPointEnded',{state:st,winnerSide:'bottom',reason:st.pointEndReason,message:st.pointEndMessage});
 else scheduleBot(room,r);
}
function botService(room,r){
 const st=r.state;if(!r.botMode||st.pointEnded||st.serviceDone||st.pointServerSide!=='top'||st.phase!=='service')return;
 const pick=botChooseJeanneShot(st,true,r.botDifficulty),c=pick.choice;if(!c)return;
 botPowerDiagnostic(room,st,'service',pick);
 if(pick.power&&botActivatePower(st,pick.power))botLog(room,`BOT — ${botPowerLabel(pick.power)} utilisé au service. Score pouvoir ${pick.powerScore?.toFixed?.(1)??pick.powerScore} / normal ${Number.isFinite(pick.normalScore)?pick.normalScore.toFixed(1):'aucun coup'}.`);
 const z=pick.normal;botAnalysis(room,'service',st,{chosen:c,options:z.options||[],characterPower:pick.power||null,powerConsidered:pick.powerConsidered||null,normalScore:pick.normalScore,powerScore:pick.powerScore,powerForced:!!pick.forced},r.botDifficulty);
 const p=st.pingPiles[c.pileIndex];p.cards.shift();st.opponentEnergy-=c.cost;st.serviceDone=true;
 if(st.characterPowers?.top?.jeanne_pm1)st.characterPowers.top.jeanne_pm1.active=false;
 if(st.characterPowers?.top?.jeanne_pm2)st.characterPowers.top.jeanne_pm2.active=false;
 if(st.characterPowers?.top?.jeanne_free_value)st.characterPowers.top.jeanne_free_value.active=false;
 st.lastServiceValue=c.finalValue;st.lastPlayedColor=p.color;st.lastPlayedValue=c.finalValue;st.phase='bottomMove';
 const action={type:'service',side:'top',pileIndex:c.pileIndex,color:p.color,printedValue:c.printedValue,finalValue:c.finalValue,cost:c.cost,characterPower:pick.power||null};st.boardPlays.push(action);
 botLog(room,`Service : ${c.color} ${c.printedValue} → ${c.finalValue}, coût ${c.cost}. Il vise son objectif ${st.playerObjectives.top} et voit votre objectif ${st.playerObjectives.bottom}.`);
 io.to(room).emit('freshServiceApplied',{state:st,action});
}
function botMove(room,r){
 const st=r.state;if(!r.botMode||st.pointEnded||st.phase!=='topMove')return;
 const pick=botChooseMathieuMove(st,+st.lastPlayedValue,r.botDifficulty),m=pick.choice;
 botPowerDiagnostic(room,st,'déplacement',pick);
 if(!m){markPointEnded(room,r,'bottom','impossibleMovement','Le BOT ne peut pas payer le déplacement requis.');return;}
 if(pick.power&&botActivatePower(st,pick.power))botLog(room,`BOT — ${botPowerLabel(pick.power)} utilisé au déplacement : distance brute ${m.rawDistance??m.distance}, coût retenu ${m.moveSpend} D + ${m.energySpend} E. Score pouvoir ${pick.powerScore?.toFixed?.(1)??pick.powerScore} / normal ${Number.isFinite(pick.normalScore)?pick.normalScore.toFixed(1):'aucun coup'}.`);
 botAnalysis(room,'move',st,{targetValue:+st.lastPlayedValue,chosen:m,options:pick.normal?.options||[],characterPower:pick.power||null,powerConsidered:pick.powerConsidered||null,normalScore:pick.normalScore,powerScore:pick.powerScore,powerForced:!!pick.forced},r.botDifficulty);
 st.opponentMovement-=m.moveSpend;st.opponentEnergy-=m.energySpend;st.opponentPaddleNode=+st.lastPlayedValue;
 if(st.characterPowers?.top?.mathieu_energy_only)st.characterPowers.top.mathieu_energy_only.active=false;
 if(st.characterPowers?.top?.mathieu_reduce1)st.characterPowers.top.mathieu_reduce1.active=false;
 if(st.characterPowers?.top?.mathieu_free_move)st.characterPowers.top.mathieu_free_move.active=false;
 const ended=maybeEndAfterMove(room,r,'top');if(!ended)st.phase='topResponse';
 const targetValue=+st.lastPlayedValue;
 botLog(room,m.distance===0?`Réception ${targetValue} : déjà en position.`:`Réception ${targetValue} : distance ${m.distance} → ${m.moveSpend} déplacement + ${m.energySpend} énergie.`);
 io.to(room).emit('freshTopMoveApplied',{state:st,action:{type:'topMove',targetValue,moveSpend:m.moveSpend,energySpend:m.energySpend,distance:m.distance,characterPower:pick.power||null}});
 if(!ended)setTimeout(()=>botResponse(room,r),350);
}
function jeanneOpponentResponded(st,side){
  const owner=side==='top'?'bottom':'top';
  const x=st.jeanneExhaustion&&st.jeanneExhaustion[owner];
  if(x&&x.stage==='waitOpponent') x.stage='waitOwner';
}
function jeanneOwnerResponded(room,r,side){
  const st=r.state;
  const x=st.jeanneExhaustion&&st.jeanneExhaustion[side];
  if(!x) return false;
  if(x.stage==='first'){x.stage='waitOpponent';return false;}
  if(x.stage==='waitOwner'){
    x.stage='roll';
    x.resume=side==='bottom'?'topMove':'bottomMove';
    st.phase='jeanneExhaustion';
    io.to(room).emit('freshJeanneExhaustionPending',{state:st,side});
    return true;
  }
  return false;
}

function mathieuOpponentResponded(st,side){
  const owner=side==='top'?'bottom':'top';
  const x=st.mathieuExhaustion&&st.mathieuExhaustion[owner];
  if(x&&x.stage==='waitOpponent') x.stage='waitOwner';
}
function mathieuOwnerResponded(room,r,side){
  const st=r.state;
  const x=st.mathieuExhaustion&&st.mathieuExhaustion[side];
  if(!x) return false;
  if(x.stage==='first'){x.stage='waitOpponent';return false;}
  if(x.stage==='waitOwner'){
    x.stage='roll';
    x.resume=side==='bottom'?'topMove':'bottomMove';
    st.phase='mathieuExhaustion';
    io.to(room).emit('freshMathieuExhaustionPending',{state:st,side});
    return true;
  }
  return false;
}

function botResponse(room,r){
 const st=r.state;if(!r.botMode||st.pointEnded||st.phase!=='topResponse')return;
 const before=botProgress(st,'top'),pick=botChooseJeanneShot(st,false,r.botDifficulty),c=pick.choice;
 botPowerDiagnostic(room,st,'réponse',pick);
 if(!c){markPointEnded(room,r,'bottom','noLegalResponse','Le BOT n’a aucune réponse légale.');return;}
 if(pick.power&&botActivatePower(st,pick.power))botLog(room,`BOT — ${botPowerLabel(pick.power)} utilisé à la réponse : ${c.printedValue} → ${c.finalValue}, coût ${c.cost} E. Score pouvoir ${pick.powerScore?.toFixed?.(1)??pick.powerScore} / normal ${Number.isFinite(pick.normalScore)?pick.normalScore.toFixed(1):'aucun coup'}.`);
 const z=pick.normal;botAnalysis(room,'response',st,{chosen:c,options:z.options||[],characterPower:pick.power||null,powerConsidered:pick.powerConsidered||null,normalScore:pick.normalScore,powerScore:pick.powerScore,powerForced:!!pick.forced},r.botDifficulty);
 const p=st.pingPiles[c.pileIndex];p.cards.shift();st.opponentEnergy-=c.cost;
 if(st.characterPowers?.top?.jeanne_pm1)st.characterPowers.top.jeanne_pm1.active=false;
 if(st.characterPowers?.top?.jeanne_pm2)st.characterPowers.top.jeanne_pm2.active=false;
 if(st.characterPowers?.top?.jeanne_free_value)st.characterPowers.top.jeanne_free_value.active=false;
 st.lastPlayedColor=p.color;st.lastPlayedValue=c.finalValue;st.blockedColor=p.color;
 mathieuOpponentResponded(st,'top');jeanneOpponentResponded(st,'top');
 const action={type:'topResponse',side:'top',pileIndex:c.pileIndex,color:p.color,printedValue:c.printedValue,finalValue:c.finalValue,cost:c.cost,characterPower:pick.power||null};st.boardPlays.push(action);
 const after=botProgress(st,'top');let e=null;
 if(objectiveComplete(st,'top'))e={winner:'top',reason:'objective',message:'Le BOT complète son objectif.'};
 else if(!hasLegalResponse(st,'bottom'))e={winner:'top',reason:'noLegalResponse',message:'Vous n’avez aucune réponse légale.'};
 else{const d=shortestDistance(st.localPaddleNode??'S',c.finalValue);if(!canPayMoveDistance(d,st.localMovement,st.localEnergy))e={winner:'top',reason:'impossibleMovement',message:`Vous devez parcourir ${d} zone(s), mais ne pouvez pas payer le déplacement.`};}
 if(e){st.pointEnded=true;st.pointWinnerSide=e.winner;st.pointEndReason=e.reason;st.pointEndMessage=e.message;st.phase='pointEnded';}else st.phase='bottomMove';
 let exhaustionHold=false;
 if(!e)exhaustionHold=mathieuOwnerResponded(room,r,'top')||jeanneOwnerResponded(room,r,'top');
 botLog(room,`Réponse : ${c.color} ${c.printedValue} → ${c.finalValue}, coût ${c.cost}. Progression de son objectif : ${before} → ${after}.`);
 io.to(room).emit('freshTopResponseApplied',{state:st,action});
 if(e)io.to(room).emit('freshPointEnded',{state:st,winnerSide:e.winner,reason:e.reason,message:e.message});
 else if(exhaustionHold)scheduleBot(room,r);
}
function scheduleBot(room,r){if(!r||!r.botMode||!r.state||r.state.pointEnded)return;
 if(r.state.phase==='service'&&r.state.pointServerSide==='top')setTimeout(()=>botService(room,r),550);
 else if(r.state.phase==='topMove')setTimeout(()=>botMove(room,r),550);
 else if(r.state.phase==='mathieuExhaustion'&&r.state.mathieuExhaustion?.top?.stage==='roll')setTimeout(()=>botResolveExhaustion(room,r,'mathieu'),550);
 else if(r.state.phase==='jeanneExhaustion'&&r.state.jeanneExhaustion?.top?.stage==='roll')setTimeout(()=>botResolveExhaustion(room,r,'jeanne'),550);
}

io.on('connection',socket=>{
  installCharacterSelection(socket,{io,rooms,scheduleBot});
  socket.on('createRoom',({name,opponentType,characterMode})=>{
    const room=makeCode(), state=makeInitialState();
    /* Compatibilité avec le frontend personnages-dev actuel, qui ne transmet
       pas encore toujours characterMode : absence = comportement historique ON. */
    state.characterMode=characterMode==='off'?'off':'on';
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
  /* Jeanne — pouvoir 1 validé sur l'ancien socle personnages-dev :
     au service de Jeanne ou pendant sa réponse, un écart de exactement 1
     par rapport à la valeur imprimée coûte 0 Énergie. */
  socket.on('freshActivateJeannePower',({room,power})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    const player=r.players.find(p=>p.id===socket.id);
    if(!player) return socket.emit('roomError','Joueur introuvable.');
    const side=player.seat==='joiner'?'top':'bottom',st=r.state;
    if(st.characters?.[side]!=='jeanne') return socket.emit('roomError','Ce pouvoir appartient à Jeanne.');
    if(!['jeanne_pm1','jeanne_pm2','jeanne_free_value'].includes(power)) return socket.emit('roomError','Pouvoir non disponible à cette étape.');
    const allowed=(st.phase==='service'&&st.pointServerSide===side)||st.phase===(side==='top'?'topResponse':'bottomResponse');
    if(st.pointEnded||!allowed) return socket.emit('roomError','Ce pouvoir doit être activé au moment de choisir la valeur d’une tuile.');
    const powers=st.characterPowers?.[side];
    const p=powers?.[power];
    if(!p) return socket.emit('roomError','Pouvoir indisponible.');
    if(p.used) return socket.emit('roomError','Ce pouvoir a déjà été utilisé.');
    if(power==='jeanne_pm2'&&!powers?.jeanne_pm1?.used) return socket.emit('roomError','Utilisez d’abord le pouvoir 1.');
    if(power==='jeanne_free_value'&&!powers?.jeanne_pm2?.used) return socket.emit('roomError','Utilisez d’abord le pouvoir 2.');
    p.used=true;p.active=true;
    if(power==='jeanne_free_value') st.jeanneExhaustion[side]={stage:'first'};
    io.to(room).emit('freshJeannePowerActivated',{state:st,side,power});
  });

  /* Mathieu — pouvoir 1 validé sur l'ancien socle personnages-dev :
     uniquement pendant SON popup de déplacement, une fois par partie.
     Toute la distance est payée en Énergie et 0 Déplacement. */
  socket.on('freshActivateCharacterPower',({room,power})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);
    if(!r) return socket.emit('roomError','Salle introuvable.');
    const player=r.players.find(p=>p.id===socket.id);
    if(!player) return socket.emit('roomError','Joueur introuvable.');
    const side=player.seat==='joiner'?'top':'bottom';
    const st=r.state;
    if(!['mathieu_energy_only','mathieu_reduce1','mathieu_free_move'].includes(power)) return socket.emit('roomError','Pouvoir non disponible à cette étape.');
    if(st.characters?.[side]!=='mathieu') return socket.emit('roomError','Ce pouvoir appartient à Mathieu.');
    if(st.pointEnded || st.phase!==(side==='top'?'topMove':'bottomMove')) return socket.emit('roomError','Ce pouvoir s’utilise au moment du déplacement de votre raquette.');
    const powers=st.characterPowers?.[side];
    const p=powers?.[power];
    if(!p || p.used) return socket.emit('roomError','Ce pouvoir a déjà été utilisé.');
    if(power==='mathieu_reduce1' && !powers?.mathieu_energy_only?.used) return socket.emit('roomError','Utilisez d’abord le pouvoir 1.');
    if(power==='mathieu_free_move' && !powers?.mathieu_reduce1?.used) return socket.emit('roomError','Utilisez d’abord le pouvoir 2.');
    const node=side==='top'?(st.opponentPaddleNode??'S'):(st.localPaddleNode??'S');
    const energy=side==='top'?st.opponentEnergy:st.localEnergy;
    const distance=shortestDistance(node,Number(st.lastPlayedValue));
    if(!Number.isFinite(distance)) return socket.emit('roomError','Déplacement impossible.');
    if(power==='mathieu_energy_only' && distance>energy) return socket.emit('roomError','Énergie insuffisante.');
    p.used=true;
    p.active=true;
    if(power==='mathieu_free_move') st.mathieuExhaustion[side]={stage:'first'};
    io.to(room).emit('freshCharacterPowerActivated',{state:st,side,power});
  });

  socket.on('freshMathieuRoll',({room})=>{
    room=String(room||'').trim();
    const r=rooms.get(room); if(!r)return;
    const player=r.players.find(p=>p.id===socket.id); if(!player)return;
    const side=player.seat==='joiner'?'top':'bottom',st=r.state,x=st.mathieuExhaustion&&st.mathieuExhaustion[side];
    if(!x||x.stage!=='roll'||st.phase!=='mathieuExhaustion')return;
    const roll=1+Math.floor(Math.random()*6),lost=roll<=3;
    x.stage='done';x.used=true;
    if(lost){
      st.pointEnded=true;st.pointWinnerSide=side==='top'?'bottom':'top';
      st.pointEndReason='mathieuExhaustion';
      st.pointEndMessage='Mathieu est épuisé : D6 = '+roll+'. Le point est perdu.';
      st.phase='pointEnded';
    }else st.phase=x.resume;
    io.to(room).emit('freshMathieuRollResult',{state:st,side,roll,lost});
  });
  socket.on('freshMathieuRollValidated',({room})=>{
    room=String(room||'').trim();
    const r=rooms.get(room);if(!r)return;
    const st=r.state;
    if(st.pointEnded) io.to(room).emit('freshPointEnded',{state:st,winnerSide:st.pointWinnerSide,reason:st.pointEndReason,message:st.pointEndMessage});
    else scheduleBot(room,r);
  });

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
    const jp=st.characterPowers?.[serviceSide]?.jeanne_pm1,jp2=st.characterPowers?.[serviceSide]?.jeanne_pm2,jp3=st.characterPowers?.[serviceSide]?.jeanne_free_value;
    const jd=Math.abs(printedValue-finalValue);
    const cost=jp3?.active?0:(jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd));
    const energyAvailable = serviceSide==='bottom' ? st.localEnergy : st.opponentEnergy;
    if(cost>energyAvailable) return socket.emit('roomError','Énergie insuffisante.');

    pile.cards.shift();
    if(jp?.active) jp.active=false;
    if(jp2?.active) jp2.active=false;
    if(jp3?.active) jp3.active=false;
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

    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);
    if(!Number.isFinite(rawDistance)) return socket.emit('roomError','Déplacement impossible.');
    const mathieuReduce1=!!st.characterPowers?.top?.mathieu_reduce1?.active;
    const mathieuFreeMove=!!st.characterPowers?.top?.mathieu_free_move?.active;
    const distance=mathieuFreeMove?0:(mathieuReduce1?Math.max(0,rawDistance-1):rawDistance);

    const mathieuEnergyOnly=!!st.characterPowers?.top?.mathieu_energy_only?.active;
    if(distance===0){
      if(moveSpend!==0 || energySpend!==0) return socket.emit('roomError','Aucune dépense nécessaire.');
    }else if(mathieuEnergyOnly){
      if(moveSpend!==0 || energySpend!==distance) return socket.emit('roomError','Pouvoir Mathieu : paiement uniquement en énergie.');
      if(energySpend>st.opponentEnergy) return socket.emit('roomError','Énergie insuffisante.');
    }else{
      if(!Number.isInteger(moveSpend) || moveSpend<1) return socket.emit('roomError','Au moins 1 déplacement est requis.');
      if(!Number.isInteger(energySpend) || energySpend<0) return socket.emit('roomError','Dépense énergie invalide.');
      if(moveSpend+energySpend!==distance) return socket.emit('roomError','Répartition invalide.');
      if(moveSpend>st.opponentMovement || energySpend>st.opponentEnergy) return socket.emit('roomError','Ressources insuffisantes.');
    }

    st.opponentMovement-=moveSpend;
    st.opponentEnergy-=energySpend;
    st.opponentPaddleNode=targetValue;
    if(st.characterPowers?.top?.mathieu_energy_only) st.characterPowers.top.mathieu_energy_only.active=false;
    if(st.characterPowers?.top?.mathieu_reduce1) st.characterPowers.top.mathieu_reduce1.active=false;
    if(st.characterPowers?.top?.mathieu_free_move) st.characterPowers.top.mathieu_free_move.active=false;

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
    const jp=st.characterPowers?.top?.jeanne_pm1,jp2=st.characterPowers?.top?.jeanne_pm2,jp3=st.characterPowers?.top?.jeanne_free_value;
    const jd=Math.abs(printedValue-finalValue);
    const cost=jp3?.active?0:(jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd));
    if(cost>st.opponentEnergy) return socket.emit('roomError','Énergie insuffisante.');
    if(!responseRuleAllows(st.lastPlayedColor,Number(st.lastPlayedValue),finalValue)){
      return socket.emit('roomError','Valeur de réponse interdite.');
    }

    pile.cards.shift();
    if(jp?.active) jp.active=false;
    if(jp2?.active) jp2.active=false;
    if(jp3?.active) jp3.active=false;
    st.opponentEnergy-=cost;
    st.lastPlayedColor=pile.color;
    st.lastPlayedValue=finalValue;
    st.blockedColor=pile.color;
    mathieuOpponentResponded(st,'top');
    jeanneOpponentResponded(st,'top');

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

    if(!endSpec){
      mathieuOwnerResponded(room,r,'top');
      jeanneOwnerResponded(room,r,'top');
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

    const rawDistance=shortestDistance(st.localPaddleNode ?? 'S',targetValue);
    if(!Number.isFinite(rawDistance)) return socket.emit('roomError','Déplacement impossible.');
    const mathieuReduce1=!!st.characterPowers?.bottom?.mathieu_reduce1?.active;
    const mathieuFreeMove=!!st.characterPowers?.bottom?.mathieu_free_move?.active;
    const distance=mathieuFreeMove?0:(mathieuReduce1?Math.max(0,rawDistance-1):rawDistance);

    const mathieuEnergyOnly=!!st.characterPowers?.bottom?.mathieu_energy_only?.active;
    if(distance===0){
      if(moveSpend!==0 || energySpend!==0) return socket.emit('roomError','Aucune dépense nécessaire.');
    }else if(mathieuEnergyOnly){
      if(moveSpend!==0 || energySpend!==distance) return socket.emit('roomError','Pouvoir Mathieu : paiement uniquement en énergie.');
      if(energySpend>st.localEnergy) return socket.emit('roomError','Énergie insuffisante.');
    }else{
      if(!Number.isInteger(moveSpend) || moveSpend<1) return socket.emit('roomError','Au moins 1 déplacement est requis.');
      if(!Number.isInteger(energySpend) || energySpend<0) return socket.emit('roomError','Dépense énergie invalide.');
      if(moveSpend+energySpend!==distance) return socket.emit('roomError','Répartition invalide.');
      if(moveSpend>st.localMovement || energySpend>st.localEnergy) return socket.emit('roomError','Ressources insuffisantes.');
    }

    st.localMovement-=moveSpend;
    st.localEnergy-=energySpend;
    st.localPaddleNode=targetValue;
    if(st.characterPowers?.bottom?.mathieu_energy_only) st.characterPowers.bottom.mathieu_energy_only.active=false;
    if(st.characterPowers?.bottom?.mathieu_reduce1) st.characterPowers.bottom.mathieu_reduce1.active=false;
    if(st.characterPowers?.bottom?.mathieu_free_move) st.characterPowers.bottom.mathieu_free_move.active=false;

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
    const jp=st.characterPowers?.bottom?.jeanne_pm1,jp2=st.characterPowers?.bottom?.jeanne_pm2,jp3=st.characterPowers?.bottom?.jeanne_free_value;
    const jd=Math.abs(printedValue-finalValue);
    const cost=jp3?.active?0:(jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd));
    if(cost>st.localEnergy) return socket.emit('roomError','Énergie insuffisante.');
    if(!responseRuleAllows(st.lastPlayedColor,Number(st.lastPlayedValue),finalValue)){
      return socket.emit('roomError','Valeur de réponse interdite.');
    }

    pile.cards.shift();
    if(jp?.active) jp.active=false;
    if(jp2?.active) jp2.active=false;
    if(jp3?.active) jp3.active=false;
    st.localEnergy-=cost;
    st.lastPlayedColor=pile.color;
    st.lastPlayedValue=finalValue;
    st.blockedColor=pile.color;
    mathieuOpponentResponded(st,'bottom');
    jeanneOpponentResponded(st,'bottom');

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

    const exhaustionHold=!endSpec&&(mathieuOwnerResponded(room,r,'bottom')||jeanneOwnerResponded(room,r,'bottom'));
    io.to(room).emit('freshBottomResponseApplied',{state:st,action});
    if(!exhaustionHold) scheduleBot(room,r);
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
