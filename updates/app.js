(() => {
  'use strict';
  const dataUrl = new URL('../assets/data/version.json', document.currentScript.src);

  const formatDate = (value) => {
    if (!value) return 'ไม่ระบุวันที่';
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(date);
  };

  const renderHistory = (items) => {
    const list = document.querySelector('#historyList');
    list.replaceChildren();
    document.querySelector('#historyCount').textContent = `${items.length} RELEASES`;

    items.forEach((item) => {
      const article = document.createElement('article');
      article.className = 'history-entry';
      const meta = document.createElement('div');
      meta.className = 'history-entry__meta';
      const version = document.createElement('strong');
      version.className = 'history-entry__version';
      version.textContent = item.version;
      const type = document.createElement('span');
      type.className = 'history-entry__type';
      type.textContent = item.type === 'Major' ? 'MAJOR UPDATE' : 'MINOR UPDATE';
      const date = document.createElement('time');
      date.textContent = formatDate(item.date);
      date.dateTime = item.date || '';
      meta.append(version, type, date);

      const detail = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = item.title || 'อัปเดตระบบ';
      const bullets = document.createElement('ul');
      (item.details || []).forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        bullets.append(li);
      });
      detail.append(title, bullets);
      article.append(meta, detail);
      list.append(article);
    });
  };

  fetch(dataUrl.href, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      return response.json();
    })
    .then((data) => {
      document.querySelector('#releaseType').textContent = data.releaseType === 'Major' ? 'MAJOR UPDATE · อัปเดตครั้งใหญ่' : 'MINOR UPDATE · อัปเดตย่อย';
      document.querySelector('#updatedAt').textContent = formatDate(data.updatedAt);
      document.querySelector('#currentTitle').textContent = data.version;
      document.querySelector('#releaseSummary').textContent = data.summary || '';
      const completed = Math.min(data.cycle?.completedSections || 0, data.cycle?.totalSections || 6);
      const total = data.cycle?.totalSections || 6;
      document.querySelector('#cycleCount').textContent = `${completed} / ${total} หัวข้อ`;
      document.querySelector('#cycleProgress').setAttribute('aria-valuemax', String(total));
      document.querySelector('#cycleProgress').setAttribute('aria-valuenow', String(completed));
      document.querySelector('#cycleBar').style.width = `${total ? completed / total * 100 : 0}%`;
      document.querySelector('#cycleNote').textContent = data.cycle?.note || '';
      renderHistory(data.history || []);
    })
    .catch(() => {
      document.querySelector('#currentTitle').textContent = 'ไม่สามารถโหลดเวอร์ชันได้';
      document.querySelector('#releaseSummary').textContent = 'โปรดลองใหม่ภายหลัง';
      document.querySelector('#historyList').textContent = 'ไม่สามารถโหลดประวัติการอัปเดตได้';
    });
})();
