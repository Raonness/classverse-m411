"use strict";

const MAX_OUTPUT_ITEMS = 100;
const MAX_PDF_PIXELS = 30000000;

const byId = (id) => document.getElementById(id);
const state = { videoFile: null, pdfFile: null, videoUrl: null, pdfUrl: null };

function setStatus(id, message, kind) {
  const node = byId(id);
  node.textContent = message;
  if (kind) node.dataset.state = kind;
  else delete node.dataset.state;
}

function setProgress(id, value, visible) {
  const bar = byId(id);
  bar.value = Math.max(0, Math.min(100, value));
  bar.hidden = !visible;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index];
}

function safeBaseName(filename) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").trim();
  return base.slice(0, 80) || "converted-files";
}

function releaseDownloadUrl(key) {
  if (state[key]) {
    URL.revokeObjectURL(state[key]);
    state[key] = null;
  }
}

function attachDownload(blob, filename, linkId, stateKey) {
  releaseDownloadUrl(stateKey);
  const url = URL.createObjectURL(blob);
  state[stateKey] = url;
  const link = byId(linkId);
  link.href = url;
  link.download = filename;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("เบราว์เซอร์ไม่สามารถสร้างไฟล์ภาพได้"));
    }, type, quality);
  });
}

function waitForMediaEvent(media, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      media.removeEventListener(eventName, onReady);
      media.removeEventListener("error", onError);
      window.clearTimeout(timer);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("อ่านวิดีโอไม่สำเร็จ หรือรูปแบบไฟล์ไม่รองรับ")); };
    media.addEventListener(eventName, onReady, { once: true });
    media.addEventListener("error", onError, { once: true });
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("ใช้เวลาอ่านวิดีโอนานเกินไป กรุณาลองไฟล์อื่น"));
    }, timeoutMs);
  });
}

async function seekVideo(video, time) {
  if (Math.abs(video.currentTime - time) < 0.01 && video.readyState >= 2) return;
  const ready = waitForMediaEvent(video, "seeked", 15000);
  video.currentTime = time;
  await ready;
}

function prepareZip() {
  if (typeof JSZip === "undefined") throw new Error("โหลดเครื่องมือ ZIP ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บแล้วลองอีกครั้ง");
  return new JSZip();
}

function setBusy(buttonId, isBusy, label) {
  const button = byId(buttonId);
  button.disabled = isBusy || !(buttonId === "convertVideo" ? state.videoFile : state.pdfFile);
  if (label) button.textContent = label;
  else button.innerHTML = buttonId === "convertVideo"
    ? 'แปลงเป็นรูปภาพ <span aria-hidden="true">↗</span>'
    : 'แปลงเป็น PNG <span aria-hidden="true">↗</span>';
}

function handleFileSelection(inputId, nameId, buttonId, stateKey, acceptLabel, statusId, resultId) {
  byId(inputId).addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    byId(resultId).hidden = true;
    if (!file) {
      state[stateKey] = null;
      byId(nameId).textContent = "ยังไม่ได้เลือกไฟล์";
      byId(buttonId).disabled = true;
      setStatus(statusId, "เลือกไฟล์เพื่อเริ่มต้น");
      return;
    }
    const extensionOk = file.name.toLowerCase().endsWith(acceptLabel === "MP4" ? ".mp4" : ".pdf");
    const mimeOk = acceptLabel === "MP4"
      ? (file.type === "video/mp4" || file.type === "")
      : (file.type === "application/pdf" || file.type === "");
    if (!extensionOk || !mimeOk) {
      state[stateKey] = null;
      event.target.value = "";
      byId(nameId).textContent = "ไฟล์ไม่ถูกต้อง";
      byId(buttonId).disabled = true;
      setStatus(statusId, "กรุณาเลือกไฟล์ " + acceptLabel + " เท่านั้น", "error");
      return;
    }
    state[stateKey] = file;
    byId(nameId).textContent = file.name + " · " + formatBytes(file.size);
    byId(buttonId).disabled = false;
    setStatus(statusId, "พร้อมแปลงไฟล์", "success");
  });
}

