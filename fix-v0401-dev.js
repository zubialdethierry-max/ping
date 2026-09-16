module.exports=function fixV0401(s){
  const bad1="rep(\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\",\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\");";
  const good1="rep(\"    const distance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\",\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\\n    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\");";
  const bad2="rep(\"    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\",\"    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\");";
  if(!s.includes(bad1)||!s.includes(bad2))throw new Error('Correctif V0.40.2: ancres inattendues');
  s=s.replace(bad1,good1).replace(bad2,'');

  const marker="const out=path.join(__dirname,'_server_v035_runtime.js');fs.writeFileSync(out,s);require(out);";
  if(!s.includes(marker))throw new Error('V0.40.18: marqueur runtime introuvable');
  const runtimePatch=`
// Jeanne P2 : même mécanisme que P1, avec 2 points de modification gratuits.
s=s.replaceAll("jeanne_pm1:{used:false,active:false}","jeanne_pm1:{used:false,active:false},jeanne_pm2:{used:false,active:false}");
s=s.replace("if(power!=='jeanne_pm1')return socket.emit('roomError','Pouvoir inconnu.');","if(!['jeanne_pm1','jeanne_pm2'].includes(power))return socket.emit('roomError','Pouvoir inconnu.');");
s=s.replace("const p=st.characterPowers?.[side]?.jeanne_pm1;if(!p||p.used)return socket.emit('roomError','Ce pouvoir a déjà été utilisé.');p.used=true;p.active=true;","const p=st.characterPowers?.[side]?.[power];if(!p||p.used)return socket.emit('roomError','Ce pouvoir a déjà été utilisé.');if(power==='jeanne_pm2'&&!st.characterPowers?.[side]?.jeanne_pm1?.used)return socket.emit('roomError','Utilisez d’abord le pouvoir 1.');p.used=true;p.active=true;");
s=s.replaceAll("const jp=st.characterPowers?.[serviceSide]?.jeanne_pm1;\\n    const jeanneFree=!!(jp?.active&&Math.abs(printedValue-finalValue)===1);\\n    const cost=jeanneFree?0:Math.abs(printedValue-finalValue);","const jp=st.characterPowers?.[serviceSide]?.jeanne_pm1,jp2=st.characterPowers?.[serviceSide]?.jeanne_pm2;\\n    const jd=Math.abs(printedValue-finalValue);\\n    const cost=jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd);");
s=s.replaceAll("pile.cards.shift();if(jp?.active)jp.active=false;","pile.cards.shift();if(jp?.active)jp.active=false;if(jp2?.active)jp2.active=false;");
s=s.replace("const jp=st.characterPowers?.top?.jeanne_pm1;const jeanneFree=!!(jp?.active&&Math.abs(printedValue-finalValue)===1);\\n    const cost=jeanneFree?0:Math.abs(printedValue-finalValue);","const jp=st.characterPowers?.top?.jeanne_pm1,jp2=st.characterPowers?.top?.jeanne_pm2;const jd=Math.abs(printedValue-finalValue);\\n    const cost=jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd);");
s=s.replace("const jp=st.characterPowers?.bottom?.jeanne_pm1;const jeanneFree=!!(jp?.active&&Math.abs(printedValue-finalValue)===1);\\n    const cost=jeanneFree?0:Math.abs(printedValue-finalValue);","const jp=st.characterPowers?.bottom?.jeanne_pm1,jp2=st.characterPowers?.bottom?.jeanne_pm2;const jd=Math.abs(printedValue-finalValue);\\n    const cost=jp2?.active?Math.max(0,jd-2):(jp?.active?Math.max(0,jd-1):jd);");
`;
  s=s.replace(marker,runtimePatch+'\n'+marker);
  return s;
};
