(() => {
  'use strict';

  const config = window.XLIVE_SUPABASE;
  const MAX_FILES = 20;
  const MAX_BYTES = 50 * 1024 * 1024;
  let client = null;
  let busy = false;

  function getClient() {
    if (client) return client;
    if (!config?.url || !config?.key || !window.supabase?.createClient) return null;
    client = window.supabase.createClient(config.url, config.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  function inspectVideo(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
        error ? reject(error) : resolve(result);
      };
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => {
        const result = {
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        };
        if (!Number.isFinite(result.duration) || !result.width || !result.height) {
          finish(new Error('تعذر قراءة بيانات الفيديو.'));
        } else {
          finish(null, result);
        }
      };
      video.onerror = () => finish(new Error('تعذر فتح أحد ملفات الفيديو.'));
      video.src = url;
    });
  }

  function makePreview(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      let done = false;
      const finish = blob => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
        resolve(blob || null);
      };
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onloadeddata = () => {
        try { video.currentTime = Math.min(1, video.duration / 2); }
        catch (_) { draw(); }
      };
      const draw = () => {
        try {
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => finish(blob), 'image/jpeg', 0.78);
        } catch (_) { finish(null); }
      };
      video.onseeked = draw;
      video.onerror = () => finish(null);
      video.src = url;
      video.load();
    });
  }

  function getOrCreateControls() {
    const heading = document.querySelector('#creator-tab-content .creator-panel-heading');
    if (!heading || heading.querySelector('[data-batch-video-upload]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-secondary';
    button.dataset.batchVideoUpload = 'true';
    button.textContent = 'رفع دفعة (حتى 20 مقطع)';
    button.setAttribute('aria-label', 'رفع حتى 20 مقطع عمودي دفعة واحدة');
    const existing = heading.querySelector('[data-creator-upload="video"]');
    if (existing) existing.insertAdjacentElement('beforebegin', button);
    else heading.appendChild(button);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm,video/quicktime';
    input.multiple = true;
    input.hidden = true;
    input.dataset.batchVideoFiles = 'true';
    heading.appendChild(input);

    const status = document.createElement('p');
    status.className = 'auth-feedback';
    status.dataset.batchVideoStatus = 'true';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    heading.insertAdjacentElement('afterend', status);
  }

  async function uploadBatch(files, status, button, input) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    input.disabled = true;
    const say = message => { if (status) status.textContent = message; };
    const allowed = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov'
    };

    try {
      if (!files.length) return;
      if (files.length > MAX_FILES) throw new Error('الحد الأقصى 20 مقطعاً في الدفعة الواحدة.');
      const invalidType = files.find(file => !allowed[file.type]);
      if (invalidType) throw new Error('كل الملفات يجب أن تكون MP4 أو WebM أو MOV.');
      const tooLarge = files.find(file => file.size > MAX_BYTES);
      if (tooLarge) throw new Error('حجم كل مقطع يجب ألا يتجاوز 50 ميغابايت.');

      say('جارٍ التحقق من ملفات الفيديو…');
      const inspected = [];
      for (const file of files) {
        const meta = await inspectVideo(file);
        inspected.push({ file, meta });
      }

      const supabase = getClient();
      if (!supabase) throw new Error('تعذر الاتصال بخدمة الحسابات.');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const user = sessionData?.session?.user;
      if (!user) throw new Error('سجّل الدخول أولاً ثم أعد المحاولة.');

      let uploaded = 0;
      const errors = [];
      for (let i = 0; i < inspected.length; i++) {
        const { file } = inspected[i];
        const id = window.crypto?.randomUUID?.();
        if (!id) throw new Error('المتصفح لا يدعم إنشاء معرّف آمن للملف.');
        const path = user.id + '/' + id + '.' + allowed[file.type];
        let previewPath = null;
        say('جارٍ رفع المقطع ' + (i + 1) + ' من ' + inspected.length + '…');

        const { error: uploadError } = await supabase.storage.from('video-originals')
          .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
        if (uploadError) {
          errors.push(file.name + ': تعذّر رفع الملف');
          continue;
        }

        try {
          const preview = await makePreview(file);
          if (preview) {
            const candidate = user.id + '/previews/' + id + '.jpg';
            const { error } = await supabase.storage.from('video-originals')
              .upload(candidate, preview, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
            if (!error) previewPath = candidate;
          }
        } catch (_) { /* Preview is optional; the original remains available for review. */ }

        const { error: rowError } = await supabase.from('videos').insert({
          owner_id: user.id,
          title: '\u200B',
          description: '',
          storage_path: path,
          preview_path: previewPath,
          status: 'pending',
          visibility: 'public',
          is_paid: false
        });
        if (rowError) {
          await supabase.storage.from('video-originals').remove([path]);
          if (previewPath) await supabase.storage.from('video-originals').remove([previewPath]);
          errors.push(file.name + ': تعذّر تسجيل المقطع للمراجعة');
          continue;
        }
        uploaded++;
      }

      if (uploaded > 0) {
        say('اكتمل رفع ' + uploaded + ' من ' + inspected.length + ' مقطعاً. المقاطع قيد المراجعة ولن تظهر للعامة قبل الموافقة.');
        window.XLiveApp?.showToast('تم رفع ' + uploaded + ' مقطعاً وإرسالها للمراجعة.');
        document.querySelector('[data-creator-tab="videos"]')?.click();
      }
      if (errors.length) say((uploaded ? 'تم رفع ' + uploaded + ' مقطعاً. ' : '') + 'تعذّر رفع ' + errors.length + ' ملف/ملفات. يمكنك إعادة المحاولة للملفات الفاشلة.');
    } catch (error) {
      say(error?.message || 'تعذّر رفع الدفعة. تحقق من الاتصال والصلاحيات ثم حاول مجدداً.');
    } finally {
      busy = false;
      button.disabled = false;
      input.disabled = false;
      input.value = '';
    }
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const button = target?.closest('[data-batch-video-upload]');
    if (!button) return;
    const input = button.parentElement?.querySelector('[data-batch-video-files]');
    input?.click();
  });

  document.addEventListener('change', event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const input = target?.closest('[data-batch-video-files]');
    if (!input) return;
    const button = input.parentElement?.querySelector('[data-batch-video-upload]');
    const status = document.querySelector('[data-batch-video-status]');
    if (button) uploadBatch(Array.from(input.files || []), status, button, input);
  });

  // The creator view is rendered asynchronously and its contents can be replaced
  // after navigation. Observe the document so the batch button is mounted reliably.
  const observer = new MutationObserver(() => getOrCreateControls());
  const start = () => {
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    getOrCreateControls();
  };
  document.addEventListener('click', event => {
    if (event.target.closest('[data-creator-tab]') || event.target.closest('[data-view="creator"]')) {
      window.setTimeout(getOrCreateControls, 0);
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
