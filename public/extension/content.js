// Content Script for DongkrakUsaha Publisher Extension
console.log("[DONGKRAK EXT CS] Content script loaded on:", window.location.href);
console.log("[DONGKRAK EXT APP CS] CONTENT SCRIPT LOADED");
console.log("[DONGKRAK EXT APP CS] APP ORIGIN =", window.location.origin);

// Authoritative Bridge Instance Singleton Identifier (Safe UUID / Timestamp generation)
const currentBridgeInstanceId = (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? `bridge_${crypto.randomUUID()}_frame_${window.self === window.top ? 'top' : 'sub'}`
  : `bridge_${Date.now()}_${Math.floor(Math.random() * 10000)}_frame_${window.self === window.top ? 'top' : 'sub'}`;

window.__DONGKRAK_BRIDGE_INSTANCE_ID__ = currentBridgeInstanceId;

// Helper to check runtime validity
const isExtensionContextValid = () => {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch (e) {
    return false;
  }
};

const normalizeAutopostText = (value) => String(value ?? '').trim();
const normalizeFieldToken = (value) => normalizeAutopostText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const getFieldSignature = (element) => {
  const labels = [];
  if (element.id) {
    document.querySelectorAll(`label[for="${CSS.escape(element.id)}"]`).forEach((label) => labels.push(label.textContent || ''));
  }
  const parentLabel = element.closest('label');
  if (parentLabel) labels.push(parentLabel.textContent || '');
  const previousLabel = element.previousElementSibling?.tagName?.toLowerCase() === 'label'
    ? element.previousElementSibling.textContent
    : '';
  const surroundingText = element.parentElement?.textContent || '';
  const ancestorText = Array.from({ length: 3 }, (_, index) => {
    let node = element;
    for (let step = 0; step <= index && node; step++) node = node.parentElement;
    return node?.textContent || '';
  }).join(' ');
  return [
    element.name,
    element.id,
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    element.getAttribute('title'),
    element.getAttribute('data-label'),
    ...labels,
    previousLabel,
    surroundingText,
    ancestorText
  ].filter(Boolean).join(' ').toLowerCase();
};

const findAutopostField = (signatures, exactNames = [], allowHidden = false) => {
  const controls = Array.from(document.querySelectorAll('input, textarea, select'));
  const exactTokens = exactNames.map(normalizeFieldToken).filter(Boolean);
  const exactMatch = controls.find((element) => {
    if (element.disabled || element.readOnly || (!allowHidden && element.type === 'hidden')) return false;
    return exactTokens.includes(normalizeFieldToken(element.name)) || exactTokens.includes(normalizeFieldToken(element.id));
  });
  if (exactMatch) return exactMatch;

  const normalizedSignatures = signatures.map(normalizeFieldToken).filter(Boolean);
  return controls
    .map((element) => {
    if (element.disabled || element.readOnly || (!allowHidden && element.type === 'hidden')) return false;
      const signature = getFieldSignature(element);
      const normalizedSignature = normalizeFieldToken(signature);
      const score = normalizedSignatures.reduce((best, candidate) => {
        if (normalizedSignature.includes(candidate)) return Math.max(best, candidate.length * 2);
        return best;
      }, 0);
      return score > 0 ? { element, score } : false;
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)[0]?.element || null;
};

const setNativeFieldValue = (element, value) => {
  const nextValue = normalizeAutopostText(value);
  if (element.tagName.toLowerCase() === 'select') {
    const normalizedValue = normalizeFieldToken(nextValue);
    const options = Array.from(element.options).filter((item) => item.value || item.textContent.trim());
    const option = options.find((item) =>
      normalizeFieldToken(item.value) === normalizedValue || normalizeFieldToken(item.textContent) === normalizedValue
    ) || options.find((item) => {
      const optionToken = normalizeFieldToken(`${item.value} ${item.textContent}`);
      return optionToken.includes(normalizedValue) || normalizedValue.includes(optionToken);
    });
    if (!option) return false;
    element.value = option.value;
  } else {
    const prototype = element.tagName.toLowerCase() === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, nextValue);
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

const escapeHtml = (value) => normalizeAutopostText(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const setDescriptionFieldValue = (textarea, value) => {
  const nextValue = normalizeAutopostText(value);
  if (!nextValue) return false;
  const html = nextValue.split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  let updated = false;

  if (textarea?.id && typeof window.CKEDITOR !== 'undefined' && window.CKEDITOR.instances?.[textarea.id]) {
    window.CKEDITOR.instances[textarea.id].setData(html);
    updated = true;
  }

  const editorFrames = Array.from(document.querySelectorAll('iframe.cke_wysiwyg_frame, iframe[src="javascript:false"], iframe[title*="Rich Text Editor"]'));
  const editorFrame = editorFrames.find((frame) => {
    const container = frame.closest('.cke, .cke_inner, .editor, .form-group');
    return textarea?.id ? Boolean(container?.querySelector(`#${CSS.escape(textarea.id)}`)) : true;
  }) || (textarea ? textarea.parentElement?.querySelector('iframe') : null);
  const editorBody = editorFrame?.contentDocument?.body;
  if (editorBody) {
    editorBody.innerHTML = html;
    editorBody.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: nextValue }));
    editorBody.dispatchEvent(new Event('change', { bubbles: true }));
    updated = true;
  }

  if (textarea) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, nextValue);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    updated = true;
  }
  return updated;
};

