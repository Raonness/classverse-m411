"use strict";
const $=id=>document.getElementById(id);
const SEATS=['A1','A2','A3','A4','A5','B1','B2','B3','B4','B5','C1','C2','C3','C4','C5','D1','D2','D3','D4','D5','E1','E2','E3','E4','E5','E6','F1','F2','F3','F4','F5','F6','G2','G3','G6','H2','H6','I2','J2','J3'];
const COLS='ABCDEFGHIJ'.split('');
const cfg=window.CLASSROOM_CONFIG||{};
const configured=Boolean(cfg.supabaseUrl&&cfg.supabaseAnonKey);
const db=configured?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
let occupants=[],admin=false,selected=null,loading=false,profiles=new Map(),profileSchemaReady=false,studentRoster=[];
const message=(id,text)=>{$(id).textContent=text};
async function rpc(name,args={}){const {data,error}=await db.rpc(name,args);if(error)throw error;return data}
function render(){const map=new Map(occupants.map(x=>[x.seat_id,x]));const grid=document.createDocumentFragment();for(let row=1;row<=6;row++){const axis=document.createElement('span');axis.className='axis';axis.textContent=row;grid.append(axis);for(const col of COLS){const id=col+row,slot=document.createElement('span');slot.className='seat-slot';if('CEI'.includes(col))slot.classList.add('lane-before');if(SEATS.includes(id)){const person=map.get(id),b=document.createElement('button');b.type='button';b.className='seat '+(person?'is-booked':'')+(selected===id?' is-selected':'');b.append(document.createTextNode(id));const sm=document.createElement('small');sm.textContent=person?(person.nickname||person.student_name):'ว่าง';b.append(sm);b.title=person?`${id}: ${person.student_name} เลขที่ ${person.student_number}`:`${id}: ว่าง`;b.addEventListener('click',()=>{document.querySelectorAll('#seatGrid .seat.is-selected').forEach(el=>el.classList.remove('is-selected'));selected=id;b.classList.add('is-selected','cv-seat-clicked');const label=$('selectedSeat');label.textContent=id;label.classList.remove('cv-selection-change');void label.offsetWidth;label.classList.add('cv-selection-change');$('selectedStudent').textContent=person?`${person.student_name}${person.nickname?' · '+person.nickname:''} (เลขที่ ${person.student_number})`:'ว่าง';$('selectedLabel').textContent=person?'มีนักเรียนนั่งอยู่':'ยังไม่มีนักเรียน';});slot.append(b)}grid.append(slot)}}$('seatGrid').replaceChildren(grid);$('occupied').textContent=occupants.length;$('statBooked').textContent=occupants.length;$('statFree').textContent=40-occupants.length;const target=$('targetSeat'),edit=$('editSeat');const targetValue=target.value,editValue=edit.value;target.replaceChildren(new Option('เลือกที่นั่งปลายทาง',''));edit.replaceChildren();for(const id of SEATS){target.add(new Option(`${id}${map.has(id)?' — '+map.get(id).student_name:' — ว่าง'}`,id));edit.add(new Option(id,id))}target.value=targetValue;edit.value=editValue||'A1';}
async function refresh(){if(!configured){message('connection','ยังไม่ได้ตั้งค่า Supabase');return}try{try{occupants=await rpc('seatmap_public_snapshot_v2');profileSchemaReady=true}catch(e){if(/seatmap_public_snapshot_v2|not found|schema cache|42883|PGRST202/i.test(e.message)){occupants=await rpc('seatmap_public_snapshot');profileSchemaReady=false}else throw e}render();message('connection','● เชื่อมต่อออนไลน์')}catch(e){message('connection','⚠ ไม่สามารถโหลดข้อมูล');message('notice',e.message)}}
$('swapForm').addEventListener('submit',async e=>{e.preventDefault();if(loading)return;loading=true;try{if(!configured)throw Error('กรุณาตั้งค่า Supabase ก่อน');const from=occupants.find(x=>String(x.student_number)===String(Number($('requesterNo').value))&&x.student_name.trim()===$('requesterName').value.trim());if(!from)throw Error('ไม่พบชื่อและเลขที่นี้ในผังปัจจุบัน');const target=$('targetSeat').value;if(from.seat_id===target)throw Error('ต้องเลือกคนละที่นั่ง');if(!occupants.some(x=>x.seat_id===target))throw Error('ปลายทางต้องมีนักเรียนนั่งอยู่ จึงจะสลับได้');await rpc('seatmap_request_swap',{p_name:$('requesterName').value.trim(),p_number:Number($('requesterNo').value),p_target:target,p_reason:$('reason').value.trim()});message('notice','✓ ส่งคำขอแล้ว รอแอดมินตรวจสอบและอนุมัติ');$('swapForm').reset()}catch(err){message('notice','⚠ '+err.message)}finally{loading=false}});
function overlay(show){$('adminOverlay').hidden=!show;document.body.style.overflow=show?'hidden':''}
$('adminBtn').onclick=()=>overlay(true);$('closeAdmin').onclick=()=>overlay(false);
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{if(!configured)throw Error('ยังไม่ได้ตั้งค่า Supabase');const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;await rpc('seatmap_admin_requests');admin=true;$('adminLogin').hidden=true;$('adminBoard').hidden=false;await loadProfiles();await loadRoster();await loadRequests();message('adminNotice','')}catch(err){await db?.auth.signOut();message('adminNotice','⚠ '+err.message)}});
$('logout').onclick=async()=>{studentRoster=[];closeRoster();await db.auth.signOut();admin=false;$('adminBoard').hidden=true;$('adminLogin').hidden=false};
function fillEditForm(){closeRoster();const seat=$('editSeat').value,x=occupants.find(x=>x.seat_id===seat),p=profiles.get(seat);$('editName').value=x?.student_name||'';$('editNo').value=x?.student_number||'';$('editNickname').value=p?.nickname||x?.nickname||'';$('editBirthday').value=p?.birth_date||''}
async function loadProfiles(){if(!admin)return;try{const rows=await rpc('seatmap_admin_profiles');profiles=new Map((rows||[]).map(x=>[x.seat_id,x]));profileSchemaReady=true;fillEditForm();message('adminNotice','')}catch(e){profiles.clear();profileSchemaReady=false;fillEditForm();message('adminNotice','โปรดติดตั้ง SQL เพิ่มชื่อเล่นและวันเกิดในโปรเจกต์ Supabase ของ Class Room Map ก่อนใช้งานช่องใหม่')}}

