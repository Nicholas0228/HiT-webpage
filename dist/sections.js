(() => {
  'use strict';
  const reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('reveal-ready');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: .12 });
    reveals.forEach(element => observer.observe(element));
  }

  const copyButton = document.querySelector('.citation-copy');
  const citation = document.querySelector('#citation-text');
  const copyStatus = document.querySelector('.citation-status');
  if (copyButton && citation && copyStatus) {
    copyButton.hidden = false;
    let resetLabel;
    copyButton.addEventListener('click', async () => {
      clearTimeout(resetLabel);
      copyStatus.textContent = '';
      try {
        await navigator.clipboard.writeText(citation.textContent.trim() + '\n');
        copyButton.textContent = 'Copied';
        copyButton.setAttribute('aria-label', 'BibTeX copied');
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(citation);
        selection.removeAllRanges();
        selection.addRange(range);
        copyStatus.textContent = 'Copy the selected citation with your browser’s copy command.';
      }
      resetLabel = setTimeout(() => {
        copyButton.textContent = 'Copy';
        copyButton.setAttribute('aria-label', 'Copy BibTeX');
      }, 2400);
    });
  }
})();
