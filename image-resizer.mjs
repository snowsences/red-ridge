import { escapeHTML } from './core.mjs?v=91-note-clipper';

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const inputTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const countImages = n => `${n} image${n === 1 ? '' : 's'}`;
const dimensionLabel = ({ width, height }) => `${width} × ${height}`;
const fileSize = bytes => bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;

function outputSize({ width, height }, settings) {
  if (settings.method === 'original') return { width, height };
  const scale = settings.method === 'percent' ? settings.percent / 100
    : Math.min(settings.width / width, settings.height / height, settings.noUpscale ? 1 : Infinity);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall back to the browser's image element decoder.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function drawWatermark(context, { width, height }, { image, corner, padding }) {
  const availableWidth = width - padding;
  const availableHeight = height - padding;
  if (availableWidth < 1 || availableHeight < 1) throw new Error('Choose less watermark padding for this image.');
  const scale = Math.min(1, availableWidth / image.width, availableHeight / image.height);
  const markWidth = Math.max(1, Math.round(image.width * scale));
  const markHeight = Math.max(1, Math.round(image.height * scale));
  const x = corner === 'left' ? padding : availableWidth - markWidth;
  context.drawImage(image.source, x, availableHeight - markHeight, markWidth, markHeight);
}

async function encode(source, size, type, quality, watermark) {
  const { width, height } = size;
  if (width > 8192 || height > 8192 || width * height > 32_000_000) {
    throw new Error('Use an output of up to 8,192 px per side and 32 megapixels.');
  }
  const canvas = document.createElement('canvas');
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This image is too large for your browser.');
    if (type === 'image/jpeg') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);
    if (watermark) drawWatermark(context, size, watermark);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob || blob.type !== type) throw new Error('Your browser could not save this format. Try PNG or JPEG.');
    return blob;
  } finally {
    canvas.width = canvas.height = 1;
  }
}

async function inspect(file) {
  const type = Object.hasOwn(extensions, file.type) ? file.type : inputTypes[file.name.split('.').at(-1).toLowerCase()];
  if (!Object.hasOwn(extensions, type)) return { file, issue: 'Choose a JPG, PNG, or WebP image.' };
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    return { file, issue: 'This image could not be opened.' };
  }
  const { width, height, source } = decoded;
  const scale = Math.min(1, 96 / Math.max(width, height));
  const size = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  let thumb;
  try {
    thumb = URL.createObjectURL(await encode(source, size, 'image/png'));
  } catch {
    // The original can still be resized if its preview could not be created.
  } finally {
    decoded.release();
  }
  return { file, type, width, height, thumb };
}

function outputName(file, { width, height }, type, used) {
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().slice(0, 120) || 'image';
  const base = `${stem}-${width}x${height}`;
  const ext = extensions[type];
  let name = `${base}.${ext}`;
  for (let copy = 2; used.has(name.toLowerCase()); copy++) name = `${base}-${copy}.${ext}`;
  used.add(name.toLowerCase());
  return name;
}

function discardResult(item) {
  if (item.result) URL.revokeObjectURL(item.result.url);
  delete item.result;
  delete item.error;
}

function row(item, index, settings, busy) {
  const name = escapeHTML(item.file.name);
  const original = item.width ? `${dimensionLabel(item)} · ${fileSize(item.file.size)}` : fileSize(item.file.size);
  const size = item.width && settings ? outputSize(item, settings) : null;
  const resized = size ? `<span class="resize-new-size">→ ${dimensionLabel(size)}${item.result ? ` · ${fileSize(item.result.blob.size)}` : ''}</span>` : '';
  const issue = item.error || item.issue;
  return `<li class="resize-row">
    ${item.thumb ? `<img class="resize-thumb" src="${item.thumb}" alt="">` : '<span class="resize-thumb"></span>'}
    <div class="resize-file-info"><strong title="${name}">${name}</strong><div><span>${original}</span>${resized}</div>${issue ? `<p class="resize-error">${escapeHTML(issue)}</p>` : ''}</div>
    <div class="resize-file-actions">${item.result ? `<a href="${item.result.url}" download="${escapeHTML(item.result.name)}" aria-label="Download ${name}">Download</a>` : ''}<button type="button" data-remove="${index}" title="Remove" aria-label="Remove ${name}"${busy ? ' disabled' : ''}>×</button></div>
  </li>`;
}

