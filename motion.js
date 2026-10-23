"use strict";
/* Decorative interactions only: never touches Supabase, seat data or submissions. */
(()=>{
  const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
  const clickable="button, a.main-action, a.live-card";
  function ripple(target,x,y){
    if(reduce.matches||target.disabled||target.getAttribute("aria-disabled")==="true")return;
    const r=target.getBoundingClientRect();
    if(r.width===0||r.height===0)return;
    const dot=document.createElement("span");
    dot.className="cv-ripple";
    dot.setAttribute("aria-hidden","true");
    dot.style.setProperty("--cv-x",(x-r.left)+"px");
    dot.style.setProperty("--cv-y",(y-r.top)+"px");
    dot.style.setProperty("--cv-size",(Math.max(r.width,r.height)*2.1)+"px");
    // Respect CSS positioning used by the existing controls (especially close buttons).
    if(getComputedStyle(target).position==="static")target.classList.add("cv-pressable");
    target.append(dot);
    dot.addEventListener("animationend",()=>dot.remove(),{once:true});
  }
  document.addEventListener("pointerdown",e=>{
    if(e.button!==0)return;
    const target=e.target instanceof Element?e.target.closest(clickable):null;
    if(target)ripple(target,e.clientX,e.clientY);
  },{passive:true});
  document.addEventListener("click",e=>{
    if(e.detail!==0)return; // keyboard-triggered buttons and links
    const target=e.target instanceof Element?e.target.closest(clickable):null;
    if(target){const r=target.getBoundingClientRect();ripple(target,r.left+r.width/2,r.top+r.height/2)}
  });
  function setupCounters(){
    if(typeof MutationObserver==="undefined")return;
    for(const el of document.querySelectorAll("[data-cv-count]")){
      let previous=el.textContent.trim();
      const observer=new MutationObserver(()=>{
        const next=el.textContent.trim();
        if(next===previous)return;
        previous=next;
        if(reduce.matches||!el.animate)return;
        el.animate([{opacity:.45,transform:"translateY(5px) scale(.96)"},{opacity:1,transform:"translateY(0) scale(1)"}],{duration:350,easing:"cubic-bezier(.2,.8,.2,1)"});
      });
      observer.observe(el,{childList:true,characterData:true,subtree:true});
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setupCounters,{once:true});else setupCounters();
})();
