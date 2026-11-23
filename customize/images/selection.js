"use strict";
(() => {
  const root=document.querySelector(".selection-shell");
  const path=location.pathname;
  const mode=path.includes("video-images")?"video":path.includes("pdf-images")?"pdf":"upload";
  const config={
    upload:{title:"เลือกรูปภาพที่อัปโหลด",heading:"รูปภาพที่อัปโหลด",desc:"เลือกรูปภาพจากอุปกรณ์ของคุณ แยกรายการและสถานะการเลือกจากหน้าอื่น",accept:"image/*",picker:"เลือกรูปภาพ",help:"เลือกภาพได้หลายไฟล์พร้อมกัน หรือลากไฟล์มาวาง",eyebrow:"SOURCE 01",input:"รูปภาพ"},
    video:{title:"เลือกรูปภาพจากวิดีโอ",heading:"ภาพที่ดึงจากวิดีโอ",desc:"แปลงวิดีโอ MP4 เป็นภาพตัวอย่าง แล้วเลือกเฉพาะเฟรมที่ต้องการ",accept:"video/mp4,.mp4",picker:"เลือกวิดีโอ MP4",help:"ระบบจะดึงภาพตามช่วงเวลาที่กำหนด",eyebrow:"SOURCE 02",input:"วิดีโอ"},
    pdf:{title:"เลือกรูปภาพจาก PDF",heading:"ภาพที่แปลงจาก PDF",desc:"แปลงแต่ละหน้าในเอกสาร PDF เป็นภาพ แล้วเลือกเฉพาะหน้าที่ต้องการ",accept:"application/pdf,.pdf",picker:"เลือกไฟล์ PDF",help:"แต่ละหน้าของเอกสารจะกลายเป็นภาพ PNG",eyebrow:"SOURCE 03",input:"PDF"}
  }[mode];
  const $=id=>document.getElementById(id);
  const EXPORT_ZIP_THRESHOLD=100;
  const state={items:[],selected:new Set(),page:0,pageSize:48,query:"",busy:false};
  const setStatus=(message,type)=>{const el=$("statusLine");el.textContent=message;el.dataset.state=type||""};
  const bytes=n=>{if(!n)return"0 B";const u=["B","KB","MB","GB"];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);return(n/1024**i).toFixed(i?1:0)+" "+u[i]};
  const cleanName=s=>String(s||"").replace(/[\\/:*?"<>|]+/g,"_").slice(0,180);
  const sourceBaseName=fileName=>{const name=String(fileName||"");const dot=name.lastIndexOf(".");return cleanName(dot>0?name.slice(0,dot):name)||"converted-image"};
  function uniqueNames(items){
    const used=new Set();
    return items.map(item=>{
      const original=item.name;let candidate=original;let suffix=2;
      const dot=original.lastIndexOf(".");const stem=dot>0?original.slice(0,dot):original;const extension=dot>0?original.slice(dot):"";
      while(used.has(candidate.toLocaleLowerCase()))candidate=stem+" ("+(suffix++)+")"+extension;
      used.add(candidate.toLocaleLowerCase());return candidate;
    });
  }
  function setupPage(){
    root.dataset.mode=mode;$("pageTitle").innerHTML=config.title+"<span>.</span>";$("pageDescription").textContent=config.desc;
    $("sourceTitle").textContent=config.heading;$("sourceEyebrow").textContent=config.eyebrow;
    $("pickerLabel").textContent=config.picker;$("pickerHelp").textContent=config.help;
    $("sourceFiles").accept=config.accept;$("sourceFiles").multiple=mode==="upload";
    document.querySelectorAll("[data-tab]").forEach(a=>{if(a.dataset.tab===mode)a.setAttribute("aria-current","page")});
    if(mode!=="upload"){
      const settings=$("conversionSettings");settings.hidden=false;
      if(mode==="video")settings.innerHTML='<label class="page-size-field">ดึงภาพทุก <input id="frameEvery" type="number" min=".25" max="60" step=".25" value="1" style="width:82px;min-height:40px;padding:.4rem;border:1px solid var(--color-line-strong)"> วินาที</label>';
      else settings.innerHTML='<label class="page-size-field">ความละเอียด <select id="pdfScale" style="min-height:40px;padding:.4rem;border:1px solid var(--color-line-strong)"><option value="1">1×</option><option value="1.5" selected>1.5×</option><option value="2">2×</option></select></label>';
    }
  }
  function updateControls(){
    $("selectionCount").textContent="เลือกแล้ว "+state.selected.size.toLocaleString("th-TH")+" / "+state.items.length.toLocaleString("th-TH");
    $("exportZip").disabled=!state.selected.size||state.busy;
    $("exportFiles").disabled=!state.selected.size||state.busy;
    $("exportZip").textContent="ดาวน์โหลด ZIP ("+state.selected.size.toLocaleString("th-TH")+" ภาพ) ↓";
    $("exportFiles").textContent="ดาวน์โหลดไฟล์แยก ("+state.selected.size.toLocaleString("th-TH")+" ไฟล์) ↓";
    $("selectAll").disabled=!state.items.length||state.busy||state.selected.size===state.items.length;
    $("clearAll").disabled=!state.selected.size||state.busy;
  }
  function filtered(){const q=state.query.toLocaleLowerCase();return state.items.map((item,index)=>({item,index})).filter(x=>x.item.name.toLocaleLowerCase().includes(q))}
  function render(){
    const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/state.pageSize));
    state.page=Math.min(state.page,pages-1);const start=state.page*state.pageSize;
    const visible=rows.slice(start,start+state.pageSize);const list=$("imageList");list.replaceChildren();
    const frag=document.createDocumentFragment();
    visible.forEach(({item,index},offset)=>{
      const row=document.createElement("label");row.className="image-row"+(state.selected.has(index)?" is-selected":"");
      const check=document.createElement("input");check.type="checkbox";check.checked=state.selected.has(index);check.setAttribute("aria-label","เลือก "+item.name);
      check.addEventListener("change",()=>{check.checked?state.selected.add(index):state.selected.delete(index);row.classList.toggle("is-selected",check.checked);updateControls()});
      const img=document.createElement("img");img.loading="lazy";img.alt="";img.src=item.url;
      const meta=document.createElement("span");meta.className="image-meta";
      const name=document.createElement("strong");name.textContent=item.name;
      const detail=document.createElement("small");detail.textContent=(item.detail||bytes(item.blob.size))+" · "+bytes(item.blob.size);
      meta.append(name,detail);
      const number=document.createElement("span");number.className="image-index";number.textContent=String(start+offset+1).padStart(4,"0");
      row.append(check,img,meta,number);frag.append(row);
    });
    list.append(frag);$("emptyState").classList.toggle("is-visible",!visible.length);
    $("pageInfo").textContent="หน้า "+(state.page+1)+" / "+pages+" · "+rows.length.toLocaleString("th-TH")+" รายการ";
    $("previousPage").disabled=state.page===0;$("nextPage").disabled=state.page>=pages-1;
    updateControls();
  }
  function addItem(blob,name,detail){
    const url=URL.createObjectURL(blob);state.items.push({blob,name:cleanName(name),url,detail});
  }
  function clearItems(){
    state.items.forEach(item=>URL.revokeObjectURL(item.url));state.items=[];state.selected.clear();state.page=0;
  }
  async function processVideo(file){
    const video=document.createElement("video");const url=URL.createObjectURL(file);video.preload="auto";video.muted=true;video.playsInline=true;video.src=url;
    try{
      await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error("อ่านวิดีโอไม่สำเร็จ"));});
      if(!Number.isFinite(video.duration)||!video.videoWidth)throw new Error("ไม่พบข้อมูลวิดีโอที่ใช้งานได้");
      const step=Math.max(.25,Math.min(60,Number($("frameEvery").value)||1));
      const total=Math.min(10000,Math.floor(video.duration/step)+1);
      const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      const ctx=canvas.getContext("2d",{alpha:false});
      for(let i=0;i<total;i++){
        const time=Math.min(i*step,Math.max(0,video.duration-.05));
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("หมดเวลารอเฟรมวิดีโอ")),12000);const done=()=>{clearTimeout(timer);resolve()};video.addEventListener("seeked",done,{once:true});video.currentTime=time;if(Math.abs(video.currentTime-time)<.01&&video.readyState>=2)done();});
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
        if(blob)addItem(blob,sourceBaseName(file.name)+"_frame-"+String(i+1).padStart(5,"0")+".jpg",time.toFixed(2)+" วินาที");
        setStatus("กำลังดึงภาพ "+(i+1).toLocaleString("th-TH")+" / "+total.toLocaleString("th-TH"));
        if(i%8===0)await new Promise(requestAnimationFrame);
      }
    }finally{URL.revokeObjectURL(url);video.remove()}
  }
  async function processPdf(file){
    if(!window.pdfjsLib)throw new Error("โหลดตัวอ่าน PDF ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const data=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data}).promise;
    if(pdf.numPages>10000)throw new Error("เอกสารมีจำนวนหน้าเกินขีดจำกัด 10,000 หน้า");
    const scale=Number($("pdfScale").value)||1.5;const canvas=document.createElement("canvas");const ctx=canvas.getContext("2d");
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      const page=await pdf.getPage(pageNo);const viewport=page.getViewport({scale});
      if(viewport.width*viewport.height>30000000)throw new Error("หน้าที่ "+pageNo+" มีขนาดภาพใหญ่เกินไป กรุณาเลือกระดับความละเอียดต่ำลง");
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:ctx,viewport}).promise;
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      if(blob)addItem(blob,sourceBaseName(file.name)+"_page-"+String(pageNo).padStart(5,"0")+".png","หน้า "+pageNo);
      setStatus("กำลังแปลงหน้า "+pageNo.toLocaleString("th-TH")+" / "+pdf.numPages.toLocaleString("th-TH"));
      if(pageNo%5===0)await new Promise(requestAnimationFrame);
    }
    canvas.width=canvas.height=1;
  }
  async function handleFiles(files){
    const incoming=Array.from(files||[]);if(!incoming.length)return;
    if(mode==="upload"){
      const images=incoming.filter(file=>file.type.startsWith("image/"));
      if(!images.length){setStatus("กรุณาเลือกไฟล์รูปภาพที่รองรับ","error");return}
      if(state.items.length+images.length>10000){setStatus("รองรับได้สูงสุด 10,000 ภาพต่อหน้า","error");return}
      images.forEach(file=>addItem(file,file.name));
      setStatus("เพิ่มรูปภาพ "+images.length.toLocaleString("th-TH")+" รายการแล้ว","success");render();return;
    }
    const file=incoming[0];if(mode==="video"&&!file.type.startsWith("video/")&&!file.name.toLowerCase().endsWith(".mp4")){setStatus("กรุณาเลือกไฟล์วิดีโอ MP4","error");return}
    if(mode==="pdf"&&file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){setStatus("กรุณาเลือกไฟล์ PDF","error");return}
    state.busy=true;updateControls();clearItems();render();setStatus("กำลังเตรียมไฟล์…","working");
    try{if(mode==="video")await processVideo(file);else await processPdf(file);setStatus("แปลงสำเร็จ · ได้ภาพ "+state.items.length.toLocaleString("th-TH")+" รายการ","success");}
    catch(error){setStatus(error.message||"ไม่สามารถแปลงไฟล์ได้","error")}
    finally{state.busy=false;render()}
  }
  async function exportZip(){
    if(!state.selected.size||state.busy)return;
    const indices=Array.from(state.selected).sort((a,b)=>a-b);
    state.busy=true;updateControls();
    try{
      if(!window.JSZip)throw new Error("โหลดระบบสร้าง ZIP ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
      setStatus("กำลังเตรียม ZIP จาก "+indices.length.toLocaleString("th-TH")+" ภาพ…","working");
      const zip=new JSZip();
      const selectedItems=indices.map(index=>state.items[index]);
      const downloadNames=uniqueNames(selectedItems);
      selectedItems.forEach((item,position)=>zip.file(downloadNames[position],item.blob));
      const blob=await zip.generateAsync({type:"blob"},meta=>setStatus("กำลังบีบอัด "+Math.round(meta.percent)+"%","working"));
      const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=mode+"-selected-images.zip";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      setStatus("เตรียม ZIP แล้ว "+indices.length.toLocaleString("th-TH")+" ภาพ · "+bytes(blob.size),"success");
    }catch(error){setStatus(error.message||"ไม่สามารถสร้าง ZIP ได้","error")}
    finally{state.busy=false;updateControls()}
  }
  async function exportFiles(){
    if(!state.selected.size||state.busy)return;
    const indices=Array.from(state.selected).sort((a,b)=>a-b);
    state.busy=true;updateControls();
    try{
      setStatus("กำลังส่งไฟล์ที่เลือกไปยังการดาวน์โหลด…","working");
      const selectedItems=indices.map(index=>state.items[index]);
      const downloadNames=uniqueNames(selectedItems);
      for(let position=0;position<selectedItems.length;position++){
        const item=selectedItems[position];
        const link=document.createElement("a");
        link.href=item.url;
        link.download=downloadNames[position];
        link.style.display="none";
        document.body.append(link);link.click();link.remove();
        if(position%20===19){
          setStatus("ส่งคำขอดาวน์โหลดแล้ว "+(position+1).toLocaleString("th-TH")+" / "+indices.length.toLocaleString("th-TH")+" ไฟล์","working");
          await new Promise(resolve=>setTimeout(resolve,250));
        }else{
          await new Promise(resolve=>setTimeout(resolve,80));
        }
      }
      setStatus("ส่งคำขอดาวน์โหลดแยกครบ "+indices.length.toLocaleString("th-TH")+" ไฟล์แล้ว · เบราว์เซอร์อาจจำกัดการดาวน์โหลดหลายไฟล์","success");
    }catch(error){setStatus(error.message||"ไม่สามารถดาวน์โหลดไฟล์ได้","error")}
    finally{state.busy=false;updateControls()}
  }
  $("sourceFiles").addEventListener("change",event=>{const files=event.target.files;handleFiles(files);event.target.value="";});
  $("selectAll").addEventListener("click",()=>{state.items.forEach((_,index)=>state.selected.add(index));render();setStatus("เลือกภาพทั้งหมดในรายการแล้ว","success")});
  $("clearAll").addEventListener("click",()=>{state.selected.clear();render();setStatus("ยกเลิกการเลือกทั้งหมดแล้ว","success")});
  $("exportZip").addEventListener("click",exportZip);\n  $("exportFiles").addEventListener("click",exportFiles);
  $("searchInput").addEventListener("input",event=>{state.query=event.target.value;state.page=0;render()});
  $("pageSize").addEventListener("change",event=>{state.pageSize=Number(event.target.value)||48;state.page=0;render()});
  $("previousPage").addEventListener("click",()=>{state.page--;render()});$("nextPage").addEventListener("click",()=>{state.page++;render()});
  const picker=document.querySelector(".file-picker");
  picker.addEventListener("dragover",event=>{if(Array.from(event.dataTransfer.types).includes("Files")){event.preventDefault();picker.classList.add("is-dragover")}});
  picker.addEventListener("dragleave",()=>picker.classList.remove("is-dragover"));
  picker.addEventListener("drop",event=>{if(Array.from(event.dataTransfer.types).includes("Files")){event.preventDefault();picker.classList.remove("is-dragover");handleFiles(event.dataTransfer.files)}});
  window.addEventListener("beforeunload",()=>state.items.forEach(item=>URL.revokeObjectURL(item.url)));
  setupPage();render();
})();