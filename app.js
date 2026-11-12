"use strict";

const elements = {
  menuToggle: document.getElementById("navToggle"),
  navigation: document.getElementById("primaryNavigation"),
  currentYear: document.getElementById("currentYear")
};

const state = { navigationOpen: false };

function setNavigationOpen(isOpen) {
  const { menuToggle, navigation } = elements;
  if (!menuToggle || !navigation) return;
  state.navigationOpen = Boolean(isOpen);
  menuToggle.setAttribute("aria-expanded", String(state.navigationOpen));
  navigation.classList.toggle("is-open", state.navigationOpen);
}

function handleDocumentKeydown(event) {
  if (event.key === "Escape") setNavigationOpen(false);
}

function initializePortal() {
  if (elements.currentYear) {
    elements.currentYear.textContent = String(new Date().getFullYear());
  }

  if (elements.menuToggle && elements.navigation) {
    elements.menuToggle.addEventListener("click", () => {
      setNavigationOpen(!state.navigationOpen);
    });

    elements.navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) setNavigationOpen(false);
    });

    document.addEventListener("click", (event) => {
      if (!elements.navigation.contains(event.target) && !elements.menuToggle.contains(event.target)) {
        setNavigationOpen(false);
      }
    });

    document.addEventListener("keydown", handleDocumentKeydown);
    window.addEventListener("resize", () => {
      if (window.matchMedia("(min-width: 761px)").matches) setNavigationOpen(false);
    });
  }
}

initializePortal();