async function loadRoster(){
 if(!admin)return;
 try{
  const rows=await rpc('seatmap_admin_roster');
  studentRoster=(rows||[]).map(r=>({student_number:Number(r.student_number),student_name:String(r.student_name||'')})).filter(r=>r.student_name);
  $('rosterHint').textContent='ค้นหาได้จากชื่อ นามสกุล หรือเลขที่ ('+studentRoster.length+' รายชื่อ) — เลือกแล้วระบบเติมเลขที่ให้ทันที';
 }catch(err){
  studentRoster=[];$('rosterHint').textContent='ยังไม่มีรายชื่อสำหรับค้นหา: โปรดรันไฟล์ติดตั้งรายชื่อใน Supabase ใหม่ก่อน';
 }
}
function closeRoster(){
 const list=$('studentSuggestions');if(!list)return;
 list.hidden=true;list.replaceChildren();$('editName').setAttribute('aria-expanded','false');
}
function showRoster(){
 const q=$('editName').value.trim().toLocaleLowerCase('th-TH'),list=$('studentSuggestions');
 list.replaceChildren();
 if(!admin||!studentRoster.length){closeRoster();return}
 const rows=studentRoster.filter(x=>!q||x.student_name.toLocaleLowerCase('th-TH').includes(q)||String(x.student_number).includes(q)).slice(0,12);
 if(!rows.length){closeRoster();return}
 for(const r of rows){
  const option=document.createElement('button');option.type='button';option.className='roster-option';option.setAttribute('role','option');
  const num=document.createElement('span');num.className='roster-num';num.textContent='เลขที่ '+r.student_number;
  const name=document.createElement('span');name.textContent=r.student_name;
  option.append(num,name);
  option.addEventListener('pointerdown',event=>event.preventDefault());
  option.addEventListener('click',()=>{
    $('editName').value=r.student_name;$('editNo').value=r.student_number;
    // Keep the selected student's own private profile when choosing a new seat.
    const existing=occupants.find(x=>Number(x.student_number)===r.student_number);
    const privateProfile=existing?profiles.get(existing.seat_id):null;
    $('editNickname').value=privateProfile?.nickname||existing?.nickname||'';
    $('editBirthday').value=privateProfile?.birth_date||'';
    closeRoster();
  });
  list.append(option);
 }
 list.hidden=false;$('editName').setAttribute('aria-expanded','true');
}
$('editName').addEventListener('input',showRoster);
$('editName').addEventListener('focus',showRoster);
$('editName').addEventListener('keydown',event=>{
 const list=$('studentSuggestions');
 if(event.key==='Escape'){closeRoster();return}
 if(event.key==='ArrowDown'&&!list.hidden){event.preventDefault();list.querySelector('button')?.focus()}
 if(event.key==='Enter'&&!list.hidden&&list.children.length===1){event.preventDefault();list.querySelector('button')?.click()}
});
$('studentSuggestions').addEventListener('keydown',event=>{
 const options=[...$('studentSuggestions').querySelectorAll('button')];const index=options.indexOf(document.activeElement);
 if(event.key==='Escape'){event.preventDefault();closeRoster();$('editName').focus()}
 if(event.key==='ArrowDown'){event.preventDefault();options[Math.min(index+1,options.length-1)]?.focus()}
 if(event.key==='ArrowUp'){event.preventDefault();if(index<=0)$('editName').focus();else options[index-1]?.focus()}
});
document.addEventListener('click',event=>{if(!event.target.closest('.roster-picker'))closeRoster()});

