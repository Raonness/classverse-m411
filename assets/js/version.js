(() => {
  'use strict';

  const currentScript = document.currentScript;
  if (!currentScript) return;

  const scriptUrl = new URL(currentScript.src);
  const assetsUrl = new URL('../', scriptUrl);
  const siteRoot = new URL('../../', scriptUrl);
  const dataUrl = new URL('data/version.json', assetsUrl);
  const changelogUrl = new URL('updates/', siteRoot);

  const mountVersionBadge = (version, releaseType) => {
    if (document.querySelector('[data-classverse-version]')) return;

    const link = document.createElement('a');
    link.className = 'cv-version';
    link.href = changelogUrl.href;
    link.dataset.classverseVersion = '';
    link.setAttribute('aria-label', `เวอร์ชัน ClassVerse ${version} ดูประวัติการอัปเดต`);
    link.innerHTML = `
      <span class="cv-version__pulse" aria-hidden="true"></span>
      <span class="cv-version__copy">
        <span class="cv-version__label">CLASSVERSE VERSION</span>
        <strong class="cv-version__number"></strong>
      </span>
      <span class="cv-version__type"></span>
      <span class="cv-version__arrow" aria-hidden="true">↗</span>
    `;
    link.querySelector('.cv-version__number').textContent = version;
    link.querySelector('.cv-version__type').textContent = releaseType === 'Major' ? 'MAJOR' : 'UPDATE';
    document.body.append(link);
  };

  fetch(dataUrl.href, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error('Version data unavailable');
      return response.json();
    })
    .then((data) => mountVersionBadge(data.version, data.releaseType))
    .catch(() => mountVersionBadge('VERSION N/A', 'UPDATE'));
})();
