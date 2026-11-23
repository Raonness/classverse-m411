"use strict";

const MAX_OUTPUT_ITEMS = 10000;
const MAX_PDF_PIXELS = 30000000;
const GALLERY_PAGE_SIZE = 48;

const byId = (id) => document.getElementById(id);
const state = {
  videoFile: null, pdfFile: null, videoUrl: null, pdfUrl: null,
  videoImages: [], pdfImages: [], videoPage: 0, pdfPage: 0,
  randomFiles: [], randomUrl: null, randomNames: [], randomSelected: new Set(), randomPage: 0
};

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

 
function renderImageGallery(kind) {
  const images = state[kind + "Images"];
  const pageKey = kind + "Page";
  const pageCount = Math.max(1, Math.ceil(images.length / GALLERY_PAGE_SIZE));
  state[pageKey] = Math.max(0, Math.min(state[pageKey], pageCount - 1));
  const start = state[pageKey] * GALLERY_PAGE_SIZE;
  const gallery = byId(kind + "Gallery");
  gallery.replaceChildren();

  images.slice(start, start + GALLERY_PAGE_SIZE).forEach((entry, offset) => {
    const index = start + offset;
    const card = document.createElement("label");
    card.className = "image-thumb";
    const image = document.createElement("img");
    image.src = entry.url;
    image.alt = entry.name;
    image.loading = "lazy";
    const meta = document.createElement("span");
    meta.className = "image-thumb-meta";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = entry.selected;
    check.addEventListener("change", () => {
      entry.selected = check.checked;
      card.classList.toggle("is-unselected", !check.checked);
      updateImageSelectionUI(kind);
    });
    const name = document.createElement("span");
    name.textContent = entry.name;
    name.title = entry.name;
    meta.append(check, name);
    card.classList.toggle("is-unselected", !entry.selected);
    card.append(image, meta);
    gallery.append(card);
  });

  byId(kind + "PageInfo").textContent = "หน้า " + (state[pageKey] + 1) + " / " + pageCount;
  byId(kind + "PrevPage").disabled = state[pageKey] === 0;
  byId(kind + "NextPage").disabled = state[pageKey] >= pageCount - 1;
  updateImageSelectionUI(kind);
}

function updateImageSelectionUI(kind) {
  const images = state[kind + "Images"];
  const selected = images.filter((entry) => entry.selected).length;
  byId(kind + "SelectionCount").textContent = selected + " / " + images.length + " ภาพ";
  byId(kind + "Download").disabled = selected === 0;
}

function setImageSelection(kind, selected) {
  state[kind + "Images"].forEach((entry) => { entry.selected = selected; });
  renderImageGallery(kind);
}

async function exportSelectedImages(kind) {
  const images = state[kind + "Images"].filter((entry) => entry.selected);
  if (!images.length) return;
  const button = byId(kind + "Download");
  button.disabled = true;
  button.textContent = "กำลังสร้าง ZIP…";
  try {
    const zip = prepareZip();
    images.forEach((entry) => zip.file(entry.name, entry.blob));
    const output = await zip.generateAsync({ type: "blob" });
    const urlKey = kind + "Url";
    releaseDownloadUrl(urlKey);
    state[urlKey] = URL.createObjectURL(output);
    const link = document.createElement("a");
    link.href = state[urlKey];
    link.download = kind + "-selected-images.zip";
    link.click();
    setStatus(kind + "Status", "สร้าง ZIP จาก " + images.length + " ภาพเรียบร้อยแล้ว", "success");
  } catch (error) {
    setStatus(kind + "Status", error.message || "ไม่สามารถสร้าง ZIP ได้", "error");
  } finally {
    button.textContent = "สร้าง ZIP จากภาพที่เลือก ↓";
    updateImageSelectionUI(kind);
  }
}

