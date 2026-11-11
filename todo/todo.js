"use strict";
(() => {
  const cfg = window.CLASSROOM_CONFIG || {};
  const db = window.supabase?.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const $ = (id) => document.getElementById(id);
  const labels = { announcement: "ประกาศ", activity: "กิจกรรม", homework: "การบ้าน" };
  let records = [], user = null, admin = false, filter = "all";
  const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const say = (el, msg, error = false) => { el.textContent = msg; el.style.color = error ? "#e5b5b5" : "#d2baf1"; };
  const dateText = (value) => value ? new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value+"T00:00:00")) : "ไม่ระบุกำหนดวัน";
  // Deadline dates are considered due at local end-of-day.
  const deadlineAt = (value) => value ? new Date(value+"T23:59:59").getTime() : null;
  const isPastDeadline = (value) => { const target=deadlineAt(value); return target!==null && Date.now()>target; };
  const countdownText = (value) => { const target=deadlineAt(value);if(target===null)return "ไม่มีกำหนดเวลา";const remaining=target-Date.now();if(remaining<=0)return "เสร็จแล้ว";const days=Math.floor(remaining/86400000),hours=Math.floor((remaining%86400000)/3600000),mins=Math.floor((remaining%3600000)/60000),secs=Math.floor((remaining%60000)/1000);return days>0?"เหลือ "+days+" วัน "+hours+" ชม.":hours>0?"เหลือ "+hours+" ชม. "+mins+" นาที":mins>0?"เหลือ "+mins+" นาที "+secs+" วินาที":"เหลือ "+secs+" วินาที";};
  function refreshCountdowns(){document.querySelectorAll("[data-deadline]").forEach(node=>{const due=node.dataset.deadline,done=isPastDeadline(due);node.textContent=countdownText(due);node.classList.toggle("countdown-done",done);const card=node.closest(".task-card");if(card){card.classList.toggle("task-completed",done);const title=card.querySelector("h3"),details=card.querySelector(".task-details");if(title)title.classList.toggle("completed-text",done);if(details)details.classList.toggle("completed-text",done);}const status=card?.querySelector(".task-status");if(status){status.textContent=done?"✓ เสร็จแล้ว":"● กำลังดำเนินการ";status.classList.toggle("status-done",done);}});}

  // Use the existing server-verified seatmap admin RPC; task privileges are separately enforced by RLS.
  async function isAuthorizedAdmin(sessionUser) {
    if (!sessionUser || !db) return false;
    const { error } = await db.rpc("seatmap_admin_requests");
    return !error;
  }

  async function refreshTasks() {
    if (!db) { $("taskGrid").innerHTML = '<div class="empty-card"><strong>ยังไม่ได้เชื่อมต่อฐานข้อมูล</strong><span>โปรดตรวจสอบ config ของ Supabase</span></div>'; return; }
    $("taskGrid").innerHTML = '<div class="loading-card"><span class="loader"></span><p>กำลังโหลดรายการ…</p></div>';
    const { data, error } = await db.from("class_tasks").select("*").order("due_date",{ascending:true,nullsFirst:false}).order("created_at",{ascending:false});
    if (error) { console.error(error); $("taskGrid").innerHTML = '<div class="empty-card"><strong>โหลดรายการไม่สำเร็จ</strong><span>ตรวจสอบการติดตั้ง To-Do SQL และสิทธิ์ Data API</span></div>'; $("boardCount").textContent="เกิดข้อผิดพลาด"; return; }
    records = data || []; render(); if (admin) renderAdminList(); refreshCountdowns();
  }

  function filtered() {
    const query = $("searchInput").value.trim().toLowerCase();
    return records.filter(row => {
      if (filter === "private" && row.audience !== "private") return false;
      if (["announcement","activity","homework"].includes(filter) && row.task_type !== filter) return false;
      return !query || [row.title,row.details,row.subject,labels[row.task_type]].some(x => String(x||"").toLowerCase().includes(query));
    });
  }
  function render() {
    const rows = filtered(); $("boardCount").textContent = rows.length + " รายการ";
    if (!rows.length) { $("taskGrid").innerHTML = '<div class="empty-card"><strong>ยังไม่มีรายการในหมวดนี้</strong><span>รายการจะปรากฏเมื่อ Admin เผยแพร่ประกาศหรือการบ้าน</span></div>'; return; }
    $("taskGrid").innerHTML = rows.map((row,i)=>'<article class="task-card '+(row.audience==="private"?"private":"")+(isPastDeadline(row.due_date)?" task-completed":"")+'" style="animation-delay:'+Math.min(i*45,240)+'ms"><div class="task-meta"><span class="type-tag type-'+esc(row.task_type)+'">'+esc(labels[row.task_type]||"รายการ")+'</span><span class="visibility-tag '+(row.audience==="private"?"private-tag":"")+'">'+(row.audience==="private"?"🔒 งานส่วนตัว":"ทั้งห้อง")+'</span></div><div class="task-status '+(isPastDeadline(row.due_date)?"status-done":"")+'">'+(isPastDeadline(row.due_date)?"✓ เสร็จแล้ว":"● กำลังดำเนินการ")+'</div><h3 class="'+(isPastDeadline(row.due_date)?"completed-text":"")+'">'+esc(row.title)+'</h3>'+(row.subject?'<p class="task-subject">'+esc(row.subject)+'</p>':"")+'<p class="task-details '+(isPastDeadline(row.due_date)?"completed-text":"")+'">'+esc(row.details||"ไม่มีรายละเอียดเพิ่มเติม")+'</p><div class="task-bottom"><span class="due">'+(row.due_date?"◷ "+esc(dateText(row.due_date)):"ไม่มีกำหนดวัน")+'</span><span class="countdown '+(isPastDeadline(row.due_date)?"countdown-done":"")+'" '+(row.due_date?'data-deadline="'+esc(row.due_date)+'"':"")+'>'+(row.due_date?esc(countdownText(row.due_date)):"ไม่มีกำหนดเวลา")+'</span></div></article>').join("");
  }
  function renderAdminList() {
    $("manageCount").textContent = records.length+" รายการ";
    if (!records.length) { $("manageList").innerHTML='<div class="empty-card"><strong>ยังไม่มีรายการ</strong><span>สร้างรายการแรกจากแบบฟอร์มด้านบน</span></div>'; return; }
    $("manageList").innerHTML=records.map(row=>'<div class="manage-item '+(isPastDeadline(row.due_date)?"manage-completed":"")+'"><div><strong class="'+(isPastDeadline(row.due_date)?"completed-text":"")+'">'+esc(row.title)+'</strong><small>'+esc(labels[row.task_type])+' · '+(row.audience==="private"?"ส่วนตัว: "+esc(row.assigned_email):"เปิดเผย")+' · '+esc(dateText(row.due_date))+' · '+(isPastDeadline(row.due_date)?"✓ เสร็จแล้ว":row.due_date?esc(countdownText(row.due_date)):"ไม่มีกำหนดเวลา")+'</small></div><div class="manage-actions"><button data-edit="'+row.id+'">แก้ไข</button><button class="delete" data-delete="'+row.id+'">ลบ</button></div></div>').join("");
    $("manageList").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>fillEdit(b.dataset.edit));
    $("manageList").querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>removeTask(b.dataset.delete));
  }
  function resetForm() { $("taskForm").reset(); $("taskId").value=""; $("taskAudience").value="public"; $("privateRecipient").hidden=true; $("saveTaskBtn").textContent="เผยแพร่รายการ"; say($("taskNotice"),""); }
  function fillEdit(id) {
    const row=records.find(x=>x.id===id); if(!row)return;
    $("taskId").value=row.id; $("taskTitle").value=row.title; $("taskType").value=row.task_type; $("taskSubject").value=row.subject||""; $("taskDetails").value=row.details||""; $("taskDue").value=row.due_date||""; $("taskAudience").value=row.audience; $("assignedEmail").value=row.assigned_email||""; $("privateRecipient").hidden=row.audience!=="private"; $("saveTaskBtn").textContent="บันทึกการแก้ไข"; $("taskTitle").focus();
  }
  async function removeTask(id) {
    if(!admin||!confirm("ยืนยันลบรายการนี้?"))return;
    const {error}=await db.from("class_tasks").delete().eq("id",id);
    if(error)return alert("ลบไม่สำเร็จ: "+error.message);
    await refreshTasks();
  }
  async function syncSession(session) {
    user=session?.user||null; admin=await isAuthorizedAdmin(user);
    $("accountBtn").textContent=user?"บัญชี: "+(user.email||"เข้าสู่ระบบแล้ว"):"เข้าสู่ระบบนักเรียน";
    $("adminBtn").textContent=admin?"⚙ จัดการ Admin":"⚙ Admin"; $("privateHint").hidden=Boolean(user);
    await refreshTasks();
  }
  $("filters").onclick=e=>{const b=e.target.closest("[data-filter]");if(!b)return;filter=b.dataset.filter;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===b));render();};
  $("searchInput").oninput=render;
  window.setInterval(refreshCountdowns,1000);
  $("accountBtn").onclick=$("hintLogin").onclick=()=>{$("authModal").hidden=false;$("authNotice").textContent="";$("authEmail").value=user?.email||"";$("authPassword").value="";$("signOutBtn").hidden=!user;$("authSubmit").disabled=Boolean(user);};
  $("adminBtn").onclick=()=>{$("adminModal").hidden=false;$("adminLoginView").hidden=admin;$("adminPanel").hidden=!admin;$("adminLoginNotice").textContent="";if(admin)renderAdminList();};
  $("closeAuth").onclick=()=> $("authModal").hidden=true; $("closeAdmin").onclick=()=> $("adminModal").hidden=true;
  ["authModal","adminModal"].forEach(id=>$(id).onclick=e=>{if(e.target===$(id))$(id).hidden=true;});
  $("taskAudience").onchange=()=> $("privateRecipient").hidden=$("taskAudience").value!=="private";
  $("resetTaskBtn").onclick=resetForm;
  $("authForm").onsubmit=async e=>{e.preventDefault();if(user)return;const {data,error}=await db.auth.signInWithPassword({email:$("authEmail").value.trim(),password:$("authPassword").value});if(error)return say($("authNotice"),"เข้าสู่ระบบไม่สำเร็จ: "+error.message,true);$("authModal").hidden=true;await syncSession(data.session);};
  $("signOutBtn").onclick=async()=>{await db.auth.signOut();$("authModal").hidden=true;await syncSession(null);};
  $("adminAuthForm").onsubmit=async e=>{e.preventDefault();const {data,error}=await db.auth.signInWithPassword({email:$("adminEmail").value.trim(),password:$("adminPassword").value});if(error)return say($("adminLoginNotice"),"เข้าสู่ระบบไม่สำเร็จ: "+error.message,true);if(!(await isAuthorizedAdmin(data.user))){await db.auth.signOut();return say($("adminLoginNotice"),"บัญชีนี้ไม่มีสิทธิ์ Admin ในฐานข้อมูล",true);}await syncSession(data.session);$("adminLoginView").hidden=true;$("adminPanel").hidden=false;};
  $("adminSignOut").onclick=async()=>{await db.auth.signOut();$("adminModal").hidden=true;await syncSession(null);};
  $("taskForm").onsubmit=async e=>{
    e.preventDefault();if(!admin)return say($("taskNotice"),"จำเป็นต้องเข้าสู่ระบบ Admin",true);
    const audience=$("taskAudience").value,email=$("assignedEmail").value.trim().toLowerCase();
    if(audience==="private"&&!email)return say($("taskNotice"),"กรุณาระบุอีเมลบัญชีผู้รับงานส่วนตัว",true);
    const payload={title:$("taskTitle").value.trim(),details:$("taskDetails").value.trim(),task_type:$("taskType").value,subject:$("taskSubject").value.trim(),due_date:$("taskDue").value||null,audience,assigned_email:audience==="private"?email:null,updated_at:new Date().toISOString()};
    const id=$("taskId").value, result=id?await db.from("class_tasks").update(payload).eq("id",id):await db.from("class_tasks").insert(payload);
    if(result.error)return say($("taskNotice"),"บันทึกไม่สำเร็จ: "+result.error.message,true);
    say($("taskNotice"),id?"แก้ไขรายการแล้ว":"เผยแพร่รายการแล้ว");resetForm();await refreshTasks();
  };
  if(!db){$("taskGrid").innerHTML='<div class="empty-card"><strong>ไม่พบ Supabase config</strong></div>';return;}
  db.auth.onAuthStateChange((_event,session)=>queueMicrotask(()=>syncSession(session)));
  db.auth.getSession().then(({data})=>syncSession(data.session));
})();
