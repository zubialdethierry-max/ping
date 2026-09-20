/* PING! — surbrillance de la dernière tuile + indicateur d'empilement. */
(()=>{
  const TILE_SELECTOR='.boardPlayedTile';

  function centerOf(tile){
    const r=tile.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  }

  function refresh(layer){
    const tiles=[...layer.querySelectorAll(TILE_SELECTOR)];

    /* Dernière tuile jouée. */
    tiles.forEach(tile=>tile.classList.remove('pingLatestPlayedTile'));
    const latest=tiles[tiles.length-1];
    if(latest) latest.classList.add('pingLatestPlayedTile');

    /* Retire les anciens badges avant de recalculer les piles. */
    layer.querySelectorAll('.pingStackBadge').forEach(el=>el.remove());

    /* Les tuiles superposées partagent le même centre à quelques pixels près. */
    const groups=[];
    for(const tile of tiles){
      const p=centerOf(tile);
      let g=groups.find(x=>Math.hypot(x.x-p.x,x.y-p.y)<8);
      if(!g){g={x:p.x,y:p.y,tiles:[]};groups.push(g);}
      g.tiles.push(tile);
    }

    const lr=layer.getBoundingClientRect();
    for(const g of groups){
      if(g.tiles.length<2) continue;
      const top=g.tiles[g.tiles.length-1];
      const tr=top.getBoundingClientRect();
      const badge=document.createElement('div');
      badge.className='pingStackBadge';
      badge.textContent='×'+g.tiles.length;
      badge.style.left=(tr.right-lr.left-9)+'px';
      badge.style.top=(tr.top-lr.top+9)+'px';
      layer.appendChild(badge);
    }
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
      .pingStackBadge{
        position:absolute;
        z-index:45;
        transform:translate(-50%,-50%);
        min-width:22px;
        height:22px;
        padding:0 4px;
        box-sizing:border-box;
        border:2px solid #fff;
        border-radius:999px;
        background:#102c46;
        color:#fff;
        font:900 12px/18px Arial,sans-serif;
        text-align:center;
        pointer-events:none;
        box-shadow:0 1px 4px rgba(0,0,0,.65);
      }
    `;
    document.head.appendChild(style);

    const bind=()=>{
      const layer=document.getElementById('boardTileLayer');
      if(!layer) return false;
      let scheduled=false;
      const update=()=>{
        if(scheduled)return;
        scheduled=true;
        requestAnimationFrame(()=>{scheduled=false;refresh(layer);});
      };
      update();
      new MutationObserver(muts=>{
        /* Nos propres badges ne doivent pas relancer le calcul en boucle. */
        const external=muts.some(m=>[...m.addedNodes,...m.removedNodes].some(n=>!(n.nodeType===1&&n.classList?.contains('pingStackBadge'))));
        if(external) update();
      }).observe(layer,{childList:true});
      window.addEventListener('resize',update);
      return true;
    };
    if(!bind()){
      const timer=setInterval(()=>{if(bind()) clearInterval(timer);},50);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
