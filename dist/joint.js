/* HiT paired joint viewer. Keep saved routing weights and hard groups separate. */
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
  const state = {source: 2, example: 0, caption: 0, time: .7, level: 1, direction: 'groups', token: 5, patch: 136, pinnedPatch: null, hoverPatch: null};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const percent = v => `${(v * 100).toFixed(v >= .01 ? 2 : 3)}%`;
  const mix = (rgb, v) => `rgb(${rgb.map(c => Math.round(255 + (c - 255) * clamp(v, 0, 1))).join(',')})`;
  const weightColor = v => mix([98, 137, 173], Math.sqrt(clamp(v, 0, 1)));
  const groupColor = g => mix([232, 164, 70], .16 + (g % 6) * .10);
  const sum = values => values.reduce((a, b) => a + b, 0);
  const decodeBytes = encoded => Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  function decodeFloats(encoded) {
    const bytes = decodeBytes(encoded), view = new DataView(bytes.buffer);
    return Float32Array.from({length: bytes.length / 4}, (_, i) => view.getFloat32(i * 4, true));
  }
  let data, inputCatalog, gallery, activeFamily, activeImage, activeInput, loading = false, tokenButtons = [], focusBeforeLoad = null, previousView = '', pendingHover = 0;
  const exampleCache = new Map(), imageCache = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  mount.classList.add('joint-viewer');
  mount.dataset.jointReady = 'loading';
  mount.innerHTML = `
    <p class="joint-loading" role="status">Loading the saved connections…</p>
    <div class="joint-content" hidden>
      <div class="joint-gallery-heading"><h3 class="joint-example-title"></h3><p class="joint-gallery-help">Choose an image.</p></div>
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
            <p class="joint-hint">Move over an image region or a caption word.</p>
          </div>
          <a class="joint-follow" target="_blank" rel="noopener noreferrer" hidden>
            <span class="joint-follow-label"></span><img src="${new URL('assets/x-logo.svg', scriptURL).href}" alt="" aria-hidden="true" width="18" height="18">
          </a>
        </div>
        <div class="joint-views">
          <figure class="joint-figure"><figcaption id="joint-image-title">Noisy input · t = 0.7</figcaption><canvas id="joint-canvas" width="1024" height="1024" tabindex="0" role="img" aria-describedby="joint-patch-help"></canvas></figure>
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
      <details class="joint-details">
        <summary>Details</summary>
        <div class="joint-detail-grid">
          <p class="joint-inspection"></p><p class="joint-mass"></p>
          <p class="joint-scale-range"></p><p class="joint-scale-note"></p>
          <p class="joint-science-note"></p>
          <p class="joint-patch-help" id="joint-patch-help">Move over either image to show its group and word connections. On a touch screen, tap a region. Use arrow keys to move. Press Escape to clear.</p>
          <p class="joint-token-note"></p>
          <div class="joint-run-data"></div>
        </div>
      </details>
    </div>
    <span class="joint-sr-only" id="joint-announcement" role="status" aria-live="polite"></span>`;

  const example = () => activeFamily.variants[state.caption];
  const frameFor = e => e.frames.find(f => f.time === state.time);
  const levelFor = e => frameFor(e).levels[state.level];
  const focusedPatch = () => state.direction === 'reverse' ? state.patch : state.hoverPatch;
  const isLocal = () => Boolean(activeFamily.local);
  const isReverse = () => state.direction === 'reverse';
  function forwardValues(e, l, token) {
    return l.forwardImage ? l.forwardImage[token] : l.imageHeat.subarray(l.tokenGroups[token] * 256, (l.tokenGroups[token] + 1) * 256);
  }
  function reverseValues(e, l, patch) {
    return l.reverseCaption ? l.reverseCaption[patch] : l.patchCaption.subarray(patch * e.tokens.length, (patch + 1) * e.tokens.length);
  }
  function scaleMaximum() {
    if (!isReverse() && !isLocal()) return 255;
    let maximum = 1e-30;
    const include = values => {for (const value of values) maximum = Math.max(maximum, value);};
    if (isLocal()) {
      activeFamily.variants.forEach((e, i) => include(isReverse() ? reverseValues(e, levelFor(e), state.patch) : forwardValues(e, levelFor(e), activeFamily.selectedTokens[i])));
    } else frameFor(example()).levels.forEach(l => include(reverseValues(example(), l, state.patch)));
    return maximum;
  }
  function announce() {
    query('#joint-announcement').textContent = `${example().caption} Level ${state.level + 1}. ${isReverse() ? `Caption connections for patch ${state.patch}.` : state.direction === 'groups' ? 'Hard image groups.' : `Image connections for ${example().tokens[state.token].text}.`}`;
  }
  function tokenDescription(index) {
    const e = example(), l = levelFor(e), token = e.tokens[index];
    const boundary = token.special === 'end' ? 'Caption end.' : token.special === 'space' ? 'Word-start token.' : token.wordStart ? 'Starts a word.' : 'Continues the preceding word.';
    return `Token ${token.position}: ${token.text}. Group ${l.tokenGroups[index]}. ${boundary}${isReverse() ? ` ${percent(reverseValues(e, l, state.patch)[index])} routing weight.` : ''}`;
  }
  function resetTokenDetail() {
    query('.joint-token-note').textContent = isReverse() ? 'Token colors show the selected patch’s caption connections. End marks the caption end.' : 'Select a token to see its image connections. End marks the caption end.';
  }
  function buildTokens() {
    const e = example(), caption = query('.joint-caption'), key = `${e.source}:${e.id}`;
    if (caption.dataset.example === key) return;
    caption.replaceChildren(); tokenButtons = [];
    let word;
    e.tokens.forEach((token, index) => {
      if (!word || token.wordStart || token.special === 'end') {
        word = document.createElement('span'); word.className = 'joint-token-run'; caption.appendChild(word);
      }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'joint-token'; button.textContent = token.text;
      button.dataset.jointToken = String(index); button.dataset.jointPosition = String(token.position); button.dataset.jointRaw = token.raw; button.dataset.jointWordStart = String(token.wordStart);
      const selectToken = (animate = false) => {
        if (loading) return;
        cancelAnimationFrame(pendingHover); pendingHover = 0;
        const changed = state.token !== index || state.direction !== 'forward';
        state.token = index; activeFamily.selectedTokens[state.caption] = index;
        state.direction = 'forward'; state.pinnedPatch = null; state.hoverPatch = null;
        if (changed) render(animate);
        query('.joint-token-note').textContent = tokenDescription(index);
      };
      button.addEventListener('click', () => {selectToken(); announce();});
      button.addEventListener('pointerenter', event => {if (event.pointerType !== 'touch') selectToken();});
      button.addEventListener('focus', () => selectToken());
      button.addEventListener('blur', resetTokenDetail);
      word.appendChild(button); tokenButtons.push(button);
    });
    caption.dataset.example = key; caption.setAttribute('aria-label', `Caption tokens: ${e.caption}`);
  }
  function boundaryPath(ctx, labels, selectedGroup = null) {
    ctx.beginPath();
    labels.forEach((g, p) => {
      if (selectedGroup !== null && g !== selectedGroup) return;
      const col = p % 16, row = Math.floor(p / 16), x = col * 32, y = row * 32;
      if (row === 0 || labels[p - 16] !== g) {ctx.moveTo(x, y); ctx.lineTo(x + 32, y);}
      if (col === 0 || labels[p - 1] !== g) {ctx.moveTo(x, y); ctx.lineTo(x, y + 32);}
      if ((selectedGroup !== null || col === 15) && (col === 15 || labels[p + 1] !== g)) {ctx.moveTo(x + 32, y); ctx.lineTo(x + 32, y + 32);}
      if ((selectedGroup !== null || row === 15) && (row === 15 || labels[p + 16] !== g)) {ctx.moveTo(x, y + 32); ctx.lineTo(x + 32, y + 32);}
    });
  }
  function drawViews() {
    if (!activeImage) return;
    const e = example(), l = levelFor(e), p = focusedPatch(), maximum = scaleMaximum(), forward = state.direction === 'forward';
    const values = forwardValues(e, l, state.token);
    [query('#joint-canvas'), query('#joint-map')].forEach((canvas, index) => {
      const ctx = canvas.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, 512, 512);
      if (index === 0) ctx.drawImage(activeImage, 0, 0, 512, 512);
      else for (let patch = 0; patch < 256; patch++) {
        ctx.fillStyle = forward ? weightColor(values[patch] / maximum) : groupColor(l.imageLabels[patch]);
        ctx.fillRect(patch % 16 * 32, Math.floor(patch / 16) * 32, 32, 32);
      }
      if (p !== null && !forward) {
        const selectedGroup = l.imageLabels[p];
        // Fill every patch in the group, including separate regions.
        l.imageLabels.forEach((group, patch) => {
          const selected = group === selectedGroup;
          ctx.fillStyle = selected ? '#e8a446' : '#ffffff';
          ctx.globalAlpha = selected ? (index === 0 ? .28 : .72) : (index === 0 ? .62 : .42);
          ctx.fillRect(patch % 16 * 32, Math.floor(patch / 16) * 32, 32, 32);
        });
        ctx.globalAlpha = 1;
      }
      boundaryPath(ctx, l.imageLabels); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (index === 0) {ctx.globalAlpha = .2; ctx.strokeStyle = '#000000'; ctx.lineWidth = 2.5; ctx.stroke();}
      ctx.globalAlpha = .92; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = index === 0 ? 1.15 : 1.3; ctx.stroke(); ctx.globalAlpha = 1;
      if (p !== null) {
        if (!forward) {
          const group = l.imageLabels[p];
          boundaryPath(ctx, l.imageLabels, group); ctx.globalAlpha = 1; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4.5; ctx.stroke(); ctx.strokeStyle = '#e8a446'; ctx.lineWidth = 2.4; ctx.stroke();
        }
        const x = p % 16 * 32, y = Math.floor(p / 16) * 32; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.strokeRect(x + 2, y + 2, 28, 28); ctx.strokeStyle = '#489750'; ctx.lineWidth = 2.6; ctx.strokeRect(x + 2, y + 2, 28, 28);
      }
      canvas.setAttribute('aria-label', `${index === 0 ? e.caption + ` ${inputLabel()} with hard group boundaries.` : forward ? `Image weights for ${e.tokens[state.token].text}.` : 'Hard image groups.'} Level ${state.level + 1}.${p !== null ? ` Selected patch ${p}, group ${l.imageLabels[p]}.` : ''}`);
    });
    mount.dataset.jointPinnedPatch = ''; // Pointer movement never locks selection.
    mount.dataset.jointHoverPatch = state.hoverPatch === null ? '' : String(state.hoverPatch);
    query('.joint-inspection').textContent = p === null ? (forward ? 'The right image shows soft image connections.' : 'Hover a region to inspect its group.') : forward ? `Patch ${p} · Group ${l.imageLabels[p]} · ${isLocal() ? percent(values[p]) + ' routing weight' : (values[p] / 255 * 100).toFixed(1) + '% of this group’s peak'}` : `Patch ${p} · Group ${l.imageLabels[p]} · ${l.imageLabels.filter(g => g === l.imageLabels[p]).length} image ${l.imageLabels.filter(g => g === l.imageLabels[p]).length === 1 ? 'patch' : 'patches'}`;
  }
  function renderDetails() {
    const source = data.sources[state.source], box = query('.joint-run-data'); box.replaceChildren();
    const lines = isLocal() ? [
      'Local caption study: Apple M3 GPU blocks with CPU routing. This is a separate run from the production GPU gallery.',
      `Precision: ${activeFamily.model.dtype}. Routing: ${activeFamily.model.routing}.`,
      `The caption uses the saved image and fixed noise. Noise seed: ${activeFamily.noise.seed}.`,
      'Group IDs apply only to the selected caption, time, and level.'
    ] : [source.id === 'paper' ? 'Paper reference: CPU routing.' : 'Gallery: production GPU routing.', 'The forward maps are saved as relative values within each group. Reverse token weights keep their saved float32 values.'];
    lines.push('40,000 updates · EMA 0.9995 · 16 × 16 image patches.', 'These maps show routing weights, not attention maps or object masks. A token can have soft image connections with no image patches in its hard group.', 'Token pieces keep their original groups. End and separate word-start tokens are included.', `Checkpoint SHA-256: ${data.checkpointSha256}`);
    lines.forEach(text => {const p = document.createElement('p'); p.textContent = text; box.appendChild(p);});
  }
  function render(animate = true) {
    const e = example(), l = levelFor(e), token = e.tokens[state.token], reverse = isReverse(), forward = state.direction === 'forward', maximum = scaleMaximum();
    Object.assign(mount.dataset, {jointExample: e.id, jointSource: data.sources[state.source].id, jointTime: String(state.time), jointInput: activeInput.image, jointInputStatus: activeInput.status, jointDirection: state.direction, jointLevel: String(state.level + 1), jointPatch: String(state.patch), jointQuery: token.text, jointToken: String(token.position), jointGroup: String(reverse ? l.imageLabels[state.patch] : l.tokenGroups[state.token]), jointScaleMax: String(maximum), jointScaleType: !reverse && !isLocal() ? 'relative' : 'raw'});
    query('#joint-time').value = String(state.time);
    all('[data-joint-level]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.jointLevel) === state.level)));
    all('[data-joint-example]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.jointExample) === state.example)));
    query('.joint-example-title').textContent = gallery[state.example].name;
    buildTokens(); resetTokenDetail();
    const weights = reverseValues(e, l, state.patch);
    tokenButtons.forEach((b, i) => {
      const selected = forward && i === state.token;
      b.setAttribute('aria-pressed', String(selected)); b.style.backgroundColor = selected ? mix([72, 151, 80], .15) : reverse ? weightColor(weights[i] / maximum) : '#ffffff';
      b.style.borderColor = selected ? '#489750' : reverse && l.tokenGroups[i] === l.imageLabels[state.patch] ? '#e8a446' : 'rgba(0,0,0,.16)';
      b.dataset.jointGroup = String(l.tokenGroups[i]); b.dataset.jointWeight = String(reverse ? weights[i] : 0); b.dataset.jointRelativeWeight = String(reverse ? weights[i] / maximum : 0);
      b.setAttribute('aria-label', `${tokenDescription(i)} Select to see its image connections.`);
    });
    const group = l.tokenGroups[state.token], imageGroups = new Set(l.imageLabels).size;
    query('#joint-image-title').textContent = inputLabel();
    query('#joint-map-title').textContent = forward ? `Image inputs for “${token.text}”` : 'Hard groups';
    query('.joint-selection').textContent = forward ? `“${token.text}” → image` : reverse ? `Group ${l.imageLabels[state.patch]} · ${l.imageLabels.filter(g => g === l.imageLabels[state.patch]).length} image ${l.imageLabels.filter(g => g === l.imageLabels[state.patch]).length === 1 ? 'patch' : 'patches'}` : `${imageGroups} image groups`;
    query('.joint-mass').textContent = forward ? `Image share ${percent(isLocal() ? sum(forwardValues(e, l, state.token)) : l.poolMass[group][0])}` : reverse ? `Caption share ${percent(isLocal() ? sum(weights) : l.patchMass[state.patch * 3 + 1])}` : '';
    query('.joint-weight-legend').hidden = state.direction === 'groups';
    query('.joint-group-legend').hidden = forward;
    query('.joint-target-legend').hidden = !reverse;
    query('.joint-weight-legend').lastElementChild.textContent = reverse ? 'Word connection' : 'Image connection';
    query('.joint-scale-range').textContent = state.direction === 'groups' ? '' : `${reverse ? 'Caption routing weight' : isLocal() ? 'Image routing weight' : 'Relative image weight'}: 0 to ${!reverse && !isLocal() ? 'the group peak' : percent(maximum)}.`;
    query('.joint-legend-ramp').style.background = `linear-gradient(90deg,${Array.from({length: 17}, (_, i) => `${weightColor(i / 16)} ${i / 16 * 100}%`).join(',')})`;
    query('.joint-scale-note').textContent = forward ? isLocal() ? 'Square-root scale for the selected token at this time and level.' : 'Square-root scale within this group. The saved values show relative weights.' : reverse ? `Token colors show soft caption connections. One square-root scale ${isLocal() ? 'covers all tokens at this level' : 'covers both levels'}. The maps show hard groups; shades can repeat.` : 'Shades can repeat. Boundaries and the selected group show exact membership.';
    query('.joint-science-note').textContent = `${isLocal() ? 'Local caption study: M3 GPU blocks, CPU routing.' : state.source === 0 ? 'Paper reference: CPU routing.' : 'Gallery: production GPU routing.'} ${state.time === 1 ? 'The left image is the clean model input.' : activeInput.status === 'verified-input' ? 'The left image shows the noisy model input. Its tensor hash matches the saved run.' : 'The left image is a noise preview reconstructed from the saved seed and noise formula. It does not exactly match the saved input hash. The groups and word connections come from the original run.'}`;
    drawViews();
    const viewKey = [state.source, state.example, state.caption, state.time, state.level, state.direction, state.token].join(':');
    if (animate && previousView && previousView !== viewKey && !reducedMotion.matches) all('canvas').forEach(canvas => {canvas.getAnimations?.().forEach(a => a.cancel()); canvas.animate?.([{opacity: .75}, {opacity: 1}], {duration: 150, easing: 'ease-out'});});
    previousView = viewKey;
  }
  function setBusy(busy) {
    if (busy) {cancelAnimationFrame(pendingHover); pendingHover = 0; focusBeforeLoad = mount.contains(document.activeElement) ? document.activeElement : null;}
    loading = busy; mount.setAttribute('aria-busy', String(busy));
    all('button,select').forEach(control => {control.disabled = busy || (!activeFamily && !control.hasAttribute('data-joint-example'));});
    query('.joint-loading').hidden = !busy;
    if (busy) {query('.joint-loading').setAttribute('role', 'status'); query('.joint-loading').textContent = 'Loading the saved connections…';}
    else {const control = focusBeforeLoad; focusBeforeLoad = null; if (control?.isConnected && !control.disabled && (document.activeElement === document.body || document.activeElement === control)) control.focus({preventScroll: true});}
  }
  function showError(error) {
    setBusy(false); mount.dataset.jointReady = activeFamily ? 'true' : 'error';
    const message = query('.joint-loading'); message.hidden = false; message.setAttribute('role', 'alert'); message.textContent = activeFamily ? error.message : `${error.message} Reload the page to try again.`;
    if (activeFamily) render();
  }
  function prepareLegacy(e, source) {
    if (e.schema !== 3 || e.source !== source.id || e.model !== source.model || e.checkpointSha256 !== data.checkpointSha256 || e.update !== 40000 || e.tokens.at(-1).raw !== '</s>' || e.frames.length !== source.times.length) throw new Error('The saved example does not match this source.');
    e.frames.forEach((f, i) => {
      if (f.time !== source.times[i] || f.levels.length !== 2) throw new Error('A saved time or level is missing.');
      f.levels.forEach(l => {
        l.imageHeat = decodeBytes(l.imageHeat); l.patchCaption = decodeFloats(l.patchCaption); l.patchMass = decodeFloats(l.patchMass);
        if (l.imageHeat.length !== l.groupCount * 256 || l.patchCaption.length !== 256 * e.tokens.length || l.patchMass.length !== 768 || l.imageLabels.length !== 256 || l.tokenGroups.length !== e.tokens.length || l.activePositions.some((p, j) => p !== e.tokens[j].position)) throw new Error('A saved weight array is incomplete.');
      });
    });
    return {variants: [e], selectedTokens: [e.defaultToken]};
  }
  function prepareStudy(study, entry) {
    if (study.schema !== 1 || study.model.checkpointSha256 !== data.checkpointSha256 || study.model.update !== 40000 || !Array.isArray(study.captions) || study.captions.length < 1 || study.times.join(',') !== '1,0.7') throw new Error('The saved caption study is incomplete.');
    const selected = study.captions.find(c => c.caption === entry.caption);
    if (!selected) throw new Error('The saved caption is missing.');
    const variants = [{...selected, id: entry.id, source: 'caption-study', defaultPatch: entry.defaultPatch ?? 136, frames: selected.frames.map(f => ({...f, time: f.t}))}];
    variants.forEach(e => {
      if (e.tokens.at(-1).raw !== '</s>' || e.frames.length !== 2) throw new Error('Caption tokens or times are missing.');
      e.frames.forEach((f, i) => {
        if (f.time !== study.times[i] || f.levels.length !== 2) throw new Error('A saved time or level is missing.');
        f.levels.forEach(l => {if (l.imageLabels.length !== 256 || l.tokenGroups.length !== e.tokens.length || l.forwardImage.length !== e.tokens.length || l.forwardImage.some(v => v.length !== 256) || l.reverseCaption.length !== 256 || l.reverseCaption.some(v => v.length !== e.tokens.length)) throw new Error('A saved caption weight array is incomplete.');});
      });
    });
    return {local: true, variants, selectedTokens: variants.map(e => e.defaultToken), model: study.model, noise: study.noise};
  }
  function buildTimeControl() {
    const source = data.sources[state.source], times = query('#joint-time'); times.replaceChildren();
    source.times.forEach(time => {const option = document.createElement('option'); option.value = String(time); option.textContent = time === 1 ? 't = 1 · clean' : `t = ${time}`; times.appendChild(option);});
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
      const image = document.createElement('img'); image.src = assetURL(entry.image); image.alt = ''; image.width = 64; image.height = 64; image.loading = 'lazy';
      const label = document.createElement('span'); label.textContent = entry.name; button.append(image, label); thumbs.appendChild(button);
      button.addEventListener('click', () => chooseExample(index).catch(showError));
      button.addEventListener('focus', () => button.scrollIntoView?.({block: 'nearest', inline: 'nearest', behavior: 'instant'}));
    });
  }
  function inputLabel() {
    return `${state.time === 1 ? 'Clean input' : activeInput.status === 'verified-input' ? 'Noisy input' : 'Noise preview'} · t = ${state.time}`;
  }
  async function loadInput(entry, time) {
    const input = inputCatalog.examples[entry.id]?.frames[String(time)];
    if (!input) throw new Error('The input image for this time is missing.');
    let image = imageCache.get(input.image);
    if (!image) {
      image = await new Promise((resolve, reject) => {
        const picture = new Image(); picture.onload = () => resolve(picture);
        picture.onerror = () => reject(new Error('The input image could not be loaded.'));
        picture.src = assetURL(input.image);
      });
      imageCache.set(input.image, image);
    }
    return {input, image};
  }
  async function chooseExample(index, time, reset = false) {
    if (loading) return;
    setBusy(true);
    const entry = gallery[index], sourceIndex = entry.sourceIndex, source = data.sources[sourceIndex];
    const requestedTime = time ?? entry.defaultTime ?? (reset ? .7 : state.time);
    const selectedTime = source.times.includes(requestedTime) ? requestedTime : .7;
    let family = exampleCache.get(entry.data);
    if (!family) {
      const response = await fetch(assetURL(entry.data)); if (!response.ok) throw new Error('The saved example could not be loaded.');
      const saved = await response.json(); family = source.id === 'caption-study' ? prepareStudy(saved, entry) : prepareLegacy(saved, source); exampleCache.set(entry.data, family);
    }
    const {image, input} = await loadInput(entry, selectedTime);
    // Change the image and its routing frame together after the image loads.
    activeFamily = family; activeImage = image; activeInput = input;
    state.source = sourceIndex; state.example = index; state.caption = 0; state.time = selectedTime;
    if (reset) {state.level = 1; family.selectedTokens = family.variants.map(e => e.defaultToken);}
    state.token = family.selectedTokens[0]; state.patch = example().defaultPatch; state.hoverPatch = null; state.pinnedPatch = null; state.direction = 'groups';
    buildTimeControl(); updateFollow(entry); renderDetails();
    query('.joint-content').hidden = false; render(); setBusy(false); mount.dataset.jointReady = 'true'; announce();
  }
  async function chooseTime(time) {
    if (loading || !activeFamily) return;
    setBusy(true);
    const {image, input} = await loadInput(gallery[state.example], time);
    activeImage = image; activeInput = input; state.time = time; state.hoverPatch = null;
    render(); setBusy(false); announce();
  }
  function clearSelection() {
    cancelAnimationFrame(pendingHover); pendingHover = 0;
    state.pinnedPatch = null; state.hoverPatch = null; state.direction = 'groups'; render(false); announce();
  }
  function choosePatch(p, announceChange = true) {
    if (loading || !activeFamily) return;
    cancelAnimationFrame(pendingHover); pendingHover = 0;
    state.patch = p; state.pinnedPatch = null; state.hoverPatch = null; state.direction = 'reverse'; render(false);
    if (announceChange) announce();
  }
  function hoverPatch(p) {
    if (state.hoverPatch === p && state.patch === p && isReverse()) return;
    state.hoverPatch = p;
    if (pendingHover) return;
    pendingHover = requestAnimationFrame(() => {
      pendingHover = 0;
      if (loading || state.hoverPatch === null) return;
      state.patch = state.hoverPatch; state.pinnedPatch = null; state.direction = 'reverse'; render(false);
    });
  }
  async function load() {
    const response = await fetch(assetURL('data.json')); if (!response.ok) throw new Error('The saved connections could not be loaded.'); data = await response.json();
    if (data.schema !== 3 || data.update !== 40000 || data.sources.length !== 2 || data.sources[0].examples.length !== 3 || data.sources[1].examples.length !== 20) throw new Error('The source catalog does not match this viewer.');
    const inputResponse = await fetch(assetURL('inputs/index.json'));
    if (!inputResponse.ok) throw new Error('The input image catalog could not be loaded.');
    inputCatalog = await inputResponse.json();
    if (inputCatalog.schema !== 1) throw new Error('The input image catalog is not supported.');
    const study = {id: 'caption-study', name: 'Local caption study', times: [1, .7], defaultTime: .7};
    data.sources.push(study);
    // Keep source metadata for decoding. The page has one gallery and no source menu.
    gallery = [
      {id: 'xiaoyu', name: 'Xiaoyu', caption: 'A man holds a camera.', image: 'local/xiaoyu-clean.png', data: 'local/xiaoyu.json', defaultTime: 1, xProfile: 'https://x.com/XiaoyuW9401147', sourceIndex: 2},
      {id: 'yifei', name: 'Yifei', caption: 'A person sits on a rock near a bridge.', image: 'local/yifei-clean.png', data: 'local/yifei.json', defaultTime: 1, xProfile: 'https://x.com/WangYw251', sourceIndex: 2},
      {id: 'weihang', name: 'Weihang', caption: 'A man wearing glasses in front of mountains.', image: 'local/weihang-clean.png', data: 'local/weihang.json', defaultTime: 1, xProfile: 'https://x.com/Weihang404', sourceIndex: 2},
      {id: 'hand-caption-study', name: 'Hand', caption: 'A man holds up his hand with gems.', image: 'gpu/thanos-gauntlet.png', data: 'caption-study.json', sourceIndex: 2},
      ...data.sources[1].examples.filter(entry => !['thanos-gauntlet', 'thanos-portrait'].includes(entry.id)).map(entry => ({...entry, sourceIndex: 1}))
    ];
    if (gallery.length !== 22) throw new Error('The image gallery is incomplete.');
    buildGallery();
    query('#joint-time').addEventListener('change', () => chooseTime(Number(query('#joint-time').value)).catch(showError));
    all('[data-joint-level]').forEach(b => b.addEventListener('click', () => {state.level = Number(b.dataset.jointLevel); state.hoverPatch = null; render(); announce();}));
    query('#joint-reset').addEventListener('click', () => chooseExample(state.example, undefined, true).catch(showError));
    all('canvas').forEach(canvas => {
      const patchAt = event => {const r = canvas.getBoundingClientRect(); return clamp(Math.floor((event.clientY - r.top) / r.height * 16), 0, 15) * 16 + clamp(Math.floor((event.clientX - r.left) / r.width * 16), 0, 15);};
      canvas.addEventListener('pointermove', event => {if (loading || !activeFamily || event.pointerType === 'touch') return; hoverPatch(patchAt(event));});
      canvas.addEventListener('pointerleave', () => {if (!activeFamily || loading) return; cancelAnimationFrame(pendingHover); pendingHover = 0; state.hoverPatch = null; drawViews();});
      canvas.addEventListener('click', event => choosePatch(patchAt(event)));
      canvas.addEventListener('keydown', event => {
        if (loading || !activeFamily) return;
        let p = focusedPatch() ?? state.patch, row = Math.floor(p / 16), col = p % 16;
        if (event.key === 'ArrowLeft') col--; else if (event.key === 'ArrowRight') col++; else if (event.key === 'ArrowUp') row--; else if (event.key === 'ArrowDown') row++; else if (event.key === 'Home') {row = 0; col = 0;} else if (event.key === 'End') {row = 15; col = 15;} else if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); choosePatch(p); return;} else return;
        event.preventDefault(); choosePatch(clamp(row, 0, 15) * 16 + clamp(col, 0, 15));
      });
    });
    mount.addEventListener('keydown', event => {if (event.key === 'Escape' && activeFamily && !loading) {event.preventDefault(); clearSelection();}});
    await chooseExample(0);
    window.HiTJointViewer = Object.freeze({getState: () => ({...state, sourceId: data.sources[state.source].id, exampleId: example().id, tokenPosition: example().tokens[state.token].position})});
  }
  load().catch(showError);
})();
