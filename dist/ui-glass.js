/* Follow each control's existing state. This does not change viewer data. */
(() => {
  const selector = '.groups-times, .efficiency-tabs, .flow-level-controls, .joint-viewer .joint-segment';
  const bound = new WeakSet();
  function bind(rail) {
    if (bound.has(rail)) return;
    bound.add(rail);
    let frame = 0;
    function update() {
      frame = 0;
      const active = rail.querySelector(':scope > button[aria-pressed="true"], :scope > button[aria-selected="true"]');
      if (!active || !active.offsetWidth) return;
      rail.style.setProperty('--glass-x', `${active.offsetLeft}px`);
      rail.style.setProperty('--glass-width', `${active.offsetWidth}px`);
      rail.classList.add('glass-segment');
      requestAnimationFrame(() => rail.classList.add('glass-ready'));
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    new MutationObserver(schedule).observe(rail, {
      subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected']
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(rail);
    rail.querySelectorAll(':scope > button').forEach(button => resize.observe(button));
    schedule();
  }
  function scan() { document.querySelectorAll(selector).forEach(bind); }
  scan();
  // The viewers mount after their data has loaded.
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(selector)) bind(node);
        node.querySelectorAll(selector).forEach(bind);
      }
    }
  }).observe(document.querySelector('main'), { childList: true, subtree: true });
})();
