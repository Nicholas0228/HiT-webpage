/* Paper geometry with the two levels from the saved website trace. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let nextId = 0;
  const set = (el, attrs) => Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
  const node = (tag, attrs = {}, text = '') => {
    const el = document.createElementNS(NS, tag); set(el,attrs);
    if (text) el.textContent = text;
    return el;
  };
  const route = points => points.map((p,i) => `${i?'L':'M'}${p[0]},${p[1]}`).join(' ');
  function mount(element, options = {}) {
    const counts=options.counts, id=`hit-paper-${++nextId}`;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)');
    const scene=document.createElement('div'); scene.className='nh-scene';
    scene.innerHTML=`<svg class="nh-diagram" role="img" aria-label="HiT hierarchy. Group reduces the token count. Ungroup restores it. Learned skips connect each encoder to its decoder."></svg>
      <button class="nh-core" type="button" aria-label="Explore Level 2. Click to keep this level." aria-expanded="false" aria-pressed="false"></button>
      <span class="nh-sr-only">Moving dots show feature paths. Their speed does not show model execution time.</span>`;
    element.appendChild(scene);
    const svg=scene.querySelector('svg'), core=scene.querySelector('button');
    const defs=node('defs'), marker=node('marker',{id:`${id}-arrow`,viewBox:'0 0 8 8',refX:7,refY:4,markerWidth:5,markerHeight:5,orient:'auto'});
    marker.append(node('path',{d:'M1 1 L7 4 L1 7Z',fill:'#222222'}));
    const clip=node('clipPath',{id:`${id}-clip`}), clipRect=node('rect'); clip.append(clipRect);
    defs.append(marker,clip);svg.append(defs);
    const edges=node('g',{'aria-hidden':'true'}), shapes=node('g'), inside=node('g',{'clip-path':`url(#${id}-clip)`}), particles=node('g',{'aria-hidden':'true'});
    svg.append(edges,shapes,inside,particles);
    const blocks={}, paths={}, labels={};
    function block(key,label,kind,title,parent=shapes) {
      const group=node('g',{'data-nh-node':key,class:`nh-node nh-${kind}`});
      const shape=node('path',{class:'nh-shape'}), text=node('text',{class:'nh-label','text-anchor':'middle','dominant-baseline':'central'},label);
      group.append(node('title',{},title),shape,text);parent.append(group);blocks[key]={group,shape,text};
    }
    function edge(key,skip=false,parent=edges) {
      const el=node('path',{class:`nh-edge${skip?' nh-skip':''}`,fill:'none','marker-end':`url(#${id}-arrow)`});
      parent.append(el);paths[key]=el;
    }
    function label(key,text,parent=shapes) {
      const el=node('text',{class:'nh-label','dominant-baseline':'central'},text);parent.append(el);labels[key]=el;
    }
    function sum(key,parent=shapes) {
      const group=node('g',{'data-nh-node':key});
      group.append(node('circle',{r:10,class:'nh-sum'}),node('text',{class:'nh-label','text-anchor':'middle','dominant-baseline':'central'},'+'));
      parent.append(group);blocks[key]={group};
    }
    block('patch','Patch projection','learned','Project the noisy image into tokens.');
    block('encoder','Transformer','learned','Process the full token sequence.');
    block('groups','Group','routing',`Group. ${counts[0]} → ${counts[1]} tokens.`);
    block('return','Ungroup','routing',`Ungroup. ${counts[1]} → ${counts[0]} tokens.`);
    sum('add1');
    block('decoder','Transformer','learned','Process the restored sequence after the skip addition.');
    block('head','Prediction head','learned','Predict the clean image.');
    block('skip1','W₁','learned','Learned outer skip projection.');
    block('compact','HiT','compact','Hover or focus to inspect the next level.');
    label('hint','Explore inside');
    const frame=node('rect',{class:'nh-inner-frame',rx:3});inside.append(frame);
    const innerEdges=node('g');inside.append(innerEdges);
    block('inner-encoder','Transformer','learned','Process the first compact sequence.',inside);
    block('inner-form','Group','routing',`Group. ${counts[1]} → ${counts[2]} tokens.`,inside);
    block('transformer','Transformer','learned','Repeat L Transformer blocks at a fixed token count.',inside);
    block('inner-return','Ungroup','routing',`Ungroup. ${counts[2]} → ${counts[1]} tokens.`,inside);
    sum('add2',inside);
    block('inner-decoder','Transformer','learned','Process the restored first compact sequence.',inside);
    block('skip2','W₂','learned','Learned inner skip projection.',inside);
    label('repeat','× L',inside);
    label('input','xₜ');label('output','Clean image');
    for (const key of ['n0','n1','n0out']) label(key,String(key==='n1'?counts[1]:counts[0]));
    label('n2',String(counts[2]),inside);
    for (const key of ['input','patch','encoder','groups','coreOut','return','add1','decoder','head']) edge(key);
    edge('skip1a',true);edge('skip1b',true);
    for (const key of ['inner-encoder','inner-form','transformer','inner-return','add2']) edge(key,false,innerEdges);
    edge('skip2a',true,innerEdges);edge('skip2b',true,innerEdges);
    let expanded=false,pulseFrame=0,geometry,lastTrace='';
    function drawBlock(key,x,y,top,bottom,height) {
      const b=blocks[key],left=x-top/2,right=x+top/2,bottomY=y+height,r=3;
      const d=top===bottom
        ?`M${left+r},${y}H${right-r}Q${right},${y} ${right},${y+r}V${bottomY-r}Q${right},${bottomY} ${right-r},${bottomY}H${left+r}Q${left},${bottomY} ${left},${bottomY-r}V${y+r}Q${left},${y} ${left+r},${y}Z`
        :`M${left},${y}H${right}L${x+bottom/2},${bottomY}H${x-bottom/2}Z`;
      set(b.shape,{d});
      set(b.text,{x,y:y+height/2});
    }
    function draw() {
      const coreY=196,coreH=320,end=coreY+coreH;
      const ungroupY=end+24,addY=ungroupY+56,decoderY=addY+22,headY=decoderY+56,height=headY+86;
      const bounds=scene.getBoundingClientRect();
      if(!bounds.width || !bounds.height)return;
      const scale=bounds.height/height, width=bounds.width/scale;
      const c=width*.53,wide=Math.min(355,width*.59),mid=wide*.8,small=wide*.62;
      const ix=c-mid/2-58,iw=mid/2+wide/2+98;
      scene.style.setProperty('--nh-text-scale',1/scale);
      set(svg,{viewBox:`0 0 ${width} ${height}`});
      const w1=Math.max(24,c-wide/2-54),w2=c-mid/2-32;
      const box=(key,y,w,h=34)=>drawBlock(key,c,y,w,w,h);
      box('patch',36,wide,30);box('encoder',86,wide);
      drawBlock('groups',c,142,wide,mid,32);drawBlock('return',c,ungroupY,mid,wide,32);
      set(blocks.add1.group,{transform:`translate(${c} ${addY})`});
      box('decoder',decoderY,wide);box('head',headY,wide,30);
      drawBlock('skip1',w1,addY-81,48,48,30);
      drawBlock('compact',ix+iw/2,coreY,iw,iw,coreH);
      set(blocks.compact.text,{y:coreY+coreH/2-16});
      set(blocks.compact.group,{opacity:expanded?0:1,'aria-hidden':expanded});
      set(labels.hint,{x:ix+iw/2,y:coreY+coreH/2+20,'text-anchor':'middle',opacity:expanded?0:1});
      set(labels.input,{x:c,y:14,'text-anchor':'middle'});set(labels.output,{x:c,y:headY+72,'text-anchor':'middle'});
      const countX=c+wide/2+12;
      set(labels.n0,{x:countX,y:103});set(labels.n1,{x:countX,y:coreY+29});set(labels.n0out,{x:countX,y:decoderY+17});
      for(const [key,y1,y2] of [['input',23,34],['patch',66,84],['encoder',120,140],['groups',174,expanded?206:194],['coreOut',expanded?end-24:end,ungroupY-2],['return',ungroupY+32,addY-11],['add1',addY+10,decoderY-2],['decoder',decoderY+34,headY-2],['head',headY+30,headY+55]]) set(paths[key],{d:route([[c,y1],[c,y2]])});
      set(paths.skip1a,{d:route([[c,131],[w1,131],[w1,addY-83]])});
      set(paths.skip1b,{d:route([[w1,addY-51],[w1,addY],[c-11,addY]])});
      set(frame,{x:ix,y:coreY,width:iw,height:coreH});set(clipRect,{x:0,y:coreY,width,height:coreH});
      set(inside,{opacity:expanded?1:0,'aria-hidden':!expanded});
      box('inner-encoder',coreY+12,mid);drawBlock('inner-form',c,coreY+68,mid,small,32);
      box('transformer',coreY+122,small,40);drawBlock('inner-return',c,coreY+184,small,mid,32);
      set(blocks.add2.group,{transform:`translate(${c} ${coreY+240})`});
      box('inner-decoder',coreY+262,mid);drawBlock('skip2',w2,coreY+143,48,48,30);
      set(labels.repeat,{x:c+small/2+9,y:coreY+142});set(labels.n2,{x:countX,y:coreY+142});
      for(const [key,y1,y2] of [['inner-encoder',coreY+46,coreY+66],['inner-form',coreY+100,coreY+120],['transformer',coreY+162,coreY+182],['inner-return',coreY+216,coreY+229],['add2',coreY+250,coreY+260]]) set(paths[key],{d:route([[c,y1],[c,y2]])});
      set(paths.skip2a,{d:route([[c,coreY+57],[w2,coreY+57],[w2,coreY+141]])});
      set(paths.skip2b,{d:route([[w2,coreY+173],[w2,coreY+240],[c-11,coreY+240]])});
      core.style.cssText=`left:${ix/width*100}%;top:${coreY/height*100}%;width:${iw/width*100}%;height:${coreH/height*100}%`;
      geometry={c,w1,w2,coreY,addY,headY};
    }
    function stopPulse(){cancelAnimationFrame(pulseFrame);pulseFrame=0;particles.replaceChildren();}
    function pulse(){
      stopPulse();if(reduce.matches||!geometry)return;
      const g=geometry,routes=[route([[g.c,24],[g.c,g.headY+55]]),route([[g.c,131],[g.w1,131],[g.w1,g.addY],[g.c,g.addY]])];
      if(expanded)routes.push(route([[g.c,g.coreY+57],[g.w2,g.coreY+57],[g.w2,g.coreY+240],[g.c,g.coreY+240]]));
      const moving=routes.map(d=>{const guide=node('path',{d,fill:'none',stroke:'none'}),dot=node('circle',{r:3.5,class:'nh-dot'});particles.append(guide,dot);return{guide,dot,length:guide.getTotalLength()};});
      let start;
      function step(now){
        if(start===undefined)start=now;const progress=Math.min(1,(now-start)/1000);
        for(const item of moving){const p=item.guide.getPointAtLength(item.length*progress);set(item.dot,{cx:p.x,cy:p.y});}
        if(progress<1)pulseFrame=requestAnimationFrame(step);else stopPulse();
      }
      pulseFrame=requestAnimationFrame(step);
    }
    function render(state={}){
      const next=state.level===1||state.preview===1||state.preview===true;
      scene.dataset.level=String(state.level===1?2:1);scene.dataset.patch=String(state.patch??'');scene.dataset.group=String(state.group??'');
      scene.classList.toggle('nh-expanded',Boolean(next));core.setAttribute('aria-expanded',String(Boolean(next)));core.setAttribute('aria-pressed',String(Boolean(state.locked)));
      const trace=[state.level,state.patch,state.group].join(':');
      const changed=next!==expanded;
      expanded=next;
      if(changed)draw();
      if(changed||trace!==lastTrace)pulse();
      lastTrace=trace;
    }
    core.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')options.onPreview?.(1);});
    core.addEventListener('pointerleave',()=>options.onLeave?.());core.addEventListener('focus',()=>options.onPreview?.(1));core.addEventListener('blur',()=>options.onLeave?.());
    core.addEventListener('click',()=>options.onSelect?.(1));
    core.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();options.onSelect?.(0);element.closest('.flow-viewer')?.querySelector('[data-flow-level="0"]')?.focus();}});
    const resize=new ResizeObserver(()=>{stopPulse();draw();});resize.observe(scene);
    const motionChange=()=>{if(reduce.matches)stopPulse();};reduce.addEventListener('change',motionChange);
    draw();render({level:0});
    return{render,destroy(){stopPulse();resize.disconnect();reduce.removeEventListener('change',motionChange);scene.remove();}};
  }
  window.HiTNestedFlow=Object.freeze({mount});
})();
