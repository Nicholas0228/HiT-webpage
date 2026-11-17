/* Two-stage ImageNet assignments of HiT-XL/16. Keep source group IDs unchanged. */
(() => {
  'use strict';
  const root = document.getElementById('grouping-viewer');
  if (!root) return;
  const scriptUrl = document.currentScript?.src || location.href;
  const dataUrl = new URL('assets/groups/data.json', scriptUrl);
  dataUrl.search = new URL(scriptUrl).search;
  const times = [0.25, 0.5, 0.75, 1];
  const levels = [1, 2];
  const escape = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (number, low, high) => Math.max(low, Math.min(high, number));
  const formatTime = value => value.toFixed(2);
  root.classList.add('groups-viewer');
  root.innerHTML = '<p class="groups-loading" role="status">Loading image groups…</p>';

  function validate(data) {
    if (data.schema !== 4 || data.stageCount !== 2 || data.imageTime !== 1 || !times.includes(data.defaultTime) || !levels.includes(data.defaultLevel)) throw new Error('Unexpected ImageNet source.');
    if (!Array.isArray(data.times) || data.times.join(',') !== times.join(',')) throw new Error('The saved diffusion times are incomplete.');
    if (!Array.isArray(data.levels) || data.levels.join(',') !== levels.join(',')) throw new Error('The saved levels are incomplete.');
    if (!Array.isArray(data.examples) || data.examples.length < 1) throw new Error('The source examples are incomplete.');
    data.examples.forEach(example => {
      if (example.grid !== 16 || !example.levels) throw new Error('The image group data are incomplete.');
      if (times.some(time => time !== 1 && typeof example.inputs?.[String(time)] !== 'string')) throw new Error('The noisy image previews are incomplete.');
      levels.forEach(level => {
        const frames = example.levels[String(level)];
        if (!Array.isArray(frames) || frames.length !== times.length) throw new Error('The saved level is incomplete.');
        frames.forEach((frame, index) => {
          if (frame.t !== times[index] || !Array.isArray(frame.groups) || frame.groups.length !== 256 || frame.groups.some(id => !Number.isInteger(id) || id < 0) || new Set(frame.groups).size !== frame.count) throw new Error('The saved labels are invalid.');
        });
      });
      const initial = example.default;
      const labels = example.levels[String(data.defaultLevel)][times.indexOf(data.defaultTime)].groups;
      if (!initial || initial.level !== data.defaultLevel || initial.t !== data.defaultTime || !Number.isInteger(initial.focusPatch) || labels[initial.focusPatch] !== initial.group || labels.filter(id => id === initial.group).length !== initial.patchCount) throw new Error('The default selection is invalid.');
    });
    return data;
  }

  async function mount() {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error('The image group data could not load.');
    const data = validate(await response.json());
    const state = { example: 0, level: data.defaultLevel, time: times.indexOf(data.defaultTime), selectedPatch: 0, hoverPatch: null, focusPatch: 0, keyboardFocus: false, boundaries: true };
    root.innerHTML = `
      <div class="groups-examples" role="group" aria-label="Choose an ImageNet example">
        ${data.examples.map((example, index) => `<button type="button" class="groups-example" data-example="${index}" aria-pressed="${index === 0}" aria-label="Show ${escape(example.name)}"><img src="${escape(new URL(example.image, dataUrl).href)}" alt="" width="60" height="60" loading="lazy"><span>${escape(example.name)}</span></button>`).join('')}
      </div>
      <aside class="groups-hint ui-hint" aria-label="Interaction tip">
        <svg class="ui-hint-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 3 12 9-6 1.5L9 20 6 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        <p id="groups-keyboard-help">Move over or tap an image region to inspect its group.<span class="ui-sr-only"> Use arrow keys to move. Press Escape to restore the default view.</span></p>
      </aside>
      <div class="groups-layout">
        <div class="groups-image-wrap">
          <img class="groups-image" alt="" width="256" height="256" decoding="async">
          <canvas class="groups-canvas" width="1024" height="1024" tabindex="0" role="img" aria-describedby="groups-keyboard-help">Select an image patch to inspect its group.</canvas>
        </div>
        <div class="groups-side">
          <span class="groups-time-label" id="groups-level-label">Hierarchy level</span>
          <div class="groups-times groups-levels" role="group" aria-labelledby="groups-level-label">
            ${levels.map(level => `<button class="groups-time groups-level" type="button" data-level="${level}" aria-pressed="${level === data.defaultLevel}">Level ${level}</button>`).join('')}
          </div>
          <span class="groups-time-label" id="groups-time-label">Diffusion time, t</span>
          <div class="groups-times" role="group" aria-labelledby="groups-time-label">
            ${times.map((time, index) => `<button class="groups-time" type="button" data-time-index="${index}" aria-pressed="${time === data.defaultTime}" aria-label="Diffusion time ${formatTime(time)}">${formatTime(time)}</button>`).join('')}
          </div>
          <div class="groups-metrics" aria-label="Image grouping">
            <div class="groups-metric"><span class="groups-value groups-input-count">256</span><span class="groups-metric-label">image patches</span></div>
            <svg class="groups-arrow" viewBox="0 0 27 19" aria-hidden="true"><path d="M1 9.5h24m-8-8 8 8-8 8" fill="none" stroke="#000000" stroke-width="1.4"/></svg>
            <div class="groups-metric"><span class="groups-value groups-output-count"></span><span class="groups-metric-label">image groups</span></div>
          </div>
          <label class="groups-group-label">Inspect group
            <select class="groups-group-select" aria-label="Inspect a source group"></select>
          </label>
          <div class="groups-controls">
            <label class="groups-show-label"><input class="groups-show" type="checkbox">All group boundaries</label>
          </div>
        </div>
      </div>
      <div class="groups-statusbar">
        <p class="groups-selection" aria-live="off" aria-atomic="true"></p>
        <div class="groups-legend" aria-label="Group legend">
          <span class="groups-legend-item"><i class="groups-swatch" aria-hidden="true"></i>Selected group</span>
          <span class="groups-legend-item"><i class="groups-boundary" aria-hidden="true"></i>Boundary</span>
        </div>
      </div>`;
    const photo = root.querySelector('.groups-image');
    const canvas = root.querySelector('.groups-canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The image canvas is unavailable.');
    const selection = root.querySelector('.groups-selection');
    const levelButtons = [...root.querySelectorAll('.groups-level')];
    const groupSelect = root.querySelector('.groups-group-select');
    const timeButtons = [...root.querySelectorAll('.groups-time[data-time-index]')];
    const exampleButtons = [...root.querySelectorAll('.groups-example')];
    const show = root.querySelector('.groups-show');
    let pendingFrame = 0;
    let imageKey = '';
    const current = () => data.examples[state.example];
    const frame = () => current().levels[String(state.level)][state.time];
    const activePatch = () => state.hoverPatch ?? state.selectedPatch;

    function boundary(labels, grid, group, stroke, width) {
      const size = canvas.width / grid;
      ctx.beginPath();
      for (let row = 0; row < grid; row++) for (let col = 0; col < grid; col++) {
        const index = row * grid + col;
        const id = labels[index];
        if (group !== null && id !== group) continue;
        const x = col * size, y = row * size;
        if (row === 0 || labels[index - grid] !== id) { ctx.moveTo(x, y); ctx.lineTo(x + size, y); }
        if (col === 0 || labels[index - 1] !== id) { ctx.moveTo(x, y); ctx.lineTo(x, y + size); }
        if (row === grid - 1 || (group !== null && labels[index + grid] !== id)) { ctx.moveTo(x, y + size); ctx.lineTo(x + size, y + size); }
        if (col === grid - 1 || (group !== null && labels[index + 1] !== id)) { ctx.moveTo(x + size, y); ctx.lineTo(x + size, y + size); }
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function draw() {
      pendingFrame = 0;
      const example = current(), saved = frame(), labels = saved.groups;
      const selected = labels[activePatch()], grid = example.grid, size = canvas.width / grid;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < labels.length; index++) {
        ctx.fillStyle = labels[index] === selected ? 'rgba(232,164,70,.10)' : 'rgba(255,255,255,.48)';
        ctx.fillRect(index % grid * size, Math.floor(index / grid) * size, size, size);
      }
      if (state.boundaries) {
        boundary(labels, grid, null, 'rgba(0,0,0,.45)', 10);
        boundary(labels, grid, null, '#ffffff', 5.6);
      }
      boundary(labels, grid, selected, '#ffffff', 12.4);
      boundary(labels, grid, selected, '#e8a446', 6.4);
      if (state.keyboardFocus && state.hoverPatch === null) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeRect(state.focusPatch % grid * size + 5, Math.floor(state.focusPatch / grid) * size + 5, size - 10, size - 10);
      }
      const patchCount = labels.filter(id => id === selected).length;
      root.dataset.example = example.id;
      root.dataset.level = String(state.level);
      root.dataset.time = formatTime(saved.t);
      root.dataset.selectedGroup = String(selected);
      root.dataset.selectedPatchCount = String(patchCount);
      root.dataset.groupCount = String(saved.count);
      root.dataset.focusPatch = String(state.focusPatch);
      root.dataset.showBoundaries = String(state.boundaries);
      root.dataset.selectionKind = example.selectionKind;
      const isDefault = state.level === example.default.level && saved.t === example.default.t && selected === example.default.group;
      root.dataset.view = isDefault ? example.selectionKind : 'inspection';
      selection.textContent = `Group ${selected} · ${patchCount} ${patchCount === 1 ? 'image patch' : 'image patches'}`;
      groupSelect.value = String(selected);
      canvas.setAttribute('aria-label', `${example.name}. Level ${state.level}, diffusion time ${formatTime(saved.t)}. ${saved.count} image groups. Group ${selected} has ${patchCount} image patches.`);
      root.dataset.ready = 'true';
    }

    function requestDraw() { if (!pendingFrame) pendingFrame = requestAnimationFrame(draw); }
    function announce() { selection.setAttribute('aria-live', 'polite'); }

    function update() {
      const example = current();
      const time = frame().t;
      const nextImageKey = `${example.id}:${time}`;
      if (imageKey !== nextImageKey) {
        imageKey = nextImageKey;
        photo.alt = time === 1 ? example.alt : `${example.alt} Noisy input at diffusion time ${formatTime(time)}.`;
        photo.src = new URL(time === 1 ? example.image : example.inputs[String(time)], dataUrl).href;
      }
      root.querySelector('.groups-output-count').textContent = String(frame().count);
      levelButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.level) === state.level)));
      const counts = new Map();
      frame().groups.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
      groupSelect.innerHTML = [...counts].sort(([a], [b]) => a - b).map(([id, count]) => `<option value="${id}">Group ${id} · ${count} ${count === 1 ? 'patch' : 'patches'}</option>`).join('');
      timeButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.time)));
      exampleButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.example)));
      show.checked = state.boundaries;
      requestDraw();
    }

    function resetDefault() {
      state.level = current().default.level;
      state.time = times.indexOf(current().default.t);
      state.selectedPatch = current().default.focusPatch;
      state.focusPatch = state.selectedPatch;
      state.hoverPatch = null;
      state.keyboardFocus = false;
      state.boundaries = true;
      update();
    }

    function patchAt(event) {
      const bounds = canvas.getBoundingClientRect(), grid = current().grid;
      return clamp(Math.floor((event.clientY - bounds.top) / bounds.height * grid), 0, grid - 1) * grid
        + clamp(Math.floor((event.clientX - bounds.left) / bounds.width * grid), 0, grid - 1);
    }

    canvas.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const patch = patchAt(event);
      if (patch === state.hoverPatch) return;
      state.hoverPatch = patch;
      selection.setAttribute('aria-live', 'off');
      requestDraw();
    });
    canvas.addEventListener('pointerleave', () => { state.hoverPatch = null; requestDraw(); });
    canvas.addEventListener('click', event => {
      state.selectedPatch = patchAt(event);
      state.focusPatch = state.selectedPatch;
      state.hoverPatch = null;
      state.keyboardFocus = false;
      announce();
      requestDraw();
    });
    canvas.addEventListener('keydown', event => {
      const grid = current().grid, row = Math.floor(state.focusPatch / grid), col = state.focusPatch % grid;
      let next = state.focusPatch;
      if (event.key === 'ArrowRight') next = row * grid + Math.min(col + 1, grid - 1);
      else if (event.key === 'ArrowLeft') next = row * grid + Math.max(col - 1, 0);
      else if (event.key === 'ArrowDown') next = Math.min(row + 1, grid - 1) * grid + col;
      else if (event.key === 'ArrowUp') next = Math.max(row - 1, 0) * grid + col;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = grid ** 2 - 1;
      else if (event.key === 'Escape') { event.preventDefault(); announce(); resetDefault(); return; }
      else if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      state.focusPatch = next;
      state.selectedPatch = next;
      state.hoverPatch = null;
      state.keyboardFocus = true;
      announce();
      requestDraw();
    });
    canvas.addEventListener('blur', () => { state.keyboardFocus = false; requestDraw(); });
    levelButtons.forEach(button => button.addEventListener('click', () => {
      state.level = Number(button.dataset.level);
      state.selectedPatch = state.focusPatch;
      state.hoverPatch = null;
      state.keyboardFocus = false;
      announce();
      update();
    }));
    groupSelect.addEventListener('change', () => {
      const selected = Number(groupSelect.value);
      const labels = frame().groups;
      state.focusPatch = labels[state.focusPatch] === selected ? state.focusPatch : labels.indexOf(selected);
      state.selectedPatch = state.focusPatch;
      state.hoverPatch = null;
      state.keyboardFocus = false;
      announce();
      requestDraw();
    });
    timeButtons.forEach(button => button.addEventListener('click', () => {
      state.time = Number(button.dataset.timeIndex);
      state.selectedPatch = state.focusPatch;
      state.hoverPatch = null;
      state.keyboardFocus = false;
      announce();
      update();
    }));
    exampleButtons.forEach(button => button.addEventListener('click', () => {
      state.example = Number(button.dataset.example);
      announce();
      resetDefault();
    }));
    show.addEventListener('change', () => { state.boundaries = show.checked; requestDraw(); });
    resetDefault();
  }

  mount().catch(error => {
    root.dataset.ready = 'error';
    root.innerHTML = '<p class="groups-error" role="status">The image groups could not load. Please reload the page.</p>';
    console.error('HiT ImageNet groups:', error);
  });
})();