async function convertVideo() {
  const file = state.videoFile;
  if (!file) return;
  const interval = Number(byId("frameInterval").value);
  const format = byId("frameFormat").value;
  if (!Number.isFinite(interval) || interval < 0.5 || interval > 60) {
    setStatus("videoStatus", "กำหนดช่วงเวลาได้ตั้งแต่ 0.5 ถึง 60 วินาที", "error");
    return;
  }

  const video = document.createElement("video");
  const sourceUrl = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: format === "png" });
  const buttonId = "convertVideo";
  let objectUrlReleased = false;

  byId("videoResult").hidden = true;
  setBusy(buttonId, true, "กำลังเตรียมวิดีโอ…");
  setStatus("videoStatus", "กำลังอ่านข้อมูลวิดีโอ", "working");
  setProgress("videoProgress", 0, true);

  try {
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const metadataReady = waitForMediaEvent(video, "loadedmetadata", 20000);
    video.src = sourceUrl;
    await metadataReady;
    if (video.readyState < 2) await waitForMediaEvent(video, "loadeddata", 20000);
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error("ไม่สามารถอ่านความยาวหรือขนาดวิดีโอได้");
    }

    const frameCount = Math.ceil(video.duration / interval);
    if (frameCount > MAX_OUTPUT_ITEMS) {
      throw new Error("การตั้งค่านี้จะสร้าง " + frameCount + " ภาพ ซึ่งมากเกินไปต่อหนึ่งครั้ง กรุณาเพิ่มช่วงเวลาดึงภาพให้ได้ไม่เกิน " + MAX_OUTPUT_ITEMS + " ภาพ");
    }
    if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการสร้างภาพจากวิดีโอ");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const zip = prepareZip();
    const extension = format === "jpg" ? "jpg" : "png";
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const times = [];
    for (let time = 0; time < video.duration && times.length < MAX_OUTPUT_ITEMS; time += interval) times.push(time);

    for (let index = 0; index < times.length; index += 1) {
      const time = times[index];
      await seekVideo(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, mime, format === "jpg" ? 0.92 : undefined);
      const frameName = "frame-" + String(index + 1).padStart(3, "0") + "." + extension;
      zip.file(frameName, blob);
      setProgress("videoProgress", ((index + 1) / times.length) * 90, true);
      setStatus("videoStatus", "กำลังสร้างภาพ " + (index + 1) + " / " + times.length, "working");
    }

    const readme = [
      "ClassVerse M.4/11 — Video to Image",
      "Source: " + file.name,
      "Frame interval: " + interval + " seconds",
      "Image format: " + format.toUpperCase(),
      "Video duration: " + video.duration.toFixed(2) + " seconds",
      "Frames created: " + times.length
    ].join("\n");
    zip.file("INFO.txt", readme);

    setStatus("videoStatus", "กำลังบีบอัดไฟล์เป็น ZIP", "working");
    const output = await zip.generateAsync({ type: "blob" }, (meta) => {
      setProgress("videoProgress", 90 + meta.percent * 0.1, true);
    });
    attachDownload(output, safeBaseName(file.name) + "-images.zip", "videoDownload", "videoUrl");
    byId("videoResultTitle").textContent = "แปลงวิดีโอสำเร็จ";
    byId("videoResultMeta").textContent = times.length + " ภาพ · " + formatBytes(output.size);
    byId("videoResult").hidden = false;
    setStatus("videoStatus", "เสร็จแล้ว ดาวน์โหลด ZIP ได้เลย", "success");
    setProgress("videoProgress", 100, true);
  } catch (error) {
    setStatus("videoStatus", error.message || "เกิดข้อผิดพลาดระหว่างแปลงวิดีโอ", "error");
    setProgress("videoProgress", 0, false);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    canvas.width = 0;
    canvas.height = 0;
    URL.revokeObjectURL(sourceUrl);
    objectUrlReleased = true;
    setBusy(buttonId, false);
    if (!objectUrlReleased) URL.revokeObjectURL(sourceUrl);
  }
}

