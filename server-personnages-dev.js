const characterState=require('./character-state-dev');
module.exports=function installCharacterSelection(socket,ctx){
  const {io,rooms}=ctx;
  socket.on('freshChooseCharacter',data=>{
    const room=String(data?.room||'').trim();
    const character=String(data?.character||'').trim();
    const r=rooms.get(room);
    if(!r)return socket.emit('roomError','Salle introuvable.');
    const player=r.players.find(p=>p.id===socket.id);
    if(!player)return socket.emit('roomError','Joueur introuvable.');
    const side=player.seat==='joiner'?'top':'bottom';
    if(!characterState.choose(r.state,side,character))return socket.emit('roomError','Choix de personnage invalide.');
    io.to(room).emit('freshCharacterChosen',{state:r.state,side,character});
  });
};
