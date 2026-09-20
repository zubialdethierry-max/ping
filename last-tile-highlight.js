/* PING! — dernière tuile + compteur d'empilement.
   Source de vérité : les attributs logiques ajoutés aux tuiles par placeServiceTile/placeResponseTile. */
(()=>{
  function decorateExistingTile(tile){
    if(tile.dataset.pingValue)return;
    const m=(tile.alt||'').match(/jouée en\s+(\d)/i);
    if(m)tile.dataset.pingValue=m[1];
    const rot=(tile.style.transform||'').includes('180deg');
    tile.dataset.pingSide=rot?'top':'bottom';
  }

  function refresh(layer){
    const tiles=[...layer.querySelectorAll('.boardPlayedTile')];
    tiles.forEach(decorateExistingTile);

    tiles.forEach(t=>t.classList.remove('pingLatestPlayedTile'));
    const latest=tiles[tiles.length-1];
    if(latest)latest.classList.add('pingLatestPlayedTile');

    layer.querySelectorAll('.pingStackBadge').forEach(e=>e.remove());

    const groups=new Map();
    for(const tile of tiles){
      const side=tile.dataset.pingSide;
      const value=tile.dataset.pingValue;
      if(!side||!value)continue;
      const key=side+':'+value;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(tile);
    }

    for(const stack of groups.values()){
      if(stack.length<2)continue;
      const topTile=stack[stack.length-1];
      const badge=document.createElement('span');
      badge.className='pingStackBadge';
      badge.textContent='×'+stack.length;
      const isTop=topTile.dataset.pingSide==='top';
      if(isTop)badge.classList.add('pingStackBadgeTop');

      /* Même repère (%) que la tuile : aucune dépendance à la taille de fenêtre. */
      badge.style.left=topTile.style.left;
      badge.style.top=topTile.style.top;
      layer.appendChild(badge);
    }
  }

  function install(){
    if(document.getElementById('ping-last-tile-highlight-style'))return;
    const style=document.createElement('style');
    style.id='ping-last-tile-highlight-style';
    style.textContent=`
      .boardPlayedTile.pingLatestPlayedTile{
        z-index:30 !important;
        filter:drop-shadow(0 0 3px rgba(255,255,255,1))
               drop-shadow(0 0 7px rgba(255,215,0,1))
               drop-shadow(0 0 13px rgba(255,190,0,.95)) !important;
      }
      .pingStackBadge{
        position:absolute;z-index:46;min-width:22px;height:22px;padding:0 4px;
        box-sizing:border-box;border:2px solid #fff;border-radius:999px;
        background:#102c46;color:#fff;font:900 12px/18px Arial,sans-serif;
        text-align:center;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.65);
        /* J1 : coin haut-droit de la tuile (largeur tuile = 24.7% du plateau). */
        transform:translate(calc(-50% + 49px),calc(-50% - 49px));
        transform-origin:center;
      }
      .pingStackBadgeTop{
        /* J2 : coin opposé dans son repère + texte retourné à 180°. */
        transform:translate(calc(-50% - 49px),calc(-50% + 49px)) rotate(180deg);
      }
      @media(max-width:900px){
        .pingStackBadge{transform:translate(calc(-50% + 36px),calc(-50% - 36px))}
        .pingStackBadgeTop{transform:translate(calc(-50% - 36px),calc(-50% + 36px)) rotate(180deg)}
      }
    `;
    document.head.appendChild(style);

    const bind=()=>{
      const layer=document.getElementById('boardTileLayer');
      if(!layer)return false;
      let pending=false;
      const update=()=>{
        if(pending)return;pending=true;
        requestAnimationFrame(()=>{pending=false;refresh(layer);});
      };
      update();
      new MutationObserver(muts=>{
        const realChange=muts.some(m=>[...m.addedNodes,...m.removedNodes].some(n=>!(n.nodeType===1&&n.classList?.contains('pingStackBadge'))));
        if(realChange)update();
      }).observe(layer,{childList:true});
      return true;
    };
    if(!bind()){const q=setInterval(()=>{if(bind())clearInterval(q)},50);}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
