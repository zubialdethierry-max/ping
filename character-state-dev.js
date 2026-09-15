module.exports={
  createCharacters(){return {top:null,bottom:null};},
  choose(st,side,character){
    if(!st||!st.characters||!['top','bottom'].includes(side))return false;
    if(!['mathieu','jeanne'].includes(character))return false;
    if(st.characters[side])return false;
    st.characters[side]=character;
    return true;
  }
};
