/* PING! — correction globale des meeples de score.
   Positions = centres des cases départ / 1 / 2 / 3 / coupe.
   Le meeple bleu est agrandi pour compenser la transparence de son PNG. */
(function(){
  const SCORE_X=[8.6,27.0,43.2,59.3,90.2];
  function installStyle(){
    if(document.getElementById('ping-score-track-fix-style'))return;
    const s=document.createElement('style');s.id='ping-score-track-fix-style';
    s.textContent='.scoreBottomWrap .scoreMeeple{width:24.5% !important;}';
    document.head.appendChild(s);
  }
  function el(side){return document.querySelector(side==='top'?'.scoreTopWrap .scoreMeeple':'.scoreBottomWrap .scoreMeeple');}
  function score(side){const m=window.matchScore;return m?Math.max(0,Math.min(4,Number(m[side])||0)):0;}
  function place(side){const x=el(side);if(x)x.style.setProperty('left',SCORE_X[score(side)]+'%','important');}
  function placeAll(){place('top');place('bottom');}
  installStyle();
  const boot=()=>{placeAll();setTimeout(placeAll,0);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  const obs=new MutationObserver(()=>requestAnimationFrame(placeAll));
  const start=()=>document.querySelectorAll('.scoreTopWrap,.scoreBottomWrap').forEach(x=>obs.observe(x,{attributes:true,subtree:true,attributeFilter:['style','src']}));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.PING_SCORE_TRACK_FIX={placeAll,SCORE_X};
})();