function setupImageReview(kind) {
  byId(kind + "PrevPage").addEventListener("click", () => {
    state[kind + "Page"] -= 1;
    renderImageGallery(kind);
  });
  byId(kind + "NextPage").addEventListener("click", () => {
    state[kind + "Page"] += 1;
    renderImageGallery(kind);
  });
  byId(kind + "Download").addEventListener("click", () => exportSelectedImages(kind));
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
    const extension = format === "jpg" ? "jpg" : "png";
    const generatedImages = [];
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const times = [];
    for (let time = 0; time < video.duration && times.length < MAX_OUTPUT_ITEMS; time += interval) times.push(time);

    for (let index = 0; index < times.length; index += 1) {
      const time = times[index];
      await seekVideo(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, mime, format === "jpg" ? 0.92 : undefined);
      const frameName = "frame-" + String(index + 1).padStart(3, "0") + "." + extension;
      generatedImages.push({ name: frameName, blob, url: URL.createObjectURL(blob), selected: true });
      setProgress("videoProgress", ((index + 1) / times.length) * 90, true);
      setStatus("videoStatus", "กำลังสร้างภาพ " + (index + 1) + " / " + times.length, "working");
    }

    state.videoImages.forEach((entry) => URL.revokeObjectURL(entry.url));
    state.videoImages = generatedImages;
    state.videoPage = 0;
    byId("videoResultTitle").textContent = "แปลงวิดีโอสำเร็จ";
    byId("videoResultMeta").textContent = times.length + " ภาพ · ตรวจสอบภาพก่อนสร้าง ZIP";
    byId("videoResult").hidden = false;
    renderImageGallery("video");
    setStatus("videoStatus", "แปลงเสร็จแล้ว ตรวจสอบและเลือกภาพก่อนสร้าง ZIP", "success");
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

    const generatedImages = [];
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
      generatedImages.push({ name: imageName, blob, url: URL.createObjectURL(blob), selected: true });
      page.cleanup();
      setProgress("pdfProgress", ((pageNumber - startPage + 1) / pageCount) * 88, true);
      setStatus("pdfStatus", "กำลังแปลงหน้า " + (pageNumber - startPage + 1) + " / " + pageCount, "working");
    }
    canvas.width = 0;
    canvas.height = 0;
    state.pdfImages.forEach((entry) => URL.revokeObjectURL(entry.url));
    state.pdfImages = generatedImages;
    state.pdfPage = 0;
    byId("pdfResultTitle").textContent = "แปลง PDF สำเร็จ";
    byId("pdfResultMeta").textContent = pageCount + " หน้า · ตรวจสอบภาพก่อนสร้าง ZIP";
    byId("pdfResult").hidden = false;
    renderImageGallery("pdf");
    setStatus("pdfStatus", "แปลงเสร็จแล้ว ตรวจสอบและเลือกภาพก่อนสร้าง ZIP", "success");
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
setupImageReview("video");
setupImageReview("pdf");

