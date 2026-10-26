"use strict";
const welcome = document.getElementById("welcome");
const menu = document.getElementById("menu");
const backBtn = document.getElementById("backBtn");

function simplifyComingSoonCards() {
  document.querySelectorAll(".locked-card").forEach((card) => {
    card.innerHTML = '<span class="coming-soon-only">เร็ว ๆ นี้</span>';
    card.setAttribute("aria-label", "เร็ว ๆ นี้");
    card.style.alignItems = "center";
    card.style.justifyContent = "center";
    card.style.textAlign = "center";
  });
}

function updateView() {
  const showMenu = window.location.hash === "#menu";
  welcome.hidden = showMenu;
  menu.hidden = !showMenu;
  document.title = showMenu
    ? "เมนูหลัก | ClassVerse M.4/11"
    : "ClassVerse M.4/11 | ห้องเรียนของเรา";
  simplifyComingSoonCards();
  window.scrollTo({ top: 0, behavior: "instant" });
}

window.addEventListener("hashchange", updateView);
backBtn.addEventListener("click", () => { window.location.hash = "welcome"; });
updateView();
