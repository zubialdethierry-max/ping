/* PING! — Championnat solo V1 : calendrier, classement et progression persistante. */
'use strict';

const {simulateMatch}=require('./championship-simulator');

const BOT_IDENTITIES=[
 {id:'lucas_morel',name:'Lucas Morel',profile:'equilibre',skill:42},
 {id:'emma_laurent',name:'Emma Laurent',profile:'objectif',skill:48},
 {id:'nathan_dubois',name:'Nathan Dubois',profile:'pression',skill:45},
 {id:'lea_martin',name:'Léa Martin',profile:'econome',skill:40},
 {id:'hugo_bernard',name:'Hugo Bernard',profile:'equilibre',skill:52},
 {id:'ines_robert',name:'Inès Robert',profile:'objectif',skill:46},
 {id:'theo_garcia',name:'Théo Garcia',profile:'pression',skill:50}
];

function roundRobin(ids){
 const a=[...ids]; if(a.length%2)a.push(null);
 const rounds=[];
 for(let r=0;r<a.length-1;r++){
  const matches=[];
  for(let i=0;i<a.length/2;i++){
   const x=a[i],y=a[a.length-1-i];
   if(x&&y)matches.push(r%2?{home:y,away:x}:{home:x,away:y});
  }
  rounds.push(matches); a.splice(1,0,a.pop());
 }
 return rounds;
}

function createSeason(playerName='Joueur'){
 const players=[
  {id:'human',name:String(playerName||'Joueur'),human:true,profile:'humain',skill:null},
  ...BOT_IDENTITIES.map(x=>({...x,human:false}))
 ];
 return {version:1,status:'active',round:0,players,schedule:roundRobin(players.map(p=>p.id)),results:[],createdAt:new Date().toISOString()};
}

function recordResult(season,round,home,away,homeScore,awayScore,meta={}){
 homeScore=Number(homeScore);awayScore=Number(awayScore);
 if(![homeScore,awayScore].includes(4)||homeScore===awayScore)throw new Error('Un match doit se terminer à 4 points gagnants.');
 const match=season.schedule?.[round]?.find(m=>m.home===home&&m.away===away);
 if(!match)throw new Error('Match absent du calendrier.');
 if(season.results.some(x=>x.round===round&&x.home===home&&x.away===away))throw new Error('Match déjà enregistré.');
 season.results.push({round,home,away,homeScore,awayScore,winner:homeScore>awayScore?home:away,...meta});
}

function standings(season){
 const rows=new Map(season.players.map(p=>[p.id,{id:p.id,name:p.name,human:!!p.human,played:0,wins:0,losses:0,for:0,against:0,diff:0,points:0}]));
 for(const m of season.results){
  const h=rows.get(m.home),a=rows.get(m.away); if(!h||!a)continue;
  h.played++;a.played++;h.for+=m.homeScore;h.against+=m.awayScore;a.for+=m.awayScore;a.against+=m.homeScore;
  if(m.homeScore>m.awayScore){h.wins++;a.losses++;h.points+=3;}else{a.wins++;h.losses++;a.points+=3;}
 }
 for(const r of rows.values())r.diff=r.for-r.against;
 return [...rows.values()].sort((a,b)=>b.points-a.points||b.diff-a.diff||b.for-a.for||a.name.localeCompare(b.name,'fr')).map((r,i)=>({...r,rank:i+1}));
}

function playerById(season,id){return season.players.find(p=>p.id===id);}
function currentRoundMatches(season){return (season.schedule[season.round]||[]).map(m=>({...m,homePlayer:playerById(season,m.home),awayPlayer:playerById(season,m.away)}));}
function humanMatch(season){return currentRoundMatches(season).find(m=>m.home==='human'||m.away==='human')||null;}

function simulateBotMatchesForCurrentRound(season,{rng=Math.random}={}){
 if(season.status!=='active')return [];
 const produced=[];
 for(const m of currentRoundMatches(season)){
  if(m.homePlayer.human||m.awayPlayer.human)continue;
  if(season.results.some(x=>x.round===season.round&&x.home===m.home&&x.away===m.away))continue;
  const sim=simulateMatch(m.homePlayer,m.awayPlayer,{rng});
  recordResult(season,season.round,m.home,m.away,sim.homeScore,sim.awayScore,{simulated:true,pointWinners:sim.points});
  produced.push(season.results[season.results.length-1]);
 }
 return produced;
}

function recordHumanMatch(season,humanScore,botScore){
 const m=humanMatch(season); if(!m)throw new Error('Aucun match humain pour cette journée.');
 const humanHome=m.home==='human';
 recordResult(season,season.round,m.home,m.away,humanHome?humanScore:botScore,humanHome?botScore:humanScore,{simulated:false});
}

function progressBots(season){
 for(const p of season.players){
  if(p.human)continue;
  const gain=0.35+Math.random()*0.9;
  p.skill=Math.min(75,Math.round((Number(p.skill||40)+gain)*100)/100);
 }
}

function completeRound(season){
 const r=season.round,expected=season.schedule[r]||[];
 const done=expected.every(m=>season.results.some(x=>x.round===r&&x.home===m.home&&x.away===m.away));
 if(!done)return false;
 progressBots(season); season.round++;
 if(season.round>=season.schedule.length)season.status='finished';
 return true;
}

function roundSummary(season,round=season.round){
 const names=new Map(season.players.map(p=>[p.id,p.name]));
 return season.results.filter(x=>x.round===round).map(x=>({...x,homeName:names.get(x.home),awayName:names.get(x.away)}));
}

module.exports={BOT_IDENTITIES,createSeason,recordResult,standings,currentRoundMatches,humanMatch,simulateBotMatchesForCurrentRound,recordHumanMatch,completeRound,roundSummary};
