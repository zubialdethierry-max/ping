/* PING! — surbrillance de la dernière tuile + indicateur d'empilement. */
(()=>{
  const TILE_SELECTOR='.boardPlayedTile';

  function refresh(layer){
    const tiles=[...layer.querySelectorAll(TILE_SELECTOR)];

    tiles.forEach(tile=>tile.classList.remove('pingLatestPlayedTile'));
    const latest=tiles[tiles.length-1];
    if(latest) latest.classList.add('pingLatestPlayedTile');

    /* Le badge est désormais attaché à la tuile supérieure elle-même :
       il suit donc automatiquement tous les redimensionnements du plateau. */
    tiles.forEach(tile=>tile.querySelectorAll(':scope > .pingStackBadge').forEach(el=>el.remove()));

    const groups=[];
    for(const tile of tiles){
      const left=parseFloat(tile.style.left);
      const top=parseFloat(tile.style.top);
      const key=Number.isFinite(left)&&Number.isFinite(top)
        ? left.toFixed(3)+'|'+top.toFixed(3)
        : null;
      let g=key?groups.find(x=>x.key===key):null;
      if(!g){
        const r=tile.getBoundingClientRect();
        const cx=r.left+r.width/2, cy=r.top+r.height/2;
        g=groups.find(x=>!key&&Math.hypot(x.cx-cx,x.cy-cy)<8);
        if(!g){g={key,cx,cy,tiles:[]};groups.push(g);}
      }
      g.tiles.push(tile);
    }

    for(const g of groups){
      if(g.tiles.length<2) continue;
      const topTile=g.tiles[g.tiles.length-1];
      const badge=document.createElement('span');
      badge.className='pingStackBadge';
      badge.textContent='×'+g.tiles.length;

      /* Les tuiles du demi-terrain supérieur appartiennent à J2.
         Son plateau est vu à 180°, donc coin et texte du badge sont inversés. */
      const layerRect=layer.getBoundingClientRect();
      const tileRect=topTile.getBoundingClientRect();
      const isTop=(tileRect.top+tileRect.height/2)<(layerRect.top+layerRect.height/2);
      badge.classList.toggle('pingStackBadgeTop',isTop);
      topTile.appendChild(badge);
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
      .boardPlayedTile{overflow:visible !important}
      .pingStackBadge{
        position:absolute;
        z-index:45;
        right:-5px;
        top:-5px;
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
        transform:none;
        transform-origin:center;
      }
      .pingStackBadge.pingStackBadgeTop{
        right:auto;
        left:-5px;
        top:auto;
        bottom:-5px;
        transform:rotate(180deg);
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
        const external=muts.some(m=>[...m.addedNodes,...m.removedNodes].some(n=>!(n.nodeType===1&&n.classList?.contains('pingStackBadge'))));
        if(external) update();
      }).observe(layer,{childList:true,subtree:false});
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
