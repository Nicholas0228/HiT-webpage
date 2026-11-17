(() => {
  'use strict';
  const scriptURL = document.currentScript?.src || location.href;
  const assetURL = name => {
    const url = new URL(`assets/efficiency/${name}`, scriptURL);
    url.search = new URL(scriptURL).search;
    return url.href;
  };
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function svgNode(name, attrs = {}, text) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function validate(data) {
    for (const id of ['hit', 'jit']) {
      const series = data.series?.find(item => item.id === id);
      if (!series?.points?.length) throw new Error('Missing chart series.');
      let previous = -Infinity;
      for (const point of series.points) {
        if (![point.epoch, point.fid, point.updatesK, point.eflops].every(Number.isFinite)
          || point.fid <= 0 || point.updatesK <= previous) throw new Error('Invalid checkpoint.');
        previous = point.updatesK;
      }
    }
  }

  async function mount() {
    const host = document.getElementById('efficiency-chart');
    if (!host || host.dataset.efficiencyState) return;
    host.dataset.efficiencyState = 'loading';
    try {
      const response = await fetch(assetURL('convergence.json'));
      if (!response.ok) throw new Error('Cannot load chart data.');
      const data = await response.json();
      validate(data);
      build(host, data);
    } catch (error) {
      host.dataset.efficiencyState = 'error';
      const message = document.createElement('p');
      message.className = 'efficiency-error';
      message.append('The chart could not be loaded. ');
      message.append('Reload the page to try again.');
      host.replaceChildren(message);
    }
  }

  function build(host, data) {
    host.innerHTML = `
      <div class="efficiency-root">
        <div class="efficiency-toolbar">
          <span class="efficiency-dataset-label">ImageNet 256 × 256</span>
          <ul class="efficiency-legend" aria-label="Models">
            <li><span class="efficiency-key efficiency-key-hit" aria-hidden="true"></span>HiT-XL/16 · tail GG, CFG 2.6</li>
            <li><span class="efficiency-key efficiency-key-jit" aria-hidden="true"></span>JiT-H/16 · CFG 2.4</li>
          </ul>
        </div>
        <div class="efficiency-plots">
          <section class="efficiency-chart" id="efficiency-updates" aria-labelledby="efficiency-updates-title"></section>
          <section class="efficiency-chart" id="efficiency-flops" aria-labelledby="efficiency-flops-title"></section>
        </div>
      </div>`;
    for (const mode of ['updates', 'flops']) buildChart(host.querySelector(`#efficiency-${mode}`), data, mode);
    host.dataset.efficiencyState = 'ready';
    host.dataset.checkpointCount = host.querySelectorAll('.efficiency-checkpoint').length;
    host.dispatchEvent(new CustomEvent('efficiency:ready', {detail: {plots: 2, points: 18}}));
  }

  function buildChart(host, data, mode) {
    const prefix = `efficiency-${mode}`;
    const hit = data.series.find(series => series.id === 'hit');
    const jit = data.series.find(series => series.id === 'jit');
    const targetFid = data.comparison.targetFid;
    function atFid(series) {
      const exact = series.points.find(point => point.fid === targetFid);
      if (exact) return exact;
      const index = series.points.findIndex((point, i) => i > 0
        && series.points[i - 1].fid >= targetFid && point.fid <= targetFid);
      if (index < 1) return null;
      const before = series.points[index - 1];
      const after = series.points[index];
      const fraction = (Math.log(targetFid) - Math.log(before.fid))
        / (Math.log(after.fid) - Math.log(before.fid));
      return {
        fid: targetFid,
        updatesK: before.updatesK + (after.updatesK - before.updatesK) * fraction,
        eflops: before.eflops + (after.eflops - before.eflops) * fraction,
      };
    }
    const target = atFid(hit);
    const crossing = atFid(jit);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let chartWidth = 0;
    let screenPoints = [];
    let clipRect, guideGroup, activeRing, inspectionLine;
    let activePoint = null;
    let animationFrame = 0;
    let animationElapsed = 0;
    let lastTime = 0;
    let entered = false;
    let complete = false;
    const duration = 1450;

    host.innerHTML = `
      <div class="efficiency-chart-root">
        <div class="efficiency-axis-heading">
          <h3 id="${prefix}-title">${mode === 'flops' ? 'Training FLOPs' : 'Training updates'}</h3>
          <span>FID-50K ↓ <span class="efficiency-log-label">(log scale)</span></span>
        </div>
        <div class="efficiency-panel" id="${prefix}-panel">
          <svg class="efficiency-svg" role="group" aria-label="Generation quality versus training computation. Use the arrow keys to inspect checkpoints."></svg>
          <div class="efficiency-tooltip" id="${prefix}-tooltip" role="tooltip" hidden></div>
        </div>
        <span class="efficiency-sr-only" aria-live="polite" aria-atomic="true"></span>
      </div>`;

    const root = host.querySelector('.efficiency-chart-root');
    const svg = host.querySelector('.efficiency-svg');
    const panel = host.querySelector('.efficiency-panel');
    const tooltip = host.querySelector('.efficiency-tooltip');
    const status = host.querySelector('.efficiency-sr-only');

    function revealAmount() {
      return complete ? 1 : clamp(animationElapsed / duration, 0, 1);
    }

    function updateReveal() {
      if (clipRect) clipRect.setAttribute('width', Number(clipRect.dataset.fullWidth) * revealAmount());
      if (guideGroup) guideGroup.classList.toggle('efficiency-is-visible', complete);
      root.classList.toggle('efficiency-is-complete', complete);
      host.dataset.efficiencyAnimation = complete ? 'complete' : entered ? 'playing' : 'waiting';
    }

    function closeTooltip() {
      activePoint = null;
      tooltip.hidden = true;
      activeRing?.setAttribute('visibility', 'hidden');
      inspectionLine?.setAttribute('visibility', 'hidden');
      for (const node of svg.querySelectorAll('[aria-describedby]')) node.removeAttribute('aria-describedby');
    }

    function inspect(point, announce = false) {
      if (!point) return;
      const change = activePoint !== point;
      activePoint = point;
      const xText = mode === 'flops' ? `≈ ${point.eflops.toFixed(1)} training EFLOPs`
        : `${point.updatesK.toFixed(2)}k training updates`;
      tooltip.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = `${point.label} · Epoch ${point.epoch}`;
      const value = document.createElement('span');
      value.textContent = `FID ${point.fid}`;
      const settings = document.createElement('span');
      settings.textContent = point.settings;
      const computation = document.createElement('span');
      computation.textContent = xText;
      tooltip.append(title, settings, value, computation);
      tooltip.hidden = false;
      tooltip.style.left = `${clamp(point.x + 14, 8, chartWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${point.y > tooltip.offsetHeight + 22 ? point.y - tooltip.offsetHeight - 14 : point.y + 18}px`;
      activeRing.setAttribute('cx', point.x);
      activeRing.setAttribute('cy', point.y);
      activeRing.setAttribute('visibility', 'visible');
      inspectionLine.setAttribute('x1', point.x);
      inspectionLine.setAttribute('x2', point.x);
      inspectionLine.setAttribute('y1', point.y);
      inspectionLine.setAttribute('visibility', 'visible');
      for (const other of screenPoints) {
        other.node.setAttribute('tabindex', other === point ? '0' : '-1');
        if (other === point) other.node.setAttribute('aria-describedby', `${prefix}-tooltip`);
        else other.node.removeAttribute('aria-describedby');
      }
      if (announce && change) status.textContent = `${title.textContent}. ${settings.textContent}. ${value.textContent}. ${xText}.`;
    }

    function render() {
      const focusedKey = host.contains(document.activeElement) ? document.activeElement?.dataset?.pointKey : null;
      closeTooltip();
      const width = Math.max(280, panel.clientWidth);
      chartWidth = width;
      const small = width < 560;
      const height = small ? 360 : 380;
      const plot = {left: small ? 52 : 62, right: width - (small ? 12 : 24), top: 20, bottom: height - 62};
      const plotWidth = plot.right - plot.left;
      const plotHeight = plot.bottom - plot.top;
      const axis = data.axes[mode];
      const yAxis = data.axes.fid;
      const x = value => plot.left + (value - axis.min) / (axis.max - axis.min) * plotWidth;
      const y = value => plot.bottom - (Math.log(value) - Math.log(yAxis.min))
        / (Math.log(yAxis.max) - Math.log(yAxis.min)) * plotHeight;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('height', height);
      svg.setAttribute('aria-label', `${mode === 'flops' ? 'Training FLOPs' : 'Training updates'} versus FID. Final evaluation results. Use the arrow keys to inspect points.`);
      svg.replaceChildren();
      screenPoints = [];

      const defs = svgNode('defs');
      const clip = svgNode('clipPath', {id: `${prefix}-clip`, clipPathUnits: 'userSpaceOnUse'});
      clipRect = svgNode('rect', {x: plot.left - 9, y: plot.top - 12, height: plotHeight + 24, width: 0, 'data-full-width': plotWidth + 20});
      clip.append(clipRect);
      defs.append(clip);
      svg.append(defs);

      const grid = svgNode('g', {'aria-hidden': 'true'});
      for (const tick of yAxis.ticks) {
        grid.append(svgNode('line', {x1: plot.left, x2: plot.right, y1: y(tick), y2: y(tick), class: 'efficiency-gridline'}));
        grid.append(svgNode('text', {x: plot.left - 12, y: y(tick), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'efficiency-tick'}, tick));
      }
      for (const tick of (small && axis.mobileTicks ? axis.mobileTicks : axis.ticks)) {
        grid.append(svgNode('line', {x1: x(tick), x2: x(tick), y1: plot.bottom, y2: plot.bottom + 5, class: 'efficiency-axis'}));
        grid.append(svgNode('text', {x: x(tick), y: plot.bottom + 24, 'text-anchor': 'middle', class: 'efficiency-tick'}, tick));
      }
      grid.append(svgNode('line', {x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: 'efficiency-axis'}));
      grid.append(svgNode('text', {x: (plot.left + plot.right) / 2, y: height - 8, 'text-anchor': 'middle', class: 'efficiency-axis-label'}, axis.label));
      svg.append(grid);

      const curveGroup = svgNode('g', {'clip-path': `url(#${prefix}-clip)`});
      for (const series of [jit, hit]) {
        const regularPoints = series.points.filter(point => !point.variant);
        const path = regularPoints.map((point, index) => `${index ? 'L' : 'M'}${x(point[axis.field]).toFixed(4)} ${y(point.fid).toFixed(4)}`).join(' ');
        curveGroup.append(svgNode('path', {d: path, class: `efficiency-curve efficiency-curve-${series.id}`, 'data-series': series.id, 'aria-hidden': 'true'}));
        for (const [index, point] of series.points.entries()) {
          const px = x(point[axis.field]), py = y(point.fid);
          if (point.variant && index > 0) {
            const previous = series.points[index - 1];
            curveGroup.append(svgNode('path', {
              d: `M${x(previous[axis.field])} ${y(previous.fid)}L${px} ${py}`,
              class: `efficiency-curve efficiency-curve-${series.id} efficiency-curve-variant`, 'aria-hidden': 'true',
            }));
          }
          const group = svgNode('g', {
            class: `efficiency-checkpoint efficiency-checkpoint-${series.id}`,
            role: 'button', tabindex: '-1', 'data-point-key': `${series.id}-${point.epoch}`,
            'data-series': series.id, 'data-epoch': point.epoch, 'data-fid': point.fid,
            'aria-label': `${series.label}, ${point.settings || series.settings}, epoch ${point.epoch}, FID ${point.fid}.`,
          });
          group.append(svgNode('circle', {cx: px, cy: py, r: 12, class: 'efficiency-point-hitarea'}));
          if (point.variant) {
            const star = Array.from({length: 10}, (_, i) => {
              const angle = -Math.PI / 2 + i * Math.PI / 5;
              const radius = i % 2 ? 3.5 : 8;
              return `${px + Math.cos(angle) * radius},${py + Math.sin(angle) * radius}`;
            }).join(' ');
            group.append(svgNode('polygon', {points: star, class: 'efficiency-point'}));
          } else group.append(svgNode('circle', {cx: px, cy: py, r: 4.1, class: 'efficiency-point'}));
          curveGroup.append(group);
          const screenPoint = {...point, id: series.id, label: series.label, settings: point.settings || series.settings, x: px, y: py, node: group};
          screenPoints.push(screenPoint);
          group.addEventListener('focus', () => { finish(); inspect(screenPoint, true); });
          group.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') inspect(screenPoint); });
          group.addEventListener('click', () => { finish(); inspect(screenPoint, true); });
          group.addEventListener('keydown', event => {
            if (event.key === 'Escape') { closeTooltip(); return; }
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = screenPoints.indexOf(screenPoint);
            const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? screenPoints.length - 1
              : (index + direction + screenPoints.length) % screenPoints.length;
            screenPoints[next].node.focus();
          });
        }
      }
      screenPoints.sort((a, b) => a[axis.field] - b[axis.field] || a.id.localeCompare(b.id));
      screenPoints[0].node.setAttribute('tabindex', '0');
      svg.append(curveGroup);

      guideGroup = svgNode('g', {class: 'efficiency-guides', 'aria-hidden': 'true'});
      if (target && crossing) {
        const hx = x(target[axis.field]), jx = x(crossing[axis.field]), gy = y(target.fid);
        const arrowY = gy - (small ? 64 : 83);
        const labelX = small ? plot.right : clamp((hx + jx) / 2, plot.left + 110, plot.right - 110);
        const labelAnchor = small ? 'end' : 'middle';
        guideGroup.append(svgNode('line', {x1: plot.left, x2: jx, y1: gy, y2: gy, class: 'efficiency-equal-line'}));
        for (const pointX of [hx, jx]) guideGroup.append(svgNode('line', {x1: pointX, x2: pointX, y1: arrowY + 7, y2: gy - 7, class: 'efficiency-guide-stem'}));
        guideGroup.append(svgNode('path', {d: `M${hx} ${arrowY}H${jx} M${hx + 6} ${arrowY - 4}L${hx} ${arrowY}L${hx + 6} ${arrowY + 4} M${jx - 6} ${arrowY - 4}L${jx} ${arrowY}L${jx - 6} ${arrowY + 4}`, class: 'efficiency-comparison-arrow'}));
        const ratio = (crossing[axis.field] / target[axis.field]).toFixed(1);
        guideGroup.append(svgNode('text', {x: labelX, y: arrowY - 42, 'text-anchor': labelAnchor, class: 'efficiency-ratio'}, `≈ ${ratio}×`));
        guideGroup.append(svgNode('text', {x: labelX, y: arrowY - 14, 'text-anchor': labelAnchor, class: 'efficiency-ratio-label'}, mode === 'flops' ? 'lower training FLOPs' : 'fewer training updates'));
        guideGroup.append(svgNode('text', {x: labelX, y: arrowY + 24, 'text-anchor': labelAnchor, class: 'efficiency-target-label'}, `FID ≈ ${targetFid.toFixed(2)}`));
        guideGroup.append(svgNode('circle', {cx: jx, cy: gy, r: 5, class: 'efficiency-estimate-point'}));
        guideGroup.append(svgNode('circle', {cx: hx, cy: gy, r: 4.5, class: 'efficiency-hit-target'}));
      }
      for (const series of [jit, hit]) {
        const last = series.points[series.points.length - 1];
        guideGroup.append(svgNode('text', {
          x: x(last[axis.field]) - 8, y: y(last.fid) - 12,
          'text-anchor': 'end', class: 'efficiency-endpoint-label',
        }, String(last.fid)));
      }
      svg.append(guideGroup);

      inspectionLine = svgNode('line', {y2: plot.bottom, class: 'efficiency-inspection-line', visibility: 'hidden', 'aria-hidden': 'true'});
      activeRing = svgNode('circle', {r: 7.5, class: 'efficiency-active-ring', visibility: 'hidden', 'aria-hidden': 'true'});
      svg.append(inspectionLine, activeRing);
      host.dataset.efficiencyMode = mode;
      updateReveal();
      if (focusedKey) screenPoints.find(point => point.node.dataset.pointKey === focusedKey)?.node.focus();
    }

    function finish() {
      entered = true;
      complete = true;
      animationElapsed = duration;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      updateReveal();
    }

    function animate(time) {
      animationFrame = 0;
      if (document.hidden || complete) { lastTime = 0; return; }
      if (lastTime) animationElapsed += Math.min(50, time - lastTime);
      lastTime = time;
      if (animationElapsed >= duration) { finish(); return; }
      updateReveal();
      animationFrame = requestAnimationFrame(animate);
    }

    function enter() {
      if (entered) return;
      entered = true;
      if (reducedMotion.matches) finish();
      else { lastTime = 0; animationFrame = requestAnimationFrame(animate); }
    }

    panel.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || !complete) return;
      const box = svg.getBoundingClientRect();
      const px = (event.clientX - box.left) * chartWidth / box.width;
      const py = (event.clientY - box.top) * Number(svg.getAttribute('height')) / box.height;
      const closest = screenPoints.reduce((best, point) => {
        const distance = Math.hypot(point.x - px, point.y - py);
        return !best || distance < best.distance ? {point, distance} : best;
      }, null);
      if (closest?.distance < 36) inspect(closest.point);
      else if (!svg.contains(document.activeElement)) closeTooltip();
    });
    panel.addEventListener('pointerleave', () => { if (!svg.contains(document.activeElement)) closeTooltip(); });
    panel.addEventListener('focusout', event => { if (!panel.contains(event.relatedTarget)) closeTooltip(); });
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches && entered) finish(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        lastTime = 0;
      } else if (entered && !complete && !animationFrame) animationFrame = requestAnimationFrame(animate);
    });

    render();
    const resizeObserver = new ResizeObserver(() => {
      if (Math.abs(panel.clientWidth - chartWidth) > 1) render();
    });
    resizeObserver.observe(panel);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { enter(); observer.disconnect(); }
      }, {threshold: .25});
      observer.observe(panel);
    } else finish();
    host.dataset.efficiencyState = 'ready';
    host.dataset.checkpointCount = screenPoints.length;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
