module.exports=function fixV0401(s){
  const bad1="rep(\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\",\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\");";
  const good1="rep(\"    const distance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\",\"    const rawDistance=shortestDistance(st.opponentPaddleNode ?? 'S',targetValue);\\n    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\");";
  const bad2="rep(\"    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\",\"    const distance=st.characterPowers?.top?.mathieu_free_move?.active?0:(st.characterPowers?.top?.mathieu_reduce1?.active?Math.max(0,rawDistance-1):rawDistance);\");";
  if(!s.includes(bad1)||!s.includes(bad2))throw new Error('Correctif V0.40.2: ancres inattendues');
  return s.replace(bad1,good1).replace(bad2,'');
};
