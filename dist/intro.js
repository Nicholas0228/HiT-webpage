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
  let width = 0, height = 0, points = [], progress = 0, targetProgress = 0;
  let frame = 0, lastTime = 0, resizeTimer = 0;
  let wordmarkShift = 0, wordmarkScale = 1;

  // Deterministic noise keeps the animation reversible at every scroll position.
  function random(seed) {
    let n = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13;
    return (n >>> 0)/4294967296;
  }

  function sampleText(elements, step) {
    const buffer = document.createElement('canvas');
    buffer.width = Math.ceil(width);
    buffer.height = Math.ceil(height);
    const paint = buffer.getContext('2d', {willReadFrequently: true});
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
      const baseline = box.top-parent.top+(box.height-ascent-descent)/2+ascent;
      paint.fillText(element.textContent, box.left-parent.left+box.width/2, baseline);
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

  function prepare() {
    if (!markImage.complete || !markImage.naturalWidth) return;
    width = stage.clientWidth;
    height = stage.clientHeight;
    // Measure the final row, then rasterize HiT at its centered start position.
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
    const count = Math.min(13000, Math.max(from.length, to.length));
    points = [];
    if (from.length && to.length) {
      for (let i = 0; i < count; i++) {
        const start = from[Math.min(from.length-1, Math.floor(i/count*from.length))];
        const end = to[Math.min(to.length-1, Math.floor(i/count*to.length))];
        const angle = random(i+13)*Math.PI*2;
        const radius = Math.sqrt(random(i+527));
        points.push({
          sx:start.x, sy:start.y, tx:end.x, ty:end.y,
          angle, radius,
          size: (width < 600 ? 0.65 : 0.85)+random(i+87)*0.7,
          delay: random(i+113)*0.075,
        });
      }
    }
    measureProgress();
    progress = targetProgress;
    requestRender();
  }

  function render(time) {
    frame = 0;
    const delta = Math.min(50, time-(lastTime || time));
    lastTime = time;
    const difference = targetProgress-progress;
    progress = Math.abs(difference) < 0.0001 ? targetProgress : progress+difference*(1-Math.exp(-delta/78));
    const p = progress;
    const morph = clamp(p/0.76);
    ctx.clearRect(0, 0, width, height);
    const reduce = reducedMotion.matches;
    keywords.style.opacity = 1-smooth(reduce ? 0.14 : 0.055, reduce ? 0.3 : 0.16, morph);
    wordmark.style.opacity = smooth(reduce ? 0.34 : 0.83, reduce ? 0.5 : 0.91, morph);
    const move = reduce ? 1 : smooth(0.72, 0.85, p);
    wordmark.style.transform = `translate(-50%, -50%) translateX(${wordmarkShift*move}px) scale(${mix(1,wordmarkScale,move)})`;
    const reveal = smooth(reduce ? 0.4 : 0.82, reduce ? 0.58 : 0.9, p);
    title.style.opacity = reveal;
    title.style.transform = `translateX(${reduce ? 0 : (1-reveal)*16}px)`;
    const authorReveal = smooth(reduce ? 0.58 : 0.9, reduce ? 0.74 : 0.95, p);
    const schoolReveal = smooth(reduce ? 0.74 : 0.95, reduce ? 0.9 : 0.995, p);
    authors.style.opacity = authorReveal;
    affiliations.style.opacity = schoolReveal;
    authors.style.transform = `translateY(${reduce ? 0 : (1-authorReveal)*12}px)`;
    affiliations.style.transform = `translateY(${reduce ? 0 : (1-schoolReveal)*12}px)`;
    authors.inert = authorReveal < 0.95;
    affiliations.inert = schoolReveal < 0.95;
    cue.style.opacity = 1-smooth(0.01, 0.075, p);

    if (!reduce && morph > 0.055 && morph < 0.91) {
      const opacity = smooth(0.055, 0.15, morph)*(1-smooth(0.83, 0.91, morph));
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = opacity;
      for (const dot of points) {
        const scatter = smooth(0.11+dot.delay, 0.43+dot.delay, morph);
        const collect = smooth(0.44+dot.delay, 0.82, morph);
        const turn = dot.angle+smooth(0.16, 0.8, morph)*1.05;
        const cloudX = width/2+Math.cos(turn)*dot.radius*Math.min(width*0.42, 560);
        const cloudY = height*0.43+Math.sin(turn)*dot.radius*Math.min(height*0.31, 310);
        const x = mix(mix(dot.sx, cloudX, scatter), dot.tx, collect);
        const y = mix(mix(dot.sy, cloudY, scatter), dot.ty, collect);
        const radius = dot.size*(1+0.25*Math.sin(scatter*Math.PI)*(1-collect));
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Stop drawing when scrolling stops. No permanent render loop.
    if (Math.abs(targetProgress-progress) > 0.0001) requestRender();
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  addEventListener('scroll', () => {measureProgress(); requestRender();}, {passive:true});
  addEventListener('resize', () => {clearTimeout(resizeTimer); resizeTimer=setTimeout(prepare, 100);}, {passive:true});
  reducedMotion.addEventListener('change', prepare);
  Promise.all([document.fonts.ready, markImage.decode()]).then(prepare);
})();
