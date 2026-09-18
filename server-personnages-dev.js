const characterState=require('./character-state-dev');
module.exports=function installCharacterSelection(socket,ctx){
  const {io,rooms,scheduleBot}=ctx;
  socket.on('freshChooseCharacter',data=>{
    const room=String(data?.room||'').trim();
    const character=String(data?.character||'').trim();
    const r=rooms.get(room);
    if(!r)return socket.emit('roomError','Salle introuvable.');
    const player=r.players.find(p=>p.id===socket.id);
    if(!player)return socket.emit('roomError','Joueur introuvable.');
    const side=player.seat==='joiner'?'top':'bottom';
    if(r.state?.characterMode!=='on')return socket.emit('roomError','Cette partie est sans personnages.');
    if(!characterState.choose(r.state,side,character))return socket.emit('roomError','Choix de personnage invalide.');
    io.to(room).emit('freshCharacterChosen',{state:r.state,side,character});
  });

  socket.on('freshJeanneResolve',data=>{
    const room=String(data?.room||'').trim();
    const roll=Number(data?.roll);
    const r=rooms.get(room);
    if(!r)return;
    const player=r.players.find(p=>p.id===socket.id);
    if(!player)return;
    const side=player.seat==='joiner'?'top':'bottom';
    const st=r.state;
    const x=st?.jeanneExhaustion?.[side];
    if(st?.characters?.[side]!=='jeanne'||!x||x.stage!=='roll'||st.phase!=='jeanneExhaustion')return;
    if(!Number.isInteger(roll)||roll<1||roll>6)return;
    const lost=roll>=4;
    x.stage='done';
    x.used=true;
    if(lost){
      st.pointEnded=true;
      st.pointWinnerSide=side==='top'?'bottom':'top';
      st.pointEndReason='jeanneExhaustion';
      st.pointEndMessage='Votre balle sort du plateau, vous perdez le point';
      st.phase='pointEnded';
    }else{
      st.phase=x.resume;
    }
    io.to(room).emit('freshJeanneRollResult',{state:st,side,roll,lost});
  });

  socket.on('freshJeanneContinueValidated',data=>{
    const room=String(data?.room||'').trim();
    const r=rooms.get(room);
    if(!r)return;
    const player=r.players.find(p=>p.id===socket.id);
    if(!player)return;
    const side=player.seat==='joiner'?'top':'bottom';
    const st=r.state;
    const x=st?.jeanneExhaustion?.[side];
    if(!x||x.stage!=='done'||st.pointEnded)return;
    if(typeof scheduleBot==='function')scheduleBot(room,r);
  });
};
