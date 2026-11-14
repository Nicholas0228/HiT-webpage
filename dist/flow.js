/* A saved local model trace. No model values are synthesized in the browser. */
(() => {
  'use strict';
  const mount = document.querySelector('#flow-viewer');
  if (!mount) return;
  const script = document.currentScript.src;
  const asset = file => {const url=new URL(`assets/flow/${file}`,script);url.search=new URL(script).search;return url.href;};
  const $ = s => mount.querySelector(s);
  const $$ = s => mount.querySelectorAll(s);
  const state = {level:0, mode:'affinity', patch:130, compare:null, channel:0, image:'input'};
  let trace, pictures, pending = 0, hoverPatch = null, previousView = '', nestedView;
  let selectedLevel=0, previewLevel=null;
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = v => Number(v).toLocaleString('en-US',{maximumSignificantDigits:5,useGrouping:false});
  const total = a => a.reduce((s,v)=>s+v,0);
  const shade = v => `rgb(${[98,137,173].map(c=>Math.round(255+(c-255)*Math.max(0,Math.min(1,v)))).join(',')})`;
  const stage = () => trace.stages[state.level];
  const queryToken = () => state.level === 0 ? state.patch : trace.stages[0].labels[state.patch];
  const group = () => stage().labels[queryToken()];
  const name = i => stage().inputNames?.[i] || (state.level === 0 ? i < 256 ? `Patch ${i}` : `Caption token ${i-256}` : `Level 1 group ${i}`);
  mount.className = 'flow-viewer component-mount';
  mount.innerHTML = `
    <h3>Groups of groups.</h3>
    <p class="flow-lead">HiT builds a hierarchy for each image.</p>
    <p class="flow-loading" role="status">Loading the racer…</p>
    <div class="flow-content" hidden>
      <div class="flow-explorer">
        <div class="flow-images-column">
          <div class="flow-image-pair">
            <figure class="flow-image"><figcaption id="flow-image-title">Image · Level 1 · t = 0.7</figcaption><canvas id="flow-image" width="1024" height="1024" tabindex="0" role="img" aria-describedby="flow-help"></canvas></figure>
            <figure class="flow-image"><figcaption id="flow-groups-title">Groups · Level 1</figcaption><canvas id="flow-map" width="1024" height="1024" tabindex="0" role="img" aria-describedby="flow-help"></canvas></figure>
          </div>
          <div class="flow-pair-status"><p class="flow-selection"></p><p class="flow-summary"></p></div>
          <div class="flow-legend"><span><i class="flow-key"></i>Group</span><span><i class="flow-key patch"></i>Patch</span></div>
          <p id="flow-help">Move over an image to inspect a group.</p>
        </div>
        <div class="flow-architecture-column">
          <div class="flow-level-controls" role="group" aria-label="Choose the displayed hierarchy level">
            <button type="button" data-flow-level="0" aria-pressed="true">Level 1</button>
            <button type="button" data-flow-level="1" aria-pressed="false">Level 2</button>
          </div>
          <div class="flow-nested"></div>
          <div class="flow-legend flow-path-key"><span><i class="flow-key"></i>Learned blocks</span><span><i class="flow-line-key"></i>Feature transfer</span></div>
          <p class="flow-level-state" role="status" aria-live="polite">Level 1 selected</p>
        </div>
      </div>
      <details class="flow-details">
        <summary>How this group is computed</summary>
        <p class="flow-provenance"></p>
        <div class="flow-detail-settings"><label>Image <select id="flow-image-mode" aria-label="Racer image display"><option value="input">Noisy input · t = 0.7</option><option value="clean">Clean reference</option></select></label></div>
        <div class="flow-tabs" role="tablist" aria-label="Inspect a routing operation">
          <button role="tab" type="button" data-flow-mode="affinity" aria-selected="true">Affinity</button>
          <button role="tab" type="button" data-flow-mode="pooling" aria-selected="false">Pooling</button>
          <button role="tab" type="button" data-flow-mode="readback" aria-selected="false">Readback</button>
        </div>
        <div class="flow-calculations" role="tabpanel" aria-label="Routing calculation">
          <div class="flow-stat"><div><div class="flow-counts"></div><p class="flow-count-label"></p><p class="flow-count-note"></p></div></div>
          <p class="flow-calculation-title"></p>
          <div class="flow-controls"><label class="flow-pair-control">Compare with <select id="flow-pair" aria-label="Compare affinity with a token"></select></label><label class="flow-channel-control" hidden>Feature channel <select id="flow-channel" aria-label="Feature channel"></select></label></div>
          <div class="flow-equations"></div><div class="flow-result"></div>
        </div>
        <p>The clean image is a reference. All values come from the saved noisy input at t = 0.7. At Level 2, the input is a Level 1 group.</p>
        <p>Hard groups define the affinity prototypes. Soft pooling uses all input tokens, including caption tokens outside the image map.</p>
        <details class="flow-paper"><summary>Paper diagrams</summary><div class="flow-diagram"></div><div class="flow-method"></div></details>
        <p class="flow-checks"></p>
        <p><a href="${asset('trace.json')}" download>Download numeric trace</a> · <a href="${asset('overview.svg')}" download>Architecture SVG</a> · <a href="${asset('mechanism.svg')}" download>Method SVG</a></p>
      </details>
    </div>`;
  function borders(ctx, labels, selected=null) {
    ctx.beginPath();
    labels.forEach((g,p)=>{
      if(selected!==null&&g!==selected)return;
      const x=p%16*32,y=Math.floor(p/16)*32;
      if(p<16||labels[p-16]!==g){ctx.moveTo(x,y);ctx.lineTo(x+32,y);}
      if(p%16===0||labels[p-1]!==g){ctx.moveTo(x,y);ctx.lineTo(x,y+32);}
      if((selected!==null||p%16===15)&&(p%16===15||labels[p+1]!==g)){ctx.moveTo(x+32,y);ctx.lineTo(x+32,y+32);}
      if((selected!==null||p>=240)&&(p>=240||labels[p+16]!==g)){ctx.moveTo(x,y+32);ctx.lineTo(x+32,y+32);}
    });
  }
  function draw() {
    const s=stage(),g=group(),i=queryToken(), labels=s.imageLabels;
    [$('#flow-image'),$('#flow-map')].forEach((canvas,index)=>{
      const ctx=canvas.getContext('2d');ctx.setTransform(canvas.width/512,0,0,canvas.height/512,0,0);ctx.clearRect(0,0,512,512);ctx.globalAlpha=1;
      if(index===0)ctx.drawImage(pictures[state.image],0,0,512,512);

      labels.forEach((label,p)=>{
        const selected=label===g,x=p%16*32,y=Math.floor(p/16)*32;
        if(index===0){ctx.fillStyle=selected?'#e8a446':'#ffffff';ctx.globalAlpha=selected?.22:.55;}
        else {ctx.globalAlpha=1;ctx.fillStyle=selected?'#e8a446':`rgb(${[232,164,70].map(c=>Math.round(255+(c-255)*(.15+(label%6)*.075))).join(',')})`;}
        ctx.fillRect(x,y,32,32);
      });
      ctx.globalAlpha=1;borders(ctx,labels);ctx.strokeStyle='#fff';ctx.lineWidth=index===0?1.3:1.8;ctx.stroke();
      borders(ctx,labels,g);ctx.strokeStyle='#fff';ctx.lineWidth=4.5;ctx.stroke();ctx.strokeStyle='#e8a446';ctx.lineWidth=2.2;ctx.stroke();
      const x=state.patch%16*32,y=Math.floor(state.patch/16)*32;ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.strokeRect(x+2,y+2,28,28);ctx.strokeStyle='#489750';ctx.lineWidth=2.6;ctx.strokeRect(x+2,y+2,28,28);
      canvas.setAttribute('aria-label',`${index===0?'Racer input':'Image group map'}. Level ${state.level+1}. Patch ${state.patch}, group ${g}.`);
    });
  }
  function mergeDecision() {
    const s=stage();let node=queryToken(),last=null,next=null;
    while(s.parents[node]!==undefined){const merge=s.parents[node];const score=s.treeScores[merge];if(score<s.threshold){next=score;break;}last=score;node=s.inputCount+merge;}
    return {last,next};
  }
  function comparison() {
    const s=stage(),i=queryToken(),g=group();
    if(state.compare!==null&&state.compare<s.inputCount)return state.compare;
    let candidates=s.labels.map((label,j)=>({label,j})).filter(v=>v.label===g&&v.j!==i);
    if(!candidates.length)candidates=s.labels.map((label,j)=>({label,j})).filter(v=>v.j!==i);
    return candidates.reduce((best,v)=>s.affinity[i][v.j]>s.affinity[i][best]?v.j:best,candidates[0].j);
  }
  const eq = (label,formula,values) => `<div class="flow-equation"><p><strong>${label}</strong></p><p>${formula}</p><p class="flow-values">${values}</p></div>`;
  function render(rebuild=false) {
    state.level=previewLevel ?? selectedLevel;
    const s=stage(),i=queryToken(),g=group(),c=state.channel,j=comparison(),members=s.labels.map((x,k)=>x===g?k:-1).filter(k=>k>=0);
    $$('.flow-level-controls button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.flowLevel)===selectedLevel)));
    $$('.flow-tabs button').forEach(b=>{const selected=b.dataset.flowMode===state.mode;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    $('.flow-counts').textContent=`${s.inputCount} → ${s.groupCount}`;
    $('.flow-count-label').textContent=state.level===0?'input tokens → Level 1 groups':'Level 1 groups → Level 2 groups';
    $('.flow-count-note').textContent=state.level===0?`256 image patches + ${s.inputCount-256} caption tokens`:`${members.length} Level 1 ${members.length===1?'group':'groups'} in Group ${g}`;
    const imageMembers=s.imageLabels.filter(v=>v===g).length;
    $('.flow-selection').textContent=`Group ${g} · ${imageMembers} image ${imageMembers===1?'patch':'patches'}`;
    $('.flow-summary').textContent=`${new Set(s.imageLabels).size} image groups`;
    $('#flow-groups-title').textContent=`Groups · Level ${state.level+1}`;
    $('#flow-image-title').textContent=`Image · Level ${state.level+1} · ${state.image==='input'?'t = 0.7':'clean reference'}`;
    $('.flow-calculation-title').textContent=state.mode==='affinity'?'From pair affinity to a group weight':state.mode==='pooling'?`Pool into Group ${g}`:`Read back to ${name(i)}`;
    $('.flow-pair-control').hidden=state.mode!=='affinity';$('.flow-channel-control').hidden=state.mode==='affinity';
    if(rebuild){
      $('#flow-pair').replaceChildren(...Array.from({length:s.inputCount},(_,idx)=>new Option(name(idx),String(idx))));
      $('#flow-channel').replaceChildren(...s.channels.map((channel,idx)=>new Option(String(channel),String(idx))));
    }
    $('#flow-pair').value=String(j);$('#flow-channel').value=String(c);
    const a=s.assignment[i][g],mass=s.groupMass[g],p=s.poolWeights[i][g],h=s.features[i][c];
    if(state.mode==='affinity'){
      const d1=s.directedAffinity[i][j],d2=s.directedAffinity[j][i],mean=s.meanAffinity[i][g];
      const numerator=Math.exp(mean/s.temperature),denominator=total(s.meanAffinity[i].map(e=>Math.exp(e/s.temperature)));
      $('.flow-equations').innerHTML=eq('Symmetric cosine affinity','Sᵢⱼ = (qᵢ · kⱼ + qⱼ · kᵢ) / 2',`(${fmt(d1)} + ${fmt(d2)}) / 2 ≈ ${fmt(s.affinity[i][j])}`)+eq(`Mean affinity to Group ${g}`,'eᵢɡ = Σⱼ∈Gɡ Sᵢⱼ / |Gɡ|',`${fmt(total(members.map(k=>s.affinity[i][k])))} / ${members.length} ≈ ${fmt(mean)}`)+eq('Soft group weight','Aᵢɡ = exp(eᵢɡ / T) / Σₕ exp(eᵢₕ / T)',`${fmt(numerator)} / ${fmt(denominator)} ≈ ${fmt(a)} · T = ${fmt(s.temperature)}`);
      const cut=mergeDecision(); $('.flow-result').innerHTML=`<strong>Average-linkage cut · τ = ${fmt(s.threshold)}</strong><br>${cut.last===null?'No merge above τ.':`Last accepted merge: ${fmt(cut.last)} ≥ τ.`}<br>${cut.next===null?'All tokens are in one group.':`Next merge: ${fmt(cut.next)} < τ. Stop here.`}<br>Merge scores compare whole groups.`;
    } else if(state.mode==='pooling'){
      const contribution=p*h,z=s.pooled[g][c];
      $('.flow-equations').innerHTML=eq('Column-normalized weight','Pᵢɡ = Aᵢɡ / Σⱼ Aⱼɡ',`${fmt(a)} / ${fmt(mass)} ≈ ${fmt(p)}`)+eq(`This token · channel ${s.channels[c]}`,'Contribution = Pᵢɡ × hᵢ',`${fmt(p)} × ${fmt(h)} ≈ ${fmt(contribution)}`)+eq('Sum over all input tokens','Zɡ = Σᵢ Aᵢɡ hᵢ / Σᵢ Aᵢɡ',`${fmt(s.poolNumerator[g][c])} / ${fmt(mass)} ≈ ${fmt(z)}`);
      $('.flow-result').innerHTML=`Group ${g}, channel ${s.channels[c]}: <strong>${fmt(z)}</strong>.<br>Column weights sum to ${fmt(total(s.poolWeights.map(row=>row[g])))}.`;
    }else{
      const processed=s.processed[g][c],r=s.readback[i][c];
      $('.flow-equations').innerHTML=eq(`Processed Group ${g}`,'Z′ɡ = compact-network output',`Channel ${s.channels[c]}: ${fmt(processed)}`)+eq('This group’s contribution','Aᵢɡ × Z′ɡ',`${fmt(a)} × ${fmt(processed)} ≈ ${fmt(a*processed)}`)+eq('Sum over all groups','Rᵢ = Σɡ Aᵢɡ Z′ɡ',`${s.groupCount} weighted contributions ≈ ${fmt(r)}`);
      $('.flow-result').innerHTML=`Readback, channel ${s.channels[c]}: <strong>${fmt(r)}</strong>.<br>The learned skip is added next, before decoding.`;
    }
    Object.assign(mount.dataset,{ready:'true',level:String(state.level+1),mode:state.mode,patch:String(state.patch),queryToken:String(i),group:String(g),compare:String(j),channel:String(s.channels[c]),value:String(state.mode==='affinity'?a:state.mode==='pooling'?s.pooled[g][c]:s.readback[i][c])});
    $$('.flow-diagram [data-id]').forEach(node => node.classList.toggle('flow-node-active', node.dataset.id === `${state.mode==='readback'?'readback':'group'}${state.level+1}`));
    nestedView?.render({level:state.level,locked:selectedLevel===1,preview:previewLevel!==null,patch:state.patch,group:g});
    const status=previewLevel!==null?'Level 2 preview · click HiT to keep this level':`Level ${selectedLevel+1} selected`;
    if($('.flow-level-state').textContent!==status)$('.flow-level-state').textContent=status;
    mount.dataset.lockedLevel=String(selectedLevel+1); mount.dataset.previewLevel=previewLevel===null?'':String(previewLevel+1);
    draw();
    const view=`${state.level}:${state.mode}`;
    if(previousView&&view!==previousView&&!reduceMotion.matches){$('.flow-calculations').getAnimations?.().forEach(a=>a.cancel());$('.flow-calculations').animate?.([{opacity:.45},{opacity:1}],{duration:180,easing:'ease-out'});}
    previousView=view;
  }
  function refreshLevel(){state.compare=null;render(true);}
  function selectLevel(level){selectedLevel=level;previewLevel=null;refreshLevel();}
  async function image(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('The racer image could not be loaded.'));img.src=asset(file);});}
  async function loadSvg(file,selector){
    const response=await fetch(asset(file));if(!response.ok)throw new Error('The method diagram could not be loaded.');
    const documentSVG=new DOMParser().parseFromString(await response.text(),'image/svg+xml');
    const svg = document.importNode(documentSVG.documentElement,true);
    const prefix = file.replace('.svg','') + '-';
    svg.querySelectorAll('[id]').forEach(node => {const id=node.id; if(node.classList.contains('node'))node.dataset.id=id; node.id=prefix+id;});
    svg.querySelectorAll('*').forEach(node => [...node.attributes].forEach(attr => {if(attr.value.includes('url(#'))node.setAttribute(attr.name,attr.value.replace(/url\(#/g,`url(#${prefix}`));}));
    svg.setAttribute('role','group'); svg.setAttribute('aria-label',file==='overview.svg'?'HiT two-stage architecture':'Affinity, pooling, and readback equations');
    $(selector).replaceChildren(svg);
  }
  async function load(){
    const response=await fetch(asset('trace.json'));if(!response.ok)throw new Error('The racer trace could not be loaded.');
    trace=await response.json();if(trace.schema!==1||trace.stages.length!==2)throw new Error('The racer trace is incomplete.');
    trace.stages.forEach(s=>{s.parents={};s.treeChildren.forEach((pair,merge)=>pair.forEach(child=>{s.parents[child]=merge;}));});
    pictures={input:await image('racer-input.png'),clean:await image('racer-clean.png')};
    await Promise.all([loadSvg('overview.svg','.flow-diagram'),loadSvg('mechanism.svg','.flow-method')]);
    $('.flow-provenance').textContent='Local two-stage joint model · 40,000 updates · EMA 0.9995 · caption: “A race car.” The caption tokens enter the first grouping stage. This is a new run, separate from the single-stage ImageNet example below.';
    $('.flow-checks').textContent='These numbers are learned feature channels, not RGB values. Values are recorded from the model. Displayed equations use rounded numbers. Pooling and readback were checked against the saved model tensors. The readback features shown here exclude the learned skip and decoder.';
    $$('.flow-level-controls button').forEach(b=>b.addEventListener('click',()=>selectLevel(Number(b.dataset.flowLevel))));
    $$('.flow-tabs button').forEach((b,index)=>{
      b.addEventListener('click',()=>{state.mode=b.dataset.flowMode;render();});
      b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...$$('.flow-tabs button')];const next=e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowLeft'?2:1))%3;tabs[next].click();tabs[next].focus();});
    });
    $('#flow-pair').addEventListener('change',()=>{state.compare=Number($('#flow-pair').value);render();});
    $('#flow-channel').addEventListener('change',()=>{state.channel=Number($('#flow-channel').value);render();});
    $('#flow-image-mode').addEventListener('change',()=>{state.image=$('#flow-image-mode').value;render();});
    [$('#flow-image'),$('#flow-map')].forEach(canvas=>{
      const patchAt=e=>{const r=canvas.getBoundingClientRect();return Math.min(15,Math.max(0,Math.floor((e.clientY-r.top)/r.height*16)))*16+Math.min(15,Math.max(0,Math.floor((e.clientX-r.left)/r.width*16)));};
      const select=e=>{hoverPatch=patchAt(e);if(pending)return;pending=requestAnimationFrame(()=>{pending=0;if(state.patch!==hoverPatch){state.patch=hoverPatch;state.compare=null;render();}});};
      canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')select(e);});canvas.addEventListener('click',select);
      canvas.addEventListener('keydown',e=>{let row=Math.floor(state.patch/16),col=state.patch%16;if(e.key==='ArrowLeft')col--;else if(e.key==='ArrowRight')col++;else if(e.key==='ArrowUp')row--;else if(e.key==='ArrowDown')row++;else return;e.preventDefault();state.patch=Math.max(0,Math.min(15,row))*16+Math.max(0,Math.min(15,col));state.compare=null;render();});
    });
    // SVG node hooks are installed after the generated figure is loaded.
    $$('.flow-diagram [data-id]').forEach(node=>{
      const id=node.dataset.id;const level=/2/.test(id)?1:0;if(!/group|readback|pool/.test(id))return;
      node.setAttribute('role','button');node.setAttribute('tabindex','0');node.setAttribute('aria-label',`${/readback/.test(id)?'Readback':'Grouping'}, Level ${level+1}`);
      const pick=()=>{state.mode=/readback/.test(id)?'readback':'affinity';selectLevel(level);};node.addEventListener('click',pick);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}});
    });
    nestedView=window.HiTNestedFlow.mount($('.flow-nested'),{
      counts:[trace.stages[0].inputCount,trace.stages[0].groupCount,trace.stages[1].groupCount],
      onPreview:()=>{if(selectedLevel!==1){previewLevel=1;refreshLevel();}},
      onLeave:()=>{if(previewLevel!==null){previewLevel=null;refreshLevel();}},
      onSelect:selectLevel
    });
    $('.flow-loading').hidden=true;$('.flow-content').hidden=false;render(true);
  }
  load().catch(error=>{mount.dataset.ready='error';$('.flow-loading').textContent=`${error.message} Reload the page to try again.`;$('.flow-loading').setAttribute('role','alert');});
})();
