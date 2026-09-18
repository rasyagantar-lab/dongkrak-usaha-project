// Authoritative Persistent Background State Coordinator for DongkrakUsaha Chrome Extension
console.log("[DONGKRAK EXT BG] Service Worker Initializing...");
console.log("[EXT RECOVERY] background worker started");

let globalSequence = 0;
let latestInspectionId = 0;
let latestCommittedInspectionId = 0;

let currentState = {
  extensionConnected: true,
  extensionDetected: true,
  dongkrakusahaDetected: false,
  tabDetected: false,
  dongkrakTabId: null,
  authenticated: false,
  isLoggedIn: false,
  authStatus: "UNKNOWN", // AUTHENTICATED | NOT_LOGGED_IN | UNKNOWN | NO_TAB
  liveInspectionStatus: "UNKNOWN", // SUCCESS | UNKNOWN | FAILED | NO_TAB | IN_PROGRESS
  liveInspectionError: null,
  productInputDetected: false,
  formDetected: false,
  formFieldCount: 0,
  discoveredFields: [],
  fieldsDiscovered: [],
  lastInspectionAt: null,
  lastStateSync: new Date().toLocaleTimeString('id-ID'),
  lastKnownUrl: null,
  url: null,
  publisherReady: false,
  pageType: 'UNCHECKED',
  message: null,
  stateSequence: 0,
  lastUpdated: Date.now()
};

// Proactively recover/re-inject App bridge into open SEO App tabs and DongkrakUsaha tabs on worker startup or recovery request
function recoverAppBridgeTabs(targetTabId = null) {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) return;
  chrome.tabs.query({}, (tabs) => {
    if (!tabs) return;
    tabs.forEach(tab => {
      if (targetTabId && tab.id !== targetTabId) return;
      const url = tab.url || tab.pendingUrl || '';
      const isDongkrak = url.includes("dongkrakusaha.com");
      const isExtension = url.startsWith("chrome") || url.startsWith("chrome-extension") || url.startsWith("about:") || url.startsWith("edge:");
      const isAppTab = url.includes("run.app") || url.includes("localhost") || url.includes("127.0.0.1") || url.includes("ai.studio") || (!isDongkrak && !isExtension && url.startsWith("http"));
      
      // Re-inject into both App tabs AND DongkrakUsaha tabs to cure orphaned / context-invalidated content scripts.
      // PING first: the service worker gets torn down and respawned constantly (normal
      // MV3 behavior), and every respawn used to call this function blindly — re-injecting
      // content.js into tabs where it was already alive and working, which throws
      // "Identifier 'currentBridgeInstanceId' has already been declared" because the
      // page already has one copy running. Only inject when PING proves nothing answers.
      if ((isAppTab || isDongkrak) && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'PING' }, { frameId: 0 }, () => {
          const alreadyAlive = !chrome.runtime.lastError;
          if (alreadyAlive) return;
          console.log(`[EXT RECOVERY] Injecting content script into ${isDongkrak ? 'Dongkrak (top-frame only)' : 'App (all frames)'} tab #${tab.id} (URL: ${url})`);
          chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: isAppTab },
            files: ['content.js']
          }).then(() => {
            console.log(`[EXT RECOVERY] INJECTION_SUCCESS tabId:${tab.id} tabUrl:${url}`);
          }).catch(err => {
            console.warn(`[EXT RECOVERY] INJECTION_FAILED tabId:${tab.id} error:${err.message}`);
          });
        });
      }
    });
  });
}

