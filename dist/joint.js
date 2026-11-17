/* HiT joint viewer. One saved HiT-B/16 run supplies the hard groups and the routing weights. */
(() => {
  'use strict';
  const scriptURL = document.currentScript.src;
  const assetURL = name => {
    const url = new URL(`assets/joint/${name}`, scriptURL);
    url.search = new URL(scriptURL).search;
    return url.href;
  };
  const mount = document.getElementById('joint-viewer');
  if (!mount) return;
  const query = selector => mount.querySelector(selector);
  const all = selector => mount.querySelectorAll(selector);
  const state = {example: 0, time: 1, level: 1, direction: 'groups', token: 0, patch: 0, hoverPatch: null};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const percent = v => `${(v * 100).toFixed(v >= .01 ? 2 : 3)}%`;
  const mix = (rgb, v) => `rgb(${rgb.map(c => Math.round(255 + (c - 255) * clamp(v, 0, 1))).join(',')})`;
  const weightColor = v => mix([98, 137, 173], Math.sqrt(clamp(v, 0, 1)));
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : word.endsWith('patch') ? 'es' : 's'}`;
  // The canvas uses 512 units on each side. One image patch is one cell.
  let data, gallery, grid = 32, patches = 1024, cell = 16;
  let active, activeFrame, activeImage, loading = false, tokenButtons = [], focusBeforeLoad = null, previousView = '', pendingHover = 0;
  const exampleCache = new Map(), imageCache = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  mount.classList.add('joint-viewer');
  mount.dataset.jointReady = 'loading';
  mount.innerHTML = `
    <p class="joint-loading" role="status">Loading the saved connections…</p>
    <div class="joint-content" hidden>
      <div class="joint-gallery-heading"><h3 class="joint-example-title"></h3><aside class="joint-gallery-help ui-hint ui-hint-compact" aria-label="Gallery tip"><svg class="ui-hint-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v14H4zM4 15l5-5 5 5 3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="16" cy="9" r="1" fill="currentColor"/></svg><p>Choose an image.</p></aside></div>
      <div class="joint-thumbnails" role="group" aria-label="Choose an example"></div>
      <div class="joint-toolbar">
        <label class="joint-time-control">Input time <select id="joint-time" aria-label="Choose saved input time t"></select></label>
        <div class="joint-tools">
          <div class="joint-segment" role="group" aria-label="Hierarchy level">
            <button type="button" data-joint-level="0" aria-pressed="false">Level 1</button>
            <button type="button" data-joint-level="1" aria-pressed="true">Level 2</button>
          </div>
          <button type="button" id="joint-reset" class="joint-reset">Reset view</button>
        </div>
      </div>
      <div id="joint-caption-panel">
        <div class="joint-caption-header">
          <div class="joint-caption-copy">
            <div class="joint-caption" role="group" aria-label="Caption tokens"></div>
            <aside class="joint-hint ui-hint" aria-label="Interaction tip">
              <svg class="ui-hint-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 3 12 9-6 1.5L9 20 6 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
              <p id="joint-patch-help">Move over or tap an image region or a caption word.<span class="ui-sr-only"> Use arrow keys to move between patches. Press Escape to clear.</span></p>
            </aside>
          </div>
          <a class="joint-follow" target="_blank" rel="noopener noreferrer" hidden>
            <span class="joint-follow-label"></span><img src="${new URL('assets/x-logo.svg', scriptURL).href}" alt="" aria-hidden="true" width="18" height="18">
          </a>
        </div>
        <div class="joint-visualization">
          <div class="joint-views">
            <figure class="joint-figure"><figcaption id="joint-image-title">Clean input · t = 1</figcaption><canvas id="joint-canvas" width="1024" height="1024" tabindex="0" role="img" aria-describedby="joint-patch-help"></canvas></figure>
            <figure class="joint-figure"><figcaption id="joint-map-title"></figcaption><canvas id="joint-map" width="1024" height="1024" tabindex="0" role="img" aria-describedby="joint-patch-help"></canvas></figure>
          </div>
          <div class="joint-statusbar">
            <p class="joint-selection"></p>
            <div class="joint-legend" aria-label="Map legend">
              <span class="joint-weight-legend"><span class="joint-legend-ramp" aria-hidden="true"></span><span>Word connection</span></span>
              <span class="joint-group-legend"><span class="joint-hard-key" aria-hidden="true"></span><span>Group</span></span>
              <span class="joint-target-legend"><span class="joint-target-key" aria-hidden="true"></span><span>Patch</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <span class="joint-sr-only" id="joint-announcement" role="status" aria-live="polite"></span>`;

  const level = () => activeFrame.levels[state.level];
  const focusedPatch = () => state.direction === 'reverse' ? state.patch : state.hoverPatch;
  const isReverse = () => state.direction === 'reverse';
  const groupSize = (l, group) => l.imageSizes.get(group) || 0;
  function forwardIndex(l, token) {return l.forwardGroups.indexOf(l.tokenGroups[token]);}
  function forwardValues(l, token) {
    const index = forwardIndex(l, token);
    return l.forward.subarray(index * patches, (index + 1) * patches);
  }
  function reverseValues(l, patch) {
    const count = active.tokens.length;
    return l.reverse.subarray(patch * count, (patch + 1) * count);
  }
  function scaleMaximum() {
    let maximum = 1e-30;
    const include = values => {for (const value of values) maximum = Math.max(maximum, value);};
    include(isReverse() ? reverseValues(level(), state.patch) : forwardValues(level(), state.token));
    return maximum;
  }
  function announce() {
    query('#joint-announcement').textContent = `${active.caption} Level ${state.level + 1}. ${isReverse() ? `Caption connections for patch ${state.patch}.` : state.direction === 'groups' ? 'Hard image groups.' : `Image connections for ${active.tokens[state.token].text}.`}`;
  }
  function tokenDescription(index) {
    const l = level(), token = active.tokens[index];
    const boundary = token.special === 'end' ? 'Caption end.' : token.special === 'space' ? 'Word-start token.' : token.wordStart ? 'Starts a word.' : 'Continues the preceding word.';
    return `Token ${token.position}: ${token.text}. Group ${l.tokenGroups[index]}. ${boundary}${isReverse() ? ` ${percent(reverseValues(l, state.patch)[index])} routing weight.` : ''}`;
  }
  function buildTokens() {
    const caption = query('.joint-caption');
    if (caption.dataset.example === active.id) return;
    caption.replaceChildren(); tokenButtons = [];
    let word;
    active.tokens.forEach((token, index) => {
      if (!word || token.wordStart || token.special === 'end') {
        word = document.createElement('span'); word.className = 'joint-token-run'; caption.appendChild(word);
      }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'joint-token'; button.textContent = token.text;
      button.dataset.jointToken = String(index); button.dataset.jointPosition = String(token.position); button.dataset.jointRaw = token.raw; button.dataset.jointWordStart = String(token.wordStart);
      const selectToken = (animate = false) => {
        if (loading) return;
        cancelAnimationFrame(pendingHover); pendingHover = 0;
        const changed = state.token !== index || state.direction !== 'forward';
        state.token = index; active.selectedToken = index;
        state.direction = 'forward'; state.hoverPatch = null;
        if (changed) render(animate);
      };
      button.addEventListener('click', () => {selectToken(); announce();});
      button.addEventListener('pointerenter', event => {if (event.pointerType !== 'touch') selectToken();});
      button.addEventListener('focus', () => selectToken());
      word.appendChild(button); tokenButtons.push(button);
    });
    caption.dataset.example = active.id; caption.setAttribute('aria-label', `Caption tokens: ${active.caption}`);
  }
  function boundaryPath(ctx, labels, selectedGroup = null) {
    const last = grid - 1;
    ctx.beginPath();
    labels.forEach((g, p) => {
      if (selectedGroup !== null && g !== selectedGroup) return;
      const col = p % grid, row = Math.floor(p / grid), x = col * cell, y = row * cell;
      if (row === 0 || labels[p - grid] !== g) {ctx.moveTo(x, y); ctx.lineTo(x + cell, y);}
      if (col === 0 || labels[p - 1] !== g) {ctx.moveTo(x, y); ctx.lineTo(x, y + cell);}
      if ((selectedGroup !== null || col === last) && (col === last || labels[p + 1] !== g)) {ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell);}
      if ((selectedGroup !== null || row === last) && (row === last || labels[p + grid] !== g)) {ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell);}
    });
  }
  function drawViews() {
    if (!activeImage) return;
    const l = level(), p = focusedPatch(), maximum = scaleMaximum(), forward = state.direction === 'forward';
    const values = forwardValues(l, state.token);
    const colors = window.HiTFigureStyle.groupColors(l.imageLabels, grid);
    // Line widths follow the patch size. Thin lines keep small groups clear.
    const line = cell / 32;
    [query('#joint-canvas'), query('#joint-map')].forEach((canvas, index) => {
      const ctx = canvas.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, 512, 512);
      if (index === 0) ctx.drawImage(activeImage, 0, 0, 512, 512);
      else for (let patch = 0; patch < patches; patch++) {
        ctx.fillStyle = forward ? weightColor(values[patch] / maximum) : colors.get(l.imageLabels[patch]);
        ctx.fillRect(patch % grid * cell, Math.floor(patch / grid) * cell, cell, cell);
      }
      if (p !== null && !forward) {
        const selectedGroup = l.imageLabels[p];
        // Fill every patch in the group, including separate regions.
        l.imageLabels.forEach((group, patch) => {
          const selected = group === selectedGroup;
          if (index === 1 && !selected) return;
          ctx.fillStyle = selected ? '#e8a446' : '#ffffff';
          ctx.globalAlpha = index === 0 ? (selected ? .08 : .22) : 1;
          ctx.fillRect(patch % grid * cell, Math.floor(patch / grid) * cell, cell, cell);
        });
        ctx.globalAlpha = 1;
      }
      boundaryPath(ctx, l.imageLabels); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = index === 0 ? .4 : .12; ctx.strokeStyle = '#000000'; ctx.lineWidth = (index === 0 ? 4.4 : 3.8) * line; ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = (index === 0 ? 2.4 : 2) * line; ctx.stroke();
      if (p !== null) {
        if (!forward) {
          boundaryPath(ctx, l.imageLabels, l.imageLabels[p]); ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.6; ctx.stroke(); ctx.strokeStyle = '#e8a446'; ctx.lineWidth = 2.4; ctx.stroke();
        }
        const x = p % grid * cell, y = Math.floor(p / grid) * cell, inset = 1, side = cell - 2 * inset;
        ctx.fillStyle = '#489750'; ctx.globalAlpha = .30; ctx.fillRect(x + inset, y + inset, side, side); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.2; ctx.strokeRect(x + inset, y + inset, side, side); ctx.strokeStyle = '#489750'; ctx.lineWidth = 2.2; ctx.strokeRect(x + inset, y + inset, side, side);
      }
      canvas.setAttribute('aria-label', `${index === 0 ? active.caption + ` ${inputLabel()} with hard group boundaries.` : forward ? `Image weights for ${active.tokens[state.token].text}.` : 'Hard image groups.'} Level ${state.level + 1}.${p !== null ? ` Selected patch ${p}, group ${l.imageLabels[p]}.` : ''}`);
    });
    mount.dataset.jointPinnedPatch = ''; // Pointer movement never locks selection.
    mount.dataset.jointHoverPatch = state.hoverPatch === null ? '' : String(state.hoverPatch);
  }
  function render(animate = true) {
    const l = level(), token = active.tokens[state.token], reverse = isReverse(), forward = state.direction === 'forward', maximum = scaleMaximum();
    Object.assign(mount.dataset, {jointExample: active.id, jointTime: String(state.time), jointInput: activeFrame.input || active.image, jointDirection: state.direction, jointLevel: String(state.level + 1), jointPatch: String(state.patch), jointQuery: token.text, jointToken: String(token.position), jointGroup: String(reverse ? l.imageLabels[state.patch] : l.tokenGroups[state.token]), jointScaleMax: String(maximum), jointScaleType: 'raw'});
    query('#joint-time').value = String(state.time);
    all('[data-joint-level]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.jointLevel) === state.level)));
    all('[data-joint-example]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.jointExample) === state.example)));
    query('.joint-example-title').textContent = gallery[state.example].name;
    buildTokens();
    const weights = reverseValues(l, state.patch);
    tokenButtons.forEach((b, i) => {
      const selected = forward && i === state.token;
      b.setAttribute('aria-pressed', String(selected)); b.style.backgroundColor = selected ? mix([72, 151, 80], .15) : reverse ? weightColor(weights[i] / maximum) : '#ffffff';
      b.style.borderColor = selected ? '#489750' : reverse && l.tokenGroups[i] === l.imageLabels[state.patch] ? '#e8a446' : 'rgba(0,0,0,.16)';
      b.dataset.jointGroup = String(l.tokenGroups[i]); b.dataset.jointWeight = String(reverse ? weights[i] : 0); b.dataset.jointRelativeWeight = String(reverse ? weights[i] / maximum : 0);
      b.setAttribute('aria-label', `${tokenDescription(i)} Select to see its image connections.`);
    });
    const selectedGroup = l.imageLabels[state.patch];
    query('#joint-image-title').textContent = inputLabel();
    query('#joint-map-title').textContent = forward ? `Image inputs for “${token.text}”` : 'Hard groups';
    query('.joint-selection').textContent = forward ? `“${token.text}” → image` : reverse ? `Group ${selectedGroup} · ${plural(groupSize(l, selectedGroup), 'image patch')}` : `${l.imageGroupCount} image groups`;
    query('.joint-weight-legend').hidden = state.direction === 'groups';
    query('.joint-group-legend').hidden = forward;
    query('.joint-target-legend').hidden = !reverse;
    query('.joint-weight-legend').lastElementChild.textContent = reverse ? 'Word connection' : 'Image connection';
    query('.joint-legend-ramp').style.background = `linear-gradient(90deg,${Array.from({length: 17}, (_, i) => `${weightColor(i / 16)} ${i / 16 * 100}%`).join(',')})`;
    drawViews();
    const viewKey = [state.example, state.time, state.level, state.direction, state.token].join(':');
    if (animate && previousView && previousView !== viewKey && !reducedMotion.matches) all('canvas').forEach(canvas => {canvas.getAnimations?.().forEach(a => a.cancel()); canvas.animate?.([{opacity: .75}, {opacity: 1}], {duration: 150, easing: 'ease-out'});});
    previousView = viewKey;
  }
  function setBusy(busy) {
    if (busy) {cancelAnimationFrame(pendingHover); pendingHover = 0; focusBeforeLoad = mount.contains(document.activeElement) ? document.activeElement : null;}
    loading = busy; mount.setAttribute('aria-busy', String(busy));
    all('button,select').forEach(control => {control.disabled = busy || (!active && !control.hasAttribute('data-joint-example'));});
    query('.joint-loading').hidden = !busy;
    if (busy) {query('.joint-loading').setAttribute('role', 'status'); query('.joint-loading').textContent = 'Loading the saved connections…';}
    else {const control = focusBeforeLoad; focusBeforeLoad = null; if (control?.isConnected && !control.disabled && (document.activeElement === document.body || document.activeElement === control)) control.focus({preventScroll: true});}
  }
  function showError(error) {
    setBusy(false); mount.dataset.jointReady = active ? 'true' : 'error';
    const message = query('.joint-loading'); message.hidden = false; message.setAttribute('role', 'alert'); message.textContent = active ? error.message : `${error.message} Reload the page to try again.`;
    if (active) render();
  }
  function prepareExample(e, entry) {
    if (e.schema !== 4 || e.id !== entry.id || e.grid !== grid || e.tokens.at(-1).raw !== '</s>' || e.frames.length !== data.times.length) throw new Error('The saved example does not match this viewer.');
    e.frames.forEach((f, i) => {
      if (f.time !== data.times[i] || f.levels.length !== 2 || (f.time !== 1 && !f.input)) throw new Error('A saved time or level is missing.');
      f.levels.forEach(l => {
        if (l.imageLabels.length !== patches || l.tokenGroups.length !== e.tokens.length || l.tokenGroups.some(g => !l.forwardGroups.includes(g)) || l.forwardImageShare.length !== l.forwardGroups.length) throw new Error('A saved group array is incomplete.');
        l.imageSizes = new Map();
        l.imageLabels.forEach(g => l.imageSizes.set(g, (l.imageSizes.get(g) || 0) + 1));
      });
    });
    e.image = entry.image; e.selectedToken = e.defaultToken;
    return e;
  }
  async function loadFrame(e, time) {
    const frame = e.frames.find(f => f.time === time);
    if (!frame) throw new Error('The saved input time is missing.');
    if (!frame.ready) {
      const response = await fetch(assetURL(`hit/${frame.weights}`)); if (!response.ok) throw new Error('The saved weights could not be loaded.');
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== frame.weightsBytes) throw new Error('A saved weight file is incomplete.');
      // The files hold little-endian float32 values: token groups × patches, then patches × tokens.
      frame.levels.forEach(l => {
        l.forward = new Float32Array(buffer, l.forwardOffset, l.forwardGroups.length * patches);
        l.reverse = new Float32Array(buffer, l.reverseOffset, patches * e.tokens.length);
      });
      frame.ready = true;
    }
    const name = time === 1 ? e.image : `inputs/${frame.input}`;
    let image = imageCache.get(name);
    if (!image) {
      image = await new Promise((resolve, reject) => {
        const picture = new Image(); picture.onload = () => resolve(picture);
        picture.onerror = () => reject(new Error('The input image could not be loaded.'));
        picture.src = assetURL(name);
      });
      imageCache.set(name, image);
    }
    return {frame, image};
  }
  function buildTimeControl() {
    const times = query('#joint-time'); times.replaceChildren();
    data.times.forEach(time => {const option = document.createElement('option'); option.value = String(time); option.textContent = time === 1 ? 't = 1 · clean' : `t = ${time}`; times.appendChild(option);});
  }
  function updateFollow(entry) {
    const follow = query('.joint-follow');
    follow.hidden = !entry.xProfile;
    if (entry.xProfile) {
      follow.href = entry.xProfile;
      follow.setAttribute('aria-label', `Follow ${entry.name} on X (opens in a new tab)`);
      query('.joint-follow-label').textContent = `Follow ${entry.name} on`;
    } else {
      follow.removeAttribute('href');
      follow.removeAttribute('aria-label');
    }
  }
  function buildGallery() {
    const thumbs = query('.joint-thumbnails'); thumbs.replaceChildren();
    gallery.forEach((entry, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'joint-example'; button.dataset.jointExample = String(index); button.setAttribute('aria-label', `Show ${entry.name}. ${entry.caption}`);
      const image = document.createElement('img'); image.src = assetURL(entry.thumbnail); image.alt = ''; image.width = 64; image.height = 64; image.loading = 'lazy';
      const label = document.createElement('span'); label.textContent = entry.name; button.append(image, label); thumbs.appendChild(button);
      button.addEventListener('click', () => chooseExample(index).catch(showError));
      button.addEventListener('focus', () => button.scrollIntoView?.({block: 'nearest', inline: 'nearest', behavior: 'instant'}));
    });
  }
  function inputLabel() {
    return `${state.time === 1 ? 'Clean input' : 'Noisy input'} · t = ${state.time}`;
  }
  async function chooseExample(index, time, reset = false) {
    if (loading) return;
    setBusy(true);
    const entry = gallery[index];
    const requestedTime = time ?? entry.defaultTime ?? (reset || !active ? data.defaultTime : state.time);
    const selectedTime = data.times.includes(requestedTime) ? requestedTime : data.defaultTime;
    let saved = exampleCache.get(entry.id);
    if (!saved) {
      const response = await fetch(assetURL(entry.data)); if (!response.ok) throw new Error('The saved example could not be loaded.');
      saved = prepareExample(await response.json(), entry); exampleCache.set(entry.id, saved);
    }
    const {frame, image} = await loadFrame(saved, selectedTime);
    // Change the image and its routing frame together after the image loads.
    active = saved; activeFrame = frame; activeImage = image;
    state.example = index; state.time = selectedTime;
    if (reset) {state.level = 1; saved.selectedToken = saved.defaultToken;}
    state.token = saved.selectedToken; state.patch = saved.defaultPatch; state.hoverPatch = null; state.direction = 'groups';
    updateFollow(entry);
    query('.joint-content').hidden = false; render(); setBusy(false); mount.dataset.jointReady = 'true'; announce();
  }
  async function chooseTime(time) {
    if (loading || !active) return;
    setBusy(true);
    const {frame, image} = await loadFrame(active, time);
    activeFrame = frame; activeImage = image; state.time = time; state.hoverPatch = null;
    render(); setBusy(false); announce();
  }
  function clearSelection() {
    cancelAnimationFrame(pendingHover); pendingHover = 0;
    state.hoverPatch = null; state.direction = 'groups'; render(false); announce();
  }
  function choosePatch(p, announceChange = true) {
    if (loading || !active) return;
    cancelAnimationFrame(pendingHover); pendingHover = 0;
    state.patch = p; state.hoverPatch = null; state.direction = 'reverse'; render(false);
    if (announceChange) announce();
  }
  function hoverPatch(p) {
    if (state.hoverPatch === p && state.patch === p && isReverse()) return;
    state.hoverPatch = p;
    if (pendingHover) return;
    pendingHover = requestAnimationFrame(() => {
      pendingHover = 0;
      if (loading || state.hoverPatch === null) return;
      state.patch = state.hoverPatch; state.direction = 'reverse'; render(false);
    });
  }
  async function load() {
    const response = await fetch(assetURL('data.json')); if (!response.ok) throw new Error('The saved connections could not be loaded.'); data = await response.json();
    if (data.schema !== 4 || !Number.isInteger(data.grid) || !Array.isArray(data.times) || !data.times.includes(data.defaultTime) || !Array.isArray(data.examples) || data.examples.length < 1) throw new Error('The example catalog does not match this viewer.');
    grid = data.grid; patches = grid * grid; cell = 512 / grid; gallery = data.examples;
    buildGallery(); buildTimeControl();
    query('#joint-time').addEventListener('change', () => chooseTime(Number(query('#joint-time').value)).catch(showError));
    all('[data-joint-level]').forEach(b => b.addEventListener('click', () => {if (loading || !active) return; state.level = Number(b.dataset.jointLevel); state.hoverPatch = null; render(); announce();}));
    query('#joint-reset').addEventListener('click', () => chooseExample(state.example, undefined, true).catch(showError));
    all('canvas').forEach(canvas => {
      const patchAt = event => {const r = canvas.getBoundingClientRect(); return clamp(Math.floor((event.clientY - r.top) / r.height * grid), 0, grid - 1) * grid + clamp(Math.floor((event.clientX - r.left) / r.width * grid), 0, grid - 1);};
      canvas.addEventListener('pointermove', event => {if (loading || !active || event.pointerType === 'touch') return; hoverPatch(patchAt(event));});
      canvas.addEventListener('pointerleave', () => {if (!active || loading) return; cancelAnimationFrame(pendingHover); pendingHover = 0; state.hoverPatch = null; drawViews();});
      canvas.addEventListener('click', event => choosePatch(patchAt(event)));
      canvas.addEventListener('keydown', event => {
        if (loading || !active) return;
        let p = focusedPatch() ?? state.patch, row = Math.floor(p / grid), col = p % grid;
        if (event.key === 'ArrowLeft') col--; else if (event.key === 'ArrowRight') col++; else if (event.key === 'ArrowUp') row--; else if (event.key === 'ArrowDown') row++; else if (event.key === 'Home') {row = 0; col = 0;} else if (event.key === 'End') {row = grid - 1; col = grid - 1;} else if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); choosePatch(p); return;} else return;
        event.preventDefault(); choosePatch(clamp(row, 0, grid - 1) * grid + clamp(col, 0, grid - 1));
      });
    });
    mount.addEventListener('keydown', event => {if (event.key === 'Escape' && active && !loading) {event.preventDefault(); clearSelection();}});
    await chooseExample(0);
    window.HiTJointViewer = Object.freeze({getState: () => ({...state, exampleId: active.id, tokenPosition: active.tokens[state.token].position})});
  }
  load().catch(showError);
})();