const uploadCampaignImage = async (campaign) => {
  const imageUrl = campaign?.dongkrakListingData?.images?.[0] || campaign?.businessData?.images?.[0];
  const fileInput = document.querySelector('input[type="file"]#file, input[type="file"][name="file"], input[type="file"]');
  if (!imageUrl) return { ready: false, error: 'IMAGE_SOURCE_MISSING' };
  if (!fileInput) return { ready: false, error: 'IMAGE_INPUT_NOT_FOUND' };

  try {
    const response = await fetch(imageUrl, { credentials: 'omit' });
    if (!response.ok) return { ready: false, error: `IMAGE_DOWNLOAD_FAILED_${response.status}` };
    const blob = await response.blob();
    const extension = (blob.type.split('/')[1] || 'jpeg').replace('jpeg', 'jpg');
    const file = new File([blob], `dongkrak-upload-${Date.now()}.${extension}`, { type: blob.type || 'image/jpeg' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    return { ready: true, fileName: file.name, bytes: file.size, source: imageUrl };
  } catch (error) {
    return { ready: false, error: error?.message || 'IMAGE_UPLOAD_FAILED' };
  }
};

const setCategoryFieldValue = (select, value) => {
  if (!select || select.tagName.toLowerCase() !== 'select') return false;
  const targetToken = normalizeFieldToken(value);
  const targetWords = normalizeAutopostText(value).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const options = Array.from(select.options).filter((option) => option.value || option.textContent.trim());
  const ranked = options.map((option) => {
    const optionText = `${option.value} ${option.textContent}`.toLowerCase();
    const optionToken = normalizeFieldToken(optionText);
    const overlap = targetWords.filter((word) => optionText.includes(word)).length;
    const exact = optionToken === targetToken ? 1000 : 0;
    const contained = optionToken && targetToken && (optionToken.includes(targetToken) || targetToken.includes(optionToken)) ? 500 : 0;
    return { option, score: exact + contained + overlap * 10 };
  }).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score === 0) return false;

  select.value = best.option.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));

  const root = select.parentElement || document;
  const searchInput = root.querySelector('input[type="search"], input[autocomplete="off"], .select2-search__field');
  if (searchInput && searchInput.offsetParent !== null) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(searchInput, best.option.textContent.trim());
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
  }

  const optionLabel = best.option.textContent.trim().toLowerCase();
  const customOptions = Array.from(document.querySelectorAll(
    '.select2-results__option, .chosen-results li, .dropdown-menu li, [role="option"]'
  )).filter((item) => item.offsetParent !== null && item.textContent.trim().toLowerCase() === optionLabel);
  customOptions[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  customOptions[0]?.click();
  return true;
};

const resolvePlatformCategory = (campaign) => {
  const business = campaign?.businessData || {};
  const content = campaign?.generatedContent || {};
  const listing = campaign?.dongkrakListingData || {};
  const source = normalizeAutopostText(listing.kategori || content.mappedCategory || business.category);
  const businessText = `${business.name || ''} ${business.category || ''} ${business.description || ''} ${(business.productsServices || []).join(' ')}`.toLowerCase();
  if (/furniture|mebel|rakit|lemari|kitchen set/.test(businessText)) return 'Furniture';
  return source;
};

const detectAutopostCaptcha = () => {
  const bodyText = document.body?.innerText?.toLowerCase() || '';
  return Boolean(document.querySelector('[class*="captcha"], [id*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]')) ||
    bodyText.includes('recaptcha') || bodyText.includes('hcaptcha') || bodyText.includes('captcha');
};

const autofillCampaign = async (campaign) => {
  if (!campaign || typeof campaign !== 'object') return { success: false, error: 'INVALID_CAMPAIGN_PAYLOAD' };
  const business = campaign.businessData || {};
  const content = campaign.generatedContent || {};
  const listing = campaign.dongkrakListingData || {};
  const values = [
    { key: 'namaProduk', exactNames: ['produk'], signatures: ['namaproduk', 'nama_produk', 'nama produk', 'title', 'judul'], value: listing.namaProduk || content.seoTitle || business.name },
    { key: 'kategori', exactNames: ['kategori'], signatures: ['kategori', 'category', 'jenis usaha', 'jenis bisnis', 'tipe usaha'], value: resolvePlatformCategory(campaign) },
    { key: 'penawaran', exactNames: ['penawaran'], signatures: ['penawaran', 'offer', 'snippet'], value: listing.penawaran || content.shortSnippet },
    { key: 'deskripsi', exactNames: ['deskripsi'], signatures: ['deskripsi', 'description', 'seo_description', 'seo description'], value: listing.deskripsi || content.seoDescription || business.description },
    { key: 'metaKeyword', exactNames: ['keyword'], signatures: ['metakeyword', 'meta_keyword', 'meta keyword', 'keyword'], value: listing.metaKeyword || business.mainKeyword },
    { key: 'metaDeskripsi', exactNames: ['metadesc'], signatures: ['metadeskripsi', 'meta_deskripsi', 'meta_desc', 'metadesc', 'meta-description', 'description_meta', 'deskripsi_meta', 'deskripsi meta', 'meta description', 'meta desc', 'seo desc', 'description seo'], value: listing.metaDeskripsi || content.metaDescription },
    { key: 'noWhatsApp', exactNames: ['no_wa'], signatures: ['nowhatsapp', 'no_whatsapp', 'whatsapp', 'phone', 'telepon'], value: listing.noWhatsApp || business.phoneWhatsApp }
  ];
  const filled = [];
  const missing = [];
  const missingDetails = [];
  const matchedSelectors = [];
  values.forEach((item) => {
    if (!normalizeAutopostText(item.value)) return;
    const field = findAutopostField(item.signatures, item.exactNames, item.key === 'deskripsi');
    const didSet = item.key === 'kategori'
      ? setCategoryFieldValue(field, item.value)
      : item.key === 'deskripsi'
        ? setDescriptionFieldValue(field, item.value)
        : Boolean(field && setNativeFieldValue(field, item.value));
    if (didSet) {
      filled.push(item.key);
      matchedSelectors.push({ key: item.key, selector: getElementUniqueSelector(field), name: field.name, id: field.id });
    }
    else {
      missing.push(item.key);
      missingDetails.push({
        key: item.key,
        valuePresent: Boolean(normalizeAutopostText(item.value)),
        signatures: item.signatures,
        exactNames: item.exactNames,
        options: field?.tagName?.toLowerCase() === 'select' ? Array.from(field.options).map((option) => ({ value: option.value, label: option.textContent.trim() })) : []
      });
    }
  });
  const image = await uploadCampaignImage(campaign);
  if (!image.ready) missing.push('image');

  return {
    success: true,
    mode: 'DRY_RUN_FILLED_WAITING_CONFIRMATION',
    captchaDetected: detectAutopostCaptcha(),
    filled,
    missing,
    missingDetails,
    matchedSelectors,
    imageReady: image.ready,
    image,
    filledCount: filled.length,
    missingCount: missing.length,
    pageUrl: window.location.href,
    formDetected: Boolean(findAuthoritativeProductForm()?.element),
    message: 'Campaign fields filled. User confirmation is required before submit.'
  };
};

