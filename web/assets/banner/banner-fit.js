(function(){
  var stage=document.getElementById('stage'), banner=document.getElementById('banner');
  function fit(){
    var w=banner.offsetWidth, h=banner.offsetHeight;
    var s=Math.min((innerWidth-48)/w,(innerHeight-48)/h,1);
    stage.style.transform='scale('+s+')'; stage.style.width=(w*s)+'px'; stage.style.height=(h*s)+'px';
  }
  addEventListener('resize',fit); fit();
  addEventListener('keydown',function(e){ if((e.key||'').toLowerCase()==='g') banner.classList.toggle('guides-off'); });
})();
