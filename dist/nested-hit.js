/* Two nested HiT stages. DOM nodes remain stable while patch data changes. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let nextId = 0;
  const svgNode = (tag, attrs) => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    return element;
  };
  function mount(element, options = {}) {
    const counts = options.counts || [261, 74, 57];
    const prefix = `nested-hit-${++nextId}`;
    const scene = document.createElement('div');
    scene.className = 'nh-scene';
    scene.dataset.level = '0';
    scene.innerHTML = `
      <svg class="nh-lines" aria-hidden="true"></svg>
      <button class="nh-home" type="button" aria-label="Select the outer HiT, Level 1"><span class="nh-name">HiT</span><span class="nh-home-level">Level 1</span></button>
      <span class="nh-block nh-decoder" data-nh-node="decoder">Decoder</span>
      <span class="nh-block nh-transfer nh-return" data-nh-node="return">Return to patches</span>
      <button class="nh-core" type="button" aria-label="Explore and select the inner HiT, Level 2" aria-expanded="false" aria-pressed="false">
        <span class="nh-core-heading"><span class="nh-name">HiT</span><span class="nh-core-caption">Explore inside</span></span>
        <span class="nh-core-count">${counts[1]} tokens</span>
        <span class="nh-inner" aria-hidden="true">
          <svg class="nh-inner-lines" aria-hidden="true"></svg>
          <span class="nh-inner-block nh-inner-decoder" data-nh-node="inner-decoder">Decoder</span>
          <span class="nh-inner-block nh-transfer nh-inner-return" data-nh-node="inner-return">Return to groups</span>
          <span class="nh-inner-block nh-transformer" data-nh-node="transformer">Transformer · ${counts[2]} tokens</span>
          <span class="nh-inner-block nh-form nh-inner-form" data-nh-node="inner-form">Group · ${counts[1]} → ${counts[2]}</span>
          <span class="nh-inner-block nh-inner-encoder" data-nh-node="inner-encoder">Encoder</span>
        </span>
      </button>
      <span class="nh-block nh-form nh-groups" data-nh-node="groups">Group · ${counts[0]} → ${counts[1]}</span>
      <span class="nh-block nh-encoder" data-nh-node="encoder">Encoder · ${counts[0]} tokens</span>
      <svg class="nh-pulses" aria-hidden="true"></svg>
      <span class="nh-sr-only">The moving dots show feature paths. Their speed does not show model execution time.</span>`;
    element.appendChild(scene);
    const home = scene.querySelector('.nh-home');
    const core = scene.querySelector('.nh-core');
    const inner = scene.querySelector('.nh-inner');
    const lines = scene.querySelector('.nh-lines');
    const innerLines = scene.querySelector('.nh-inner-lines');
    const pulses = scene.querySelector('.nh-pulses');
    const nodes = Object.fromEntries([...scene.querySelectorAll('[data-nh-node]')].map(node => [node.dataset.nhNode, node]));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let expanded = false, geometry = null, pulseFrame = 0, lastTrace = '', activeState = {};
    const path = (id, d, target = lines, kind = '') => {
      const result = svgNode('path', {id:`${prefix}-${id}`, d, class:`nh-edge ${kind}`, fill:'none'});
      target.appendChild(result); return result;
    };
    function arrowDefs(target, suffix) {
      const defs = svgNode('defs', {});
      const marker = svgNode('marker', {id:`${prefix}-${suffix}`,viewBox:'0 0 10 10',refX:'8',refY:'5',markerWidth:'5',markerHeight:'5',orient:'auto'});
      marker.appendChild(svgNode('path',{d:'M 1 1 L 9 5 L 1 9',fill:'none',stroke:'#000000','stroke-width':'1.5'}));
      defs.appendChild(marker);target.appendChild(defs);
    }
    function addArrow(d, target, suffix) {
      const p = path(`edge-${target.children.length}`,d,target);
      p.setAttribute('marker-end',`url(#${prefix}-${suffix})`);return p;
    }
    const point = (box, side) => [box.x + box.width / 2, side === 'top' ? box.y : side === 'bottom' ? box.y + box.height : box.y + box.height / 2];
    const line = points => points.map((p,i) => `${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ');
    function stopPulse() {
      cancelAnimationFrame(pulseFrame);pulseFrame=0;pulses.replaceChildren();
    }
    function layout() {
      stopPulse();
      const sceneRect = scene.getBoundingClientRect();
      if (!sceneRect.width) return;
      const relative = (node, to=sceneRect) => {const b=node.getBoundingClientRect();return {x:b.left-to.left,y:b.top-to.top,width:b.width,height:b.height};};
      const b=Object.fromEntries(Object.entries(nodes).map(([key,node]) => [key,relative(node)]));
      b.core=relative(core);
      lines.replaceChildren();innerLines.replaceChildren();
      lines.setAttribute('viewBox',`0 0 ${sceneRect.width} ${sceneRect.height}`);
      pulses.setAttribute('viewBox',`0 0 ${sceneRect.width} ${sceneRect.height}`);
      arrowDefs(lines,'arrow');arrowDefs(innerLines,'inner-arrow');
      const outerPairs = [['encoder','groups'],['groups','core'],['core','return'],['return','decoder']];
      for(const [from,to] of outerPairs) addArrow(line([point(b[from],'top'),point(b[to],'bottom')]),lines,'arrow');
      const outerStart = point(b.encoder,'top');
      const outerJoin = [sceneRect.width/2,(b.return.y+b.decoder.y+b.decoder.height)/2];
      const skipX=Math.max(11, b.core.x-24);
      const skip = path('outer-skip',line([outerStart,[skipX,outerStart[1]],[skipX,outerJoin[1]],outerJoin]),lines,'nh-skip');
      lines.appendChild(svgNode('circle',{cx:outerJoin[0],cy:outerJoin[1],r:'8',class:'nh-sum'}));
      const sum=svgNode('text',{x:outerJoin[0],y:outerJoin[1],class:'nh-sum-label','text-anchor':'middle','dominant-baseline':'central'});sum.textContent='+';lines.appendChild(sum);
      const skipLabel=svgNode('text',{x:skipX-8,y:(outerStart[1]+outerJoin[1])/2,class:'nh-path-label','text-anchor':'end'});skipLabel.textContent='Skip';lines.appendChild(skipLabel);

      const c=core.getBoundingClientRect();
      const ib=Object.fromEntries(['inner-encoder','inner-form','transformer','inner-return','inner-decoder'].map(key=>[key,relative(nodes[key],c)]));
      innerLines.setAttribute('viewBox',`0 0 ${c.width} ${c.height}`);
      for(const [from,to] of [['inner-encoder','inner-form'],['inner-form','transformer'],['transformer','inner-return'],['inner-return','inner-decoder']]) addArrow(line([point(ib[from],'top'),point(ib[to],'bottom')]),innerLines,'inner-arrow');
      const is=point(ib['inner-encoder'],'top');
      const ij=[c.width/2,(ib['inner-return'].y+ib['inner-decoder'].y+ib['inner-decoder'].height)/2];
      const ix=Math.max(10,ib['inner-encoder'].x-18);
      path('inner-skip',line([is,[ix,is[1]],[ix,ij[1]],ij]),innerLines,'nh-skip');
      innerLines.appendChild(svgNode('circle',{cx:ij[0],cy:ij[1],r:'6',class:'nh-sum'}));
      const isum=svgNode('text',{x:ij[0],y:ij[1],class:'nh-sum-label','text-anchor':'middle','dominant-baseline':'central'});isum.textContent='+';innerLines.appendChild(isum);
      geometry={b,skip};
    }
    function pulse() {
      stopPulse();
      if(reduce.matches||!geometry)return;
      const b=geometry.b;
      const middle=expanded ? ['inner-encoder','inner-form','transformer','inner-return','inner-decoder'] : ['core'];
      const order=['encoder','groups',...middle,'return','decoder'];
      const points=order.flatMap(id=>[point(b[id],'bottom'),point(b[id],'top')]);
      const mainPath=path('motion',line(points),pulses,'nh-motion-guide');
      const skipPath=path('skip-motion',geometry.skip.getAttribute('d'),pulses,'nh-motion-guide');
      const mainDot=svgNode('circle',{r:'4',class:'nh-dot'}),skipDot=svgNode('circle',{r:'3.5',class:'nh-dot nh-skip-dot'});
      pulses.append(mainDot,skipDot);
      const paths=[mainPath,skipPath],dots=[mainDot,skipDot],lengths=paths.map(p=>p.getTotalLength());
      let start;
      function step(now) {
        if(start===undefined)start=now;
        const progress=Math.min(1,(now-start)/850);
        for(let i=0;i<paths.length;i++) {const p=paths[i].getPointAtLength(progress*lengths[i]);dots[i].setAttribute('cx',p.x);dots[i].setAttribute('cy',p.y);}
        if(progress<1)pulseFrame=requestAnimationFrame(step);else stopPulse();
      }
      pulseFrame=requestAnimationFrame(step);
    }
    function render(state={}) {
      activeState=state;
      const nextExpanded=state.level===1||state.preview===1||state.preview===true;
      const changed=nextExpanded!==expanded;
      expanded=nextExpanded;
      scene.classList.toggle('nh-expanded',expanded);
      scene.classList.toggle('nh-locked',Boolean(state.locked&&state.level===1));
      scene.dataset.level=String(state.level===1?1:0);
      scene.dataset.patch=state.patch==null?'':String(state.patch);
      scene.dataset.group=state.group==null?'':String(state.group);
      core.setAttribute('aria-expanded',String(expanded));
      core.setAttribute('aria-pressed',String(Boolean(state.locked)));
      home.setAttribute('aria-pressed',String(!state.locked));
      inner.setAttribute('aria-hidden',String(!expanded));
      const trace=[state.level,state.patch,state.group].join(':');
      if(changed) layout();
      if(trace!==lastTrace) {lastTrace=trace;pulse();}
    }
    core.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')options.onPreview?.(1);});
    core.addEventListener('pointerleave',()=>options.onLeave?.());
    core.addEventListener('focus',()=>options.onPreview?.(1));
    core.addEventListener('blur',()=>options.onLeave?.());
    core.addEventListener('click',()=>options.onSelect?.(1));
    home.addEventListener('click',()=>options.onSelect?.(0));
    core.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();home.focus();options.onSelect?.(0);}});
    const resize=new ResizeObserver(layout);resize.observe(scene);
    const motionChange=()=>{if(reduce.matches)stopPulse();};reduce.addEventListener('change',motionChange);
    layout();render({level:0});
    return {render,destroy(){stopPulse();resize.disconnect();reduce.removeEventListener('change',motionChange);scene.remove();}};
  }
  window.HiTNestedFlow=Object.freeze({mount});
})();
