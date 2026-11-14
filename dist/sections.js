(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('reveal-ready');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: .12 });
    reveals.forEach(element => observer.observe(element));
  }
  const reveal = document.querySelector('.more-reveal');
  if (!reveal) return;
  const stage = reveal.querySelector('.more-stage');
  const headline = reveal.querySelector('.more-headline');
  const words = [...reveal.querySelectorAll('.more-word')];
  const front = reveal.querySelector('.more-lens-front');
  const back = reveal.querySelector('.more-lens-back');
  const glow = reveal.querySelector('.more-glow');
  const light = reveal.querySelector('.more-light');
  let frame = 0;
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => {n=clamp(n);return n*n*(3-2*n);};
  const span = (p,a,b) => smooth((p-a)/(b-a));
  function update() {
    frame = 0;
    if (reduce.matches) {
      reveal.classList.remove('more-motion');
      [headline,...words,front,back,glow,light].forEach(node=>node.removeAttribute('style'));
      reveal.dataset.phase='static';
      return;
    }
    const box = reveal.getBoundingClientRect();
    const viewport = stage.offsetHeight;
    if(box.top>innerHeight*1.3 || box.bottom < -viewport*.3) {reveal.classList.remove('more-motion');return;}
    const travel=Math.max(1,box.height-viewport);
    const p=clamp((viewport*.35-box.top)/(travel+viewport*.35));
    const depart=smooth((-box.top-travel)/(viewport*.7));
    const push=span(p,.62,1);
    const arrival=span(p,0,.30);
    reveal.classList.add('more-motion');
    reveal.dataset.progress=p.toFixed(3);
    reveal.dataset.phase=p<.30?'enter':p<.62?'hold':'depart';
    words.forEach((word,index)=>{
      const t=span(p,.025+index*.055,.19+index*.055);
      word.style.transform=`translate3d(0,${(1-t)*115}%,0) rotateX(${(1-t)*36}deg)`;
      word.style.filter=`blur(${(1-t)*10}px)`;
      word.style.opacity=String(t);
    });
    headline.style.transform=`translate3d(0,${-push*viewport*.085}px,0) scale(${.9+arrival*.1+push*(innerWidth<=480?.12:.23)})`;
    headline.style.opacity=String(1-depart);
    front.style.transform=`translate(-50%,-50%) rotate(${-42+p*36}deg) rotateX(${40-p*24}deg) scale(${.72+arrival*.24+push*.55})`;
    back.style.transform=`translate(-50%,-50%) rotate(${38-p*52}deg) rotateX(${52-p*25}deg) scale(${.76+arrival*.22+push*.32})`;
    front.style.opacity=String(arrival*(1-depart)*(.85-push*.45));
    back.style.opacity=String(arrival*(1-depart)*(.58-push*.3));
    glow.style.transform=`translate(${-55+p*10}%,-50%) scale(${.8+arrival*.3+push*.5})`;
    glow.style.opacity=String(arrival*(1-depart)*(.9-push*.25));
    light.style.transform=`translate(-50%,-50%) translateY(${(p-.5)*viewport*.16}px) rotate(${-32+p*30}deg) scaleX(${.7+arrival*.3+push*.2})`;
    light.style.opacity=String(arrival*(1-depart)*(.85-push*.65));
  }
  function requestUpdate() { if (!frame) frame = requestAnimationFrame(update); }
  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', requestUpdate, { passive: true });
  reduce.addEventListener('change', requestUpdate);
  requestUpdate();
})();