// Clean up previous window message listener if bridge was re-injected
if (window.__DONGKRAK_BRIDGE_LISTENER__) {
  try {
    window.removeEventListener("message", window.__DONGKRAK_BRIDGE_LISTENER__);
  } catch (e) {}
}

// Broadcast bridge readiness to web application window
const sendBridgeReady = () => {
  if (!isExtensionContextValid()) {
    console.warn(`[EXT RECOVERY] Context invalidated on ${window.location.href}. Suppressing BRIDGE_READY.`);
    return;
  }
  try {
    const nowIso = new Date().toISOString();
    console.log(`[EXT RECOVERY] BRIDGE_READY sent instanceId:${currentBridgeInstanceId} url:${window.location.href} frame:${window.self === window.top ? 'top' : 'subframe'} timestamp:${nowIso}`);
    console.log("[DONGKRAK EXT APP CS] BRIDGE READY SENT instanceId:", currentBridgeInstanceId);
    window.postMessage({
      type: 'DONGKRAK_EXT_BRIDGE_READY',
      version: '1.0.0',
      bridgeInstanceId: currentBridgeInstanceId,
      url: window.location.href,
      origin: window.location.origin,
      frameType: window.self === window.top ? 'top' : 'subframe',
      timestamp: nowIso
    }, '*');
  } catch (e) {}
};

sendBridgeReady();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sendBridgeReady);
}

