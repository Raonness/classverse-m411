"use strict";
/* Shared transition and back navigation. Does not read or change booking records. */
(()=>{
  const prefersReduced=window.matchMedia("(prefers-reduced-motion: reduce)");
  const portalPath="/classverse-m411/";
  const portalMenu=portalPath+"#menu";
  const current=()=>window.location.pathname;
  let leaving=false;
  let overlay=null;

  function makeOverlay(){
    if(overlay)return overlay;
    overlay=document.createElement("div");
    overlay.className="cv-transition-overlay";
    overlay.setAttribute("aria-hidden","true");
    overlay.innerHTML='<div class="cv-transition-overlay-inner"><div class="cv-loader-orbit">✳</div><strong class="cv-loader-label">CLASSVERSE M.4/11</strong><span class="cv-loader-sub">กำลังเปิดหน้าถัดไป…</span></div>';
    document.body.append(overlay);
    return overlay;
  }

  function navigate(href,replace=false){
    if(leaving)return;
    leaving=true;
    if(prefersReduced.matches){
      if(replace)window.location.replace(href);
      else window.location.assign(href);
      return;
    }
    makeOverlay().classList.add("cv-visible");
    window.setTimeout(()=>{
      if(replace)window.location.replace(href);
      else window.location.assign(href);
    },270);
  }

  function safeLocalReferrer(){
    try{
      if(!document.referrer)return false;
      const ref=new URL(document.referrer);
      return ref.origin===window.location.origin && ref.pathname.startsWith(portalPath) &&
        (ref.pathname!==current() || ref.hash!==window.location.hash);
    }catch{return false}
  }
  function goBack(){
    if(leaving)return;
    if(safeLocalReferrer() && window.history.length>1){
      leaving=true;
      if(!prefersReduced.matches)makeOverlay().classList.add("cv-visible");
      window.setTimeout(()=>window.history.back(),prefersReduced.matches?0:270);
      return;
    }
    navigate(portalMenu);
  }

  function loadSeatingFinder(){
    if(!current().startsWith(portalPath+"seating/")||document.querySelector('script[data-seating-finder]'))return;
    const script=document.createElement("script");
    script.src="swap-finder-fix.js?v=20261023finder2";
    script.dataset.seatingFinder="true";
    document.body.append(script);
  }

  function setup(){
    if(!prefersReduced.matches){
      const main=document.querySelector("main");
      if(main){main.classList.add("cv-page-enter");main.addEventListener("animationend",()=>main.classList.remove("cv-page-enter"),{once:true})}
    }
    document.querySelectorAll("[data-cv-back]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();goBack()}));
    document.addEventListener("click",e=>{
      if(leaving || e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)return;
      const target=e.target instanceof Element?e.target.closest("a[href]"):null;
      if(!target||target.hasAttribute("download")||target.target==="_blank"||target.dataset.cvBack!==undefined)return;
      let url;try{url=new URL(target.href,window.location.href)}catch{return}
      if(url.origin!==location.origin||!url.pathname.startsWith(portalPath))return;
      if(url.pathname===location.pathname)return;
      e.preventDefault();navigate(url.href);
    });
    loadSeatingFinder();
  }

  window.addEventListener("pageshow",()=>{leaving=false;if(overlay)overlay.classList.remove("cv-visible")});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();
