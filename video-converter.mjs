import { escapeHTML } from './core.mjs?v=91-note-clipper';

const codecs = { hevc: 'H.265', avc: 'H.264', vp9: 'VP9' };
const bytesLabel = bytes => bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
const countVideos = n => `${n} video${n === 1 ? '' : 's'}`;

function openInput(api, file) {
  return new api.Input({ source: new api.BlobSource(file), formats: [api.MP4, api.QTFF, api.MATROSKA, api.WEBM] });
}

async function inspect(api, file) {
  const input = openInput(api, file);
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    if (!video) throw new Error('No video track found.');
    if (!await video.canDecode()) throw new Error('This browser cannot decode the video in this file.');
    const [width, height, stats, color, duration] = await Promise.all([
      video.getDisplayWidth(), video.getDisplayHeight(), video.computePacketStats(60),
      video.getColorSpace(), input.getDurationFromMetadata(),
    ]);
    return {
      file, width, height, fps: stats.averagePacketRate, duration: duration ?? await input.computeDuration(),
      audio: Boolean(audio), hdr: ['pq', 'hlg'].includes(color.transfer),
    };
  } catch (error) {
    return { file, issue: error.message || 'This video could not be opened.' };
  } finally {
    input.dispose();
  }
}

function outputSize({ width, height }, resolution) {
  const scale = resolution ? Math.min(1, resolution / Math.min(width, height), resolution * 16 / 9 / Math.max(width, height)) : 1;
  const even = n => Math.max(2, Math.round(n * scale / 2) * 2);
  return { width: even(width), height: even(height) };
}

function outputName(file, extension, names) {
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().slice(0, 120) || 'video';
  let name = `${stem}-compressed.${extension}`;
  for (let i = 2; names.has(name.toLowerCase()); i++) name = `${stem}-compressed-${i}.${extension}`;
  names.add(name.toLowerCase());
  return name;
}

function row(item, index, config, busy) {
  const name = escapeHTML(item.file.name);
  const source = item.width ? `${item.width} × ${item.height} · ${Math.round(item.duration)} sec · ${bytesLabel(item.file.size)}` : bytesLabel(item.file.size);
  const estimate = item.duration > 0 && config ? `~${bytesLabel(item.duration * (config.bitrate + (item.audio && !config.mute ? 128_000 : 0)) / 8)} estimated` : '';
  const issue = item.error || item.issue;
  let summary = estimate;
  if (item.result) {
    const ratio = Math.round((1 - item.result.bytes / item.file.size) * 100);
    summary = `${bytesLabel(item.result.bytes)}${ratio > 0 ? ` · ${ratio}% smaller` : ratio < 0 ? ' · Larger than the original' : ''}${item.result.saved ? ' · Saved to folder' : ''}`;
  }
  return `<li class="resize-row video-row"><div class="resize-file-info">
    <strong title="${name}">${name}</strong><div><span>${source}</span>${item.hdr ? '<span>· HDR</span>' : ''}</div>
    ${summary ? `<div class="${item.result ? 'video-success' : ''}">${summary}</div>` : ''}
    ${item.processing ? `<progress max="1" value="0" aria-label="Conversion progress for ${name}"></progress>` : ''}
    ${issue ? `<p class="resize-error">${escapeHTML(issue)}</p>` : ''}
    </div><div class="resize-file-actions">
    ${item.result?.url ? `<a href="${item.result.url}" download="${escapeHTML(item.result.name)}" aria-label="Download ${name}">Download</a>` : ''}
    <button type="button" data-remove-video="${index}" title="Remove" aria-label="Remove ${name}"${busy ? ' disabled' : ''}>×</button>
    </div></li>`;
}

function discardResult(item) {
  if (item.result?.url) URL.revokeObjectURL(item.result.url);
  delete item.result;
}