// 1. Listen for background service worker broadcasts
function clickInputProdukButton() {
  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const labelOf = (el) => (
    (el.tagName === 'INPUT' ? (el.value || '') : (el.innerText || el.textContent || '')) ||
    el.title || el.getAttribute('aria-label') || ''
  ).replace(/\s+/g, ' ').trim();

  const candidates = Array.from(document.querySelectorAll('a, button, input[type="button"], input[type="submit"], [role="button"], .btn'));
  const exact = /^\+?\s*(input|tambah|add)\s+produk\s*(baru)?$/i;
  const loose = /(input|tambah|add)\s*produk/i;
  const hrefHint = /aksi=(tambah|input|add)|menu=produk.*(tambah|input|add)/i;

  const scored = [];
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const text = labelOf(el);
    const href = el.tagName === 'A' ? (el.getAttribute('href') || '') : '';
    let score = 0;
    if (exact.test(text)) score = 3;
    else if (loose.test(text)) score = 2;
    else if (hrefHint.test(href)) score = 1;
    if (score > 0) scored.push({ el, text, href, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const sample = candidates.filter(isVisible).slice(0, 40).map(labelOf).filter(Boolean).slice(0, 15);
  if (scored.length === 0) {
    return {
      success: false,
      error: 'INPUT_PRODUK_BUTTON_NOT_FOUND',
      pageUrl: location.href,
      visibleButtons: sample
    };
  }
  const best = scored[0];
  best.el.scrollIntoView({ block: 'center' });
  best.el.click();
  return {
    success: true,
    matchedText: best.text,
    href: (() => { try { return best.href ? new URL(best.href, location.href).href : ''; } catch (e) { return best.href; } })(),
    tag: best.el.tagName.toLowerCase(),
    pageUrl: location.href
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
      // Lightweight liveness check so background.js can tell whether a content
      // script is already alive in this tab BEFORE deciding to re-inject content.js.
      // Answered synchronously — no need to keep the message channel open.
      sendResponse({ alive: true, bridgeInstanceId: currentBridgeInstanceId });
      return false;
    }
    if (request.action === 'CLICK_INPUT_PRODUK') {
      // The product LIST page (menu=produk) has an "Input Produk" button that opens the
      // real entry form. The app used to open the list and leave the operator to find
      // it. This locates the button by its visible text and clicks it. Answered
      // synchronously; if the click navigates, background.js waits for the load.
      let result;
      try { result = clickInputProdukButton(); }
      catch (err) { result = { success: false, error: 'CLICK_THREW', detail: err && err.message }; }
      console.log('[DONGKRAK EXT CS] CLICK_INPUT_PRODUK ->', result);
      sendResponse(result);
      return false;
    }
    if (request.action === 'INSPECT_PAGE_DOM') {
      const requestId = request.requestId || 'dom-' + Date.now();
      console.log("[DONGKRAKUSAHA CONTENT SCRIPT] REAL DOM INSPECTION REQUEST_ID =", requestId);
      
      let inspectionResult;
      try {
        if (typeof inspectDongkrakDOM === 'function') {
          inspectionResult = inspectDongkrakDOM();
        } else {
          console.warn("[DONGKRAKUSAHA CONTENT SCRIPT] inspectDongkrakDOM not ready yet");
          inspectionResult = {
            loggedIn: false,
            authStatus: 'UNKNOWN',
            pageType: 'UNCHECKED',
            formDetected: false,
            fieldsDiscovered: [],
            discoveredFields: [],
            fieldCount: 0,
            error: 'inspectDongkrakDOM function not ready'
          };
        }
      } catch (err) {
        console.error("[DONGKRAKUSAHA CONTENT SCRIPT] Error executing inspectDongkrakDOM:", err);
        inspectionResult = {
          loggedIn: false,
          authStatus: 'ERROR',
          pageType: 'ERROR',
          formDetected: false,
          fieldsDiscovered: [],
          discoveredFields: [],
          fieldCount: 0,
          error: err.message
        };
      }

      const fieldsCount = inspectionResult.fieldsDiscovered ? inspectionResult.fieldsDiscovered.length : 0;
      console.log("[DONGKRAKUSAHA CONTENT SCRIPT] FIELDS_DISCOVERED =", fieldsCount);
      sendResponse(inspectionResult);
    } else if (request.action === 'AUTOFILL_CAMPAIGN') {
      autofillCampaign(request.campaign).then(sendResponse).catch((error) => sendResponse({ success: false, error: error.message || 'AUTOFILL_FAILED' }));
      return true;
    } else if (request.action === 'SUBMIT_CAMPAIGN') {
      const captchaDetected = detectAutopostCaptcha();
      if (captchaDetected) {
        sendResponse({ success: false, error: 'CAPTCHA_DETECTED', captchaDetected: true });
        return false;
      }
      const form = findAuthoritativeProductForm();
      const submitControl = form.element.querySelector('button[type="submit"], input[type="submit"], button:not([type]), input[name*="simpan"], input[value*="Simpan"], input[value*="SIMPAN"]');
      if (!submitControl) {
        sendResponse({ success: false, error: 'SUBMIT_CONTROL_NOT_FOUND' });
        return false;
      }
      let submitMethod = 'click';
      try {
        if (typeof form.element.requestSubmit === 'function') {
          form.element.requestSubmit(submitControl);
          submitMethod = 'requestSubmit';
        } else {
          form.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          submitControl.click();
        }
      } catch (submitError) {
        submitControl.click();
      }
      sendResponse({ success: true, submitted: false, dispatched: true, mode: 'SUBMITTED', submitMethod, formSelector: form.selector, message: 'Submit event dispatched. Publish is not confirmed until a success URL or page confirmation is detected.' });
    } else if (request.action === 'STATE_UPDATED') {
      const payload = request.payload || request.state || {};
      const dongkrakState = payload.dongkrakState || payload;
      const fields = dongkrakState.discoveredFields || dongkrakState.fieldsDiscovered || [];
      const reqSeq = request.requestSequence || payload.requestSequence || 0;
      const stateSeq = request.stateSequence || payload.stateSequence || dongkrakState.stateSequence || 0;
      console.log("[DONGKRAK APP BRIDGE] Forwarding STATE_UPDATED to window. Fields count:", fields.length, "reqSeq:", reqSeq, "stateSeq:", stateSeq);
      
      console.warn('[FORENSIC-BRIDGE-PAYLOAD]', JSON.stringify(request, null, 2));

      window.postMessage({
        type: 'DONGKRAK_REAL_EXT_INSPECT_RES',
        payload: dongkrakState,
        discoveredFields: fields,
        fieldsDiscovered: fields,
        bridgeInstanceId: currentBridgeInstanceId,
        requestId: request.requestId || payload.requestId || 'update-' + Date.now(),
        requestSequence: reqSeq,
        stateSequence: stateSeq
      }, '*');
      window.postMessage({
        type: 'DONGKRAK_EXTENSION_HANDSHAKE_RESPONSE',
        bridgeInstanceId: currentBridgeInstanceId,
        requestSequence: reqSeq,
        stateSequence: stateSeq,
        payload: {
          extensionInstalled: true,
          extensionConnected: true,
          extensionVersion: '1.0.0',
          bridgeReady: true,
          backgroundWorkerReady: true,
          dongkrakState: dongkrakState,
          discoveredFields: fields,
          fieldsDiscovered: fields,
          requestId: request.requestId || payload.requestId,
          requestSequence: reqSeq,
          stateSequence: stateSeq
        }
      }, '*');
    }
    // Every branch above already calls sendResponse() synchronously (or never calls
    // it at all, for STATE_UPDATED). Returning `true` here used to falsely promise
    // Chrome an async response for the branches that don't send one, producing
    // "message channel closed before a response was received" noise. false = "I'm
    // done responding synchronously" (harmless for INSPECT_PAGE_DOM, correct for
    // everything else).
    return false;
  });
}

