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
  let snapSource;
  const sourceReady=window.HiTSnap.load().then(source=>{snapSource=source;});
  let width = 0, height = 0, points = [], progress = 0, targetProgress = 0;
  let frame = 0, lastTime = 0, resizeTimer = 0, elapsed = 0;
  let wordmarkShift = 0, wordmarkScale = 1;
  const HAND_START=.395,HAND_END=.555,FLOW_END=.625,HAND_TRIGGER=.29,HAND_RESET=.285;
  const HAND_HOLD=100,HAND_PLAY=500,HAND_SETTLE=100,FLOW_PLAY=450;
  let gestureState='armed',gestureElapsed=0,scrollProgress=0,prepared=false;

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
    paint.fillStyle = '#000000';
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
    const raw=distance>0?clamp(-intro.getBoundingClientRect().top/distance):0;
    scrollProgress=raw;
    if(reducedMotion.matches) { targetProgress=raw; return; }
    // Scrolling enters the gesture. Its full movement runs on a clock.
    targetProgress=raw<HAND_TRIGGER?raw/HAND_TRIGGER*HAND_START
      :FLOW_END+(raw-HAND_TRIGGER)/(1-HAND_TRIGGER)*(1-FLOW_END);
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
    if (!snapSource || !markImage.complete || !markImage.naturalWidth) return;
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
    const step = width < 600 ? 2 : 3;
    const from = sampleText([...keywords.children], step);
    const to = sampleMark(step);
    from.sort((a,b) => a.x-b.x || a.y-b.y);
    to.sort((a,b) => a.x-b.x || a.y-b.y);
    const sideCount=1200;
    const count=snapSource.count+2*sideCount;
    points = [];
    if (from.length && to.length) {
      for (let i = 0; i < count; i++) {
        const start = from[Math.min(from.length-1, Math.floor(i/count*from.length))];
        const end = to[Math.min(to.length-1, Math.floor(i/count*to.length))];
        const group=i<sideCount?0:i<sideCount+snapSource.count?1:2;
        const localIndex=group===0?i:group===1?i-sideCount:i-sideCount-snapSource.count;
        points.push({sx:start.x, sy:start.y, tx:end.x, ty:end.y,
          group, localIndex, u:random(i+13), v:random(i+527), phase:random(i+901)*Math.PI*2,
          edge:random(i+275)<(group===1?.18:.46), boundary:boundaryPoint(group,random(i+407)),
          size:Math.max(.58,Math.min(1,width/900))*(.70+random(i+87)*.42), shade:Math.floor(random(i+142)*4), delay:random(i+113)*.035});
      }
    }
    measureProgress();
    if(reducedMotion.matches) {
      gestureState=scrollProgress>=HAND_TRIGGER?'done':'armed';
      gestureElapsed=0;
    }
    if(!prepared || reducedMotion.matches) {
      progress=reducedMotion.matches?targetProgress:Math.min(targetProgress,HAND_START);
      prepared=true;
    }
    requestRender();
  }

  function sceneLayout() {
    const span=Math.min(width*.92,height*1.05,1200);
    const outerHeight=Math.min(span*.72,height*.66);
    return {span,sideWidth:span*.12,centerWidth:span*.70,outerHeight,innerHeight:outerHeight*.67};
  }

  function snapProgress() {
    return HAND_START+(HAND_END-HAND_START)*(snapSource.snapMs-snapSource.firstTimeMs)/(snapSource.lastTimeMs-snapSource.firstTimeMs);
  }

  function sourceTime(p) {
    // Play every pose from the selected source, including the final release.
    return mix(snapSource.firstTimeMs,snapSource.lastTimeMs,clamp((p-HAND_START)/(HAND_END-HAND_START)));
  }

  function boundaryPoint(group,t) {
    const vertices=group===0 ? [[-.5,-.5],[.5,-.335],[.5,.335],[-.5,.5]]
      : group===2 ? [[-.5,-.335],[.5,-.5],[.5,.5],[-.5,.335]]
      : [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
    const lengths=vertices.map((v,i)=>Math.hypot(v[0]-vertices[(i+1)%4][0],v[1]-vertices[(i+1)%4][1]));
    let distance=t*lengths.reduce((a,b)=>a+b,0);
    for(let i=0;i<4;i++) {
      if(distance<=lengths[i] || i===3) {
        const u=distance/lengths[i],a=vertices[i],b=vertices[(i+1)%4];
        return {x:mix(a[0],b[0],u),y:mix(a[1],b[1],u)};
      }
      distance-=lengths[i];
    }
  }

  function drawParticles(p, reduce) {
    const opacity = smooth(.06, .12, p) * (1 - smooth(.815, .86, p));
    if (opacity <= 0 || !snapSource) return;

    const count = points.length;
    const sourceCount = snapSource.count;
    let cache = drawParticles.buffers;
    if (!cache || cache.x.length !== count || cache.tones.length !== sourceCount) {
      cache = drawParticles.buffers = {
        x: new Float64Array(count),
        y: new Float64Array(count),
        radius: new Float64Array(count),
        buckets: Array.from({length: 8}, () => new Uint32Array(count)),
        lengths: new Uint32Array(8),
        sourceXY: new Float64Array(sourceCount * 2),
        tones: new Float64Array(sourceCount),
        details: new Float64Array(sourceCount),
      };
    }
    cache.lengths.fill(0);

    const clock = reduce ? 0 : elapsed;
    const handForm = smooth(.30, HAND_START, p);
    const connect = smooth(HAND_END, FLOW_END, p);
    const form = handForm * (1 - connect);
    const scene = sceneLayout();
    const centerX = width / 2;
    const centerY = height * .46;
    const moduleDistance = scene.span * .44;
    const sourceScale = Math.min(
      scene.centerWidth / snapSource.width,
      scene.outerHeight * 1.04 / snapSource.height
    );
    const shakeT = clamp((p - snapProgress()) / .046);
    const shake = reduce ? 0 : Math.sin(shakeT * Math.PI) * Math.sin(shakeT * 8 * Math.PI) * 2;

    // Fill source buffers once. At form=0, no source data is read or expanded.
    // fillFrame returns centered XY, tone in [0,1], and eased detail in [0,1].
    if (form > 0) {
      const sourceFrame = snapSource.frameAt(sourceTime(p));
      snapSource.fillFrame(sourceFrame, cache.sourceXY, cache.tones, cache.details);
    }

    const waveSpan = Math.min(width * .90, 1240);
    const waveAmplitude = Math.min(height * .105, width * .10, 100);
    const waveThickness = Math.min(height * .13, width * .16, 130);
    const wavePhase = clock * .7 + p * 5;
    const driftSize = Math.min(width * .045, 50);
    const gathering = !reduce && p < .28;
    const collecting = !reduce && p > .745;

    // Compute each point once, then put its index in exactly one alpha bucket.
    for (let i = 0; i < count; i++) {
      const dot = points[i];
      const middle = dot.group === 1;
      let x, y;

      // Build the current shape first. All three groups then enter the same flow.
      if (connect < 1 && middle && handForm === 1) {
        const sourceIndex = dot.localIndex * 2;
        x = centerX + cache.sourceXY[sourceIndex] * sourceScale;
        y = centerY + cache.sourceXY[sourceIndex + 1] * sourceScale;
      } else if (connect < 1) {
        let localX, localY;
        if (dot.edge) {
          const pull = .97 + .02 * Math.sin(clock * .5 + dot.phase);
          localX = dot.boundary.x * pull;
          localY = dot.boundary.y * pull;
        } else {
          const u = clamp(dot.u * .90 + .05 + Math.sin(clock * .45 + dot.phase) * .035);
          const half = dot.group === 0 ? mix(.5, .335, u)
            : dot.group === 2 ? mix(.335, .5, u) : .5;
          const v = (dot.v - .5) * 1.78 + Math.sin(clock * .55 + dot.phase + u * 4) * .05;
          localX = u - .5;
          localY = v * half;
        }
        const side = dot.group - 1;
        x = centerX + side * moduleDistance
          + localX * (middle ? scene.centerWidth : scene.sideWidth) + shake * side;
        y = centerY + localY * (middle ? scene.innerHeight : scene.outerHeight);
        if (middle && handForm > 0) {
          const sourceIndex = dot.localIndex * 2;
          x = mix(x, centerX + cache.sourceXY[sourceIndex] * sourceScale, handForm);
          y = mix(y, centerY + cache.sourceXY[sourceIndex + 1] * sourceScale, handForm);
        }
      }

      if (connect > 0) {
        const u = dot.group === 0 ? dot.u * .15
          : middle ? .15 + dot.u * .70 : .85 + dot.u * .15;
        const v = dot.v - .5;
        const waveX = centerX + (u - .5) * waveSpan;
        const waveY = centerY
          + Math.sin(u * 7.5 - wavePhase) * waveAmplitude * .9
          + Math.sin(u * 15 + v * 3 + wavePhase) * waveAmplitude * .24
          + v * waveThickness * Math.sin(Math.PI * (.08 + .84 * u));
        if (connect === 1) {
          x = waveX;
          y = waveY;
        } else {
          x = mix(x, waveX, connect);
          y = mix(y, waveY, connect);
        }
      }

      // Avoid the inactive sine/cosine terms once words have dispersed.
      if (gathering) {
        const gather = smooth(.085 + dot.delay, .245 + dot.delay, p);
        if (gather < 1) {
          const drift = Math.sin(gather * Math.PI) * driftSize;
          x = mix(dot.sx, x, gather) + Math.cos(dot.phase) * drift;
          y = mix(dot.sy, y, gather) + Math.sin(dot.phase) * drift;
        }
      }

      if (collecting) {
        const collect = smooth(.745 + dot.delay * .25, .84, p);
        if (collect === 1) {
          x = dot.tx;
          y = dot.ty;
        } else if (collect > 0) {
          const curl = Math.sin(collect * Math.PI) * driftSize;
          x = mix(x, dot.tx, collect) + Math.cos(dot.phase + collect * 3) * curl;
          y = mix(y, dot.ty, collect) + Math.sin(dot.phase + collect * 3) * curl;
        }
      }

      const base = .29 + dot.shade * .20;
      let shade = base;
      let radius = dot.size;
      if (middle && form > 0) {
        const detail = cache.details[dot.localIndex];
        const surface = .32 + .50 * cache.tones[dot.localIndex];
        shade = mix(base, mix(surface, .98, detail), form);
        radius *= mix(1, mix(1, 1.10, detail), form);
      }
      const band = Math.round(clamp((shade - .14) / .86) * 7);
      cache.x[i] = x;
      cache.y[i] = y;
      cache.radius[i] = radius;
      cache.buckets[band][cache.lengths[band]++] = i;
    }

    ctx.fillStyle = '#000000';
    for (let band = 0; band < 8; band++) {
      const length = cache.lengths[band];
      if (!length) continue;
      const bucket = cache.buckets[band];
      ctx.globalAlpha = opacity * (.14 + band * .86 / 7);
      ctx.beginPath();
      for (let j = 0; j < length; j++) {
        const i = bucket[j];
        const x = cache.x[i], y = cache.y[i], radius = cache.radius[i];
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }


  function followScroll(current,target,delta) {
    const difference=target-current;
    return Math.abs(difference)<.0001?target:current+difference*(1-Math.exp(-delta/60));
  }

  function advanceStory(current,delta) {
    if(reducedMotion.matches) return followScroll(current,targetProgress,delta);
    if((gestureState==='playing'||gestureState==='done') && scrollProgress<HAND_RESET) {
      gestureState='rewind';
    }
    if(gestureState==='rewind') {
      const aim=scrollProgress>=HAND_TRIGGER?HAND_START:targetProgress;
      const next=followScroll(current,aim,delta);
      if(next<=HAND_START+.0001) {
        gestureState='armed';gestureElapsed=0;
        return Math.min(next,HAND_START);
      }
      return next;
    }
    if(gestureState==='armed') {
      const next=followScroll(current,targetProgress,delta);
      if(scrollProgress>=HAND_TRIGGER && next>=HAND_START-.0001) {
        gestureState='playing';gestureElapsed=0;
        return HAND_START;
      }
      return Math.min(next,HAND_START);
    }
    if(gestureState==='playing') {
      gestureElapsed+=delta;
      const releaseAt=HAND_HOLD+HAND_PLAY+HAND_SETTLE;
      if(gestureElapsed>=releaseAt+FLOW_PLAY) {
        gestureState='done';return FLOW_END;
      }
      if(gestureElapsed>=releaseAt) {
        return mix(HAND_END,FLOW_END,(gestureElapsed-releaseAt)/FLOW_PLAY);
      }
      if(gestureElapsed<HAND_HOLD) return HAND_START;
      return mix(HAND_START,HAND_END,clamp((gestureElapsed-HAND_HOLD)/HAND_PLAY));
    }
    return followScroll(current,Math.max(FLOW_END,targetProgress),delta);
  }

  function render(time) {
    frame=0;
    if (!prepared) return;
    const delta=Math.min(50,time-(lastTime||time));lastTime=time;
    if (!document.hidden) elapsed+=delta/1000;
    progress=advanceStory(progress,document.hidden?0:delta);
    const p=progress, reduce=reducedMotion.matches;
    ctx.clearRect(0,0,width,height);
    keywords.style.opacity=1-smooth(.06,.13,p);
    drawParticles(p,reduce);
    wordmark.style.opacity=smooth(reduce?.77:.82,reduce?.84:.865,p);
    const move=reduce?1:smooth(.865,.935,p);
    wordmark.style.transform=`translate(-50%, -50%) translateX(${wordmarkShift*move}px) scale(${mix(1,wordmarkScale,move)})`;
    const reveal=smooth(.915,.965,p);
    title.style.opacity=reveal;
    title.style.transform=`translateX(${reduce?0:(1-reveal)*16}px)`;
    const authorReveal=smooth(.96,.985,p), schoolReveal=smooth(.98,.999,p);
    authors.style.opacity=authorReveal;affiliations.style.opacity=schoolReveal;
    authors.style.transform=`translateY(${reduce?0:(1-authorReveal)*12}px)`;
    affiliations.style.transform=`translateY(${reduce?0:(1-schoolReveal)*12}px)`;
    authors.inert=authorReveal<.95;affiliations.inert=schoolReveal<.95;
    cue.style.opacity=1-smooth(.01,.055,p);
    intro.dataset.phase=p<.13?'keywords':p<.30?'isolated-modules':p<snapProgress()?'source-hand':p<.555?'snap':p<.625?'merging':p<.745?'connected-flow':p<.865?'logo-forming':p<.935?'logo':'identity';
    intro.dataset.particleCount=points.length;
    intro.dataset.gesture=gestureState;
    intro.dataset.sourceTime=Math.round(sourceTime(p));
    const waveIsVisible=p>.08&&p<.85&&!reduce&&!document.hidden;
    if(Math.abs(targetProgress-progress)>.0001 || waveIsVisible || (gestureState==='playing'&&!document.hidden)) requestRender();
  }

  function requestRender() { if(!frame) frame=requestAnimationFrame(render); }
  addEventListener('scroll',()=>{measureProgress();requestRender();},{passive:true});
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(prepare,100);},{passive:true});
  reducedMotion.addEventListener('change',prepare);
  document.addEventListener('visibilitychange',()=>{lastTime=0;requestRender();});
  Promise.all([document.fonts.ready,markImage.decode(),sourceReady]).then(prepare);
})();
