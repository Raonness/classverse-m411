"use strict";
(() => {
  const cfg = window.CLASSROOM_CONFIG || {};
  const db = window.supabase?.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const elements = new Map(Array.from(document.querySelectorAll("[id]"), element => [element.id, element]));
  const $ = (id) => elements.get(id) || document.getElementById(id);
  const requiredElements = ["accountBtn","adminAuthForm","adminBtn","adminEmail","adminLoginNotice","adminLoginView","adminModal","adminPanel","adminPassword","adminSignOut","assignedEmail","assignedGroup","authEmail","authForm","authModal","authNotice","authPassword","authSubmit","boardCount","clearDue","clearGroupBtn","closeAdmin","closeAuth","filters","groupList","groupMembers","groupName","groupNotice","groupRecipient","groupSelect","hintLogin","manageCount","manageList","privateHint","privateRecipient","resetTaskBtn","saveGroupBtn","saveTaskBtn","searchInput","signOutBtn","taskAudience","taskDetails","taskDue","taskForm","taskGrid","taskId","taskNotice","taskSubject","taskSubjectCustom","taskTitle","taskType"];
  const missingElements = requiredElements.filter(id => !$(id));
  if (missingElements.length) {
    console.error("ClassVerse task page is missing required elements:", missingElements);
    throw new Error("Task board could not start because its HTML contract is incomplete.");
  }
  const labels = { announcement: "ประกาศ", activity: "กิจกรรม", homework: "การบ้าน" };
  let records = [], user = null, admin = false, filter = "all", taskGroups = [], roster = [];
  const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const say = (el, msg, error = false) => { if (!el) return; el.textContent = msg; el.classList.toggle("is-error", error); };
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
      if (filter === "private" && row.audience === "public") return false;
      if (["announcement","activity","homework"].includes(filter) && row.task_type !== filter) return false;
      return !query || [row.title,row.details,row.subject,labels[row.task_type]].some(x => String(x||"").toLowerCase().includes(query));
    });
  }
  function render() {
    const rows = filtered(); $("boardCount").textContent = rows.length + " รายการ";
    if (!rows.length) { $("taskGrid").innerHTML = '<div class="empty-card"><strong>ยังไม่มีรายการในหมวดนี้</strong><span>รายการจะปรากฏเมื่อ Admin เผยแพร่ประกาศหรือการบ้าน</span></div>'; return; }
    $("taskGrid").innerHTML = rows.map((row,i)=>'<article class="task-card '+(row.audience==="private"?"private":"")+(isPastDeadline(row.due_date)?" task-completed":"")+'"><div class="task-meta"><span class="type-tag type-'+esc(row.task_type)+'">'+esc(labels[row.task_type]||"รายการ")+'</span><span class="visibility-tag '+(row.audience==="private"?"private-tag":"")+'">'+(row.audience==="private"?"🔒 งานส่วนตัว":row.audience==="group"?"👥 งานกลุ่ม":"ทั้งห้อง")+'</span></div><div class="task-status '+(isPastDeadline(row.due_date)?"status-done":"")+'">'+(isPastDeadline(row.due_date)?"✓ เสร็จแล้ว":"● กำลังดำเนินการ")+'</div><h3 class="'+(isPastDeadline(row.due_date)?"completed-text":"")+'">'+esc(row.title)+'</h3>'+(row.subject?'<p class="task-subject">'+esc(row.subject)+'</p>':"")+'<p class="task-details '+(isPastDeadline(row.due_date)?"completed-text":"")+'">'+esc(row.details||"ไม่มีรายละเอียดเพิ่มเติม")+'</p><div class="task-bottom"><span class="due">'+(row.due_date?"◷ "+esc(dateText(row.due_date)):"ไม่มีกำหนดวัน")+'</span><span class="countdown '+(isPastDeadline(row.due_date)?"countdown-done":"")+'" '+(row.due_date?'data-deadline="'+esc(row.due_date)+'"':"")+'>'+(row.due_date?esc(countdownText(row.due_date)):"ไม่มีกำหนดเวลา")+'</span></div></article>').join("");
  }
  function renderAdminList() {
    $("manageCount").textContent = records.length+" รายการ";
    if (!records.length) { $("manageList").innerHTML='<div class="empty-card"><strong>ยังไม่มีรายการ</strong><span>สร้างรายการแรกจากแบบฟอร์มด้านบน</span></div>'; return; }
    $("manageList").innerHTML=records.map(row=>'<div class="manage-item '+(isPastDeadline(row.due_date)?"manage-completed":"")+'"><div><strong class="'+(isPastDeadline(row.due_date)?"completed-text":"")+'">'+esc(row.title)+'</strong><small>'+esc(labels[row.task_type])+' · '+(row.audience==="private"?"ส่วนตัว: "+esc(row.assigned_email):row.audience==="group"?"กลุ่ม: "+esc(taskGroups.find(g=>g.id===row.assigned_group_id)?.name||"กลุ่มที่กำหนด"):"เปิดเผย")+' · '+esc(dateText(row.due_date))+' · '+(isPastDeadline(row.due_date)?"✓ เสร็จแล้ว":row.due_date?esc(countdownText(row.due_date)):"ไม่มีกำหนดเวลา")+'</small></div><div class="manage-actions"><button data-edit="'+row.id+'">แก้ไข</button><button class="delete" data-delete="'+row.id+'">ลบ</button></div></div>').join("");
    $("manageList").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>fillEdit(b.dataset.edit));
    $("manageList").querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>removeTask(b.dataset.delete));
  }

  async function loadGroupAdminData(){
    const [gRes,mRes,rRes,nRes]=await Promise.all([db.from("class_task_groups").select("*").order("name"),db.from("class_task_group_members").select("*"),db.from("student_roster").select("student_number,email").order("student_number"),db.from("seatmap_student_roster").select("student_number,student_name").order("student_number")]);
    if(gRes.error||mRes.error||rRes.error||nRes.error){console.error(gRes.error||mRes.error||rRes.error||nRes.error);say($("groupNotice"),"โหลดกลุ่ม/รายชื่อนักเรียนไม่สำเร็จ โปรดตรวจสอบสิทธิ์ฐานข้อมูล",true);return;}
    const nameMap=new Map((nRes.data||[]).map(s=>[String(s.student_number),s.student_name]));roster=(rRes.data||[]).map(s=>({...s,student_number:String(s.student_number),student_name:nameMap.get(String(s.student_number))||"นักเรียน"}));
    const memberRows=mRes.data||[];taskGroups=(gRes.data||[]).map(g=>({...g,members:memberRows.filter(m=>m.group_id===g.id)}));
    const opts=roster.map(s=>'<option value="'+esc(s.student_number)+'">'+esc(s.student_number+' · '+s.student_name+' · '+s.email)+'</option>').join("");$("groupMembers").innerHTML=opts;
    $("groupSelect").innerHTML='<option value="">— สร้างกลุ่มใหม่ —</option>'+taskGroups.map(g=>'<option value="'+g.id+'">'+esc(g.name)+' ('+g.members.length+' คน)</option>').join("");
    $("assignedGroup").innerHTML='<option value="">— เลือกกลุ่ม —</option>'+taskGroups.map(g=>'<option value="'+g.id+'">'+esc(g.name)+' ('+g.members.length+' คน)</option>').join("");
    $("groupList").innerHTML=taskGroups.length?taskGroups.map(g=>'<div class="manage-item"><div><strong>'+esc(g.name)+'</strong><small>สมาชิก '+g.members.length+' คน</small></div><div class="manage-actions"><button type="button" data-group-edit="'+g.id+'">แก้ไขสมาชิก</button></div></div>').join(""):'<div class="empty-card"><strong>ยังไม่มีกลุ่ม</strong><span>สร้างกลุ่มแรกได้จากฟอร์มด้านบน</span></div>';
    $("groupList").querySelectorAll("[data-group-edit]").forEach(b=>b.onclick=()=>{$("groupSelect").value=b.dataset.groupEdit;$("groupSelect").dispatchEvent(new Event("change"));});
  }
  async function saveGroup(){
    if(!admin)return say($("groupNotice"),"ต้องเข้าสู่ระบบ Admin",true);
    const name=$("groupName").value.trim(),selected=[...$("groupMembers").selectedOptions].map(o=>o.value),id=$("groupSelect").value;
    if(!name)return say($("groupNotice"),"กรุณากรอกชื่อกลุ่ม",true);if(!selected.length)return say($("groupNotice"),"เลือกสมาชิกอย่างน้อย 1 คน",true);
    let groupId=id;if(id){const {error}=await db.from("class_task_groups").update({name,updated_at:new Date().toISOString()}).eq("id",id);if(error)return say($("groupNotice"),"แก้ไขกลุ่มไม่สำเร็จ: "+error.message,true);const del=await db.from("class_task_group_members").delete().eq("group_id",id);if(del.error)return say($("groupNotice"),"ปรับสมาชิกไม่สำเร็จ: "+del.error.message,true);}else{const {data,error}=await db.from("class_task_groups").insert({name}).select("id").single();if(error)return say($("groupNotice"),"สร้างกลุ่มไม่สำเร็จ: "+error.message,true);groupId=data.id;}
    const {error}=await db.from("class_task_group_members").insert(selected.map(student_number=>({group_id:groupId,student_number})));if(error)return say($("groupNotice"),"บันทึกสมาชิกไม่สำเร็จ: "+error.message,true);
    say($("groupNotice"),id?"อัปเดตสมาชิกกลุ่มแล้ว":"สร้างกลุ่มและกำหนดสมาชิกแล้ว");await loadGroupAdminData();$("groupSelect").value=groupId;$("groupSelect").dispatchEvent(new Event("change"));
  }
  function resetForm() { $("taskForm").reset(); $("taskId").value=""; $("taskAudience").value="public"; $("privateRecipient").hidden=true; $("groupRecipient").hidden=true; $("taskSubjectCustom").hidden=true; $("saveTaskBtn").textContent="เผยแพร่รายการ"; say($("taskNotice"),""); }
  function fillEdit(id) {
    const row=records.find(x=>x.id===id); if(!row)return;
    $("taskId").value=row.id; $("taskTitle").value=row.title; $("taskType").value=row.task_type; const subject=row.subject||""; const subjectOption=[...$("taskSubject").options].some(o=>o.value===subject); $("taskSubject").value=subjectOption?subject:(subject?"__custom":""); $("taskSubjectCustom").value=subjectOption?"":subject; $("taskSubjectCustom").hidden=subjectOption||!subject; $("taskDetails").value=row.details||""; $("taskDue").value=row.due_date||""; $("taskAudience").value=row.audience; $("assignedEmail").value=row.assigned_email||""; $("privateRecipient").hidden=row.audience!=="private"; $("groupRecipient").hidden=row.audience!=="group"; $("assignedGroup").value=row.assigned_group_id||""; $("saveTaskBtn").textContent="บันทึกการแก้ไข"; $("taskTitle").focus();
  }
  async function removeTask(id) {
    if(!admin||!confirm("ยืนยันลบรายการนี้?"))return;
    const {error}=await db.from("class_tasks").delete().eq("id",id);
    if(error)return alert("ลบไม่สำเร็จ: "+error.message);
    await refreshTasks();
  }
  async function syncSession(session) {
    user=session?.user||null; admin=await isAuthorizedAdmin(user); if(admin) await loadGroupAdminData();
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
  $("taskAudience").onchange=()=>{const audience=$("taskAudience").value;$("privateRecipient").hidden=audience!=="private";$("groupRecipient").hidden=audience!=="group";};
  $("taskSubject").onchange=()=>{$("taskSubjectCustom").hidden=$("taskSubject").value!=="__custom";if($("taskSubject").value!=="__custom")$("taskSubjectCustom").value="";};
  document.querySelectorAll("[data-date-offset]").forEach(btn=>btn.onclick=()=>{const d=new Date();d.setDate(d.getDate()+Number(btn.dataset.dateOffset));$("taskDue").value=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");});
  $("clearDue").onclick=()=> $("taskDue").value="";
  $("groupSelect").onchange=()=>{const id=$("groupSelect").value;const g=taskGroups.find(x=>x.id===id);$("groupName").value=g?.name||"";const ids=(g?.members||[]).map(m=>m.student_number);[...$("groupMembers").options].forEach(o=>o.selected=ids.includes(o.value));$("saveGroupBtn").textContent=g?"บันทึกสมาชิกกลุ่ม":"สร้างกลุ่ม";};
  $("clearGroupBtn").onclick=()=>{ $("groupSelect").value="";$("groupName").value="";[...$("groupMembers").options].forEach(o=>o.selected=false);$("saveGroupBtn").textContent="สร้างกลุ่ม";say($("groupNotice"),"");};
  $("saveGroupBtn").onclick=saveGroup;
  $("resetTaskBtn").onclick=resetForm;
  $("authForm").onsubmit=async e=>{e.preventDefault();if(user)return;const {data,error}=await db.auth.signInWithPassword({email:$("authEmail").value.trim(),password:$("authPassword").value});if(error)return say($("authNotice"),"เข้าสู่ระบบไม่สำเร็จ: "+error.message,true);$("authModal").hidden=true;await syncSession(data.session);};
  $("signOutBtn").onclick=async()=>{await db.auth.signOut();$("authModal").hidden=true;await syncSession(null);};
  $("adminAuthForm").onsubmit=async e=>{e.preventDefault();const {data,error}=await db.auth.signInWithPassword({email:$("adminEmail").value.trim(),password:$("adminPassword").value});if(error)return say($("adminLoginNotice"),"เข้าสู่ระบบไม่สำเร็จ: "+error.message,true);if(!(await isAuthorizedAdmin(data.user))){await db.auth.signOut();return say($("adminLoginNotice"),"บัญชีนี้ไม่มีสิทธิ์ Admin ในฐานข้อมูล",true);}await syncSession(data.session);$("adminLoginView").hidden=true;$("adminPanel").hidden=false;};
  $("adminSignOut").onclick=async()=>{await db.auth.signOut();$("adminModal").hidden=true;await syncSession(null);};
  $("taskForm").onsubmit=async e=>{
    e.preventDefault();if(!admin)return say($("taskNotice"),"จำเป็นต้องเข้าสู่ระบบ Admin",true);
    const audience=$("taskAudience").value,email=$("assignedEmail").value.trim().toLowerCase();
    if(audience==="private"&&!email)return say($("taskNotice"),"กรุณาระบุอีเมลบัญชีผู้รับงานส่วนตัว",true);
    const chosenSubject=$("taskSubject").value;const subject=chosenSubject==="__custom"?$("taskSubjectCustom").value.trim():chosenSubject;const groupId=$("assignedGroup").value;if(audience==="group"&&!groupId)return say($("taskNotice"),"กรุณาเลือกกลุ่มผู้รับงาน",true);const payload={title:$("taskTitle").value.trim(),details:$("taskDetails").value.trim(),task_type:$("taskType").value,subject,due_date:$("taskDue").value||null,audience,assigned_email:audience==="private"?email:null,assigned_group_id:audience==="group"?groupId:null,updated_at:new Date().toISOString()};
    const id=$("taskId").value, result=id?await db.from("class_tasks").update(payload).eq("id",id):await db.from("class_tasks").insert(payload);
    if(result.error)return say($("taskNotice"),"บันทึกไม่สำเร็จ: "+result.error.message,true);
    say($("taskNotice"),id?"แก้ไขรายการแล้ว":"เผยแพร่รายการแล้ว");resetForm();await refreshTasks();
  };
  if(!db){$("taskGrid").innerHTML='<div class="empty-card"><strong>ไม่พบ Supabase config</strong></div>';return;}
  db.auth.onAuthStateChange((_event,session)=>queueMicrotask(()=>syncSession(session)));
  db.auth.getSession().then(({data})=>syncSession(data.session));
})();