// 2. Listen for requests coming from the SEO Web Application page via window.postMessage
const handleWindowMessage = (event) => {
  if (!isExtensionContextValid()) {
    console.warn(`[EXT RECOVERY] Dead content script detected on frame ${window.location.href}. Self-destructing listener.`);
    if (window.__DONGKRAK_BRIDGE_INSTANCE_ID__ === currentBridgeInstanceId) {
      window.__DONGKRAK_BRIDGE_INSTANCE_ID__ = null;
    }
    try {
      window.removeEventListener("message", handleWindowMessage);
    } catch (e) {}
    if (event.data && (event.data.type === 'DONGKRAK_EXTENSION_HANDSHAKE' || event.data.type === 'DONGKRAK_RECOVER_BRIDGE_REQ')) {
      window.postMessage({
        type: 'DONGKRAK_BRIDGE_CONTEXT_INVALIDATED',
        bridgeInstanceId: currentBridgeInstanceId,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        error: 'Extension context invalidated'
      }, '*');
    }
    return;
  }

  // Authoritative Singleton Guard: only the newest active bridge instance responds
  if (window.__DONGKRAK_BRIDGE_INSTANCE_ID__ !== currentBridgeInstanceId) {
    return;
  }
  if (!event.data || !event.data.type) return;

  const reqType = event.data.type;
  if (reqType === 'DONGKRAK_EXTENSION_HANDSHAKE' || reqType === 'DONGKRAK_GET_CURRENT_STATE' || reqType === 'DONGKRAK_REAL_EXT_INSPECT_REQ') {
    const requestId = event.data.requestId || 'req-' + Date.now();
    const reqSeq = event.data.requestSequence || 0;
    console.log("[EXT RECOVERY] HANDSHAKE started requestId:", requestId, "bridgeInstanceId:", currentBridgeInstanceId, "REQ_SEQ =", reqSeq);

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const bgAction = reqType === 'DONGKRAK_EXTENSION_HANDSHAKE' ? 'EXTENSION_HANDSHAKE' : 'GET_CURRENT_STATE';
      try {
        chrome.runtime.sendMessage({ action: bgAction, requestId, requestSequence: reqSeq }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("[EXT RECOVERY] STATE SYNC failed - Background worker error for requestId:", requestId, chrome.runtime.lastError.message);
            window.postMessage({
              type: 'DONGKRAK_EXTENSION_HANDSHAKE_RESPONSE',
              requestId,
              requestSequence: reqSeq,
              bridgeInstanceId: currentBridgeInstanceId,
              payload: {
                extensionInstalled: false,
                extensionConnected: false,
                extensionVersion: '1.0.0',
                bridgeReady: true,
                backgroundWorkerReady: false,
                requestSequence: reqSeq,
                errorMessage: chrome.runtime.lastError.message
              }
            }, '*');
          } else if (response) {
            const stateObj = response.dongkrakState || response;
            const fields = response.discoveredFields || response.fieldsDiscovered || stateObj.discoveredFields || stateObj.fieldsDiscovered || [];
            const seq = response.stateSequence || stateObj.stateSequence || 0;
            console.log("[EXT RECOVERY] HANDSHAKE succeeded requestId:", requestId, "stateSequence:", seq, "fields:", fields.length);
            console.log("[EXT RECOVERY] STATE SYNC succeeded requestId:", requestId);
            
            console.warn('[FORENSIC-BRIDGE-PAYLOAD]', JSON.stringify(response, null, 2));

            window.postMessage({
              type: 'DONGKRAK_EXTENSION_HANDSHAKE_RESPONSE',
              requestId,
              requestSequence: reqSeq,
              stateSequence: seq,
              bridgeInstanceId: currentBridgeInstanceId,
              payload: {
                ...response,
                requestSequence: reqSeq,
                stateSequence: seq,
                discoveredFields: fields,
                fieldsDiscovered: fields,
                dongkrakState: {
                  ...stateObj,
                  stateSequence: seq,
                  discoveredFields: fields,
                  fieldsDiscovered: fields
                }
              }
            }, '*');

            window.postMessage({
              type: 'DONGKRAK_REAL_EXT_INSPECT_RES',
              requestId,
              requestSequence: reqSeq,
              stateSequence: seq,
              bridgeInstanceId: currentBridgeInstanceId,
              payload: {
                ...stateObj,
                stateSequence: seq,
                discoveredFields: fields,
                fieldsDiscovered: fields
              }
            }, '*');
          }
        });
      } catch (err) {
        console.warn("[EXT RECOVERY] STATE SYNC failed - Extension context invalidated:", err.message);
        window.postMessage({
          type: 'DONGKRAK_EXTENSION_HANDSHAKE_RESPONSE',
          requestId,
          requestSequence: reqSeq,
          bridgeInstanceId: currentBridgeInstanceId,
          payload: {
            extensionInstalled: false,
            extensionConnected: false,
            extensionVersion: '1.0.0',
            bridgeReady: false,
            backgroundWorkerReady: false,
            requestSequence: reqSeq,
            errorMessage: err.message || 'Extension context invalidated'
          }
        }, '*');
      }
    }
  }

  if (event.data.type === 'DONGKRAK_RECOVER_BRIDGE_REQ') {
    const reqId = event.data.requestId || 'rec-' + Date.now();
    console.log("[EXT RECOVERY] DONGKRAK_RECOVER_BRIDGE_REQ received, sending RECOVER_APP_BRIDGE to background");
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: 'RECOVER_APP_BRIDGE', requestId: reqId });
      } catch (e) {
        console.warn("[EXT RECOVERY] Runtime sendMessage failed during recovery request:", e.message);
      }
    }
  }

  if (event.data.type === 'DONGKRAK_REAL_EXT_OPEN_LOGIN') {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'OPEN_DONGKRAK_LOGIN' });
    }
  }

  if (event.data.type === 'DONGKRAK_REAL_EXT_OPEN_FORM') {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'OPEN_DONGKRAK_PRODUCT_FORM' });
    }
  }

  if (event.data.type === 'DONGKRAK_REAL_EXT_OPEN_INPUT_PRODUK') {
    const requestId = event.data.requestId || ('input-produk-' + Date.now());
    const reply = (payload) => window.postMessage({ type: 'DONGKRAK_INPUT_PRODUK_RESULT', requestId, payload }, '*');
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: 'OPEN_DONGKRAK_INPUT_PRODUK', requestId }, (response) => {
          if (chrome.runtime.lastError) { reply({ success: false, error: chrome.runtime.lastError.message || 'RUNTIME_MESSAGE_FAILED' }); return; }
          reply(response || { success: false, error: 'EMPTY_EXTENSION_RESPONSE' });
        });
      } catch (e) {
        reply({ success: false, error: e && e.message ? e.message : 'RUNTIME_MESSAGE_THREW' });
      }
    } else {
      reply({ success: false, error: 'EXTENSION_NOT_AVAILABLE' });
    }
  }

  if (event.data.type === 'DONGKRAK_AUTOFILL_CAMPAIGN' || event.data.type === 'DONGKRAK_SUBMIT_CAMPAIGN') {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: event.data.type === 'DONGKRAK_AUTOFILL_CAMPAIGN' ? 'AUTOFILL_CAMPAIGN' : 'SUBMIT_CAMPAIGN',
        campaign: event.data.campaign,
        requestId: event.data.requestId || `autopost-${Date.now()}`
      }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: event.data.type === 'DONGKRAK_AUTOFILL_CAMPAIGN' ? 'DONGKRAK_AUTOFILL_RESULT' : 'DONGKRAK_SUBMIT_RESULT',
            requestId: event.data.requestId,
            payload: { success: false, error: chrome.runtime.lastError.message || 'RUNTIME_MESSAGE_FAILED' }
          }, '*');
          return;
        }
        window.postMessage({
          type: event.data.type === 'DONGKRAK_AUTOFILL_CAMPAIGN' ? 'DONGKRAK_AUTOFILL_RESULT' : 'DONGKRAK_SUBMIT_RESULT',
          requestId: event.data.requestId,
          payload: response || { success: false, error: 'EMPTY_EXTENSION_RESPONSE' }
        }, '*');
      });
    }
  }
};