async function convertPdf() {
  const file = state.pdfFile;
  if (!file) return;
  const startPage = Number(byId("pdfStart").value);
  const endInput = byId("pdfEnd").value.trim();
  const scale = Number(byId("pdfScale").value);
  if (!Number.isInteger(startPage) || startPage < 1) {
    setStatus("pdfStatus", "กรุณาระบุหน้าเริ่มต้นเป็นเลขตั้งแต่ 1 ขึ้นไป", "error");
    return;
  }
  if (endInput && (!Number.isInteger(Number(endInput)) || Number(endInput) < startPage)) {
    setStatus("pdfStatus", "หน้าสุดท้ายต้องเป็นเลขที่ไม่น้อยกว่าหน้าเริ่มต้น", "error");
    return;
  }
  if (typeof pdfjsLib === "undefined") {
    setStatus("pdfStatus", "โหลดเครื่องมืออ่าน PDF ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บแล้วลองอีกครั้ง", "error");
    return;
  }

  const buttonId = "convertPdf";
  byId("pdfResult").hidden = true;
  setBusy(buttonId, true, "กำลังเปิดเอกสาร…");
  setStatus("pdfStatus", "กำลังอ่านเอกสาร PDF", "working");
  setProgress("pdfProgress", 0, true);

  let pdfDocument = null;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const data = await file.arrayBuffer();
    pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
    const endPage = endInput ? Number(endInput) : pdfDocument.numPages;
    if (startPage > pdfDocument.numPages || endPage > pdfDocument.numPages) {
      throw new Error("เอกสารนี้มีทั้งหมด " + pdfDocument.numPages + " หน้า กรุณาตรวจสอบช่วงหน้าที่เลือก");
    }
    const pageCount = endPage - startPage + 1;
    if (pageCount > MAX_OUTPUT_ITEMS) {
      throw new Error("เลือกได้ไม่เกิน " + MAX_OUTPUT_ITEMS + " หน้าต่อครั้ง กรุณาแบ่งแปลงเป็นหลายชุด");
    }

    const zip = prepareZip();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการสร้างภาพ PNG");

    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: scale });
      const pixels = viewport.width * viewport.height;
      if (pixels > MAX_PDF_PIXELS) {
        throw new Error("หน้า " + pageNumber + " มีขนาดภาพใหญ่เกินไปเมื่อใช้ความละเอียดนี้ กรุณาเลือกระดับ 1× หรือแบ่งหน้า");
      }
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      const blob = await canvasToBlob(canvas, "image/png");
      const imageName = "page-" + String(pageNumber).padStart(3, "0") + ".png";
      zip.file(imageName, blob);
      page.cleanup();
      setProgress("pdfProgress", ((pageNumber - startPage + 1) / pageCount) * 88, true);
      setStatus("pdfStatus", "กำลังแปลงหน้า " + (pageNumber - startPage + 1) + " / " + pageCount, "working");
    }
    canvas.width = 0;
    canvas.height = 0;
    zip.file("INFO.txt", [
      "ClassVerse M.4/11 — PDF to PNG",
      "Source: " + file.name,
      "Pages: " + startPage + "–" + endPage,
      "Resolution: " + scale + "x",
      "Images created: " + pageCount
    ].join("\n"));

    setStatus("pdfStatus", "กำลังบีบอัดภาพเป็น ZIP", "working");
    const output = await zip.generateAsync({ type: "blob" }, (meta) => {
      setProgress("pdfProgress", 88 + meta.percent * 0.12, true);
    });
    attachDownload(output, safeBaseName(file.name) + "-png.zip", "pdfDownload", "pdfUrl");
    byId("pdfResultTitle").textContent = "แปลง PDF สำเร็จ";
    byId("pdfResultMeta").textContent = pageCount + " หน้า · " + formatBytes(output.size);
    byId("pdfResult").hidden = false;
    setStatus("pdfStatus", "เสร็จแล้ว ดาวน์โหลด ZIP ได้เลย", "success");
    setProgress("pdfProgress", 100, true);
  } catch (error) {
    const message = error && error.name === "PasswordException"
      ? "ไฟล์ PDF นี้มีรหัสผ่านป้องกัน กรุณาใช้ไฟล์ที่เปิดอ่านได้"
      : (error.message || "เกิดข้อผิดพลาดระหว่างแปลง PDF");
    setStatus("pdfStatus", message, "error");
    setProgress("pdfProgress", 0, false);
  } finally {
    if (pdfDocument) {
      try { await pdfDocument.destroy(); } catch (_) { /* Cleanup only. */ }
    }
    setBusy(buttonId, false);
  }
}