export function setupVideoConverter(root) {
  const get = id => root.querySelector(`#video-${id}`);
  const form = get('form'), fields = form.elements;
  const picker = get('files'), drop = get('drop'), browse = get('browse'), queue = get('queue');
  const clear = get('clear'), submit = get('submit'), cancel = get('cancel'), status = get('status');
  const items = [];
  const supportsFolder = typeof window.showDirectoryPicker === 'function';
  let libraryPromise, api, busy = '', message = '', job = null;
  const supported = new Set();
  get('folder-option').hidden = !supportsFolder;

  function config() {
    const value = fields.bitrate.value === 'custom' ? fields.customBitrate.valueAsNumber : Number(fields.bitrate.value);
    if (!Number.isFinite(value) || value < 0.1 || value > 80) return null;
    return {
      codec: fields.codec.value, resolution: Number(fields.resolution.value), bitrate: Math.round(value * 1_000_000),
      limitFps: fields.limitFps.checked, mute: fields.mute.checked, folder: supportsFolder && fields.folder.checked,
    };
  }

  function render() {
    const custom = fields.bitrate.value === 'custom';
    get('custom').hidden = !custom;
    for (const input of fields) input.disabled = Boolean(busy);
    fields.customBitrate.disabled ||= !custom;
    fields.folder.disabled ||= !supportsFolder;
    const current = config();
    const ready = items.filter(item => !item.issue).length;
    const scroll = queue.scrollTop;
    queue.innerHTML = items.map((item, index) => row(item, index, current, busy)).join('');
    queue.hidden = clear.hidden = !items.length;
    get('empty').hidden = Boolean(items.length);
    queue.scrollTop = scroll;
    get('count').textContent = items.length;
    get('hdr-note').hidden = !items.some(item => item.hdr);
    browse.disabled = picker.disabled = clear.disabled = Boolean(busy);
    submit.disabled = Boolean(busy) || !ready || !current || !supported.has(current.codec);
    submit.textContent = busy || (ready ? `Convert ${countVideos(ready)}` : 'Convert videos');
    cancel.hidden = !job;
    cancel.disabled = Boolean(job?.cancelled);
    status.textContent = message || (ready ? `${countVideos(ready)} ready.` : 'Add videos to get started.');
  }

  function loadLibrary() {
    if (libraryPromise) return libraryPromise;
    const codecStatus = get('codec-status');
    libraryPromise = import('./vendor/mediabunny.min.mjs').then(async loaded => {
      const available = await Promise.all(Object.keys(codecs).map(async codec => {
        try {
          return await loaded.canEncodeVideo(codec, { width: 1920, height: 1080, bitrate: 2_500_000 }) ? codec : '';
        } catch {
          return '';
        }
      }));
      for (const codec of available.filter(Boolean)) supported.add(codec);
      for (const option of fields.codec.options) option.disabled = !supported.has(option.value);
      if (!supported.has(fields.codec.value) && supported.size) fields.codec.value = [...supported][0];
      codecStatus.textContent = supported.has('hevc') ? 'H.265 encoding is available on this device.'
        : supported.size ? 'H.265 encoding is unavailable here. Choose H.264 or VP9 if enabled.'
        : 'This browser has no supported video encoder. Try Chrome or Edge on a computer.';
      api = loaded;
      render();
      return loaded;
    }).catch(error => {
      libraryPromise = null;
      codecStatus.textContent = 'The converter could not load. Reopen Videos to retry.';
      throw error;
    });
    return libraryPromise;
  }

  async function addFiles(files) {
    if (busy || !files.length) return;
    busy = 'Reading videos…';
    message = '';
    render();
    try {
      const loaded = await loadLibrary();
      for (const file of files) items.push(await inspect(loaded, file));
    } catch {
      message = 'The converter could not load. Try again.';
    } finally {
      busy = '';
      render();
    }
  }

  async function convert(item, settings, directory, names, batch) {
    const { Output, Mp4OutputFormat, WebMOutputFormat, AppendOnlyStreamTarget, StreamTarget, Conversion } = api;
    const mp4 = settings.codec !== 'vp9';
    const extension = mp4 ? 'mp4' : 'webm';
    const name = outputName(item.file, extension, names);
    const input = openInput(api, item.file);
    const chunks = [];
    let writer, created = false, output;
    try {
      const format = mp4 ? new Mp4OutputFormat({ fastStart: directory ? false : 'fragmented' })
        : new WebMOutputFormat({ appendOnly: !directory });
      let target;
      if (directory) {
        const handle = await directory.getFileHandle(name, { create: true });
        created = true;
        writer = await handle.createWritable();
        target = new StreamTarget(writer, { chunked: true, chunkSize: 2 ** 20 });
      } else {
        target = new AppendOnlyStreamTarget(new WritableStream({ write: data => { chunks.push(data); } }));
      }
      output = new Output({ format, target });
      const conversion = await Conversion.init({
        input, output, tracks: 'primary', tags: {}, showWarnings: false,
        video: {
          ...outputSize(item, settings.resolution), fit: 'contain', codec: settings.codec, bitrate: settings.bitrate,
          forceTranscode: true, allowTransformationMetadata: false,
          frameRate: settings.limitFps && item.fps > 30.1 ? 30 : undefined,
        },
        audio: settings.mute ? { discard: true } : { codec: mp4 ? 'aac' : 'opus' },
      });
      if (batch.cancelled) return;
      if (!conversion.isValid || !conversion.utilizedTracks.some(track => track.type === 'video')) {
        throw new Error(`This browser cannot convert this clip to ${codecs[settings.codec]} at the selected resolution.`);
      }
      if (item.audio && !settings.mute && !conversion.utilizedTracks.some(track => track.type === 'audio')) {
        throw new Error('This browser cannot keep the audio in this format. Try another format or select Remove audio.');
      }
      batch.conversion = conversion;
      const progress = queue.querySelector('progress');
      conversion.onProgress = value => { if (progress) progress.value = value; };
      await conversion.execute();
      if (batch.cancelled) return;
      const file = directory ? await (await directory.getFileHandle(name)).getFile()
        : new Blob(chunks, { type: mp4 ? 'video/mp4' : 'video/webm' });
      discardResult(item);
      item.result = { name, bytes: file.size, saved: Boolean(directory), url: directory ? '' : URL.createObjectURL(file) };
      created = false;
    } finally {
      batch.conversion = null;
      if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {});
      if (created) {
        await writer?.abort().catch(() => {});
        await directory.removeEntry(name).catch(() => {});
      }
      input.dispose();
    }
  }

  async function processBatch(settings) {
    if (busy || !api || !supported.has(settings.codec)) return;
    busy = 'Preparing…';
    message = '';
    render();
    let directory;
    const batch = { cancelled: false, conversion: null };
    try {
      if (settings.folder) {
        const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
        const folderName = `Red Ridge videos ${new Date().toISOString().slice(0, 10)} ${crypto.randomUUID().slice(0, 8)}`;
        directory = await parent.getDirectoryHandle(folderName, { create: true });
      }
      const ready = items.filter(item => !item.issue);
      const names = new Set();
      job = batch;
      let complete = 0;
      for (const [index, item] of ready.entries()) {
        if (batch.cancelled) break;
        item.processing = true;
        delete item.error;
        busy = `Converting ${index + 1} of ${ready.length}…`;
        message = item.file.name;
        render();
        try {
          await convert(item, settings, directory, names, batch);
          if (!batch.cancelled) complete++;
        } catch (error) {
          if (!batch.cancelled) item.error = error.message || 'Conversion failed.';
        } finally {
          item.processing = false;
        }
      }
      const suffix = directory && complete ? ` Saved in ${directory.name}.` : '';
      const failed = ready.length - complete;
      message = batch.cancelled ? `Cancelled. ${countVideos(complete)} completed.${suffix}`
        : `${countVideos(complete)} converted.${failed ? ` ${failed} failed.` : ''}${suffix}`;
    } catch (error) {
      message = error.name === 'AbortError' ? 'No folder selected.' : 'Could not open the output folder. Try another folder or turn off folder saving.';
    } finally {
      busy = '';
      job = null;
      render();
    }
  }

  browse.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.value = '';
    addFiles(files);
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
    addFiles([...event.dataTransfer.files]);
  });
  clear.addEventListener('click', () => {
    items.forEach(discardResult);
    items.length = 0;
    message = '';
    render();
    browse.focus();
  });
  queue.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-video]');
    if (!button || busy) return;
    const index = Number(button.dataset.removeVideo);
    discardResult(items.splice(index, 1)[0]);
    message = '';
    render();
    (queue.querySelector(`[data-remove-video="${Math.min(index, items.length - 1)}"]`) || browse).focus({ preventScroll: true });
  });
  form.addEventListener('input', () => {
    message = '';
    render();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const settings = config();
    if (settings) processBatch(settings);
  });
  cancel.addEventListener('click', () => {
    if (!job) return;
    job.cancelled = true;
    cancel.disabled = true;
    status.textContent = 'Cancelling…';
    job.conversion?.cancel().catch(() => {});
  });
  render();
  return () => loadLibrary().catch(() => {});
}