window.__DONGKRAK_BRIDGE_LISTENER__ = handleWindowMessage;
window.addEventListener("message", handleWindowMessage);

// 3. If running on dongkrakusaha.com, report DOM state changes automatically with bounded retry strategy
if (window.location.hostname.includes("dongkrakusaha.com")) {
  let initialFieldCount = 0;
  let finalFieldCount = 0;
  let notifyDebounceTimer = null;
  let lastNotifiedStateHash = '';

  const notifyDOMState = (reason = 'INITIAL') => {
    if (notifyDebounceTimer) clearTimeout(notifyDebounceTimer);
    
    notifyDebounceTimer = setTimeout(() => {
      let inspectionResult;
      try {
        inspectionResult = (typeof inspectDongkrakDOM === 'function') 
          ? inspectDongkrakDOM() 
          : { loggedIn: false, authStatus: 'UNKNOWN', pageType: 'UNCHECKED', fieldCount: 0, fieldsDiscovered: [] };
      } catch (e) {
        inspectionResult = { loggedIn: false, authStatus: 'ERROR', pageType: 'ERROR', fieldCount: 0, fieldsDiscovered: [] };
      }
      const currentHash = `${inspectionResult.authStatus}_${inspectionResult.pageType}_${inspectionResult.fieldCount}`;
      
      if (reason !== 'INITIAL' && currentHash === lastNotifiedStateHash) {
        return; // Skip redundant DOM notification if state hasn't changed
      }
      lastNotifiedStateHash = currentHash;

      if (reason === 'INITIAL') {
        initialFieldCount = inspectionResult.fieldCount;
      } else {
        finalFieldCount = inspectionResult.fieldCount;
        console.log(`[DONGKRAK EXT CS] DYNAMIC DOM RETRY (${reason}): INITIAL_FIELD_COUNT=${initialFieldCount}, FINAL_FIELD_COUNT=${finalFieldCount}`);
      }

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        console.warn('[TRACE-CONTENT-NOTIFY]', { reason, fieldCount: inspectionResult.fieldCount, auth: inspectionResult.authStatus });
        chrome.runtime.sendMessage({ action: 'NOTIFY_DOM_CHANGED', payload: inspectionResult }).catch(() => {});
      }
    }, reason === 'INITIAL' ? 0 : 250);
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    notifyDOMState('INITIAL');
  } else {
    document.addEventListener('DOMContentLoaded', () => notifyDOMState('INITIAL'));
  }
  window.addEventListener('load', () => notifyDOMState('LOAD_EVENT'));

  // Bounded retry strategy for dynamic / AJAX loaded forms
  setTimeout(() => notifyDOMState('RETRY_500MS'), 500);
  setTimeout(() => notifyDOMState('RETRY_1500MS'), 1500);
  setTimeout(() => notifyDOMState('RETRY_3000MS'), 3000);
}

function getElementUniqueSelector(el) {
  if (!el) return '';
  if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
  
  let path = [];
  let current = el;
  while (current && current !== document.body && current !== document.documentElement) {
    let tag = current.tagName.toLowerCase();
    if (current.id) {
      path.unshift(`${tag}#${current.id}`);
      break;
    }
    let sibIndex = 1;
    let sib = current.previousElementSibling;
    while (sib) {
      if (sib.tagName === current.tagName) sibIndex++;
      sib = sib.previousElementSibling;
    }
    path.unshift(`${tag}:nth-of-type(${sibIndex})`);
    current = current.parentElement;
  }
  return path.join(' > ');
}

