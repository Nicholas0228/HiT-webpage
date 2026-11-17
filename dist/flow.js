/* A saved local model trace. No model values are synthesized in the browser. */
(() => {
  'use strict';
  const mount = document.querySelector('#flow-viewer');
  if (!mount) return;
  const script = document.currentScript.src;
  const asset = file => {const url=new URL(`assets/flow/${file}`,script);url.search=new URL(script).search;return url.href;};
  const $ = s => mount.querySelector(s);
  const $$ = s => mount.querySelectorAll(s);
  const state = {level:0, patch:130};
  let trace, picture, pending = 0, hoverPatch = null, nestedView;
  let selectedLevel=0, previewLevel=null;
  const stage = () => trace.stages[state.level];
  const queryToken = () => state.level === 0 ? state.patch : trace.stages[0].labels[state.patch];
  const group = () => stage().labels[queryToken()];
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
          <aside id="flow-help" class="ui-hint" aria-label="Interaction tip"><svg class="ui-hint-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m4 3 7.6 17 1.6-6 6-1.6L4 3Z"/></svg><p>Move over or tap an image to inspect a group. Colors can repeat for distant groups.</p></aside>
        </div>
        <div class="flow-architecture-column">
          <div class="flow-level-controls" role="group" aria-label="Choose the displayed hierarchy level">
            <button type="button" data-flow-level="0" aria-pressed="true">Level 1</button>
            <button type="button" data-flow-level="1" aria-pressed="false">Level 2</button>
          </div>
          <div class="flow-nested"></div>
          <div class="flow-legend flow-path-key"><span><i class="flow-key"></i>Transformer and skip</span><span><i class="flow-key routing"></i>Group / Ungroup</span></div>
          <p class="flow-architecture-note">Group combines tokens. Ungroup restores token positions.<br>Counts include image and caption tokens.</p>
          <p class="flow-level-state" role="status" aria-live="polite">Level 1 selected</p>
        </div>
      </div>
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
    const s=stage(),g=group(),labels=s.imageLabels;
    const colors=window.HiTFigureStyle.groupColors(labels);
    [$('#flow-image'),$('#flow-map')].forEach((canvas,index)=>{
      const ctx=canvas.getContext('2d');ctx.setTransform(canvas.width/512,0,0,canvas.height/512,0,0);ctx.clearRect(0,0,512,512);ctx.globalAlpha=1;
      if(index===0)ctx.drawImage(picture,0,0,512,512);

      labels.forEach((label,p)=>{
        const selected=label===g,x=p%16*32,y=Math.floor(p/16)*32;
        if(index===0){ctx.fillStyle=selected?'#e8a446':'#ffffff';ctx.globalAlpha=selected?.08:.32;}
        else {ctx.globalAlpha=1;ctx.fillStyle=selected?'#e8a446':colors.get(label);}
        ctx.fillRect(x,y,32,32);
      });
      borders(ctx,labels);ctx.globalAlpha=index===0?.45:.12;ctx.strokeStyle='#000';ctx.lineWidth=index===0?5:3.8;ctx.stroke();
      ctx.globalAlpha=1;ctx.strokeStyle='#fff';ctx.lineWidth=index===0?2.8:2;ctx.stroke();
      borders(ctx,labels,g);ctx.strokeStyle='#fff';ctx.lineWidth=6.2;ctx.stroke();ctx.strokeStyle='#e8a446';ctx.lineWidth=3.2;ctx.stroke();
      const x=state.patch%16*32,y=Math.floor(state.patch/16)*32;
      ctx.fillStyle='#489750';ctx.globalAlpha=.30;ctx.fillRect(x+2,y+2,28,28);ctx.globalAlpha=1;
      ctx.strokeStyle='#fff';ctx.lineWidth=5.5;ctx.strokeRect(x+2,y+2,28,28);ctx.strokeStyle='#489750';ctx.lineWidth=3;ctx.strokeRect(x+2,y+2,28,28);
      canvas.setAttribute('aria-label',`${index===0?'Racer input':'Image group map'}. Level ${state.level+1}. Patch ${state.patch}, group ${g}.`);
    });
  }
  function render() {
    state.level=previewLevel ?? selectedLevel;
    const s=stage(),i=queryToken(),g=group();
    $$('.flow-level-controls button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.flowLevel)===selectedLevel)));
    const imageMembers=s.imageLabels.filter(v=>v===g).length;
    $('.flow-selection').textContent=`Group ${g} · ${imageMembers} image ${imageMembers===1?'patch':'patches'}`;
    $('.flow-summary').textContent=`${new Set(s.imageLabels).size} image groups`;
    $('#flow-groups-title').textContent=`Groups · Level ${state.level+1}`;
    $('#flow-image-title').textContent=`Image · Level ${state.level+1} · t = 0.7`;
    Object.assign(mount.dataset,{ready:'true',level:String(state.level+1),patch:String(state.patch),queryToken:String(i),group:String(g)});
    nestedView?.render({level:state.level,locked:selectedLevel===1,preview:previewLevel!==null,patch:state.patch,group:g});
    const status=previewLevel!==null?'Level 2 preview · click HiT to keep this level':`Level ${selectedLevel+1} selected`;
    if($('.flow-level-state').textContent!==status)$('.flow-level-state').textContent=status;
    mount.dataset.lockedLevel=String(selectedLevel+1); mount.dataset.previewLevel=previewLevel===null?'':String(previewLevel+1);
    draw();
  }
  function refreshLevel(){render();}
  function selectLevel(level){selectedLevel=level;previewLevel=null;refreshLevel();}
  async function image(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('The racer image could not be loaded.'));img.src=asset(file);});}
  async function load(){
    const response=await fetch(asset('trace.json'));if(!response.ok)throw new Error('The racer trace could not be loaded.');
    trace=await response.json();if(trace.schema!==1||trace.stages.length!==2)throw new Error('The racer trace is incomplete.');
    picture=await image('racer-input.png');
    $$('.flow-level-controls button').forEach(b=>b.addEventListener('click',()=>selectLevel(Number(b.dataset.flowLevel))));
    [$('#flow-image'),$('#flow-map')].forEach(canvas=>{
      const patchAt=e=>{const r=canvas.getBoundingClientRect();return Math.min(15,Math.max(0,Math.floor((e.clientY-r.top)/r.height*16)))*16+Math.min(15,Math.max(0,Math.floor((e.clientX-r.left)/r.width*16)));};
      const select=e=>{hoverPatch=patchAt(e);if(pending)return;pending=requestAnimationFrame(()=>{pending=0;if(state.patch!==hoverPatch){state.patch=hoverPatch;render();}});};
      canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')select(e);});canvas.addEventListener('click',select);
      canvas.addEventListener('keydown',e=>{let row=Math.floor(state.patch/16),col=state.patch%16;if(e.key==='ArrowLeft')col--;else if(e.key==='ArrowRight')col++;else if(e.key==='ArrowUp')row--;else if(e.key==='ArrowDown')row++;else return;e.preventDefault();state.patch=Math.max(0,Math.min(15,row))*16+Math.max(0,Math.min(15,col));render();});
    });
    nestedView=window.HiTNestedFlow.mount($('.flow-nested'),{
      counts:[trace.stages[0].inputCount,trace.stages[0].groupCount,trace.stages[1].groupCount],
      onPreview:()=>{if(selectedLevel!==1){previewLevel=1;refreshLevel();}},
      onLeave:()=>{if(previewLevel!==null){previewLevel=null;refreshLevel();}},
      onSelect:selectLevel
    });
    $('.flow-loading').hidden=true;$('.flow-content').hidden=false;render();
  }
  load().catch(error=>{mount.dataset.ready='error';$('.flow-loading').textContent=`${error.message} Reload the page to try again.`;$('.flow-loading').setAttribute('role','alert');});
})();