window.addEventListener("beforeunload", () => {
  releaseDownloadUrl("videoUrl");
  releaseDownloadUrl("pdfUrl");
  state.videoImages.forEach((entry) => URL.revokeObjectURL(entry.url));
  state.pdfImages.forEach((entry) => URL.revokeObjectURL(entry.url));
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

    const files = event.dataTransfer.files;
    if (!files?.length) return;
    const firstExtension = files[0].name.toLowerCase();
    const allSameMediaType = files.length === 1 && (firstExtension.endsWith(".mp4") || firstExtension.endsWith(".pdf"));
    const targetInput = allSameMediaType
      ? (firstExtension.endsWith(".mp4") ? byId("videoFile") : byId("pdfFile"))
      : byId("randomFiles");

    if (assignFilesToInput(targetInput, files)) {
      openToolWorkspace(targetInput.id === "videoFile" ? "video" : targetInput.id === "pdfFile" ? "pdf" : "random");
      targetInput.closest(".tool-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  window.addEventListener("dragend", hideOverlay);
  window.addEventListener("blur", hideOverlay);
}

attachGlobalDropTarget();


function createRandomFilename(length, extension, usedNames) {
  if (![12, 16, 20].includes(Number(length))) throw new Error("เลือกความยาวชื่อสุ่มได้ 12, 16 หรือ 20 ตัวอักษรเท่านั้น");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  let candidate;
  do {
    crypto.getRandomValues(bytes);
    candidate = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("") + extension;
  } while (usedNames.has(candidate));
  usedNames.add(candidate);
  return candidate;
}

function splitFilename(filename) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex <= 0
    ? { extension: "" }
    : { extension: filename.slice(dotIndex) };
}

function updateRandomSelectionUI() {
  const selectedCount = state.randomSelected.size;
  const totalCount = state.randomFiles.length;
  byId("randomCount").textContent = selectedCount + " / " + totalCount + " ไฟล์";
  byId("downloadRandomZip").disabled = selectedCount === 0;
  byId("randomResult").hidden = true;
}

function renderRandomPreview(regenerateNames = true) {
  const usedNames = new Set();
  const length = Number(byId("randomNameLength").value);
  if (regenerateNames || state.randomNames.length !== state.randomFiles.length) {
    state.randomNames = state.randomFiles.map((file) =>
      createRandomFilename(length, splitFilename(file.name).extension, usedNames)
    );
  }
  const list = byId("randomFileList");
  list.replaceChildren();
  const pageCount = Math.max(1, Math.ceil(state.randomFiles.length / GALLERY_PAGE_SIZE));
  state.randomPage = Math.max(0, Math.min(state.randomPage, pageCount - 1));
  const pageStart = state.randomPage * GALLERY_PAGE_SIZE;
  state.randomFiles.slice(pageStart, pageStart + GALLERY_PAGE_SIZE).forEach((file, offset) => {
    const index = pageStart + offset;
    const item = document.createElement("li");
    const checkbox = document.createElement("input");
    const oldName = document.createElement("span");
    const arrow = document.createElement("span");
    const newName = document.createElement("span");
    checkbox.type = "checkbox";
    checkbox.className = "random-file-check";
    checkbox.checked = state.randomSelected.has(index);
    checkbox.setAttribute("aria-label", "เลือก " + file.name + " เพื่อส่งออก");
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.randomSelected.add(index);
      else state.randomSelected.delete(index);
      item.classList.toggle("is-excluded", !checkbox.checked);
      updateRandomSelectionUI();
    });
    oldName.className = "old-name";
    oldName.textContent = file.name;
    oldName.title = file.name;
    arrow.className = "rename-arrow";
    arrow.textContent = "→";
    newName.className = "new-name";
    newName.textContent = state.randomNames[index];
    newName.title = state.randomNames[index];
    item.classList.toggle("is-excluded", !checkbox.checked);
    item.append(checkbox, oldName, arrow, newName);
    list.append(item);
  });
  byId("randomPreview").hidden = state.randomFiles.length === 0;
  byId("randomizeNames").disabled = state.randomFiles.length === 0;
  byId("randomPageInfo").textContent = "หน้า " + (state.randomPage + 1) + " / " + pageCount;
  byId("randomPrevPage").disabled = state.randomPage === 0;
  byId("randomNextPage").disabled = state.randomPage >= pageCount - 1;
  updateRandomSelectionUI();
}

function setRandomFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  state.randomFiles = files;
  state.randomPage = 0;
  state.randomSelected = new Set(files.map((_, index) => index));
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  byId("randomFileName").textContent = files.length + " ไฟล์ · " + formatBytes(totalSize);
  renderRandomPreview();
  setStatus("randomStatus", "พร้อมสุ่มชื่อไฟล์ " + files.length + " รายการ", "success");
}