function findAuthoritativeProductForm() {
  const forms = Array.from(document.querySelectorAll('form'));
  
  // 1. Look for explicit product input forms
  for (const form of forms) {
    const action = (form.getAttribute('action') || '').toLowerCase();
    const name = (form.getAttribute('name') || '').toLowerCase();
    const id = (form.id || '').toLowerCase();
    const cls = (form.className || '').toLowerCase();

    if (action.includes('login') || id.includes('login') || name.includes('login') || action.includes('search')) {
      continue;
    }

    if (
      action.includes('menu=produk') || action.includes('produk') || action.includes('product') ||
      action.includes('simpan') || action.includes('insert') || action.includes('save') ||
      id.includes('produk') || name.includes('produk') || cls.includes('produk')
    ) {
      return {
        element: form,
        selector: getElementUniqueSelector(form),
        id: form.id || '',
        name: form.getAttribute('name') || '',
        action: form.getAttribute('action') || '',
        method: form.getAttribute('method') || 'POST'
      };
    }
  }

  // 2. Look for any non-login form with interactive fields inside panel
  const validForms = forms.filter(f => {
    const action = (f.getAttribute('action') || '').toLowerCase();
    const id = (f.id || '').toLowerCase();
    const name = (f.getAttribute('name') || '').toLowerCase();
    return !action.includes('login') && !id.includes('login') && !name.includes('login') && !action.includes('search');
  });

  if (validForms.length > 0) {
    validForms.sort((a, b) => {
      const countA = a.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
      const countB = b.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
      return countB - countA;
    });
    const bestForm = validForms[0];
    if (bestForm.querySelectorAll('input:not([type="hidden"]), select, textarea').length > 0) {
      return {
        element: bestForm,
        selector: getElementUniqueSelector(bestForm),
        id: bestForm.id || '',
        name: bestForm.getAttribute('name') || '',
        action: bestForm.getAttribute('action') || '',
        method: bestForm.getAttribute('method') || 'POST'
      };
    }
  }

  // 3. Fallback to main content container or body
  const mainContainer = document.querySelector('.content-wrapper, #content, .content, #main-content, .panel-body, .card-body, main') || document.body;
  return {
    element: mainContainer,
    selector: getElementUniqueSelector(mainContainer),
    id: mainContainer.id || '',
    name: mainContainer.getAttribute('name') || '',
    action: '',
    method: ''
  };
}