// Hydrate cached state from chrome.storage.local on worker startup / wake
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['dongkrak_state'], (result) => {
    if (result && result.dongkrak_state) {
      const restoredSeq = result.dongkrak_state.stateSequence || globalSequence;
      globalSequence = Math.max(globalSequence, restoredSeq);
      currentState = {
        ...currentState,
        ...result.dongkrak_state,
        extensionConnected: true,
        liveInspectionStatus: 'UNKNOWN',
        stateSequence: globalSequence
      };
      console.log("[DONGKRAK EXT BG] Restored persisted state from chrome.storage.local. Sequence:", globalSequence, "Fields:", currentState.discoveredFields?.length);
    }
    recoverAppBridgeTabs();
    inspectAndSyncState('boot-' + Date.now(), null, 'SERVICE_WORKER_STARTUP');
  });
} else {
  recoverAppBridgeTabs();
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    console.log("[EXT RECOVERY] Extension installed/reloaded - triggering bridge recovery");
    recoverAppBridgeTabs();
  });
}

// Authoritative Inspection Transaction Coordinator
function inspectAndSyncState(requestId, sendResponseCallback, source = 'GENERIC') {
  if (!requestId) requestId = 'bg-' + Date.now();
  const inspectionId = ++latestInspectionId;
  console.warn('[TRACE-START]', { inspectionId, source, reqId: requestId, globalSeq: globalSequence, committed: latestCommittedInspectionId });
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();

  console.log(`[INSPECTION START] inspectionId:${inspectionId} source:${source} requestId:${requestId} timestamp:${nowIso}`);

  if (typeof chrome === 'undefined' || !chrome.tabs) {
    commitAndBroadcastState(inspectionId, sendResponseCallback, requestId, source);
    return;
  }

  // Safe wrapper for single-use sendResponse
  let sendResponseCalled = false;
  const safeSendResponse = (payload) => {
    if (sendResponseCallback && !sendResponseCalled) {
      sendResponseCalled = true;
      try { sendResponseCallback(payload); } catch(e) {}
    }
  };

  const preQueryDongkrakTabId = currentState.dongkrakTabId;
  console.warn(`[FORENSIC-QUERY-DISPATCH] timestamp:${new Date().toISOString()} inspectionId:${inspectionId} reqId:${requestId} source:${source} stateSeq:${globalSequence} dongkrakTabId_beforeQuery:${preQueryDongkrakTabId}`);

  chrome.tabs.query({}, (tabs) => {
    const queryTimestamp = new Date().toISOString();
    // Transaction Guard before processing query result
    if (inspectionId < latestCommittedInspectionId) {
      console.warn(`[INSPECTION DISCARDED] Stale query result for inspectionId:${inspectionId} < latestCommitted:${latestCommittedInspectionId} source:${source}`);
      safeSendResponse({ status: 'DISCARDED', reason: 'stale_query' });
      return;
    }

    const allTabs = tabs || [];
    const dongkrakTabIdAtQuery = currentState.dongkrakTabId;

    console.warn(`[FORENSIC-QUERY-RESULT] timestamp:${queryTimestamp} inspectionId:${inspectionId} reqId:${requestId} source:${source} stateSeq:${globalSequence} totalTabs:${allTabs.length} dongkrakTabId_atResult:${dongkrakTabIdAtQuery}`);

    // Per-tab diagnostic audit
    allTabs.forEach((tab, index) => {
      const urlHasDongkrak = typeof tab.url === 'string' && tab.url.includes("dongkrakusaha.com");
      const pendingUrlHasDongkrak = typeof tab.pendingUrl === 'string' && tab.pendingUrl.includes("dongkrakusaha.com");
      const isTrackedId = !!dongkrakTabIdAtQuery && tab.id === dongkrakTabIdAtQuery;

      let caseClassification = 'NONE';
      if (isTrackedId && (!tab.url || tab.url === '')) {
        caseClassification = 'CASE_1_URL_EMPTY';
      } else if (pendingUrlHasDongkrak && (!tab.url || !tab.url.includes("dongkrakusaha.com"))) {
        caseClassification = 'CASE_2_PENDING_URL_MATCH';
      } else if (urlHasDongkrak) {
        caseClassification = 'CASE_3_URL_MATCHED';
      } else if (isTrackedId) {
        caseClassification = 'CASE_TRACKED_ID_MATCH';
      }

      console.warn(`[FORENSIC-TAB-AUDIT] index:${index}/${allTabs.length} inspectionId:${inspectionId} source:${source} tabId:${tab.id} isTrackedId:${isTrackedId} url:"${tab.url || ''}" pendingUrl:"${tab.pendingUrl || ''}" active:${tab.active} status:${tab.status} discarded:${tab.discarded} windowId:${tab.windowId} urlMatch:${urlHasDongkrak} pendingMatch:${pendingUrlHasDongkrak} classification:${caseClassification}`);
    });

    const dongkrakTabs = allTabs.filter(t => {
      const u = (t.url || '').toLowerCase();
      const pu = (t.pendingUrl || '').toLowerCase();
      return u.includes("dongkrakusaha.com") || pu.includes("dongkrakusaha.com");
    });

    // Check if previously tracked tab ID still exists in open tabs even if URL is transient/loading
    const trackedTabStillExists = dongkrakTabIdAtQuery ? allTabs.find(t => t.id === dongkrakTabIdAtQuery) : null;

    console.warn(`[FORENSIC-FILTER-EVAL] timestamp:${new Date().toISOString()} inspectionId:${inspectionId} reqId:${requestId} source:${source} stateSeq:${globalSequence} dongkrakTabsCount:${dongkrakTabs.length} trackedTabExists:${!!trackedTabStillExists} trackedTabId:${dongkrakTabIdAtQuery || 'null'} evaluatedDongkrakTabIds:${JSON.stringify(dongkrakTabs.map(t => t.id))}`);

    if (dongkrakTabs.length === 0 && !trackedTabStillExists) {
      // NON-DESTRUCTIVE PRESERVATION:
      // If we previously had discovered fields and authenticated state, do not destroy it immediately
      // on a transient query miss unless the tab was explicitly removed via chrome.tabs.onRemoved
      const hadPreviousValidData = (currentState.discoveredFields && currentState.discoveredFields.length > 0) || currentState.authenticated;

      if (hadPreviousValidData && source !== 'ON_REMOVED') {
        console.warn(`[INSPECTION PRESERVED] Temporary 0-tab query on source:${source}. Preserving ${currentState.discoveredFields?.length || 0} fields from cache.`);
        commitAndBroadcastState(inspectionId, safeSendResponse, requestId, source);
        return;
      }

      const isCase4 = !!dongkrakTabIdAtQuery && !allTabs.some(t => t.id === dongkrakTabIdAtQuery);
      const isCase5 = dongkrakTabIdAtQuery === null || dongkrakTabIdAtQuery === undefined;
      const isCase6 = inspectionId > 1 && latestCommittedInspectionId === 0;

      console.warn(`[FORENSIC-NOTAB-ENTRY] timestamp:${new Date().toISOString()} inspectionId:${inspectionId} reqId:${requestId} source:${source} stateSeq:${globalSequence} dongkrakTabId_beforeMutation:${currentState.dongkrakTabId} isCase4_tabGone:${isCase4} isCase5_idNullPrior:${isCase5} isCase6_uncommittedFirst:${isCase6}`);
      console.log(`[INSPECTION NO_TAB] inspectionId:${inspectionId} source:${source} requestId:${requestId}`);

      // Transaction Guard: Discard stale inspection
      if (inspectionId < latestCommittedInspectionId) {
        console.warn(`[INSPECTION DISCARDED] Stale inspectionId:${inspectionId} < latestCommitted:${latestCommittedInspectionId} source:${source}`);
        safeSendResponse({ status: 'DISCARDED', reason: 'stale_notab' });
        return;
      }

      currentState.dongkrakusahaDetected = false;
      currentState.tabDetected = false;
      currentState.dongkrakTabId = null;
      currentState.authenticated = false;
      currentState.isLoggedIn = false;
      currentState.authStatus = "NO_TAB";
      currentState.liveInspectionStatus = "NO_TAB";
      currentState.pageType = "NO_TAB";
      currentState.productInputDetected = false;
      currentState.formDetected = false;
      currentState.discoveredFields = [];
      currentState.fieldsDiscovered = [];
      currentState.formFieldCount = 0;
      currentState.publisherReady = false;
      currentState.message = "No open tab found for dongkrakusaha.com";
      currentState.lastInspectionAt = new Date().toLocaleTimeString('id-ID');

      console.warn(`[FORENSIC-NOTAB-MUTATED] timestamp:${new Date().toISOString()} inspectionId:${inspectionId} reqId:${requestId} source:${source} dongkrakTabId_afterMutation:${currentState.dongkrakTabId}`);

      commitAndBroadcastState(inspectionId, safeSendResponse, requestId, source);
      return;
    }

    const bestTab = dongkrakTabs.find(t => {
      const u = ((t.url || t.pendingUrl) || '').toLowerCase();
      return u.includes("menu=produk") || u.includes("produk");
    }) || dongkrakTabs.find(t => {
      const u = ((t.url || t.pendingUrl) || '').toLowerCase();
      return u.includes("/panelmember");
    }) || dongkrakTabs.find(t => t.active)
       || dongkrakTabs[0]
       || trackedTabStillExists;

    console.log(`[INSPECTION TARGET] inspectionId:${inspectionId} tabId:${bestTab.id} url:${bestTab.url} source:${source} requestId:${requestId}`);

    if (inspectionId < latestCommittedInspectionId) {
      console.warn(`[INSPECTION DISCARDED] Stale tab selection for inspectionId:${inspectionId} < latestCommitted:${latestCommittedInspectionId} source:${source}`);
      safeSendResponse({ status: 'DISCARDED', reason: 'stale_tab' });
      return;
    }

    currentState.dongkrakusahaDetected = true;
    currentState.tabDetected = true;
    currentState.dongkrakTabId = bestTab.id;
    currentState.lastKnownUrl = bestTab.url || currentState.lastKnownUrl;
    currentState.url = bestTab.url || currentState.url;

    console.warn('[TRACE-PING]', { inspectionId, tabId: bestTab.id, status: 'SENDING_MESSAGE' });
    // Send DOM inspection request to target tab content script (Pinned to frameId: 0 to avoid race with empty iframes)
    chrome.tabs.sendMessage(bestTab.id, { action: 'INSPECT_PAGE_DOM', requestId, inspectionId }, { frameId: 0 }, (tabResponse) => {
      // Transaction Guard
      if (inspectionId < latestCommittedInspectionId) {
        console.warn(`[INSPECTION DISCARDED] Stale response for inspectionId:${inspectionId} < latestCommitted:${latestCommittedInspectionId} source:${source}`);
        safeSendResponse({ status: 'DISCARDED', reason: 'stale_response' });
        return;
      }

      if (chrome.runtime.lastError || !tabResponse) {
        console.warn('[TRACE-FAIL]', { inspectionId, tabId: bestTab.id, error: chrome.runtime?.lastError?.message });
        console.warn(`[INSPECTION TIMEOUT/FAILED] inspectionId:${inspectionId} tabId:${bestTab.id} source:${source} error:${chrome.runtime?.lastError?.message || 'no response'}`);
        
        // We do NOT programmatically inject content.js here anymore to avoid duplicate injections
        // Retry communication once with simple timeout
        setTimeout(() => {
          if (inspectionId < latestCommittedInspectionId) {
             safeSendResponse({ status: 'DISCARDED', reason: 'stale_retry' });
             return;
          }
          chrome.tabs.sendMessage(bestTab.id, { action: 'INSPECT_PAGE_DOM', requestId, inspectionId }, { frameId: 0 }, (retryRes) => {
            if (inspectionId < latestCommittedInspectionId) {
              safeSendResponse({ status: 'DISCARDED', reason: 'stale_retry_res' });
              return;
            }
            if (retryRes) {
              applyInspectionResponse(retryRes, bestTab, inspectionId);
            } else {
              currentState.liveInspectionStatus = "PENDING_RETRY";
              currentState.liveInspectionError = "Tab inspection timed out";
            }
            commitAndBroadcastState(inspectionId, safeSendResponse, requestId, source);
          });
        }, 300);
        return;
      } else {
        applyInspectionResponse(tabResponse, bestTab, inspectionId);
        commitAndBroadcastState(inspectionId, safeSendResponse, requestId, source);
      }
    });
  });
}