export function setupImageResizer(root) {
  const get = id => root.querySelector(`#resize-${id}`);
  const form = get('form'), picker = get('files'), drop = get('drop'), queue = get('queue'), status = get('status');
  const submit = get('submit'), browse = get('browse'), clear = get('clear');
  const fields = form.elements;
  const items = [];
  let busy = '', message = '';
  let watermark = null, watermarkError = '';

  function invalidateResults() {
    for (const item of items) discardResult(item);
    message = '';
  }

  function settings() {
    const method = fields.method.value;
    const required = method === 'fit' ? [fields.width, fields.height] : method === 'percent' ? [fields.percent] : [];
    if (required.some(input => !input.validity.valid)) return null;
    const overlay = fields.addWatermark.checked && watermark
      ? { image: watermark, corner: fields.corner.value, padding: Number(fields.padding.value) } : null;
    return { method, width: fields.width.valueAsNumber, height: fields.height.valueAsNumber,
      percent: fields.percent.valueAsNumber, noUpscale: fields.noUpscale.checked, format: fields.format.value,
      quality: fields.quality.valueAsNumber / 100, overlay };
  }

  function render() {
    const fit = fields.method.value === 'fit';
    const percent = fields.method.value === 'percent';
    const wantsWatermark = fields.addWatermark.checked;
    get('fit').hidden = !fit;
    get('scale').hidden = !percent;
    get('quality').hidden = fields.format.value === 'image/png';
    get('quality-value').value = `${fields.quality.value}%`;
    get('watermark-options').hidden = !wantsWatermark;
    const markStatus = get('watermark-status');
    const markMessage = watermarkError || (watermark ? `${watermark.name} · ${dimensionLabel(watermark)} px` : 'Choose a transparent PNG.');
    if (markStatus.textContent !== markMessage) markStatus.textContent = markMessage;
    markStatus.toggleAttribute('data-error', Boolean(watermarkError));
    for (const input of fields) input.disabled = Boolean(busy);
    fields.width.disabled ||= !fit;
    fields.height.disabled ||= !fit;
    fields.percent.disabled ||= !percent;
    fields.quality.disabled ||= get('quality').hidden;
    for (const field of [fields.watermarkFile, fields.corner, fields.padding]) field.disabled ||= !wantsWatermark;
    picker.disabled = browse.disabled = clear.disabled = Boolean(busy);
    const current = settings();
    const ready = items.filter(item => item.width).length;
    const done = items.some(item => item.result);
    const top = queue.scrollTop;
    queue.innerHTML = items.map((item, index) => row(item, index, current, busy)).join('');
    queue.hidden = clear.hidden = !items.length;
    get('empty').hidden = Boolean(items.length);
    queue.scrollTop = top;
    get('count').textContent = items.length;
    const needsWatermark = wantsWatermark && !watermark;
    const action = wantsWatermark ? 'Watermark' : (fit || percent ? 'Resize' : 'Export');
    submit.disabled = Boolean(busy) || !ready || !current || needsWatermark;
    submit.textContent = busy || (done ? 'Download ZIP' : `${action} ${ready ? countImages(ready) : 'images'}`);
    const nextStatus = message || (needsWatermark ? 'Choose a PNG watermark to continue.' : ready
      ? (current ? `${countImages(ready)} ready.` : 'Enter valid resize dimensions.') : 'Add images to get started.');
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
  }

  async function loadWatermark(file) {
    if (busy || !file) return;
    busy = 'Reading watermark…';
    watermarkError = '';
    watermark?.release();
    watermark = null;
    invalidateResults();
    render();
    try {
      const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (signature.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('format');
      watermark = { ...await decode(file), name: file.name };
    } catch {
      watermarkError = 'This file could not be opened as a PNG.';
    } finally {
      busy = '';
      render();
    }
  }

  async function add(files) {
    if (busy || !files.length) return;
    busy = 'Reading images…';
    message = '';
    render();
    for (const file of files) items.push(await inspect(file));
    for (const item of items) discardResult(item);
    busy = '';
    render();
  }

  function remove(index) {
    const [item] = items.splice(index, 1);
    discardResult(item);
    if (item.thumb) URL.revokeObjectURL(item.thumb);
  }

  async function processBatch(config) {
    const ready = items.filter(item => item.width);
    const used = new Set();
    const activity = config.overlay || config.method === 'original' ? 'Processing' : 'Resizing';
    busy = `${activity}…`;
    message = `${activity} 0 of ${ready.length}…`;
    render();
    for (const [index, item] of ready.entries()) {
      let image;
      try {
        discardResult(item);
        image = await decode(item.file);
        const size = outputSize(item, config);
        const type = config.format === 'original' ? item.type : config.format;
        const blob = await encode(image.source, size, type, config.quality, config.overlay);
        item.result = { name: outputName(item.file, size, type, used), blob, url: URL.createObjectURL(blob) };
      } catch (error) {
        item.error = error.message || 'This image could not be processed.';
      } finally {
        image?.release();
      }
      status.textContent = `${activity} ${index + 1} of ${ready.length}…`;
    }
    const done = ready.filter(item => item.result).length;
    const skipped = items.length - done;
    message = done ? `${countImages(done)} ready to download.${skipped ? ` ${skipped} skipped.` : ''}` : 'No images could be processed. Check the queue.';
    busy = '';
    render();
  }

  async function downloadZip(results) {
    busy = 'Packing ZIP…';
    message = 'Preparing your ZIP download…';
    render();
    try {
      await import('./vendor/jszip.min.js');
      const zip = new window.JSZip();
      for (const { name, blob } of results) zip.file(name, blob);
      const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = fields.addWatermark.checked ? 'red-ridge-watermarked-images.zip' : 'red-ridge-resized-images.zip';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      message = 'ZIP download started.';
    } catch {
      message = 'Could not create the ZIP. Try downloading images individually.';
    } finally {
      busy = '';
      render();
    }
  }

  browse.addEventListener('click', () => picker.click());
  fields.watermarkFile.addEventListener('change', () => {
    const [file] = fields.watermarkFile.files;
    fields.watermarkFile.value = '';
    loadWatermark(file);
  });
  picker.addEventListener('change', () => {
    const files = Array.from(picker.files);
    picker.value = '';
    add(files);
  });
  drop.addEventListener('dragover', event => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
    if (!busy) drop.classList.add('drag-over');
  });
  drop.addEventListener('dragleave', event => {
    if (!drop.contains(event.relatedTarget)) drop.classList.remove('drag-over');
  });
  drop.addEventListener('drop', event => {
    event.preventDefault();
    drop.classList.remove('drag-over');
    add(Array.from(event.dataTransfer.files));
  });
  clear.addEventListener('click', () => {
    while (items.length) remove(items.length - 1);
    message = '';
    render();
    browse.focus();
  });
  queue.addEventListener('click', event => {
    const button = event.target.closest('[data-remove]');
    if (!button || busy) return;
    const index = Number(button.dataset.remove);
    remove(index);
    message = '';
    render();
    (queue.querySelector(`[data-remove="${Math.min(index, items.length - 1)}"]`) || browse).focus({ preventScroll: true });
  });
  form.addEventListener('input', event => {
    if (busy || event.target === fields.watermarkFile) return;
    invalidateResults();
    render();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const results = items.filter(item => item.result).map(item => item.result);
    if (results.length) downloadZip(results);
    else {
      const config = settings();
      if (config && (!fields.addWatermark.checked || config.overlay)) processBatch(config);
    }
  });
  render();
}
