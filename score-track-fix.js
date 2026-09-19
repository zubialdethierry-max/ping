/* PING! — correction globale des meeples de score.
   Le moteur historique écrit encore les anciennes coordonnées 0/1/2/3/coupe.
   On les remappe ici sur les centres visuels réels, sans lire matchScore
   (déclaré en 'let' dans le HTML et donc absent de window). */
(function(){
  const OLD=[7.0,22.5,39.5,57.0,82.0];
  const FIX=[7.0,27.0,45.5,64.0,88.0];
  let busy=false;

  function installStyle(){
    if(document.getElementById('ping-score-track-fix-style'))return;
    const s=document.createElement('style');s.id='ping-score-track-fix-style';
    /* Le PNG bleu possède de grandes marges transparentes : sa boîte doit être
       nettement plus grande pour obtenir la même taille VISUELLE que le violet. */
    s.textContent='.scoreBottomWrap .scoreMeeple{width:30% !important;}';
    document.head.appendChild(s);
  }
  function remap(el){
    if(!el||busy)return;
    const raw=parseFloat(el.style.left||getComputedStyle(el).left);
    if(!Number.isFinite(raw))return;
    /* Une valeur déjà corrigée ne doit pas être retraitée. */
    if(FIX.some(v=>Math.abs(raw-v)<0.15))return;
    let idx=0,best=Infinity;
    OLD.forEach((v,i)=>{const d=Math.abs(raw-v);if(d<best){best=d;idx=i;}});
    if(best>3)return;
    busy=true;el.style.setProperty('left',FIX[idx]+'%','important');busy=false;
  }
  function all(){document.querySelectorAll('.scoreTopWrap .scoreMeeple,.scoreBottomWrap .scoreMeeple').forEach(remap);}
  installStyle();
  const start=()=>{
    all();
    const obs=new MutationObserver(ms=>{for(const m of ms)if(m.type==='attributes')remap(m.target);});
    document.querySelectorAll('.scoreTopWrap .scoreMeeple,.scoreBottomWrap .scoreMeeple').forEach(el=>obs.observe(el,{attributes:true,attributeFilter:['style']}));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.PING_SCORE_TRACK_FIX={all,OLD,FIX};
})();