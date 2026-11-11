"use strict";
const welcome = document.getElementById("welcome");
const menu = document.getElementById("menu");
const backBtn = document.getElementById("backBtn");

function activateTodoOption() {
  const placeholder = document.querySelector(".locked-card");
  if (!placeholder || document.querySelector('[data-service="todo"]')) return;
  const card = document.createElement("a");
  card.className = "service-card live-card";
  card.href = "./todo/";
  card.dataset.service = "todo";
  card.setAttribute("aria-label", "To-Do List ลงมือทำ เปิดใช้งานได้");
  card.innerHTML = '<span class="card-top"><span class="service-icon purple" aria-hidden="true">✓</span><span class="status available"><span class="status-dot" aria-hidden="true"></span> OPEN</span></span><span class="card-num">03 / TASK CENTER</span><strong>To-Do List (ลงมือทำ)</strong><span class="card-description">รวมประกาศ กิจกรรม และการบ้าน พร้อมรายการส่วนตัวที่ Admin มอบหมาย</span><span class="card-foot">เข้าสู่รายการที่ต้องทำ <span aria-hidden="true">↗</span></span>';
  placeholder.replaceWith(card);
  const summary = document.querySelector(".dashboard-summary");
  if (summary) {
    const values = summary.querySelectorAll("strong");
    const captions = summary.querySelectorAll("span");
    if (values[0]) values[0].textContent = "03";
    if (captions[0]) captions[0].textContent = "บริการที่เปิดใช้งาน";
    if (values[1]) values[1].textContent = "03";
    if (captions[1]) captions[1].textContent = "พื้นที่สำหรับอนาคต";
  }
}

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
  activateTodoOption();
  simplifyComingSoonCards();
  window.scrollTo({ top: 0, behavior: "instant" });
}

window.addEventListener("hashchange", updateView);
backBtn.addEventListener("click", () => { window.location.hash = "welcome"; });
updateView();