function applyInspectionResponse(tabResponse, targetTab, inspectionId) {
  console.warn('[TRACE-APPLY]', { inspectionId, fields: tabResponse?.fieldsDiscovered?.length, auth: tabResponse?.authStatus });
  if (inspectionId && inspectionId < latestCommittedInspectionId) {
    console.warn(`[APPLY DISCARDED] Stale inspectionId:${inspectionId} < latestCommitted:${latestCommittedInspectionId}`);
    return;
  }

  const fields = tabResponse.fieldsDiscovered || tabResponse.discoveredFields || [];
  console.log(`[INSPECTION SUCCESS] tabId:${targetTab.id} fields:${fields.length} auth:${tabResponse.authStatus}`);

  currentState.liveInspectionStatus = "SUCCESS";
  currentState.liveInspectionError = null;

  if (tabResponse.authStatus === 'AUTHENTICATED' || tabResponse.loggedIn) {
    currentState.authenticated = true;
    currentState.isLoggedIn = true;
    currentState.authStatus = 'AUTHENTICATED';
  } else if (tabResponse.authStatus === 'NOT_LOGGED_IN' || tabResponse.pageType === 'LOGIN_PAGE') {
    currentState.authenticated = false;
    currentState.isLoggedIn = false;
    currentState.authStatus = 'NOT_LOGGED_IN';
  }

  currentState.rawControlCount = tabResponse.rawControlCount || 0;
  currentState.formControlCount = tabResponse.formControlCount || 0;
  currentState.excludedControlCount = tabResponse.excludedControlCount || 0;
  currentState.duplicateCount = tabResponse.duplicateCount || 0;
  currentState.validFieldCount = tabResponse.validFieldCount || fields.length;
  currentState.authoritativeForm = tabResponse.authoritativeForm || null;

  if (fields.length > 0) {
    currentState.productInputDetected = true;
    currentState.formDetected = true;
    currentState.discoveredFields = fields;
    currentState.fieldsDiscovered = fields;
    currentState.formFieldCount = fields.length;
    if (currentState.authenticated) {
      currentState.pageType = 'PRODUCT_INPUT_FORM';
    }
  } else {
    currentState.productInputDetected = false;
    currentState.formDetected = false;
    currentState.discoveredFields = [];
    currentState.fieldsDiscovered = [];
    currentState.formFieldCount = 0;
  }

  if (tabResponse.pageType) {
    currentState.pageType = tabResponse.pageType;
  }

  currentState.publisherReady = currentState.authenticated && currentState.productInputDetected && currentState.discoveredFields.length > 0;
  currentState.message = null;
  currentState.lastInspectionAt = new Date().toLocaleTimeString('id-ID');
}

