module.exports=function fixV0401(s){
  const bad1="rep(\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\",\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\");";
  const good1="rep(\"    const distance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\",\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\\n    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\");";
  const bad2="rep(\"    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\",\"    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\");";
  if(!s.includes(bad1)||!s.includes(bad2))throw new Error('Correctif V0.40.2: ancres inattendues');
  s=s.replace(bad1,good1).replace(bad2,'');
  s=s.replace("installCharacterSelection(socket,{io,rooms});","installCharacterSelection(socket,{io,rooms,scheduleBot});");

  const marker="const out=path.join(__dirname,'_server_v035_runtime.js');fs.writeFileSync(out,s);require(out);";
  if(!s.includes(marker))throw new Error('V0.40.18: marqueur runtime introuvable');
  const runtimePatch=`
// Jeanne P2/P3 : même mécanisme que P1. P2 retire 2 au coût, P3 rend toute modification gratuite.
s=s.replaceAll("jeanne_pm1:{used:false,active:false}","jeanne_pm1:{used:false,active:false},jeanne_pm2:{used:false,active:false},jeanne_free_value:{used:false,active:false}");
s=s.replace("if(power!=='jeanne_pm1')return socket.emit('roomError','Pouvoir inconnu.');","if(!['jeanne_pm1','jeanne_pm2','jeanne_free_value'].includes(power))return socket.emit('roomError','Pouvoir inconnu.');");
s=s.replace("const p=st.characterPowers?.[side]?.jeanne_pm1;if(!p||p.used)return socket.emit('roomError','Ce pouvoir a déjà été utilisé.');p.used=true;p.active=true;","const p=st.characterPowers?.[side]?.[power];if(!p||p.used)return socket.emit('roomError','Ce pouvoir a déjà été utilisé.');if(power==='jeanne_pm2'&&!st.characterPowers?.[side]?.jeanne_pm1?.used)return socket.emit('roomError','Utilisez d’abord le pouvoir 1.');if(power==='jeanne_free_value'&&!st.characterPowers?.[side]?.jeanne_pm2?.used)return socket.emit('roomError','Utilisez d’abord le pouvoir 2.');p.used=true;p.active=true;");
s=s.replaceAll("const jp=st.characterPowers?.[serviceSide]?.jeanne_pm1;\\n    const jeanneFree=!!(jp?.active&&Math.abs(printedValue-finalValue)===1);\\n    const cost=jeanneFree?0:Math.abs(printedValue-finalValue);","const jp=st.characterPowers?.[serviceSide]?.jeanne_pm1,jp2=st.characterPowers?.[serviceSide]?.jeanne_pm2,jp3=st.characterPowers?.[serviceSide]?.jeanne_free_value;\\n    const jd=Math.abs(printedValue-finalValue);\\n    const cost=jp3?.active?0:(jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd));");
s=s.replaceAll("pile.cards.shift();if(jp?.active)jp.active=false;","pile.cards.shift();if(jp?.active)jp.active=false;if(jp2?.active)jp2.active=false;if(jp3?.active)jp3.active=false;");
s=s.replace("const jp=st.characterPowers?.top?.jeanne_pm1;const jeanneFree=!!(jp?.active&&Math.abs(printedValue-finalValue)===1);\\n    const cost=jeanneFree?0:Math.abs(printedValue-finalValue);","const jp=st.characterPowers?.top?.jeanne_pm1,jp2=st.characterPowers?.top?.jeanne_pm2,jp3=st.characterPowers?.top?.jeanne_free_value;const jd=Math.abs(printedValue-finalValue);\\n    const cost=jp3?.active?0:(jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd));");
s=s.replace("const jp=st.characterPowers?.bottom?.jeanne_pm1;const jeanneFree=!!(jp?.active&&Math.abs(printedValue-finalValue)===1);\\n    const cost=jeanneFree?0:Math.abs(printedValue-finalValue);","const jp=st.characterPowers?.bottom?.jeanne_pm1,jp2=st.characterPowers?.bottom?.jeanne_pm2,jp3=st.characterPowers?.bottom?.jeanne_free_value;const jd=Math.abs(printedValue-finalValue);\\n    const cost=jp3?.active?0:(jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd));");

// Jeanne P4, étapes 1 à 5 : copie de la machine d'état de Mathieu, sans résolution du D6 à ce stade.
s=s.replace("mathieuExhaustion:{top:null,bottom:null}","mathieuExhaustion:{top:null,bottom:null},jeanneExhaustion:{top:null,bottom:null}");
s=s.replace("p.used=true;p.active=true;io.to(room).emit('freshJeannePowerActivated',{state:st,side,power});","p.used=true;p.active=true;if(power==='jeanne_free_value')st.jeanneExhaustion[side]={stage:'first'};io.to(room).emit('freshJeannePowerActivated',{state:st,side,power});");
s=s.replace("function mathieuOpponentResponded(st,side){","function jeanneOpponentResponded(st,side){const owner=side==='top'?'bottom':'top',x=st.jeanneExhaustion&&st.jeanneExhaustion[owner];if(x&&x.stage==='waitOpponent')x.stage='waitOwner';}\\nfunction jeanneOwnerResponded(room,r,side){const st=r.state,x=st.jeanneExhaustion&&st.jeanneExhaustion[side];if(!x)return false;if(x.stage==='first'){x.stage='waitOpponent';return false;}if(x.stage==='waitOwner'){x.stage='roll';x.resume=side==='bottom'?'topMove':'bottomMove';st.phase='jeanneExhaustion';io.to(room).emit('freshJeanneExhaustionPending',{state:st,side});return true;}return false;}\\nfunction mathieuOpponentResponded(st,side){");
s=s.replaceAll("mathieuOpponentResponded(st,'top');","mathieuOpponentResponded(st,'top');jeanneOpponentResponded(st,'top');");
s=s.replaceAll("mathieuOpponentResponded(st,'bottom');","mathieuOpponentResponded(st,'bottom');jeanneOpponentResponded(st,'bottom');");
s=s.replace("if(!endSpec)mathieuOwnerResponded(room,r,'top');","if(!endSpec){mathieuOwnerResponded(room,r,'top');jeanneOwnerResponded(room,r,'top');}");
s=s.replace("const exhaustionHold=!endSpec&&mathieuOwnerResponded(room,r,'bottom');","const exhaustionHold=!endSpec&&(mathieuOwnerResponded(room,r,'bottom')||jeanneOwnerResponded(room,r,'bottom'));");
`;
  s=s.replace(marker,runtimePatch+'\n'+marker);
  return s;
};