function inspectDongkrakDOM() {
  const url = window.location.href;
  const isDongkrakDomain = url.includes("dongkrakusaha.com");

  if (!isDongkrakDomain) {
    return {
      loggedIn: false,
      authStatus: 'NOT_DONGKRAK',
      pageType: 'NOT_DONGKRAK',
      formDetected: false,
      formContext: 'NOT_DONGKRAK',
      rawControlCount: 0,
      formControlCount: 0,
      excludedControlCount: 0,
      duplicateCount: 0,
      validFieldCount: 0,
      authoritativeForm: null,
      fieldsDiscovered: [],
      discoveredFields: [],
      fieldCount: 0,
      timestamp: new Date().toISOString()
    };
  }

  // 1. AUTHENTICATION DIAGNOSTIC EVIDENCE
  const bodyText = (document.body ? document.body.innerText : '').toUpperCase();

  const hasMasterData = bodyText.includes('MASTER DATA');
  const hasGoogleList = bodyText.includes('DAFTAR KE GOOGLE') || bodyText.includes('GOOGLE VERIFICATION');
  const hasKeywordResearch = bodyText.includes('RISET KATA KUNCI');
  const hasPackageInfo = bodyText.includes('PAKET');
  const hasQuotaInfo = bodyText.includes('QUOTA');
  const hasAnnouncement = bodyText.includes('PENGUMUMAN');
  const hasProductMenu = bodyText.includes('PRODUK') || url.includes('menu=produk');
  const hasMetaTagMenu = bodyText.includes('META TAG');
  const isPanelMemberUrl = url.includes('/panelMember') || url.includes('menu=');

  const memberEvidenceList = [
    hasMasterData && 'MASTER DATA',
    hasGoogleList && 'DAFTAR KE GOOGLE / VERIFICATION',
    hasKeywordResearch && 'RISET KATA KUNCI',
    hasPackageInfo && 'PAKET INFO',
    hasQuotaInfo && 'QUOTA INFO',
    hasAnnouncement && 'PENGUMUMAN',
    hasProductMenu && 'PRODUK MENU',
    hasMetaTagMenu && 'META TAG',
    isPanelMemberUrl && 'PANEL MEMBER URL/PARAM'
  ].filter(Boolean);

  const logoutElements = document.querySelectorAll(
    'a[href*="logout"], a[href*="Logout"], a[href*="keluar"], a[href*="exit"], a[href*="log_out"], a[href*="action=logout"], a[href*="menu=logout"]'
  );
  const hasLogoutLink = logoutElements.length > 0;

  const passwordInputs = document.querySelectorAll('input[type="password"]');
  const hasPasswordField = passwordInputs.length > 0;

  const loginFormElements = document.querySelectorAll('form[action*="login"], form[name*="login"]');
  const isExplicitLoginPage = (loginFormElements.length > 0 || hasPasswordField) && !isPanelMemberUrl && !hasLogoutLink && memberEvidenceList.length === 0;

  let isLoggedIn = false;
  let authStatus = 'UNKNOWN';

  if (isPanelMemberUrl || hasLogoutLink || memberEvidenceList.length > 0) {
    isLoggedIn = true;
    authStatus = 'AUTHENTICATED';
  } else if (isExplicitLoginPage) {
    isLoggedIn = false;
    authStatus = 'NOT_LOGGED_IN';
  } else {
    isLoggedIn = false;
    authStatus = 'UNKNOWN';
  }

  // 2. AUTHORITATIVE FORM & DOM CONTROL DISCOVERY
  const isInIframe = window.self !== window.top;
  const formContext = isInIframe ? 'IFRAME' : 'MAIN_DOCUMENT';

  const allRawControls = Array.from(document.querySelectorAll('input, select, textarea'));
  const rawControlCount = allRawControls.length;

  const authForm = findAuthoritativeProductForm();
  const formEl = authForm.element;

  const formCandidates = Array.from(formEl.querySelectorAll('input, select, textarea'));
  const formControlCount = formCandidates.length;

  let excludedControlCount = 0;
  let duplicateCount = 0;

  const validFields = [];
  const seenKeyMap = new Map();
  const kategoriOccurrences = [];

  formCandidates.forEach((el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const tag = el.tagName.toLowerCase();

    // 1. Exclude buttons / submits / image inputs / resets
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image' || tag === 'button') {
      excludedControlCount++;
      return;
    }

    // 2. Exclude system tokens (CSRF, PHPSESSID, security tokens)
    if (name.includes('csrf') || name.includes('phpsessid') || name.includes('token') || id.includes('csrf') || id.includes('token')) {
      excludedControlCount++;
      return;
    }

    // 3. Exclude controls belonging to login / search forms
    const parentForm = el.closest('form');
    if (parentForm && parentForm !== formEl) {
      const pAction = (parentForm.getAttribute('action') || '').toLowerCase();
      const pId = (parentForm.id || '').toLowerCase();
      if (pAction.includes('login') || pId.includes('login') || pAction.includes('search')) {
        excludedControlCount++;
        return;
      }
    }

    // 4. Exclude controls in nav, header, footer, or template containers
    if (el.closest('header, footer, nav, .sidebar-search, .navbar, .template, template, .hidden-template')) {
      excludedControlCount++;
      return;
    }

    // Compute Label text
    let labelText = '';
    if (el.id) {
      try {
        const labelEl = document.querySelector(`label[for="${CSS.escape ? CSS.escape(el.id) : el.id}"]`);
        if (labelEl) labelText = labelEl.innerText.trim();
      } catch (e) {}
    }
    if (!labelText && el.closest('label')) {
      labelText = el.closest('label').innerText.trim();
    }
    if (!labelText && el.parentElement) {
      const parentLabel = el.parentElement.querySelector('label');
      if (parentLabel) {
        labelText = parentLabel.innerText.trim();
      } else {
        const textContent = el.parentElement.innerText || '';
        labelText = textContent.split('\n')[0].trim();
      }
    }
    const cleanLabel = labelText || el.getAttribute('placeholder') || el.name || `Field #${validFields.length + 1}`;

    const isVisible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && 
                      window.getComputedStyle(el).visibility !== 'hidden' && 
                      type !== 'hidden';

    const selector = getElementUniqueSelector(el);

    if (cleanLabel.toLowerCase().includes('kategori') || name.includes('kategori') || id.includes('kategori')) {
      kategoriOccurrences.push({
        label: cleanLabel,
        selector,
        formSelector: authForm.selector,
        name,
        id,
        type,
        visible: isVisible,
        frame: isInIframe ? 'iframe' : 'main'
      });
    }

    // Deterministic deduplication key
    const dedupKey = (name ? `name:${name}` : (id ? `id:${id}` : `selector:${selector}`)) + `|tag:${tag}`;

    if (seenKeyMap.has(dedupKey)) {
      duplicateCount++;
      console.log(`[DONGKRAK EXT CS] DEDUP REMOVED DUPLICATE CONTROL: key=${dedupKey}, label=${cleanLabel}`);
      return;
    }

    seenKeyMap.set(dedupKey, true);

    validFields.push({
      index: validFields.length + 1,
      fieldId: `field_${validFields.length + 1}_${name || id || tag}`,
      label: cleanLabel,
      tagName: tag.toUpperCase(),
      type: type || (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'text'),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      selector: selector,
      formSelector: authForm.selector,
      visible: isVisible,
      disabled: el.disabled || el.hasAttribute('disabled'),
      readonly: el.readOnly || el.hasAttribute('readonly'),
      required: el.hasAttribute('required'),
      placeholder: el.getAttribute('placeholder') || '',
      maxlength: el.getAttribute('maxlength') || null,
      accept: el.getAttribute('accept') || null,
      frame: isInIframe ? 'iframe' : 'main',
      source: 'REAL_DONGKRAKUSAHA_DOM',
      isAuthoritative: true
    });
  });

  if (kategoriOccurrences.length > 1) {
    console.log("==========================================");
    console.log("CATEGORY FIELD AUDIT - KATEGORI OCCURRENCES DETECTED:");
    kategoriOccurrences.forEach((occ, i) => {
      console.log(`Occurrence #${i + 1}:`);
      console.log(`  Label: ${occ.label}`);
      console.log(`  DOM selector: ${occ.selector}`);
      console.log(`  Form: ${occ.formSelector}`);
      console.log(`  Name: ${occ.name}`);
      console.log(`  ID: ${occ.id}`);
      console.log(`  Type: ${occ.type}`);
      console.log(`  Visible: ${occ.visible}`);
      console.log(`  Frame: ${occ.frame}`);
    });
    console.log("==========================================");
  }

  const isProductUrl = url.includes('menu=produk') || url.includes('produk');
  const formDetected = validFields.length > 0 && (isProductUrl || isPanelMemberUrl || validFields.length >= 2);

  let pageType = 'PUBLIC_PAGE';
  if (isExplicitLoginPage) {
    pageType = 'LOGIN_PAGE';
  } else if (isLoggedIn && formDetected) {
    pageType = 'PRODUCT_INPUT_FORM';
  } else if (isLoggedIn) {
    pageType = 'MEMBER_DASHBOARD';
  }

  console.log(`[DONGKRAK EXT CS] AUDIT RESULTS: URL=${url} | PAGE_TYPE=${pageType} | AUTH_STATUS=${authStatus} | RAW_CONTROLS=${rawControlCount} | FORM_CONTROLS=${formControlCount} | EXCLUDED=${excludedControlCount} | DUPLICATES_REMOVED=${duplicateCount} | FINAL_VALID_FIELDS=${validFields.length}`);

  return {
    loggedIn: isLoggedIn,
    authStatus,
    pageType,
    formDetected,
    formContext,
    rawControlCount,
    formControlCount,
    excludedControlCount,
    duplicateCount,
    validFieldCount: validFields.length,
    authoritativeForm: {
      selector: authForm.selector,
      id: authForm.id,
      name: authForm.name,
      action: authForm.action,
      method: authForm.method
    },
    fieldsDiscovered: validFields,
    discoveredFields: validFields,
    fieldCount: validFields.length,
    timestamp: new Date().toISOString()
  };
}