function commitAndBroadcastState(inspectionId, sendResponseCallback, requestId, source) {
  console.warn('[TRACE-COMMIT]', { inspectionId, isStale: inspectionId < latestCommittedInspectionId, liveStatus: currentState.liveInspectionStatus, tabExists: currentState.tabDetected });
  if (inspectionId < latestCommittedInspectionId) {
    console.warn(`[COMMIT DISCARDED] Stale inspectionId:${inspectionId} < latestCommitted:${latestCommittedInspectionId}`);
    if (sendResponseCallback) {
      try { sendResponseCallback({ status: 'DISCARDED', reason: 'stale_commit' }); } catch(e) {}
    }
    return;
  }

  latestCommittedInspectionId = inspectionId;

  console.log(`[STATE WRITE] timestamp:${new Date().toISOString()} inspectionId:${inspectionId} source:${source} requestId:${requestId} tabDetected:${currentState.tabDetected} authStatus:${currentState.authStatus} fieldsCount:${currentState.discoveredFields.length}`);

  saveAndBroadcastState(sendResponseCallback, requestId);
}

function saveAndBroadcastState(sendResponseCallback, requestId) {
  globalSequence++;
  currentState.stateSequence = globalSequence;
  currentState.lastUpdated = Date.now();
  currentState.lastStateSync = new Date().toLocaleTimeString('id-ID');

  const fields = currentState.discoveredFields || currentState.fieldsDiscovered || [];

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ dongkrak_state: currentState });
  }

  const responsePayload = {
    extensionInstalled: true,
    extensionConnected: true,
    extensionVersion: "1.0.0",
    bridgeReady: true,
    backgroundWorkerReady: true,
    dongkrakState: {
      ...currentState,
      discoveredFields: fields,
      fieldsDiscovered: fields
    },
    discoveredFields: fields,
    fieldsDiscovered: fields,
    requestId: requestId || 'bg-' + Date.now(),
    stateSequence: globalSequence,
    timestamp: new Date().toISOString()
  };

  console.warn('[FORENSIC-BROADCAST-PAYLOAD]', JSON.stringify(responsePayload, null, 2));

  if (sendResponseCallback) {
    try { sendResponseCallback(responsePayload); } catch(e) {}
  }
  broadcastStateToAppTabs(responsePayload, requestId);
}

