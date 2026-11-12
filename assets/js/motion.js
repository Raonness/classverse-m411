/* ClassVerse Motion System — shared, progressive enhancement. */
(() => {
  "use strict";
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("motion-ready");
  const entranceSelector = ".site-header, .topbar, .hero, .hero-note, .time-card, .section-heading, .service-card, .services, .stats, .workspace, .panel, .toolbar, .board-heading, .task-grid, .portal-note, .site-footer";
  document.querySelectorAll(entranceSelector).forEach((element, index) => {
    element.classList.add("motion-enter");
    element.style.setProperty("--motion-delay", `${Math.min(index, 12) * 80}ms`);
  });
  if (!reduceMotion) requestAnimationFrame(() => root.classList.add("motion-active"));
  else root.classList.add("motion-active");

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || reduceMotion) return;
    const target = event.target.closest("button, .service-card__link, .button, .filter, .seat");
    if (!target || target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;
    const rect = target.getBoundingClientRect(), ripple = document.createElement("span");
    ripple.className = "motion-ripple";
    ripple.setAttribute("aria-hidden", "true");
    ripple.style.setProperty("--ripple-x", `${event.clientX - rect.left}px`);
    ripple.style.setProperty("--ripple-y", `${event.clientY - rect.top}px`);
    target.classList.add("motion-ripple-host");
    target.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  }, { passive: true });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || reduceMotion || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        link.target === "_blank" || link.hasAttribute("download") ||
        link.getAttribute("href").startsWith("#") || link.dataset.noTransition === "true") return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin ||
        (destination.pathname === location.pathname && destination.search === location.search)) return;
    event.preventDefault();
    root.classList.add("motion-exit");
    setTimeout(() => location.assign(destination.href), 180);
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.motionSubmit === "off") return;
    const button = event.submitter || form.querySelector('button[type="submit"], input[type="submit"]');
    if (!button || button.dataset.motionBusy === "true") return;
    button.dataset.motionBusy = "true";
    button.classList.add("motion-submitting");
    form.classList.add("motion-form-pending");
    button.setAttribute("aria-busy", "true");
    const width = button.getBoundingClientRect().width;
    if (width) button.style.minWidth = `${width}px`;
    const clear = () => {
      button.classList.remove("motion-submitting");
      form.classList.remove("motion-form-pending");
      button.removeAttribute("aria-busy");
      delete button.dataset.motionBusy;
      button.style.removeProperty("min-width");
    };
    setTimeout(clear, 5000);
    form.addEventListener("reset", clear, { once: true });
  }, true);

  const disabledObserver = new MutationObserver(records => records.forEach(({target}) => {
    if (target instanceof HTMLButtonElement) target.classList.toggle("motion-disabled", target.disabled);
  }));
  const observeButton = button => {
    button.classList.toggle("motion-disabled", button.disabled);
    disabledObserver.observe(button, {attributes:true, attributeFilter:["disabled"]});
  };
  document.querySelectorAll("button").forEach(observeButton);

  const dynamicObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (!(node instanceof Element)) return;
    (node.matches("button") ? [node] : node.querySelectorAll("button")).forEach(observeButton);
    const dynamicTargets = node.matches(".task-card, .loading-card, .empty-card, .notice, .dialog, .modal")
      ? [node] : node.querySelectorAll(".task-card, .loading-card, .empty-card, .notice, .dialog, .modal");
    dynamicTargets.forEach((element, index) => {
      element.classList.add("motion-dynamic-enter");
      element.style.setProperty("--motion-delay", `${Math.min(index, 5) * 60}ms`);
      if (!reduceMotion) requestAnimationFrame(() => element.classList.add("motion-dynamic-active"));
    });
  })));
  dynamicObserver.observe(document.body, {childList:true, subtree:true});

  // Success/error copy is owned by each page; this observer adds visual feedback only.
  const feedbackObserver = new MutationObserver(records => records.forEach(record => {
    const node = record.target instanceof Element ? record.target : record.target.parentElement;
    if (!node || !node.matches('[role="status"], .notice, .form-notice, .admin-notice')) return;
    const message = (node.textContent || "").trim();
    const isError = /ไม่สำเร็จ|ผิดพลาด|กรุณา|error|failed|⚠/i.test(message);
    const isSuccess = !isError && /สำเร็จ|เรียบร้อย|บันทึกแล้ว|เผยแพร่รายการแล้ว|อนุมัติแล้ว|เพิ่มแล้ว|✓/i.test(message);
    node.classList.toggle("motion-feedback-error", isError && message.length > 0);
    node.classList.toggle("motion-feedback-success", isSuccess && message.length > 0);
    if (isSuccess && message.length > 0 && !node.querySelector(".motion-checkmark")) {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("class", "motion-checkmark");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M4.5 12.5 9.5 17 19.5 6.5");
      icon.append(path);
      node.prepend(icon);
    }
  }));
  document.querySelectorAll('[role="status"], .notice, .form-notice, .admin-notice').forEach(node =>
    feedbackObserver.observe(node, {childList:true, characterData:true, subtree:true}));

  document.addEventListener("invalid", event => {
    const field = event.target;
    if (!(field instanceof HTMLElement)) return;
    field.classList.remove("motion-invalid");
    void field.offsetWidth;
    field.classList.add("motion-invalid");
    field.addEventListener("input", () => field.classList.remove("motion-invalid"), {once:true});
  }, true);
})();