async function downloadRandomFiles() {
  if (!state.randomFiles.length) return;
  const button = byId("downloadRandomZip");
  button.disabled = true;
  byId("randomizeNames").disabled = true;
  setStatus("randomStatus", "กำลังจัดเตรียมไฟล์ ZIP…", "working");
  try {
    const selectedIndexes = Array.from(state.randomSelected).sort((a, b) => a - b);
    if (!selectedIndexes.length) throw new Error("กรุณาเลือกอย่างน้อย 1 ไฟล์ก่อนส่งออก");
    if (state.randomNames.length !== state.randomFiles.length) renderRandomPreview(false);
    const zip = prepareZip();
    selectedIndexes.forEach((index) => zip.file(state.randomNames[index], state.randomFiles[index]));
    const output = await zip.generateAsync({ type: "blob" });
    attachDownload(output, "random-renamed-files.zip", "randomDownload", "randomUrl");
    byId("randomResultMeta").textContent = selectedIndexes.length + " / " + state.randomFiles.length + " ไฟล์ · " + formatBytes(output.size);
    byId("randomResult").hidden = false;
    setStatus("randomStatus", "เปลี่ยนชื่อไฟล์เรียบร้อยแล้ว ดาวน์โหลด ZIP ได้เลย", "success");
  } catch (error) {
    setStatus("randomStatus", error.message || "ไม่สามารถจัดเตรียมไฟล์ได้", "error");
  } finally {
    button.disabled = state.randomSelected.size === 0;
    byId("randomizeNames").disabled = state.randomFiles.length === 0;
  }
}

function assignFilesToInput(input, files) {
  if (!files || !files.length) return false;
  try {
    const transfer = new DataTransfer();
    Array.from(files).forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (error) {
    setStatus("randomStatus", "เบราว์เซอร์นี้ไม่รองรับการวางไฟล์ กรุณาใช้ปุ่มเลือกไฟล์แทน", "error");
    return false;
  }
}

function attachRandomFilePicker() {
  const input = byId("randomFiles");
  const dropZone = byId("randomDropLabel");
  input.addEventListener("change", () => setRandomFiles(input.files));
  dropZone.addEventListener("dragover", (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    dropZone.classList.add("is-dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragover"));
  dropZone.addEventListener("drop", (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove("is-dragover");
    assignFilesToInput(input, event.dataTransfer.files);
  });
  byId("randomNameLength").addEventListener("change", () => renderRandomPreview(true));
  byId("randomizeNames").addEventListener("click", () => renderRandomPreview(true));
  byId("selectAllRandom").addEventListener("click", () => {
    state.randomSelected = new Set(state.randomFiles.map((_, index) => index));
    renderRandomPreview(false);
  });
  byId("clearRandomSelection").addEventListener("click", () => {
    state.randomSelected.clear();
    renderRandomPreview(false);
  });
  byId("randomPrevPage").addEventListener("click", () => { state.randomPage -= 1; renderRandomPreview(false); });
  byId("randomNextPage").addEventListener("click", () => { state.randomPage += 1; renderRandomPreview(false); });
  byId("downloadRandomZip").addEventListener("click", downloadRandomFiles);
}

attachRandomFilePicker();


function openToolWorkspace(toolName) {
  const allowedTools = ["video", "pdf", "random"];
  if (!allowedTools.includes(toolName)) return;

  const picker = byId("toolPicker");
  const workspace = byId("toolWorkspace");
  const switcher = byId("workspaceSwitcher");
  const privacyNote = byId("privacyNote");

  picker.hidden = true;
  workspace.hidden = false;
  switcher.hidden = false;
  privacyNote.hidden = false;

  document.querySelectorAll("[data-tool-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.toolPanel !== toolName;
  });
  document.querySelectorAll("[data-compact-tool]").forEach((button) => {
    if (button.dataset.compactTool === toolName) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  const heading = document.querySelector("[data-tool-panel='" + toolName + "'] h3");
  if (heading) {
    byId("toolWorkspace").setAttribute("aria-label", "พื้นที่ทำงาน: " + heading.textContent);
  }
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

document.querySelectorAll("[data-open-tool]").forEach((button) => {
  button.addEventListener("click", () => openToolWorkspace(button.dataset.openTool));
});
byId("backToToolPicker").addEventListener("click", () => {
  byId("toolWorkspace").hidden = true;
  byId("workspaceSwitcher").hidden = true;
  byId("privacyNote").hidden = true;
  byId("toolPicker").hidden = false;
  document.querySelectorAll("[data-tool-panel]").forEach((panel) => { panel.hidden = true; });
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});