// Broadcast updated state to all open web app content scripts
function broadcastStateToAppTabs(payload, requestId) {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  chrome.tabs.query({}, (allTabs) => {
    if (!allTabs) return;
    allTabs.forEach(t => {
      chrome.tabs.sendMessage(t.id, {
        action: 'STATE_UPDATED',
        state: currentState,
        payload: payload || { dongkrakState: currentState },
        requestId,
        stateSequence: globalSequence
      }).catch(() => {
        if (chrome.scripting && t.id && t.url) {
          const isAppTab = t.url.includes("run.app") || t.url.includes("localhost") || t.url.includes("127.0.0.1") || t.url.includes("ai.studio");
          if (isAppTab) {
            chrome.scripting.executeScript({
              target: { tabId: t.id, allFrames: true },
              files: ['content.js']
            }).then(() => {
              console.log("[BACKGROUND] Re-injected content.js into app tab #", t.id);
            }).catch(() => {});
          }
        }
      });
    });
  });
}

// Automatically re-inspect when DongkrakUsaha tabs complete loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes("dongkrakusaha.com")) {
    if (changeInfo.status === 'complete') {
      console.log("[DONGKRAK EXT BG] Tab updated complete for:", tab.url);
      inspectAndSyncState('tab-update-' + Date.now(), null, 'ON_UPDATED');
    }
  }
});

