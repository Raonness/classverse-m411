"use strict";
const welcome = document.getElementById("welcome");
const menu = document.getElementById("menu");
const backBtn = document.getElementById("backBtn");

function updateView() {
  const showMenu = window.location.hash === "#menu";
  welcome.hidden = showMenu;
  menu.hidden = !showMenu;
  document.title = showMenu
    ? "เมนูหลัก | ClassroomHub M.4/11"
    : "ClassroomHub M.4/11 | ห้องเรียนของเรา";
  window.scrollTo({ top: 0, behavior: "instant" });
}

window.addEventListener("hashchange", updateView);
backBtn.addEventListener("click", () => { window.location.hash = "welcome"; });
updateView();
