/* Inject the friendly ClassVerse mascot while the document is getting ready. */
(() => {
  "use strict";
  if (document.getElementById("cvCuteLoader")) return;
  const startedAt = performance.now();
  const minVisibleMs = 720;
  const fallbackMs = 3600;
  const loader = document.createElement("div");
  loader.className = "cv-cute-loader";
  loader.id = "cvCuteLoader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.setAttribute("aria-label", "กำลังเตรียมเว็บไซต์ ClassVerse");
  loader.innerHTML = `
    <div class="cv-cute-loader__card">
      <svg class="cv-cute-loader__art" viewBox="0 0 164 150" role="img" aria-label="แมวตัวน้อยนั่งบนกองหนังสือ">
        <ellipse cx="82" cy="132" rx="49" ry="7" fill="#e7e3d9"/>
        <g class="cv-cute-loader__spark cv-cute-loader__spark--two" fill="#d5b66f">
          <path d="M25 48l3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z"/>
        </g>
        <g class="cv-cute-loader__spark" fill="#a9b89a">
          <path d="M133 28l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z"/>
        </g>
        <g class="cv-cute-loader__spark cv-cute-loader__spark--three" fill="#d9a6a0">
          <circle cx="130" cy="76" r="3"/><circle cx="39" cy="91" r="2.5"/>
        </g>
        <g class="cv-cute-loader__book-one">
          <rect x="37" y="111" width="90" height="17" rx="5" fill="#c9d5bd"/>
          <path d="M42 115h80" stroke="#9eae8e" stroke-width="2" stroke-linecap="round"/>
          <rect x="45" y="100" width="78" height="14" rx="4" fill="#e7c9a9"/>
          <path d="M50 104h68" stroke="#d4ad86" stroke-width="2" stroke-linecap="round"/>
          <rect x="52" y="90" width="61" height="13" rx="4" fill="#d9b8bb"/>
          <path d="M57 94h51" stroke="#c49a9e" stroke-width="2" stroke-linecap="round"/>
        </g>
        <g class="cv-cute-loader__cat">
          <path class="cv-cute-loader__tail" d="M109 91c17 1 20-13 12-18-6-5-12 0-10 5" fill="none" stroke="#d8b995" stroke-width="9" stroke-linecap="round"/>
          <path d="M52 70l3-25 21 14M88 59l20-14 2 27" fill="#e8c9a7" stroke="#cba982" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M60 57l1-12 12 9M94 54l11-8 1 14" fill="#d9a3a0"/>
          <ellipse cx="82" cy="79" rx="34" ry="29" fill="#f0d9b8" stroke="#cba982" stroke-width="2"/>
          <ellipse cx="82" cy="88" rx="22" ry="16" fill="#fff4e4"/>
          <ellipse cx="70" cy="77" rx="3" ry="4" fill="#51483e"/>
          <ellipse cx="94" cy="77" rx="3" ry="4" fill="#51483e"/>
          <path d="M78 84q4 4 8 0" fill="none" stroke="#9f7770" stroke-width="2" stroke-linecap="round"/>
          <ellipse cx="64" cy="84" rx="5" ry="3" fill="#e7b2aa" opacity=".7"/>
          <ellipse cx="100" cy="84" rx="5" ry="3" fill="#e7b2aa" opacity=".7"/>
          <path d="M67 97q15 8 30 0" fill="none" stroke="#cba982" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M70 97v5M94 97v5" stroke="#cba982" stroke-width="2.5" stroke-linecap="round"/>
        </g>
      </svg>
      <p class="cv-cute-loader__title">กำลังจัดโต๊ะเรียนให้พร้อม ✿</p>
      <p class="cv-cute-loader__subtitle">เจ้าเหมียวกำลังเตรียมพื้นที่ของห้องเราอยู่นะ</p>
      <div class="cv-cute-loader__track" aria-hidden="true"><span></span></div>
      <span class="cv-cute-loader__dots" aria-hidden="true"><span></span><span></span><span></span></span>
    </div>`;
  document.body.append(loader);

  let finished = false;
  const hide = () => {
    if (finished) return;
    finished = true;
    const wait = Math.max(0, minVisibleMs - (performance.now() - startedAt));
    setTimeout(() => {
      loader.classList.add("is-leaving");
      setTimeout(() => loader.remove(), 460);
    }, wait);
  };
  if (document.readyState === "complete") hide();
  else window.addEventListener("load", hide, { once: true });
  setTimeout(hide, fallbackMs);
})();