function attachDragAndDrop(inputId) {
  const input = byId(inputId);
  const dropZone = input.closest(".upload-area").querySelector(".drop-label");
  let dragDepth = 0;

  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");

  dropZone.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    dropZone.classList.add("is-dragover");
  });

  dropZone.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dropZone.classList.add("is-dragover");
  });

  dropZone.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropZone.classList.remove("is-dragover");
  });

  dropZone.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("is-dragover");

    const droppedFile = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!droppedFile) return;

    // Reuse the native input/change validation path for dropped and browsed files.
    const transfer = new DataTransfer();
    transfer.items.add(droppedFile);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Prevent the browser from opening a dropped file outside the upload zone.
  window.addEventListener("dragover", (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  window.addEventListener("drop", (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
}

handleFileSelection("videoFile", "videoFileName", "convertVideo", "videoFile", "MP4", "videoStatus", "videoResult");
attachDragAndDrop("videoFile");
attachDragAndDrop("pdfFile");
handleFileSelection("pdfFile", "pdfFileName", "convertPdf", "pdfFile", "PDF", "pdfStatus", "pdfResult");
byId("convertVideo").addEventListener("click", convertVideo);
byId("convertPdf").addEventListener("click", convertPdf);

window.addEventListener("beforeunload", () => {
  releaseDownloadUrl("videoUrl");
  releaseDownloadUrl("pdfUrl");
});

function attachGlobalDropTarget() {
  const overlay = byId("globalDropOverlay");
  let dragDepth = 0;

  const isFileDrag = (event) =>
    Array.from(event.dataTransfer?.types || []).includes("Files");

  const showOverlay = () => overlay.classList.add("is-visible");
  const hideOverlay = () => {
    dragDepth = 0;
    overlay.classList.remove("is-visible");
    document.querySelectorAll(".drop-label.is-dragover").forEach((node) => {
      node.classList.remove("is-dragover");
    });
  };

  document.addEventListener("dragenter", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth += 1;
    showOverlay();
  });

  document.addEventListener("dragover", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    showOverlay();
  });

  document.addEventListener("dragleave", (event) => {
    if (!isFileDrag(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 && !event.relatedTarget) hideOverlay();
  });

  document.addEventListener("drop", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    hideOverlay();

    // Dedicated upload cards already process their own drop event.
    if (event.target.closest?.(".upload-area")) return;

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const extension = file.name.toLowerCase();
    const targetInput = extension.endsWith(".mp4")
      ? byId("videoFile")
      : extension.endsWith(".pdf")
        ? byId("pdfFile")
        : null;

    if (!targetInput) {
      setStatus("videoStatus", "รองรับเฉพาะไฟล์ MP4 และ PDF", "error");
      setStatus("pdfStatus", "รองรับเฉพาะไฟล์ MP4 และ PDF", "error");
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    targetInput.files = transfer.files;
    targetInput.dispatchEvent(new Event("change", { bubbles: true }));
    targetInput.closest(".tool-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  window.addEventListener("dragend", hideOverlay);
  window.addEventListener("blur", hideOverlay);
}

attachGlobalDropTarget();
