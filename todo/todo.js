"use strict";
(() => {
  const config = window.CLASSROOM_CONFIG || {};
  const client = window.supabase?.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const $ = (id) => document.getElementById(id);
  const grid = $("taskGrid");
  const filterButtons = [...document.querySelectorAll(".filter")];
  let tasks = [];
  let activeFilter = "all";
  let currentUser = null;
  let isAdmin = false;

  const labels = { announcement: "ประกาศ", activity: "กิจกรรม", homework: "การบ้าน" };
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const dateLabel = (value) => {
    if (!value) return "ไม่ระบุกำหนดการ";
    const date = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
    return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(date);
  };
  const notice = (element, text, error = false) => {
    element.textContent = text;
    element.style.color = error ? "#e5b5b5" : "#d2baf1";
  };

  async function checkAdmin(user) {
    if (!user || !client) return false;
    const { data, error } = await client.from("classroom_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) console.warn("Admin role lookup:", error.message);
    return Boolean(data);
  }

  async function loadTasks() {
    if (!client) {
      grid.innerHTML = '<div class="empty-card"><strong>ยังไม่ได้ตั้งค่าการเชื่อมต่อ</strong><span>ตรวจสอบไฟล์ config.js ของระบบ</span></div>';
      $("boardCount").textContent = "ไม่สามารถเชื่อมต่อ";
      return;
    }
    grid.innerHTML = '<div class="loading-card"><span class="loader"></span><p>กำลังโหลดรายการ…</p></div>';
    // RLS returns only public tasks plus private tasks assigned to the signed-in email.
    const { data, error } = await client.from("class_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      grid.innerHTML = '<div class="empty-card"><strong>โหลดรายการไม่สำเร็จ</strong><span>โปรดตรวจสอบการตั้งค่าฐานข้อมูล To-Do</span></div>';
      $("boardCount").textContent = "เกิดข้อผิดพลาด";
      return;
    }
    tasks = data || [];
    renderTasks();
    if (isAdmin) renderManageList();
  }

  function visibleTasks() {
    const query = $("searchInput").value.trim().toLowerCase();
    return tasks.filter((task) => {
      if (activeFilter === "private" && task.audience !== "private") return false;
      if (["announcement", "activity", "homework"].includes(activeFilter) && task.task_type !== activeFilter) return false;
      if (query && ![task.title, task.details, task.subject, labels[task.task_type]].some((part) => String(part || "").toLowerCase().includes(query))) return false;
      return true;
    });
  }

  function renderTasks() {
    const items = visibleTasks();
    $("boardCount").textContent = `${items.length} รายการ`;
    if (!items.length) {
      grid.innerHTML = '<div class="empty-card"><strong>ยังไม่มีรายการในหมวดนี้</strong><span>เมื่อ Admin เพิ่มประกาศหรือการบ้าน รายการจะแสดงที่นี่</span></div>';
      return;
    }
    grid.innerHTML = items.map((task, index) => `
      <article class="task-card ${task.audience === "private" ? "private" : ""}" style="animation-delay:${Math.min(index * 45, 240)}ms">
        <div class="task-meta"><span class="type-tag type-${escapeHTML(task.task_type)}">${escapeHTML(labels[task.task_type] || "รายการ")}</span><span class="visibility-tag ${task.audience === "private" ? "private-tag" : ""}">${task.audience === "private" ? "🔒 งานส่วนตัว" : "ทั้งห้อง"}</span></div>
        <h3>${escapeHTML(task.title)}</h3>
        ${task.subject ? `<p class="task-subject">${escapeHTML(task.subject)}</p>` : ""}
        <p class="task-details">${escapeHTML(task.details || "ไม่มีรายละเอียดเพิ่มเติม")}</p>
        <div class="task-bottom"><span class="due">${task.due_date ? "◷ " + escapeHTML(dateLabel(task.due_date)) : "ไม่มีกำหนดวัน"}</span><span>${task.audience === "private" ? "เฉพาะผู้รับ" : "M.4/11"}</span></div>
      </article>`).join("");
  }

  function renderManageList() {
    $("manageCount").textContent = `${tasks.length} รายการ`;
    const list = $("manageList");
    if (!tasks.length) {
      list.innerHTML = '<div class="empty-card"><strong>ยังไม่มีรายการ</strong><span>สร้างรายการแรกจากแบบฟอร์มด้านบน</span></div>';
      return;
    }
    list.innerHTML = tasks.map((task) => `
      <div class="manage-item"><div><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(labels[task.task_type])} · ${task.audience === "private" ? "ส่วนตัว: " + escapeHTML(task.assigned_email) : "เปิดเผย"} · ${escapeHTML(dateLabel(task.due_date))}</small></div><div class="manage-actions"><button type="button" data-edit="${task.id}">แก้ไข</button><button type="button" class="delete" data-delete="${task.id}">ลบ</button></div></div>`).join("");
    list.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editTask(button.dataset.edit)));
    list.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteTask(button.dataset.delete)));
  }

  function resetTaskForm() {
    $("taskForm").reset();
    $("taskId").value = "";
    $("taskAudience").value = "public";
    $("privateRecipient").hidden = true;
    $("saveTaskBtn").textContent = "เผยแพร่รายการ";
    notice($("taskNotice"), "");
  }

  function editTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    $("taskId").value = task.id;
    $("taskTitle").value = task.title;
    $("taskType").value = task.task_type;
    $("taskSubject").value = task.subject || "";
    $("taskDetails").value = task.details || "";
    $("taskDue").value = task.due_date || "";
    $("taskAudience").value = task.audience;
    $("assignedEmail").value = task.assigned_email || "";
    $("privateRecipient").hidden = task.audience !== "private";
    $("saveTaskBtn").textContent = "บันทึกการแก้ไข";
    $("taskTitle").focus();
  }

  async function deleteTask(id) {
    if (!isAdmin || !confirm("ลบรายการนี้ใช่ไหม? การลบไม่สามารถย้อนกลับได้")) return;
    const { error } = await client.from("class_tasks").delete().eq("id", id);
    if (error) return alert("ลบไม่สำเร็จ: " + error.message);
    await loadTasks();
  }

  async function openAuthModal() {
    $("authModal").hidden = false;
    $("authNotice").textContent = "";
    $("signOutBtn").hidden = !currentUser;
    $("authEmail").value = currentUser?.email || "";
    $("authPassword").value = "";
    $("authSubmit").textContent = currentUser ? "คุณเข้าสู่ระบบแล้ว" : "เข้าสู่ระบบ";
    $("authSubmit").disabled = Boolean(currentUser);
  }

  async function openAdminModal() {
    $("adminModal").hidden = false;
    $("adminLoginView").hidden = isAdmin;
    $("adminPanel").hidden = !isAdmin;
    $("adminLoginNotice").textContent = "";
    if (isAdmin) renderManageList();
  }

  async function syncSession(session) {
    currentUser = session?.user || null;
    isAdmin = await checkAdmin(currentUser);
    $("accountBtn").textContent = currentUser ? "บัญชี: " + (currentUser.email || "เข้าสู่ระบบแล้ว") : "เข้าสู่ระบบนักเรียน";
    $("adminBtn").textContent = isAdmin ? "⚙ จัดการ Admin" : "⚙ Admin";
    $("privateHint").hidden = Boolean(currentUser);
    await loadTasks();
  }

  $("filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderTasks();
  });
  $("searchInput").addEventListener("input", renderTasks);
  $("accountBtn").addEventListener("click", openAuthModal);
  $("hintLogin").addEventListener("click", openAuthModal);
  $("adminBtn").addEventListener("click", openAdminModal);
  $("closeAuth").addEventListener("click", () => $("authModal").hidden = true);
  $("closeAdmin").addEventListener("click", () => $("adminModal").hidden = true);
  ["authModal", "adminModal"].forEach((id) => $(id).addEventListener("click", (event) => { if (event.target === $(id)) $(id).hidden = true; }));
  $("taskAudience").addEventListener("change", () => $("privateRecipient").hidden = $("taskAudience").value !== "private");
  $("resetTaskBtn").addEventListener("click", resetTaskForm);

  $("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentUser) return;
    const { data, error } = await client.auth.signInWithPassword({ email: $("authEmail").value.trim(), password: $("authPassword").value });
    if (error) return notice($("authNotice"), "เข้าสู่ระบบไม่สำเร็จ: " + error.message, true);
    $("authModal").hidden = true;
    await syncSession(data.session);
  });

  $("signOutBtn").addEventListener("click", async () => {
    await client.auth.signOut();
    $("authModal").hidden = true;
    await syncSession(null);
  });

  $("adminAuthForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { data, error } = await client.auth.signInWithPassword({ email: $("adminEmail").value.trim(), password: $("adminPassword").value });
    if (error) return notice($("adminLoginNotice"), "เข้าสู่ระบบไม่สำเร็จ: " + error.message, true);
    const allowed = await checkAdmin(data.user);
    if (!allowed) {
      await client.auth.signOut();
      return notice($("adminLoginNotice"), "บัญชีนี้ไม่ได้รับสิทธิ์ Admin ในฐานข้อมูล", true);
    }
    await syncSession(data.session);
    $("adminLoginView").hidden = true;
    $("adminPanel").hidden = false;
  });

  $("adminSignOut").addEventListener("click", async () => {
    await client.auth.signOut();
    $("adminModal").hidden = true;
    await syncSession(null);
  });

  $("taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin) return notice($("taskNotice"), "จำเป็นต้องเข้าสู่ระบบ Admin", true);
    const audience = $("taskAudience").value;
    const assignedEmail = $("assignedEmail").value.trim().toLowerCase();
    if (audience === "private" && !assignedEmail) return notice($("taskNotice"), "กรุณาระบุอีเมลผู้รับงานส่วนตัว", true);
    const payload = {
      title: $("taskTitle").value.trim(),
      details: $("taskDetails").value.trim(),
      task_type: $("taskType").value,
      subject: $("taskSubject").value.trim(),
      due_date: $("taskDue").value || null,
      audience,
      assigned_email: audience === "private" ? assignedEmail : null,
      updated_at: new Date().toISOString()
    };
    const id = $("taskId").value;
    const result = id
      ? await client.from("class_tasks").update(payload).eq("id", id)
      : await client.from("class_tasks").insert(payload);
    if (result.error) return notice($("taskNotice"), "บันทึกไม่สำเร็จ: " + result.error.message, true);
    notice($("taskNotice"), id ? "บันทึกการแก้ไขแล้ว" : "เผยแพร่รายการแล้ว");
    resetTaskForm();
    await loadTasks();
  });

  if (!client) {
    loadTasks();
    $("accountBtn").disabled = $("adminBtn").disabled = true;
    return;
  }
  client.auth.onAuthStateChange((_event, session) => {
    // Avoid a Supabase auth callback's async work blocking its internal event queue.
    queueMicrotask(() => syncSession(session));
  });
  client.auth.getSession().then(({ data }) => syncSession(data.session));
})();
