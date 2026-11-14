(() => {
  'use strict';
  const intro = document.querySelector('.intro');
  const stage = document.querySelector('.stage');
  const canvas = document.querySelector('.particles');
  const ctx = canvas.getContext('2d');
  const keywords = document.querySelector('.keywords');
  const wordmark = document.querySelector('.wordmark');
  const title = document.querySelector('.paper-title');
  const slot = document.querySelector('.wordmark-slot');
  const authors = document.querySelector('.authors');
  const affiliations = document.querySelector('.affiliations');
  const cue = document.querySelector('.scroll-cue');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const markImage = new Image();
  markImage.src = 'assets/hit-mark.svg';
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = (a, b, n) => { const t = clamp((n-a)/(b-a)); return t*t*(3-2*t); };
  const mix = (a, b, t) => a+(b-a)*t;
  const palette = {train:'#e8a446', fill:'#fdf6ea', tensor:'#a5d3f2', ink:'#000000'};
  let width = 0, height = 0, points = [], progress = 0, targetProgress = 0;
  let frame = 0, lastTime = 0, resizeTimer = 0, scene;
  let wordmarkShift = 0, wordmarkScale = 1;

  // Use fixed seeds so that scrolling backward restores the same image.
  function random(seed) {
    let n = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13;
    n = Math.imul(n, 0xc2b2ae35);
    n ^= n >>> 16;
    return (n >>> 0)/4294967296;
  }

  function sampleText(elements, step) {
    const buffer = document.createElement('canvas');
    buffer.width = Math.ceil(width);
    buffer.height = Math.ceil(height);
    const paint = buffer.getContext('2d', {willReadFrequently:true});
    paint.fillStyle = palette.ink;
    const parent = stage.getBoundingClientRect();
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      paint.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      paint.letterSpacing = style.letterSpacing;
      paint.textAlign = 'center';
      paint.textBaseline = 'alphabetic';
      const metrics = paint.measureText(element.textContent);
      const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize)*0.8;
      const descent = metrics.fontBoundingBoxDescent ?? parseFloat(style.fontSize)*0.2;
      paint.fillText(element.textContent, box.left-parent.left+box.width/2,
        box.top-parent.top+(box.height-ascent-descent)/2+ascent);
    }
    return samplePixels(paint, buffer, step);
  }

  function sampleMark(step) {
    const buffer = document.createElement('canvas');
    buffer.width = Math.ceil(width);
    buffer.height = Math.ceil(height);
    const paint = buffer.getContext('2d', {willReadFrequently:true});
    const parent = stage.getBoundingClientRect();
    const box = wordmark.getBoundingClientRect();
    paint.drawImage(markImage, box.left-parent.left, box.top-parent.top, box.width, box.height);
    return samplePixels(paint, buffer, step);
  }

  function samplePixels(paint, buffer, step) {
    const {data} = paint.getImageData(0, 0, buffer.width, buffer.height);
    const pixels = [];
    for (let y = 0; y < buffer.height; y += step) {
      for (let x = 0; x < buffer.width; x += step) {
        if (data[(y*buffer.width+x)*4+3] > 150) pixels.push({x, y});
      }
    }
    return pixels;
  }

  function measureProgress() {
    const distance = intro.offsetHeight-stage.offsetHeight;
    targetProgress = distance > 0 ? clamp(-intro.getBoundingClientRect().top/distance) : 0;
  }

  function layoutScene() {
    const vertical = width < 640;
    const gap = vertical ? 72 : Math.max(64, Math.min(104, width*.1));
    const w = vertical ? Math.min(width-48, 350) : (Math.min(width-80, 1060)-gap)/2;
    const h = vertical ? Math.min(174, height*.22) : Math.min(260, height*.35);
    const cy = height*.45;
    const boxes = vertical
      ? [{x:(width-w)/2,y:cy-h-gap/2,w,h},{x:(width-w)/2,y:cy+gap/2,w,h}]
      : [{x:(width-2*w-gap)/2,y:cy-h/2,w,h},{x:(width+gap)/2,y:cy-h/2,w,h}];
    const ports = vertical
      ? [{x:width/2,y:boxes[0].y+h},{x:width/2,y:boxes[1].y}]
      : [{x:boxes[0].x+w,y:cy},{x:boxes[1].x,y:cy}];
    return {vertical, boxes, ports, bottom:Math.max(...boxes.map(b=>b.y+b.h))};
  }

  function fitTitle() {
    const row = title.parentElement;
    const identity = row.parentElement;
    const gap = parseFloat(getComputedStyle(row).columnGap);
    title.style.width = `${identity.clientWidth-slot.offsetWidth-gap}px`;
    // Center the ink, not the unused space in a balanced text box.
    // Text ranges also cover lines that contain the unbroken End-to-End phrase.
    const lines = new Map();
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const box of range.getClientRects()) {
        if (!box.width) continue;
        const key = Math.round(box.top);
        const line = lines.get(key) || {left:box.left, right:box.right};
        line.left = Math.min(line.left,box.left);
        line.right = Math.max(line.right,box.right);
        lines.set(key,line);
      }
    }
    const inkWidth = Math.max(...[...lines.values()].map(line=>line.right-line.left));
    if (Number.isFinite(inkWidth)) title.style.width = `${Math.ceil(inkWidth)+1}px`;
  }

  function prepare() {
    if (!markImage.complete || !markImage.naturalWidth) return;
    width = stage.clientWidth;
    height = stage.clientHeight;
    fitTitle();
    const stageBox = stage.getBoundingClientRect();
    const slotBox = slot.getBoundingClientRect();
    wordmark.style.top = `${slotBox.top-stageBox.top+slotBox.height/2}px`;
    wordmark.style.transform = 'translate(-50%, -50%)';
    const wordmarkBox = wordmark.getBoundingClientRect();
    wordmarkShift = slotBox.left+slotBox.width/2-stageBox.left-width/2;
    wordmarkScale = slotBox.width/wordmarkBox.width;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width*ratio);
    canvas.height = Math.round(height*ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    scene = layoutScene();
    const step = width < 600 ? 2 : 3;
    const from = sampleText([...keywords.children], step);
    const to = sampleMark(step);
    from.sort((a,b) => a.x-b.x || a.y-b.y);
    to.sort((a,b) => a.x-b.x || a.y-b.y);
    const count = Math.min(7800, Math.max(from.length, to.length));
    points = [];
    if (from.length && to.length) {
      for (let i = 0; i < count; i++) {
        const start = from[Math.min(from.length-1, Math.floor(i/count*from.length))];
        const end = to[Math.min(to.length-1, Math.floor(i/count*to.length))];
        points.push({sx:start.x, sy:start.y, tx:end.x, ty:end.y,
          group:i%2, u:random(i+13), v:random(i+527), phase:random(i+901)*Math.PI*2,
          size:(width<600?.55:.65)+random(i+87)*.45, delay:random(i+113)*.035});
      }
    }
    measureProgress();
    progress = targetProgress;
    requestRender();
  }

  function text(value, x, y, size, weight=500, align='center') {
    ctx.fillStyle = palette.ink;
    ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function polygon(vertices) {
    ctx.beginPath();
    vertices.forEach(([x,y],i)=> i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function shake(p, group) {
    if (reducedMotion.matches) return {x:0,y:0};
    const t = clamp((p-.405)/.075);
    const envelope = Math.sin(t*Math.PI);
    return {x:Math.sin(t*Math.PI*10+group*Math.PI)*4*envelope,
      y:Math.sin(t*Math.PI*8)*1.5*envelope};
  }

  function drawFrame(box, index, open, p) {
    const {x,y,w,h} = box;
    const movement = shake(p,index);
    ctx.save();
    ctx.translate(movement.x,movement.y);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.2;
    // The facing edge opens to form a port, without moving either stage.
    ctx.beginPath();
    if (scene.vertical) {
      const portY = index===0 ? y+h : y;
      const farY = index===0 ? y : y+h;
      ctx.moveTo(x+w/2-25*open,portY);ctx.lineTo(x,portY);
      ctx.lineTo(x,farY);ctx.lineTo(x+w,farY);ctx.lineTo(x+w,portY);
      ctx.lineTo(x+w/2+25*open,portY);
    } else {
      const portX = index===0 ? x+w : x;
      const farX = index===0 ? x : x+w;
      ctx.moveTo(portX,y+h/2-25*open);ctx.lineTo(portX,y);
      ctx.lineTo(farX,y);ctx.lineTo(farX,y+h);ctx.lineTo(portX,y+h);
      ctx.lineTo(portX,y+h/2+25*open);
    }
    ctx.stroke();
    const labelSize = width<640?13:14;
    text(`STAGE ${index+1}`,x+18,y+22,labelSize,500,'left');
    drawLock(x+w-24,y+22,open);
    const mx=x+w/2, my=y+h*.51, halfH=h*.20;
    ctx.lineWidth=1.6;
    ctx.strokeStyle=palette.train;
    ctx.fillStyle=palette.fill;
    if (index===0) {
      polygon([[x+w*.13,my-halfH],[x+w*.40,my-halfH*.32],[x+w*.40,my+halfH*.32],[x+w*.13,my+halfH]]);
      polygon([[x+w*.60,my-halfH*.32],[x+w*.87,my-halfH],[x+w*.87,my+halfH],[x+w*.60,my+halfH*.32]]);
      ctx.strokeStyle=palette.ink;ctx.lineWidth=.9;
      ctx.beginPath();ctx.moveTo(x+w*.42,my);ctx.lineTo(x+w*.58,my);ctx.stroke();
      text('Encoder',x+w*.265,y+h*.84,width<640?14:16);
      text('Decoder',x+w*.735,y+h*.84,width<640?14:16);
    } else {
      for(let i=2;i>=0;i--) {
        ctx.fillStyle=palette.fill;ctx.strokeStyle=palette.train;
        ctx.beginPath();ctx.rect(mx-w*.27+i*7,my-halfH-i*6,w*.54,halfH*2);ctx.fill();ctx.stroke();
      }
      text('Generator',mx,y+h*.84,width<640?14:16);
    }
    ctx.restore();
  }

  function drawLock(x,y,open) {
    ctx.save();
    ctx.translate(x,y);
    ctx.globalAlpha*=1-smooth(.5,1,open);
    ctx.strokeStyle=palette.ink;ctx.lineWidth=1.25;
    ctx.beginPath();ctx.rect(-5,-1,10,8);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-3.5,-1);
    ctx.lineTo(-3.5,-5-open*3);ctx.arc(0,-5-open*3,3.5,Math.PI,0);
    ctx.lineTo(3.5,-1-open*6);ctx.stroke();
    ctx.restore();
  }

  function tokenPosition(dot,p) {
    const b=scene.boxes[dot.group];
    // Small bounded movement keeps all tokens inside their own model.
    const shift=reducedMotion.matches?0:Math.sin(p*55+dot.phase)*.018;
    const u=clamp(dot.u*.94+.03+shift), v=clamp(dot.v*.94+.03+shift);
    let x,y;
    if(dot.group===0) {
      const left=u<.5;
      const local=left?u*2:(u-.5)*2;
      x=b.x+b.w*(left?mix(.145,.385,local):mix(.615,.855,local));
      const half=b.h*.175*(left?mix(1,.32,local):mix(.32,1,local));
      y=b.y+b.h*.51+(v-.5)*2*half;
    } else {
      x=b.x+b.w*mix(.245,.755,u);
      y=b.y+b.h*(.51+(v-.5)*.35);
    }
    const movement=shake(p,dot.group);
    return {x:x+movement.x,y:y+movement.y};
  }

  function drawScene(p,opacity) {
    const open=smooth(.47,.55,p);
    ctx.save();ctx.globalAlpha=opacity;
    scene.boxes.forEach((box,index)=>drawFrame(box,index,open,p));
    const [a,b]=scene.ports;
    const bridge=smooth(.50,.57,p);
    if(bridge>0) {
      ctx.strokeStyle=palette.ink;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(mix(a.x,b.x,bridge),mix(a.y,b.y,bridge));ctx.stroke();
    }
    const baseline=scene.bottom+36;
    const connected=smooth(.52,.57,p);
    ctx.globalAlpha=opacity*(1-connected);
    text('Two isolated stages',width/2,baseline,width<640?18:22);
    ctx.globalAlpha=opacity*connected;
    text('One connected system',width/2,baseline,width<640?18:22);
    ctx.globalAlpha=opacity;
    const legendY=baseline+32, start=width/2-95;
    ctx.fillStyle=palette.fill;ctx.strokeStyle=palette.train;ctx.lineWidth=1.5;
    ctx.fillRect(start,legendY-5,10,10);ctx.strokeRect(start,legendY-5,10,10);
    text('Trainable blocks',start+18,legendY,11,400,'left');
    ctx.fillStyle=palette.tensor;ctx.beginPath();ctx.arc(start+143,legendY,3,0,Math.PI*2);ctx.fill();
    text('Tokens',start+153,legendY,11,400,'left');
    ctx.restore();
  }

  function drawParticles(p,reduce) {
    const enter=reduce?smooth(.14,.23,p):smooth(.065,.13,p), leave=1-smooth(.765,.805,p);
    if(enter*leave<=0) return;
    const collect=smooth(.645,.785,p);
    const blue=smooth(.10,.24,p)*(1-smooth(.65,.77,p));
    ctx.fillStyle=`rgb(${Math.round(165*blue)},${Math.round(211*blue)},${Math.round(242*blue)})`;
    ctx.globalAlpha=enter*leave*(reduce ? 1-smooth(.63,.72,p) : 1);
    ctx.beginPath();
    for(const dot of points) {
      const trapped=tokenPosition(dot,p);
      let x=trapped.x,y=trapped.y;
      if(!reduce) {
        const gather=smooth(.09+dot.delay,.25+dot.delay,p);
        const scatter=Math.sin(gather*Math.PI)*Math.min(width*.045,48);
        x=mix(dot.sx,x,gather)+Math.cos(dot.phase)*scatter;
        y=mix(dot.sy,y,gather)+Math.sin(dot.phase)*scatter;
        // After the ports open, a small stream can cross the boundary.
        const flow=smooth(.55,.59,p)*(1-smooth(.65,.70,p));
        if(dot.u<.16 && flow>0) {
          const t=(dot.v+(p-.55)*3)%1;
          const first=scene.boxes[dot.group], second=scene.boxes[1-dot.group];
          const a=scene.ports[dot.group], b=scene.ports[1-dot.group];
          const stops=[{x:first.x+first.w/2,y:first.y+first.h*.51},a,b,{x:second.x+second.w/2,y:second.y+second.h*.51}];
          const segment=Math.min(2,Math.floor(t*3)), local=t*3-segment;
          x=mix(x,mix(stops[segment].x,stops[segment+1].x,local),flow);
          y=mix(y,mix(stops[segment].y,stops[segment+1].y,local),flow);
        }
        const converge=smooth(.645+dot.delay*.5,.785,p);
        x=mix(x,dot.tx,converge);y=mix(y,dot.ty,converge);
      }
      const radius=dot.size*(1+collect*.2);
      ctx.moveTo(x+radius,y);ctx.arc(x,y,radius,0,Math.PI*2);
    }
    ctx.fill();ctx.globalAlpha=1;
  }

  function render(time) {
    frame=0;
    const delta=Math.min(50,time-(lastTime||time));lastTime=time;
    const difference=targetProgress-progress;
    progress=Math.abs(difference)<.0001?targetProgress:progress+difference*(1-Math.exp(-delta/78));
    const p=progress, reduce=reducedMotion.matches;
    ctx.clearRect(0,0,width,height);
    keywords.style.opacity=1-smooth(.065,.14,p);
    const sceneOpacity=smooth(.14,.23,p)*(1-smooth(.64,.73,p));
    if(sceneOpacity>0) drawScene(p,sceneOpacity);
    drawParticles(p,reduce);
    wordmark.style.opacity=smooth(reduce?.71:.765,reduce?.79:.81,p);
    const move=reduce?1:smooth(.82,.9,p);
    wordmark.style.transform=`translate(-50%, -50%) translateX(${wordmarkShift*move}px) scale(${mix(1,wordmarkScale,move)})`;
    const reveal=smooth(.885,.945,p);
    title.style.opacity=reveal;
    title.style.transform=`translateX(${reduce?0:(1-reveal)*16}px)`;
    const authorReveal=smooth(.94,.975,p), schoolReveal=smooth(.97,.999,p);
    authors.style.opacity=authorReveal;affiliations.style.opacity=schoolReveal;
    authors.style.transform=`translateY(${reduce?0:(1-authorReveal)*12}px)`;
    affiliations.style.transform=`translateY(${reduce?0:(1-schoolReveal)*12}px)`;
    authors.inert=authorReveal<.95;affiliations.inert=schoolReveal<.95;
    cue.style.opacity=1-smooth(.01,.065,p);
    intro.dataset.phase=p<.14?'keywords':p<.405?'isolated':p<.47?'shake':p<.645?'connected':p<.81?'logo-forming':p<.9?'logo':'identity';
    // Stop drawing when scrolling stops. No permanent render loop.
    if(Math.abs(targetProgress-progress)>.0001) requestRender();
  }

  function requestRender() { if(!frame) frame=requestAnimationFrame(render); }
  addEventListener('scroll',()=>{measureProgress();requestRender();},{passive:true});
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(prepare,100);},{passive:true});
  reducedMotion.addEventListener('change',prepare);
  Promise.all([document.fonts.ready,markImage.decode()]).then(prepare);
})();