// Automatically re-inspect when DongkrakUsaha tabs are created
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url && tab.url.includes("dongkrakusaha.com")) {
    console.log("[DONGKRAK EXT BG] Dongkrak tab created:", tab.id);
    inspectAndSyncState('tab-created-' + Date.now(), null, 'ON_CREATED');
  }
});

// Automatically re-inspect when tabs are activated
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.get) {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab && tab.url && tab.url.includes("dongkrakusaha.com")) {
        console.log("[DONGKRAK EXT BG] Dongkrak tab activated:", activeInfo.tabId);
        inspectAndSyncState('tab-activated-' + Date.now(), null, 'ON_ACTIVATED');
      }
    });
  }
});

// Automatically re-inspect when tracked Dongkrak tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentState.dongkrakTabId && tabId === currentState.dongkrakTabId) {
    console.log("[DONGKRAK EXT BG] Tracked Dongkrak tab removed tabId:", tabId);
    inspectAndSyncState('tab-removed-' + Date.now(), null, 'ON_REMOVED');
  }
});

// Communication listener for SEO App & Content Scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const requestId = request.requestId || 'msg-' + Date.now();
  console.log(`[DONGKRAK EXT BG] Message Received: ${request.action} REQUEST_ID = ${requestId} from: ${sender.tab ? `Tab #${sender.tab.id}` : "app/extension"}`);

  if (request.action === 'RECOVER_APP_BRIDGE') {
    const senderTabId = sender.tab ? sender.tab.id : null;
    recoverAppBridgeTabs(senderTabId);
    inspectAndSyncState(requestId, sendResponse, 'RECOVERY');
    return true;
  }

  if (request.action === 'EXTENSION_HANDSHAKE' || request.action === 'DONGKRAK_EXTENSION_HANDSHAKE') {
    inspectAndSyncState(requestId, sendResponse, 'HANDSHAKE');
    return true;
  }

  if (request.action === 'GET_CURRENT_STATE' || request.action === 'INSPECT_DONGKRAK_TAB') {
    inspectAndSyncState(requestId, sendResponse, 'INSPECT_REQUEST');
    return true;
  }

  if (request.action === 'MEASURE_DONGKRAK_FIELDS') {
    // Popup -> the DongkrakUsaha tab (active one first) -> popup, and a copy to every
    // app tab so the Publish tab can compare "sent" with "saved".
    chrome.tabs.query({}, (tabs) => {
      const all = tabs || [];
      const dongkrak = all.filter(t => (((t.url || '') + (t.pendingUrl || '')).toLowerCase()).includes('dongkrakusaha.com'));
      const target = dongkrak.find(t => t.active) || dongkrak[0];
      if (!target) { sendResponse({ ok: false, error: 'NO_DONGKRAK_TAB' }); return; }
      chrome.tabs.sendMessage(target.id, { action: 'MEASURE_FIELDS' }, { frameId: 0 }, (res) => {
        const err = chrome.runtime.lastError;
        const payload = (err || !res) ? { ok: false, error: err ? err.message : 'NO_RESPONSE', url: target.url } : res;
        payload.tabUrl = target.url || '';
        try { sendResponse(payload); } catch (e) {}
        all.forEach(t => {
          const u = t.url || '';
          if (u.includes('run.app') || u.includes('localhost') || u.includes('127.0.0.1') || u.includes('ai.studio')) {
            chrome.tabs.sendMessage(t.id, { action: 'FIELD_MEASURE', payload }).catch(() => {});
          }
        });
      });
    });
    return true;
  }

  if (request.action === 'OPEN_DONGKRAK_LOGIN') {
    chrome.tabs.create({ url: "https://dongkrakusaha.com/panelMember/" }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
      setTimeout(() => inspectAndSyncState('open-login-' + Date.now(), null, 'OPEN_LOGIN'), 1500);
    });
    return true;
  }

  if (request.action === 'OPEN_DONGKRAK_INPUT_PRODUK') {
    openInputProduk(requestId).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err && err.message ? err.message : 'OPEN_INPUT_PRODUK_FAILED' });
    });
    return true;
  }

  if (request.action === 'OPEN_DONGKRAK_PRODUCT_FORM') {
    chrome.tabs.create({ url: "https://dongkrakusaha.com/panelMember/index.php?menu=produk" }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
      setTimeout(() => inspectAndSyncState('open-form-' + Date.now(), null, 'OPEN_FORM'), 1500);
    });
    return true;
  }

  if (request.action === 'AUTOFILL_CAMPAIGN' || request.action === 'SUBMIT_CAMPAIGN') {
    chrome.tabs.query({}, (tabs) => {
      const dongkrakTabs = (tabs || []).filter((tab) => {
        const url = `${tab.url || ''} ${tab.pendingUrl || ''}`.toLowerCase();
        return url.includes('dongkrakusaha.com');
      });
      const tab = dongkrakTabs.find((item) => `${item.url || item.pendingUrl || ''}`.toLowerCase().includes('menu=produk')) ||
        dongkrakTabs.find((item) => item.active) ||
        dongkrakTabs[0];

      if (!tab?.id) {
        sendResponse({ success: false, error: 'NO_DONGKRAK_TAB' });
        return;
      }

      chrome.tabs.sendMessage(tab.id, request, { frameId: 0 }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse(response || { success: false, error: 'EMPTY_CONTENT_RESPONSE' });
      });
    });
    return true;
  }

  if (request.action === 'NOTIFY_DOM_CHANGED') {
    if (request.payload) {
      console.log("[DONGKRAK EXT BG] NOTIFY_DOM_CHANGED Received:", {
        authStatus: request.payload.authStatus,
        pageType: request.payload.pageType,
        formDetected: request.payload.formDetected,
        fieldsDiscoveredCount: request.payload.fieldsDiscovered ? request.payload.fieldsDiscovered.length : 0
      });

      // Use authoritative transaction manager for NOTIFY_DOM_CHANGED
      inspectAndSyncState(requestId, sendResponse, 'NOTIFY_DOM_CHANGED');
    }
    return true;
  }
});

