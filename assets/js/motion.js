/* ClassVerse Motion System — shared, progressive enhancement. */
(() => {
  "use strict";
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("motion-ready");
  const entranceTargets = document.querySelectorAll(
    ".site-header, .topbar, .hero, .hero-note, .time-card, .section-heading, .service-card, .services, .stats, .workspace, .panel, .toolbar, .board-heading, .task-grid, .portal-note, .site-footer"
  );
  entranceTargets.forEach((element, index) => {
    element.classList.add("motion-enter");
    element.style.setProperty("--motion-delay", `${Math.min(index, 12) * 80}ms`);
  });
  if (!reduceMotion) requestAnimationFrame(() => root.classList.add("motion-active"));
  else root.classList.add("motion-active");

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || reduceMotion) return;
    const target = event.target.closest("button, .service-card__link, .button, .filter, .seat");
    if (!target || target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement("span");
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
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
    event.preventDefault();
    root.classList.add("motion-exit");
    window.setTimeout(() => window.location.assign(destination.href), 180);
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.motionSubmit === "off") return;
    const submitter = event.submitter || form.querySelector('button[type="submit"], input[type="submit"]');
    if (!submitter || submitter.dataset.motionBusy === "true") return;
    submitter.dataset.motionBusy = "true";
    submitter.classList.add("motion-submitting");
    form.classList.add("motion-form-pending");
    submitter.setAttribute("aria-busy", "true");
    const width = submitter.getBoundingClientRect().width;
    if (width) submitter.style.minWidth = `${width}px`;
    const clear = () => {
      submitter.classList.remove("motion-submitting");
      form.classList.remove("motion-form-pending");
      submitter.removeAttribute("aria-busy");
      delete submitter.dataset.motionBusy;
      submitter.style.removeProperty("min-width");
    };
    window.setTimeout(clear, 5000);
    form.addEventListener("reset", clear, { once: true });
  }, true);

  const disabledObserver = new MutationObserver((records) => records.forEach(({ target }) => {
    if (target instanceof HTMLButtonElement) target.classList.toggle("motion-disabled", target.disabled);
  }));
  const observeButton = (button) => {
    button.classList.toggle("motion-disabled", button.disabled);
    disabledObserver.observe(button, { attributes: true, attributeFilter: ["disabled"] });
  };
  document.querySelectorAll("button").forEach(observeButton);
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    (node.matches("button") ? [node] : node.querySelectorAll("button")).forEach(observeButton);
  }))).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("invalid", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement)) return;
    field.classList.remove("motion-invalid");
    void field.offsetWidth;
    field.classList.add("motion-invalid");
    field.addEventListener("input", () => field.classList.remove("motion-invalid"), { once: true });
  }, true);
})();
