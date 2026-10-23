"use strict";
/* Student name/seat finder for the public seat-exchange panel. Read-only: it never writes seating data. */
(()=>{
  const $=id=>document.getElementById(id);
  const form=$("swapForm");
  if(!form)return;

  const style=document.createElement("style");
  style.textContent=`
    .swap-finder{margin:0 0 16px;padding:14px;border:1px solid #ffffff1c;border-radius:16px;background:linear-gradient(145deg,#ffffff0b,#ffffff05);box-shadow:0 10px 28px #05050d26}
    .swap-finder-label{display:block;color:#c8cce4;font-size:12px;margin:0 0 7px}
    .swap-finder-wrap{position:relative}
    .swap-finder-input{width:100%;background:#ffffff0c;color:#fff;border:1px solid #ffffff30;border-radius:12px;padding:13px;font:inherit;outline:none}
    .swap-finder-input:focus{border-color:#bca9ff;box-shadow:0 0 0 3px #bca9ff18}
    .swap-finder-results{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 6px);display:none;max-height:280px;overflow:auto;padding:5px;border:1px solid #afa2f175;border-radius:12px;background:#252542;box-shadow:0 18px 40px #08081680}
    .swap-finder-results.is-open{display:block}
    .swap-finder-result{display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:9px;padding:9px 10px;background:transparent;color:#fff;text-align:left;cursor:pointer;font:inherit}
    .swap-finder-result:hover,.swap-finder-result:focus-visible{background:#9c8dff30;outline:2px solid #cbb9ff;outline-offset:-2px}
    .swap-finder-seat{flex:0 0 auto;min-width:42px;text-align:center;padding:5px 7px;border-radius:7px;background:#9484ff30;color:#ddd7ff;font-weight:600;font-size:12px}
    .swap-finder-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .swap-finder-no{margin-left:auto;color:#bfc5e0;font-size:11px;white-space:nowrap}
    .swap-person-card{display:none;margin-top:10px;padding:12px 13px;border-radius:13px;border:1px solid #bca9ff55;background:linear-gradient(135deg,#8d78ff1b,#ffffff08);animation:swap-finder-in .25s ease}
    .swap-person-card.is-visible{display:block}
    .swap-person-top{display:flex;justify-content:space-between;align-items:center;gap:10px}
    .swap-person-badge{font-size:10px;letter-spacing:.08em;color:#cfc7ff;text-transform:uppercase}
    .swap-person-seat{font-size:22px;font-weight:700;color:#e3dcff}
    .swap-person-name{margin-top:4px;font-size:14px;font-weight:600;overflow-wrap:anywhere}
    .swap-person-meta{margin-top:4px;color:#aeb5d1;font-size:11px}
    .swap-person-clear{margin-top:9px;border:0;background:transparent;color:#bcb2df;font:inherit;font-size:11px;cursor:pointer;padding:0;text-decoration:underline}
    .swap-finder-hint{margin:7px 0 0;color:#9299b9;font-size:10px;line-height:1.55}
    @keyframes swap-finder-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    @media(max-width:700px){.swap-finder-input{font-size:16px}.swap-finder-results{max-height:34dvh}.swap-person-seat{font-size:20px}}
    @media(prefers-reduced-motion:reduce){.swap-person-card{animation:none}}
  `;
  document.head.append(style);

  const block=document.createElement("div");
  block.className="swap-finder";
  block.innerHTML=`
    <label class="swap-finder-label" for="swapFinderInput">เลือกชื่อผู้ขอสลับที่นั่ง</label>
    <div class="swap-finder-wrap">
      <input id="swapFinderInput" class="swap-finder-input" type="search" autocomplete="off" placeholder="ค้นหาชื่อ หรือเลขที่..." aria-autocomplete="list" aria-controls="swapFinderResults" aria-expanded="false">
      <div id="swapFinderResults" class="swap-finder-results" role="listbox"></div>
    </div>
    <p class="swap-finder-hint">พิมพ์ชื่อหรือเลขที่ แล้วกดชื่อที่ต้องการ ระบบจะแสดงว่าปัจจุบันนั่งอยู่ที่ไหนและกรอกข้อมูลให้โดยอัตโนมัติ</p>
    <div id="swapPersonCard" class="swap-person-card" aria-live="polite">
      <div class="swap-person-top"><span class="swap-person-badge">CURRENT SEAT</span><strong id="swapPersonSeat" class="swap-person-seat">—</strong></div>
      <div id="swapPersonName" class="swap-person-name">—</div>
      <div id="swapPersonMeta" class="swap-person-meta">—</div>
      <button id="swapPersonClear" class="swap-person-clear" type="button">เปลี่ยนคนที่เลือก</button>
    </div>`;
  const firstLabel=form.querySelector("label");
  form.insertBefore(block,firstLabel||form.firstChild);

  const input=$("swapFinderInput"),results=$("swapFinderResults"),card=$("swapPersonCard");
  let people=[];
  let selectedNo=null;

  function readPeople(){
    const rows=[];
    document.querySelectorAll("#seatGrid .seat.is-booked").forEach(btn=>{
      const title=btn.getAttribute("title")||"";
      const match=title.match(/^([^:]+):\\s*(.*?)\\s+เลขที่\\s+(\\d+)$/);
      if(!match)return;
      rows.push({seat:match[1].trim(),name:match[2].trim(),number:Number(match[3]),button:btn});
    });
    people=rows;
    if(selectedNo!==null){
      const current=people.find(x=>x.number===selectedNo);
      if(current)showCard(current,false); else clearSelection(false);
    }
  }

  function closeResults(){results.classList.remove("is-open");input.setAttribute("aria-expanded","false")}

  function showResults(){
    const q=input.value.trim().toLocaleLowerCase("th-TH");
    results.replaceChildren();
    if(!people.length||!q){closeResults();return}
    const matches=people.filter(x=>x.name.toLocaleLowerCase("th-TH").includes(q)||String(x.number).includes(q)).slice(0,12);
    if(!matches.length){
      const empty=document.createElement("div");empty.className="swap-finder-result";empty.style.cursor="default";empty.textContent="ไม่พบชื่อหรือเลขที่ในผังปัจจุบัน";results.append(empty);results.classList.add("is-open");input.setAttribute("aria-expanded","true");return;
    }
    for(const person of matches){
      const b=document.createElement("button");b.type="button";b.className="swap-finder-result";b.setAttribute("role","option");
      const seat=document.createElement("span");seat.className="swap-finder-seat";seat.textContent=person.seat;
      const name=document.createElement("span");name.className="swap-finder-name";name.textContent=person.name;
      const no=document.createElement("span");no.className="swap-finder-no";no.textContent=`เลขที่ ${person.number}`;
      b.append(seat,name,no);b.addEventListener("click",()=>selectPerson(person));results.append(b);
    }
    results.classList.add("is-open");input.setAttribute("aria-expanded","true");
  }

  function showCard(person,focusInput=true){
    selectedNo=person.number;
    input.value=person.name;
    $("requesterName").value=person.name;
    $("requesterNo").value=String(person.number);
    $("swapPersonSeat").textContent=person.seat;
    $("swapPersonName").textContent=person.name;
    $("swapPersonMeta").textContent=`เลขที่ ${person.number} · ตำแหน่งปัจจุบัน ${person.seat}`;
    card.classList.add("is-visible");
    closeResults();
    if(person.button){person.button.click();}
    if(focusInput)input.blur();
  }

  function selectPerson(person){showCard(person,true)}

  function clearSelection(clearFields=true){
    selectedNo=null;card.classList.remove("is-visible");
    if(clearFields){input.value="";if($("requesterName"))$("requesterName").value="";if($("requesterNo"))$("requesterNo").value="";}
    closeResults();
  }

  input.addEventListener("input",showResults);
  input.addEventListener("focus",()=>{if(input.value.trim())showResults()});
  input.addEventListener("keydown",e=>{if(e.key==="Escape")closeResults();if(e.key==="Enter"&&results.classList.contains("is-open")){const first=results.querySelector("button");if(first){e.preventDefault();first.click()}}});
  $("swapPersonClear").addEventListener("click",()=>{clearSelection();input.focus()});
  form.addEventListener("reset",()=>setTimeout(()=>clearSelection(),0));
  document.addEventListener("click",e=>{if(!e.target.closest(".swap-finder"))closeResults()});

  const grid=$("seatGrid");
  if(grid){
    const observer=new MutationObserver(()=>{readPeople()});
    observer.observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:["class","title"]});
  }
  window.setTimeout(readPeople,0);
  window.setTimeout(readPeople,500);
})();