// ---- "Input Produk" one-click ----
// Opens (or re-uses) the member product LIST tab, waits for it to load, and asks the
// content script there to click the "Input Produk" button. The list page is the only
// URL we know for certain; the entry form is reached exactly the way a human does it.
const PRODUK_LIST_URL = 'https://dongkrakusaha.com/panelMember/index.php?menu=produk';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (how) => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(listener); resolve(how); };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish('complete');
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => finish('timeout'), timeoutMs);
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(response || null);
      });
    } catch (e) { resolve(null); }
  });
}

async function openInputProduk(requestId) {
  const tabs = await new Promise((resolve) => chrome.tabs.query({}, resolve));
  const dongkrakTabs = (tabs || []).filter((tab) => `${tab.url || ''} ${tab.pendingUrl || ''}`.toLowerCase().includes('dongkrakusaha.com'));
  const existing = dongkrakTabs.find((t) => `${t.url || ''}`.toLowerCase().includes('menu=produk')) ||
    dongkrakTabs.find((t) => `${t.url || ''}`.toLowerCase().includes('/panelmember')) ||
    dongkrakTabs[0];

  let tabId;
  const loaded = existing
    ? (async () => { const p = waitForTabComplete(existing.id, 20000); await chrome.tabs.update(existing.id, { url: PRODUK_LIST_URL, active: true }); tabId = existing.id; return p; })()
    : (async () => { const tab = await chrome.tabs.create({ url: PRODUK_LIST_URL, active: true }); tabId = tab.id; return waitForTabComplete(tab.id, 20000); })();
  const loadState = await loaded;
  console.log('[DONGKRAK EXT BG] input-produk: list tab', tabId, 'load:', loadState, 'req:', requestId);
  await sleep(500);

  // The content script may need a moment after 'complete'; retry a few times.
  let result = null;
  for (let attempt = 1; attempt <= 5 && !result; attempt++) {
    result = await sendToTab(tabId, { action: 'CLICK_INPUT_PRODUK', requestId });
    if (!result) await sleep(600);
  }
  if (!result) return { success: false, error: 'CONTENT_SCRIPT_NOT_RESPONDING', tabId, reusedTab: !!existing };

  if (result.success) {
    // If the click navigates to the form, let it settle, then refresh the app's view
    // of the DOM so the field list shows the entry form right away.
    const after = await waitForTabComplete(tabId, 8000);
    setTimeout(() => inspectAndSyncState('input-produk-' + Date.now(), null, 'INPUT_PRODUK'), 600);
    const tab = await new Promise((resolve) => chrome.tabs.get(tabId, resolve));
    return { ...result, tabId, reusedTab: !!existing, navigated: after === 'complete', landedUrl: tab && tab.url };
  }
  return { ...result, tabId, reusedTab: !!existing };
}

// Initial inspection trigger on worker boot
inspectAndSyncState('init-' + Date.now(), null, 'WORKER_BOOT');
