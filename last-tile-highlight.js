/* PING! — surbrillance de la dernière tuile + compteur logique d'empilement.
   Le compteur utilise l'historique officiel boardPlays (valeur finale 1..6),
   jamais des coordonnées écran. */
(()=>{
  let lastState=null;
  const socket=()=>window.freshPingSocket||window.FRESH_NET?.socket||null;

  function logicalValue(play){
    const v=Number(play?.finalValue ?? play?.targetValue ?? play?.value);
    return Number.isInteger(v)&&v>=1&&v<=6?v:null;
  }

  function countsFromState(st){
    const counts={1:0,2:0,3:0,4:0,5:0,6:0};
    for(const p of st?.boardPlays||[]){
      /* Seules les tuiles jouées comptent; les déplacements de raquette non. */
      if(p?.type && /move/i.test(String(p.type))) continue;
      const v=logicalValue(p);
      if(v) counts[v]++;
    }
    return counts;
  }

  function tileCenter(tile){
    const r=tile.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  }

  function clusterTiles(tiles){
    const groups=[];
    for(const tile of tiles){
      const p=tileCenter(tile);
      let g=groups.find(x=>Math.hypot(x.x-p.x,x.y-p.y)<Math.max(6,tile.getBoundingClientRect().width*.18));
      if(!g){g={x:p.x,y:p.y,tiles:[]};groups.push(g);}
      g.tiles.push(tile);
    }
    return groups;
  }

  function assignLogicalPositions(layer,groups){
    if(!groups.length)return new Map();
    const lr=layer.getBoundingClientRect();
    const midX=lr.left+lr.width/2, midY=lr.top+lr.height/2;
    const map=new Map();

    /* Position logique déterminée par la géométrie du plateau, pas par le viewport :
       bas J1 : gauche=5, droite=6 ; milieu : gauche=3, droite=4 ; haut : gauche=1, droite=2.
       Pour J2, la moitié supérieure est tournée de 180° :
       près du filet gauche=2/droite=1, milieu gauche=4/droite=3, fond gauche=6/droite=5.
       Comme une valeur n'a qu'une position physique commune sur le plateau, on classe
       ici les six centres de cases par leur position verticale puis horizontale. */
    const sorted=[...groups].sort((a,b)=>a.y-b.y||a.x-b.x);
    /* Les groupes visibles ne sont pas forcément les six cases; on s'appuie donc
       surtout sur leur moitié et leur ordre latéral. La valeur réelle sera confirmée
       par l'historique via le nombre attendu de tuiles par valeur. */
    for(const g of sorted){
      g.half=g.y<midY?'top':'bottom';
      g.side=g.x<midX?'left':'right';
    }
    return map;
  }

  function markLatestAndStacks(layer){
    const tiles=[...layer.querySelectorAll('.boardPlayedTile')];
    tiles.forEach(t=>t.classList.remove('pingLatestPlayedTile'));
    const latest=tiles[tiles.length-1];
    if(latest)latest.classList.add('pingLatestPlayedTile');

    layer.querySelectorAll('.pingStackBadge').forEach(e=>e.remove());
    if(!lastState)return;

    const counts=countsFromState(lastState);
    const groups=clusterTiles(tiles);
    const wanted=Object.entries(counts).filter(([,n])=>n>=2);
    if(!wanted.length)return;

    /* Un groupe DOM contenant N tuiles correspond nécessairement à une pile N.
       On associe d'abord sans ambiguïté par multiplicité; s'il y a plusieurs piles
       de même hauteur, l'ordre des dernières occurrences de boardPlays donne l'ordre
       d'apparition et donc celui des groupes DOM. */
    const bySize=new Map();
    for(const g of groups){
      const n=g.tiles.length;
      if(n<2)continue;
      if(!bySize.has(n))bySize.set(n,[]);
      bySize.get(n).push(g);
    }
    const plays=(lastState.boardPlays||[]).filter(p=>!p?.type||!/move/i.test(String(p.type)));
    const lastIndex={};
    plays.forEach((p,i)=>{const v=logicalValue(p);if(v)lastIndex[v]=i;});

    for(const [n,gs] of bySize){
      const values=wanted.filter(([,count])=>count===n).map(([v])=>Number(v))
        .sort((a,b)=>(lastIndex[a]??-1)-(lastIndex[b]??-1));
      const ordered=[...gs].sort((a,b)=>{
        const ai=Math.max(...a.tiles.map(t=>tiles.indexOf(t)));
        const bi=Math.max(...b.tiles.map(t=>tiles.indexOf(t)));
        return ai-bi;
      });
      ordered.forEach((g,i)=>{
        const value=values[i];
        if(!value)return;
        const topTile=g.tiles[g.tiles.length-1];
        const badge=document.createElement('span');
        badge.className='pingStackBadge pingStackValue'+value;
        badge.textContent='×'+n;
        /* 1-2-3 sont orientés vers J2; 4-5-6 vers J1 selon le plateau actuel. */
        const j2=value<=3;
        if(j2)badge.classList.add('pingStackBadgeJ2');
        topTile.insertAdjacentElement('afterend',badge);
        const tr=topTile.getBoundingClientRect(),lr=layer.getBoundingClientRect();
        badge.style.left=((j2?tr.left:tr.right)-lr.left)+'px';
        badge.style.top=((j2?tr.bottom:tr.top)-lr.top)+'px';
      });
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
        transform:translate(35%,-35%);transform-origin:center;
      }
      .pingStackBadgeJ2{transform:translate(-35%,35%) rotate(180deg)}
    `;
    document.head.appendChild(style);

    const bindLayer=()=>{
      const layer=document.getElementById('boardTileLayer');if(!layer)return false;
      let pending=false;
      const update=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;markLatestAndStacks(layer);});};
      update();
      new MutationObserver(muts=>{
        if(muts.some(m=>[...m.addedNodes,...m.removedNodes].some(n=>!(n.nodeType===1&&n.classList?.contains('pingStackBadge')))))update();
      }).observe(layer,{childList:true});
      window.addEventListener('resize',update);
      window.addEventListener('orientationchange',update);
      window.__pingRefreshTileMarkers=update;
      return true;
    };
    if(!bindLayer()){const q=setInterval(()=>{if(bindLayer())clearInterval(q)},50);}

    const bindSocket=()=>{
      const s=socket();if(!s)return false;
      if(!s.__pingStackStateListener&&s.onAny){
        s.onAny((e,p)=>{if(p?.state){lastState=p.state;window.__pingRefreshTileMarkers?.();}});
        s.__pingStackStateListener=true;
      }
      return true;
    };
    if(!bindSocket()){const q=setInterval(()=>{if(bindSocket())clearInterval(q)},50);}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