$('editSeat').onchange=fillEditForm;
$('assignForm').addEventListener('submit',async e=>{e.preventDefault();try{if(!profileSchemaReady)throw Error('กรุณารันไฟล์ seating/supabase/add-student-profiles.sql ใน Supabase ใหม่ก่อนบันทึก');const seat=$('editSeat').value;const incoming=$('editName').value.trim();const incomingNo=$('editNo').value?Number($('editNo').value):null;const previous=occupants.find(x=>x.seat_id===seat);
if(!incoming && previous && !confirm('ต้องการลบรายชื่อและข้อมูลเพิ่มเติมของที่นั่ง '+seat+' จริงหรือไม่?'))return;
if(incoming && previous && previous.student_number!==incomingNo){throw Error('ที่นั่งนี้มีนักเรียนอยู่แล้ว กรุณาเลือกที่นั่งว่างหรือจัดการสลับที่นั่งผ่านคำขออนุมัติ')}
await rpc('seatmap_admin_assign_profile',{p_seat:seat,p_name:$('editName').value.trim(),p_number:$('editNo').value?Number($('editNo').value):null,p_nickname:$('editNickname').value.trim()||null,p_birthday:$('editBirthday').value||null});await refresh();await loadProfiles();$('editSeat').value=seat;fillEditForm();message('adminNotice','✓ บันทึกชื่อ–นามสกุล ชื่อเล่น และวันเกิดเรียบร้อยแล้ว')}catch(err){message('adminNotice','⚠ '+err.message)}});
async function loadRequests(){if(!admin)return;try{const requests=await rpc('seatmap_admin_requests');const root=$('requests');root.replaceChildren();if(!requests.length){root.textContent='ยังไม่มีคำขอรออนุมัติ';return}for(const r of requests){const div=document.createElement('div');div.className='admin-row';const info=document.createElement('div');const title=document.createElement('strong');title.textContent=`${r.requester_name} เลขที่ ${r.requester_number}: ${r.from_seat} ↔ ${r.to_seat}`;const small=document.createElement('small');small.textContent=r.reason||'ไม่ได้ระบุเหตุผล';info.append(title,small);const actions=document.createElement('div');actions.className='action-line';for(const [label,approve] of [['อนุมัติ',true],['ปฏิเสธ',false]]){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{if(approve&&!confirm('ยืนยันว่าตรวจสอบความยินยอมของนักเรียนทั้งสองฝ่ายแล้ว?'))return;try{await rpc('seatmap_admin_decide',{p_id:r.id,p_approve:approve});await refresh();await loadProfiles();await loadRequests();message('adminNotice',approve?'✓ อนุมัติและสลับที่นั่งแล้ว':'ปฏิเสธคำขอแล้ว')}catch(err){message('adminNotice','⚠ '+err.message)}};actions.append(b)}div.append(info,actions);root.append(div)}}catch(err){message('adminNotice','⚠ '+err.message)}}
if(configured){db.channel('seatmap-updates').on('postgres_changes',{event:'*',schema:'public',table:'seatmap_seats'},()=>refresh()).subscribe();db.channel('seatmap-requests').on('postgres_changes',{event:'*',schema:'public',table:'seatmap_swap_requests'},()=>{if(admin)loadRequests()}).subscribe();refresh();setInterval(()=>{refresh();if(admin)loadRequests()},15000)}else{render();message('connection','ยังไม่ได้เชื่อมต่อฐานข้อมูล')}
