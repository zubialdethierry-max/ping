/* PING! — surbrillance de la dernière tuile jouée sur le plateau. */
(()=>{
  function markLatest(layer){
    const tiles=[...layer.querySelectorAll('.boardPlayedTile')];
    tiles.forEach(tile=>tile.classList.remove('pingLatestPlayedTile'));
    const latest=tiles[tiles.length-1];
    if(latest) latest.classList.add('pingLatestPlayedTile');
  }

  function install(){
    if(document.getElementById('ping-last-tile-highlight-style')) return;
    const style=document.createElement('style');
    style.id='ping-last-tile-highlight-style';
    style.textContent=`
      .boardPlayedTile.pingLatestPlayedTile{
        z-index:30 !important;
        filter:
          drop-shadow(0 0 3px rgba(255,255,255,1))
          drop-shadow(0 0 7px rgba(255,215,0,1))
          drop-shadow(0 0 13px rgba(255,190,0,.95)) !important;
      }
    `;
    document.head.appendChild(style);

    const bind=()=>{
      const layer=document.getElementById('boardTileLayer');
      if(!layer) return false;
      markLatest(layer);
      new MutationObserver(()=>markLatest(layer)).observe(layer,{childList:true});
      return true;
    };
    if(!bind()){
      const timer=setInterval(()=>{if(bind()) clearInterval(timer);},50);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
