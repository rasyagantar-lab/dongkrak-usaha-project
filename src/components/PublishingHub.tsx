import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Download, 
  RefreshCw, 
  ExternalLink, 
  UserCheck, 
  FileCode, 
  Settings, 
  Zap, 
  Copy,
  MonitorPlay,
  CheckSquare,
  ShieldAlert,
  Code,
  Info,
  Terminal,
  HelpCircle,
  Puzzle,
  LogIn,
  ArrowRight,
  ShieldCheck,
  Lock,
  Activity
} from 'lucide-react';
import { Campaign, DongkrakUsahaConnectionConfig } from '../types';
import { buildListingData } from '../lib/listingData';
import { showResult } from '../theme/persona/ResultBanner';

interface PublishingHubProps {
  campaigns: Campaign[];
  activeCampaign: Campaign;
  connectionConfig: DongkrakUsahaConnectionConfig;
  onUpdateCampaign: (campaign: Campaign) => void;
  onNavigateSettings: () => void;
  onNavigateHistory: () => void;
  // Owned by App (never unmounts) so the autopost submit-result handler survives the
  // user switching tabs away from Publishing Hub right after clicking Submit.
  pendingAutopostCampaignRef: React.MutableRefObject<string | null>;
}

export interface AuthoritativeFormMeta {
  selector: string;
  id: string;
  name: string;
  action: string;
  method: string;
}

export interface DiscoveredField {
  index: number;
  fieldId?: string;
  tagName: string;
  type: string;
  name: string;
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxlength?: string | null;
  accept?: string | null;
  selector?: string;
  formSelector?: string;
  visible?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  frame?: string;
  source?: string;
  isAuthoritative?: boolean;
}

export interface DetailedConnectionStatus {
  extensionRuntime: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  appBridge: 'CONNECTED' | 'RECOVERING' | 'DISCONNECTED' | 'UNKNOWN';
  dongkrakTab: 'DETECTED' | 'NOT_DETECTED' | 'UNKNOWN';
  dongkrakInspection: 'SUCCESS' | 'IN_PROGRESS' | 'DELAYED' | 'FAILED' | 'NO_TAB';
  lastSuccessfulResponseAt?: string | null;
  lastFailureReason?: string | null;
}

export interface RealHandshakeDiagnostic {
  extensionInstalled: boolean;
  appContentScriptLoaded: boolean;
  bridgeInstanceId?: string;
  handshakeStatus: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'PENDING' | 'DEGRADED';
  backgroundWorkerResponding: boolean;
  extensionVersion: string;
  stateSource: string;
}

export interface DiagnosticLog {
  id: string;
  timestamp: string;
  event: string;
  requestId?: string;
  requestSequence?: number;
  bridgeInstanceId?: string;
  status: 'SUCCESS' | 'PENDING' | 'TIMEOUT' | 'FAILED' | 'INFO' | 'DEGRADED';
  durationMs?: number;
  details?: string;
}

export interface FieldMeasure {
  ok: boolean;
  editor?: string;
  fieldName?: string;
  karakter?: number;
  kata?: number;
  kalimat?: number;
  maxlengthInputs?: Array<{ label: string; name: string; maxlength: number; tag: string }>;
  url?: string;
  tabUrl?: string;
  measuredAt?: string;
  error?: string;
}

// Rendered under the extension status: the numbers the field-limit decision needs.
// "Dikirim" is the active campaign's description as the extension would fill it;
// "tersimpan" is what the page holds now, so after a publish the two compare directly.
const FieldMeasurePanel: React.FC<{ measure: FieldMeasure | null; sentText?: string }> = ({ measure, sentText }) => {
  if (!measure) return null;
  const fmt = (n?: number) => Number(n || 0).toLocaleString('id-ID');
  const sent = String(sentText || '').trim().length;
  const saved = measure.karakter || 0;
  // An empty editor is not a truncated one: before a publish (or on a fresh form)
  // there is simply nothing to compare yet.
  const verdict = !measure.ok || !sent ? null
    : saved === 0 ? 'kolom deskripsi di halaman itu masih kosong — publish dulu, buka halaman edit produk, lalu ukur lagi'
    : saved >= sent * 0.97 ? 'utuh — tidak terpotong pada ukuran ini'
    : 'terpotong: tersimpan ' + fmt(saved) + ' dari ' + fmt(sent) + ' karakter';
  const inputs = measure.maxlengthInputs || [];
  return (
    <div className="p-3 bg-slate-900 rounded border border-slate-800 space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-slate-200" data-guide="publish.ukur">Batas field terdeteksi</span>
        <span className="text-3xs text-slate-500">{measure.measuredAt ? new Date(measure.measuredAt).toLocaleTimeString('id-ID') : ''}</span>
      </div>
      {measure.ok ? (
        <div className="text-slate-300">
          Deskripsi di halaman: <span className="font-bold text-emerald-300">{fmt(measure.karakter)} karakter</span> · {fmt(measure.kata)} kata · {fmt(measure.kalimat)} kalimat
          <span className="text-slate-500"> (editor: {measure.editor}{measure.fieldName ? ', ' + measure.fieldName : ''})</span>
        </div>
      ) : (
        <div className="text-amber-300">Editor deskripsi tidak ditemukan di halaman itu{measure.error ? ' (' + measure.error + ')' : ''}. Buka form Input Produk atau halaman edit produk, lalu ukur lagi.</div>
      )}
      {verdict && (
        <div className={saved > 0 && saved >= sent * 0.97 ? 'text-emerald-300' : 'text-amber-300'}>
          Dikirim dari campaign aktif: {fmt(sent)} karakter → {verdict}
        </div>
      )}
      <div className="text-slate-400">
        {inputs.length > 0
          ? <>maxlength: {inputs.map((i, idx) => <span key={idx}>{idx > 0 ? ' · ' : ''}<span className="text-slate-200">{i.label || i.name}</span> = {i.maxlength}</span>)}</>
          : 'Tidak ada input dengan maxlength di halaman itu — batas deskripsi hanya bisa dibuktikan dengan simpan lalu ukur ulang.'}
        {measure.ok && measure.editor === 'textarea' && (
          <div className="text-slate-500 mt-1">Kolom deskripsi adalah textarea tanpa maxlength: batasnya (kalau ada) di server DongkrakUsaha, jadi tetap harus dibuktikan dengan simpan lalu ukur ulang.</div>
        )}
      </div>
    </div>
  );
};

interface ExtensionInspectionState {
  extensionDetected: boolean;
  tabDetected: boolean;
  isLoggedIn: boolean;
  formDetected: boolean;
  pageType: 'PUBLIC_PAGE' | 'LOGIN_PAGE' | 'MEMBER_DASHBOARD' | 'PRODUCT_INPUT_FORM' | 'NO_TAB' | 'TAB_FOUND_UNRESPONSIVE' | 'UNCHECKED';
  tabUrl?: string | null;
  tabId?: number | string | null;
  authStatus?: string;
  liveInspectionStatus?: string;
  liveInspectionError?: string | null;
  fieldsDiscovered: DiscoveredField[];
  rawControlCount?: number;
  formControlCount?: number;
  excludedControlCount?: number;
  duplicateCount?: number;
  validFieldCount?: number;
  authoritativeForm?: AuthoritativeFormMeta | null;
  lastCheckedAt?: string;
  lastStateSync?: string;
  errorMessage?: string | null;
}

export const PublishingHub: React.FC<PublishingHubProps> = ({
  campaigns,
  activeCampaign,
  connectionConfig,
  onUpdateCampaign,
  onNavigateSettings,
  onNavigateHistory,
  pendingAutopostCampaignRef
}) => {
  const [connectionStatus, setConnectionStatus] = useState<DetailedConnectionStatus>({
    extensionRuntime: 'UNKNOWN',
    appBridge: 'UNKNOWN',
    dongkrakTab: 'UNKNOWN',
    dongkrakInspection: 'NO_TAB',
    lastSuccessfulResponseAt: null,
    lastFailureReason: null
  });
  const isRecoveringRef = useRef<boolean>(false);

  const [publisherMode, setPublisherMode] = useState<'EXTENSION' | 'MANUAL' | 'EXPORT'>('EXTENSION');
  // "Ukur field" result from the extension popup: what the DongkrakUsaha page holds
  // in its description editor, and every input that declares a maxlength. This is
  // the evidence for the description-length decision (PROJECT_KNOWLEDGE 2026-09-18).
  const [fieldMeasure, setFieldMeasure] = useState<FieldMeasure | null>(null);
  const [extState, setExtState] = useState<ExtensionInspectionState>({
    extensionDetected: false,
    tabDetected: false,
    isLoggedIn: false,
    formDetected: false,
    pageType: 'UNCHECKED',
    fieldsDiscovered: []
  });
  const [lastVerifiedState, setLastVerifiedState] = useState<ExtensionInspectionState | null>(null);
  const [diagnostic, setDiagnostic] = useState<RealHandshakeDiagnostic>({
    extensionInstalled: false,
    appContentScriptLoaded: false,
    handshakeStatus: 'PENDING',
    backgroundWorkerResponding: false,
    extensionVersion: 'N/A',
    stateSource: 'NOT CONNECTED'
  });
  const [isTesting, setIsTesting] = useState(false);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);

  const [autopostStatus, setAutopostStatus] = useState<string | null>(null);
  const [autopostResult, setAutopostResult] = useState<any>(null);
  const autopostRequestRef = useRef<string | null>(null);
  const autopostTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isConnected = connectionConfig.status === 'Connected';
  const hasListingData = !!activeCampaign.dongkrakListingData;

  // Diagnostic timeline log state and refs
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLog[]>([]);
  const consecutiveTimeoutsRef = useRef<number>(0);
  const activeBridgeInstanceIdRef = useRef<string>('unknown');
  const requestStartTimesRef = useRef<Map<string, number>>(new Map());

  const addDiagnosticLog = useCallback((
    event: string, 
    status: DiagnosticLog['status'], 
    details?: string, 
    meta?: Partial<DiagnosticLog>
  ) => {
    const timeStr = new Date().toLocaleTimeString('id-ID', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    const newLog: DiagnosticLog = {
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: timeStr,
      event,
      status,
      details,
      bridgeInstanceId: activeBridgeInstanceIdRef.current,
      ...meta
    };
    setDiagnosticLogs(prev => [newLog, ...prev].slice(0, 20));
  }, []);

  // Handler for REAL Extension Connection Inspection Handshake
  const requestSequenceRef = useRef<number>(0);
  const pendingRequestsRef = useRef<Set<string>>(new Set());
  const lastAppliedSeqRef = useRef<number>(0);

  const requestExtensionState = useCallback((customRequestId?: string) => {
    const recoveryId = 'recovery-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const requestId = customRequestId || recoveryId;
    const reqSeq = ++requestSequenceRef.current;
    const t0 = Date.now();
    requestStartTimesRef.current.set(requestId, t0);

    setIsTesting(true);

    setConnectionStatus(prev => ({
      ...prev,
      appBridge: 'RECOVERING',
      dongkrakInspection: 'IN_PROGRESS'
    }));

    console.log("[EXT RECOVERY] RECOVERY TRANSACTION STARTED requestId:", requestId, "RECOVERY_ID:", recoveryId, "REQ_SEQ =", reqSeq);

    pendingRequestsRef.current.add(requestId);

    addDiagnosticLog('RECOVERY_TRANSACTION_DISPATCHED', 'PENDING', `Single-flight recovery #${reqSeq}`, {
      requestId,
      requestSequence: reqSeq,
      bridgeInstanceId: activeBridgeInstanceIdRef.current
    });

    window.postMessage({
      type: 'DONGKRAK_EXTENSION_HANDSHAKE',
      requestId,
      recoveryId,
      requestSequence: reqSeq
    }, '*');

    window.postMessage({
      type: 'DONGKRAK_RECOVER_BRIDGE_REQ',
      requestId,
      recoveryId,
      requestSequence: reqSeq
    }, '*');

    // Timeout tracker for this request ID (3000ms threshold)
    setTimeout(() => {
      if (pendingRequestsRef.current.has(requestId)) {
        pendingRequestsRef.current.delete(requestId);

        if (reqSeq < requestSequenceRef.current) {
          console.log(`[PUBLISHING HUB] IGNORING STALE TIMEOUT (reqSeq ${reqSeq} < ${requestSequenceRef.current})`);
          addDiagnosticLog('STALE_TIMEOUT_IGNORED', 'INFO', `Req #${reqSeq} < Current #${requestSequenceRef.current}`, {
            requestId,
            requestSequence: reqSeq
          });
          return;
        }

        const durationMs = Date.now() - t0;
        consecutiveTimeoutsRef.current++;

        console.warn(`[EXT RECOVERY] RECOVERY TRANSACTION TIMEOUT requestId: ${requestId}, reqSeq: ${reqSeq}`);

        addDiagnosticLog('RECOVERY_FAILED_TIMEOUT', 'FAILED', 
          `Bridge or Worker response delayed ${durationMs}ms. Transitioning to DISCONNECTED/UNAVAILABLE.`, {
          requestId,
          requestSequence: reqSeq,
          durationMs
        });

        setIsTesting(false);
        isRecoveringRef.current = false;

        setConnectionStatus(prev => ({
          ...prev,
          extensionRuntime: prev.extensionRuntime === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE',
          appBridge: prev.appBridge === 'DISCONNECTED' ? 'DISCONNECTED' : 'CONNECTED',
          dongkrakInspection: 'DELAYED',
          lastFailureReason: 'Inspection response delayed (>3s)'
        }));

        setDiagnostic(prev => ({
          ...prev,
          appContentScriptLoaded: true,
          bridgeInstanceId: activeBridgeInstanceIdRef.current,
          backgroundWorkerResponding: prev.backgroundWorkerResponding,
          stateSource: prev.stateSource
        }));

        setExtState(prev => ({
          ...prev,
          liveInspectionStatus: 'DELAYED',
          liveInspectionError: 'DOM inspection response delayed',
          lastCheckedAt: new Date().toLocaleTimeString('id-ID')
        }));
      }
    }, 3000);
  }, [addDiagnosticLog]);

  const handleTestBrowserConnection = () => {
    if (isRecoveringRef.current) {
      console.log("[EXT RECOVERY] Recovery transaction already in progress. Ignoring duplicate click.");
      addDiagnosticLog('DUPLICATE_RECOVERY_CLICK_IGNORED', 'INFO', 'Single-flight recovery transaction active');
      return;
    }
    isRecoveringRef.current = true;
    const recoveryId = 'user-recovery-' + Date.now();
    const bridgeId = activeBridgeInstanceIdRef.current;
    const nowIso = new Date().toISOString();

    console.log(`[RECONNECT] START timestamp:${nowIso} recoveryId:${recoveryId} bridgeInstanceId:${bridgeId} requestId:${recoveryId}`);
    console.log(`[RECONNECT] EXTENSION_RUNTIME_CHECK timestamp:${nowIso} recoveryId:${recoveryId} bridgeInstanceId:${bridgeId} requestId:${recoveryId}`);
    console.log(`[RECONNECT] APP_BRIDGE_CHECK timestamp:${nowIso} recoveryId:${recoveryId} bridgeInstanceId:${bridgeId} requestId:${recoveryId}`);

    addDiagnosticLog('MANUAL_TEST_CLICKED', 'INFO', 'User initiated Test Browser Connection', { requestId: recoveryId, recoveryId, bridgeInstanceId: bridgeId, timestamp: nowIso });
    requestExtensionState(recoveryId);
  };

  const recoveryTestTrackerRef = useRef<{
    active: boolean;
    testId: string;
    oldBridgeId: string;
    newBridgeId: string | null;
    bridgeReadyEventReceived: boolean;
    bridgeReadyOriginMatch: boolean;
    workerResponseReceived: boolean;
    stateUpdatedToLive: boolean;
  }>({
    active: false,
    testId: '',
    oldBridgeId: '',
    newBridgeId: null,
    bridgeReadyEventReceived: false,
    bridgeReadyOriginMatch: false,
    workerResponseReceived: false,
    stateUpdatedToLive: false
  });

  const [bridgeRecoveryTestResult, setBridgeRecoveryTestResult] = useState<{
    running: boolean;
    overallStatus: 'NOT_RUN' | 'IN_PROGRESS' | 'RECOVERY_SUCCESS' | 'RECOVERY_FAILED';
    steps: { step: number; name: string; status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'; detail: string }[];
    newBridgeInstanceId?: string;
  }>({
    running: false,
    overallStatus: 'NOT_RUN',
    steps: []
  });

  const runAppBridgeRecoveryTest = () => {
    const testId = 'recovery-test-' + Date.now();
    const oldBridgeId = activeBridgeInstanceIdRef.current;
    const nowIso = new Date().toISOString();
    const currentUrl = window.location.href;
    const currentOrigin = window.location.origin;
    const isIframe = window.self !== window.top;

    console.log(`[TEST APP BRIDGE RECOVERY] START testId:${testId} oldBridgeId:${oldBridgeId} timestamp:${nowIso}`);

    recoveryTestTrackerRef.current = {
      active: true,
      testId,
      oldBridgeId,
      newBridgeId: null,
      bridgeReadyEventReceived: false,
      bridgeReadyOriginMatch: false,
      workerResponseReceived: false,
      stateUpdatedToLive: false
    };

    const initialSteps = [
      { step: 1, name: "1. App Tab Found", status: 'SUCCESS' as const, detail: `App tab detected at ${currentOrigin}` },
      { step: 2, name: "2. Exact Tab URL", status: 'SUCCESS' as const, detail: `URL: ${currentUrl}` },
      { step: 3, name: "3. Frame Tree Discovered", status: 'SUCCESS' as const, detail: `Context: ${isIframe ? 'Subframe (Iframe)' : 'Top Frame (Main Window)'}` },
      { step: 4, name: "4. Correct App Frame Identified", status: 'SUCCESS' as const, detail: `React frame: ${currentUrl}` },
      { step: 5, name: "5. Capture Old Bridge ID", status: 'SUCCESS' as const, detail: `OLD_BRIDGE_ID: ${oldBridgeId || 'None (Context Invalidated)'}` },
      { step: 6, name: "6. Recovery Trigger Dispatched", status: 'PENDING' as const, detail: 'Dispatching recovery trigger to window...' },
      { step: 7, name: "7. New bridgeInstanceId Created", status: 'PENDING' as const, detail: 'Awaiting new bridge instance ID...' },
      { step: 8, name: "8. BRIDGE_READY Received from Exact Frame", status: 'PENDING' as const, detail: 'Awaiting DONGKRAK_EXT_BRIDGE_READY message from frame...' },
      { step: 9, name: "9. Handshake Sent", status: 'PENDING' as const, detail: 'Sending DONGKRAK_EXTENSION_HANDSHAKE...' },
      { step: 10, name: "10. Background Worker Response", status: 'PENDING' as const, detail: 'Awaiting background worker response...' },
      { step: 11, name: "11. React State Updated to LIVE", status: 'PENDING' as const, detail: 'Evaluating React state update...' }
    ];

    setBridgeRecoveryTestResult({
      running: true,
      overallStatus: 'IN_PROGRESS',
      steps: initialSteps
    });

    window.postMessage({ type: 'DONGKRAK_RECOVER_BRIDGE_REQ', requestId: testId }, '*');
    window.postMessage({ type: 'DONGKRAK_EXTENSION_HANDSHAKE', requestId: testId }, '*');

    setTimeout(() => {
      const tracker = recoveryTestTrackerRef.current;
      tracker.active = false;

      const newlyCreatedBridge = tracker.newBridgeId;
      const isNewBridgeValid = !!(newlyCreatedBridge && newlyCreatedBridge !== oldBridgeId);
      const isExactFrameMatch = tracker.bridgeReadyEventReceived && tracker.bridgeReadyOriginMatch;
      const isWorkerOk = tracker.workerResponseReceived;
      const isLiveStateOk = tracker.stateUpdatedToLive;

      const steps = [
        { step: 1, name: "1. App Tab Found", status: 'SUCCESS' as const, detail: `App tab detected at ${currentOrigin}` },
        { step: 2, name: "2. Exact Tab URL", status: 'SUCCESS' as const, detail: `URL: ${currentUrl}` },
        { step: 3, name: "3. Frame Tree Discovered", status: 'SUCCESS' as const, detail: `Context: ${isIframe ? 'Subframe (Iframe)' : 'Top Frame (Main Window)'}` },
        { step: 4, name: "4. Correct App Frame Identified", status: 'SUCCESS' as const, detail: `React frame: ${currentUrl}` },
        { step: 5, name: "5. Capture Old Bridge ID", status: 'SUCCESS' as const, detail: `OLD_BRIDGE_ID: ${oldBridgeId || 'None (Context Invalidated)'}` },
        { step: 6, name: "6. Recovery Trigger Dispatched", status: 'SUCCESS' as const, detail: `Dispatched DONGKRAK_RECOVER_BRIDGE_REQ #${testId}` },
        { 
          step: 7, 
          name: "7. New bridgeInstanceId Created", 
          status: isNewBridgeValid ? ('SUCCESS' as const) : ('FAILED' as const), 
          detail: isNewBridgeValid ? `NEW_BRIDGE_ID: ${newlyCreatedBridge} (differs from old ${oldBridgeId})` : `Failed: Bridge ID unchanged or missing (Old: ${oldBridgeId}, New: ${newlyCreatedBridge || 'none'})` 
        },
        { 
          step: 8, 
          name: "8. BRIDGE_READY Received from Exact Frame", 
          status: isExactFrameMatch ? ('SUCCESS' as const) : ('FAILED' as const), 
          detail: isExactFrameMatch ? `Received BRIDGE_READY from exact frame: ${currentUrl}` : `Failed: BRIDGE_READY missing or from wrong frame` 
        },
        { step: 9, name: "9. Handshake Sent", status: 'SUCCESS' as const, detail: 'Dispatched DONGKRAK_EXTENSION_HANDSHAKE' },
        { 
          step: 10, 
          name: "10. Background Worker Response", 
          status: isWorkerOk ? ('SUCCESS' as const) : ('FAILED' as const), 
          detail: isWorkerOk ? 'Background Worker responding with live state' : 'Failed: No response from background worker' 
        },
        { 
          step: 11, 
          name: "11. React State Updated to LIVE", 
          status: isLiveStateOk ? ('SUCCESS' as const) : ('FAILED' as const), 
          detail: isLiveStateOk ? 'React UI state updated to LIVE/CONNECTED' : 'Failed: React UI state not updated to LIVE' 
        }
      ];

      const allPassed = steps.every(s => s.status === 'SUCCESS');
      console.log(`[TEST APP BRIDGE RECOVERY] COMPLETED testId:${testId} status:${allPassed ? 'RECOVERY_SUCCESS' : 'RECOVERY_FAILED'} newBridgeId:${newlyCreatedBridge}`);

      setBridgeRecoveryTestResult({
        running: false,
        overallStatus: allPassed ? 'RECOVERY_SUCCESS' : 'RECOVERY_FAILED',
        steps,
        newBridgeInstanceId: newlyCreatedBridge || activeBridgeInstanceIdRef.current
      });
    }, 2000);
  };

  const handleOpenDongkrakLogin = () => {
    window.postMessage({ type: 'DONGKRAK_REAL_EXT_OPEN_LOGIN' }, '*');
    window.open('https://dongkrakusaha.com/panelMember/', '_blank');
  };

  const handleOpenProductForm = () => {
    window.postMessage({ type: 'DONGKRAK_REAL_EXT_OPEN_FORM' }, '*');
    window.open('https://dongkrakusaha.com/panelMember/index.php?menu=produk', '_blank');
  };

  // One click all the way to the entry form: the extension opens the product list
  // and presses DongkrakUsaha's own "Input Produk" button (the plain "open form"
  // button above only lands on the list, which is what the operator complained about).
  const [inputProdukStatus, setInputProdukStatus] = useState<{ tone: 'info' | 'ok' | 'error'; text: string } | null>(null);
  const inputProdukRequestRef = useRef<string | null>(null);
  const handleOpenInputProduk = () => {
    const requestId = `input-produk-${Date.now()}`;
    inputProdukRequestRef.current = requestId;
    setInputProdukStatus({ tone: 'info', text: 'Membuka daftar produk dan menekan tombol "Input Produk"...' });
    window.postMessage({ type: 'DONGKRAK_REAL_EXT_OPEN_INPUT_PRODUK', requestId }, '*');
    setTimeout(() => {
      if (inputProdukRequestRef.current !== requestId) return;
      inputProdukRequestRef.current = null;
      setInputProdukStatus({ tone: 'error', text: 'Tidak ada jawaban dari ekstensi dalam 30 detik. Pastikan ekstensi aktif dan Anda sudah login DongkrakUsaha.' });
    }, 30000);
  };
  useEffect(() => {
    const onResult = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'DONGKRAK_INPUT_PRODUK_RESULT') return;
      if (event.data.requestId !== inputProdukRequestRef.current) return;
      inputProdukRequestRef.current = null;
      const p = event.data.payload || {};
      if (p.success) {
        setInputProdukStatus({
          tone: 'ok',
          text: `Tombol "${p.matchedText || 'Input Produk'}" ditekan${p.landedUrl ? ` — halaman: ${p.landedUrl}` : ''}. Lanjutkan dengan "Isi Form Otomatis".`
        });
      } else if (p.error === 'INPUT_PRODUK_BUTTON_NOT_FOUND') {
        setInputProdukStatus({
          tone: 'error',
          text: `Tombol "Input Produk" tidak ditemukan di ${p.pageUrl || 'halaman'}. Tombol yang terlihat: ${(p.visibleButtons || []).join(' | ') || '(tidak ada)'}. Kemungkinan belum login.`
        });
      } else {
        setInputProdukStatus({ tone: 'error', text: `Gagal: ${p.error || 'unknown'}${p.detail ? ` (${p.detail})` : ''}` });
      }
    };
    window.addEventListener('message', onResult);
    return () => window.removeEventListener('message', onResult);
  }, []);

  const handleAutofillCampaign = () => {
    const requestId = `autofill-${Date.now()}`;
    if (autopostTimeoutRef.current) clearTimeout(autopostTimeoutRef.current);
    autopostRequestRef.current = requestId;
    setAutopostStatus('Mengirim data campaign ke form DongkrakUsaha...');
    setAutopostResult(null);
    // The extension reads campaign.dongkrakListingData; rebuild it from the current
    // content so a run applied a minute ago is what lands in the form.
    const fresh = { ...activeCampaign, dongkrakListingData: buildListingData(activeCampaign, activeCampaign.dongkrakListingData) };
    window.postMessage({ type: 'DONGKRAK_AUTOFILL_CAMPAIGN', requestId, campaign: fresh }, '*');
    autopostTimeoutRef.current = setTimeout(() => {
      if (autopostRequestRef.current !== requestId) return;
      setAutopostResult({ success: false, error: 'AUTOFILL_TIMEOUT' });
      setAutopostStatus('Autopost timeout setelah 10 detik. Reload extension dan pastikan tab DongkrakUsaha terbuka.');
    }, 10000);
  };

  const handleSubmitCampaign = () => {
    if (!autopostResult?.success || autopostResult?.captchaDetected || autopostResult?.imageReady === false) return;
    if (!window.confirm('Field sudah terisi. Submit listing ini ke DongkrakUsaha sekarang?')) return;
    const requestId = `submit-${Date.now()}`;
    if (autopostTimeoutRef.current) clearTimeout(autopostTimeoutRef.current);
    autopostRequestRef.current = requestId;
    pendingAutopostCampaignRef.current = activeCampaign.id;
    setAutopostStatus('Mengirim submit ke DongkrakUsaha...');
    window.postMessage({ type: 'DONGKRAK_SUBMIT_CAMPAIGN', requestId, campaign: activeCampaign }, '*');
    autopostTimeoutRef.current = setTimeout(() => {
      if (autopostRequestRef.current !== requestId) return;
      setAutopostResult({ success: false, error: 'SUBMIT_TIMEOUT' });
      setAutopostStatus('Submit timeout setelah 10 detik. Periksa tab DongkrakUsaha dan reload extension.');
    }, 10000);
  };

  const updateExtStateFromPayload = (payload: any, requestId?: string) => {
    console.warn('[FORENSIC-RAW-PAYLOAD]', JSON.stringify(payload, null, 2));
    console.warn('[TRACE-REACT-RECEIVE]', { reqId: requestId, seq: payload.stateSequence, tabDetected: payload.tabDetected, liveStatus: payload.liveInspectionStatus });
    const dongkrakState = payload.dongkrakState || payload;
    const seq = dongkrakState.stateSequence || payload.stateSequence || 0;

    if (seq > 0 && seq < lastAppliedSeqRef.current) {
      console.log(`[PUBLISHING HUB] IGNORING STALE RESPONSE (seq ${seq} < ${lastAppliedSeqRef.current})`);
      return;
    }
    if (seq > 0) {
      lastAppliedSeqRef.current = seq;
    }

    const fields = payload.discoveredFields || payload.fieldsDiscovered || dongkrakState.discoveredFields || dongkrakState.fieldsDiscovered || [];
    const fieldsCount = fields ? fields.length : 0;

    const reqId = requestId || payload.requestId || dongkrakState.requestId || 'res-' + Date.now();
    const nowIso = new Date().toISOString();
    const bridgeId = activeBridgeInstanceIdRef.current;

    setExtState(prev => {
      let isTabFound = !!(dongkrakState.tabDetected ?? dongkrakState.dongkrakusahaDetected ?? payload.tabDetected);
      const rawAuthStatus = dongkrakState.authStatus || payload.authStatus;
      const isExplicitNoTab = !isTabFound || rawAuthStatus === 'NO_TAB' || payload.pageType === 'NO_TAB' || dongkrakState.pageType === 'NO_TAB' || (typeof dongkrakState.tabDetected === 'boolean' && !dongkrakState.tabDetected && !fieldsCount);

      let isAuth = isTabFound ? (rawAuthStatus === 'AUTHENTICATED' || prev.isLoggedIn) : false;

      if (rawAuthStatus === 'AUTHENTICATED') {
        isAuth = true;
      } else if (rawAuthStatus === 'NOT_LOGGED_IN' || rawAuthStatus === 'NO_TAB') {
        isAuth = isTabFound ? false : (prev.fieldsDiscovered.length > 0 ? prev.isLoggedIn : false);
      } else if (typeof dongkrakState.authenticated === 'boolean') {
        isAuth = dongkrakState.authenticated;
      } else if (typeof dongkrakState.loggedIn === 'boolean') {
        isAuth = dongkrakState.loggedIn;
      }

      // IMPORTANT: when the extension says NO_TAB, do not keep stale fields from the last valid state.
      // This was the source of the false "64 fields still visible" state even after DongkrakUsaha tab closed.
      let finalFields = fields && fields.length > 0 ? fields : [];
      if (!isExplicitNoTab && !isTabFound && prev.fieldsDiscovered.length > 0 && fieldsCount === 0) {
        finalFields = prev.fieldsDiscovered;
      }
      if (isExplicitNoTab) {
        finalFields = [];
        isTabFound = false;
      }

      const finalFieldsCount = finalFields.length;
      const rawFormDetected = !!(dongkrakState.productInputDetected ?? dongkrakState.formDetected ?? payload.formDetected);
      const finalFormDetected = !isExplicitNoTab && isTabFound && finalFieldsCount > 0 && (rawFormDetected || finalFieldsCount >= 3 || prev.formDetected);

      let finalPageType = isExplicitNoTab ? 'NO_TAB' : (isTabFound ? (dongkrakState.pageType || payload.pageType || prev.pageType || 'PUBLIC_PAGE') : 'NO_TAB');
      if (isTabFound && (isAuth || prev.isLoggedIn) && finalFieldsCount > 0) {
        finalPageType = 'PRODUCT_INPUT_FORM';
      }

      console.log("[EXT RECOVERY] HANDSHAKE succeeded requestId:", reqId);
      console.log("[EXT RECOVERY] STATE SYNC succeeded requestId:", reqId);
      console.log("[PUBLISHING HUB] REACT STATE UPDATED REQUEST_ID =", reqId, "SEQ =", seq, "FIELDS_DISCOVERED =", finalFieldsCount, "PAGE_TYPE =", finalPageType);

      const targetTabId = isTabFound ? (dongkrakState.dongkrakTabId || dongkrakState.tabId || payload.tabId) : null;

      console.log(`[RECONNECT] STATE_APPLIED timestamp:${nowIso} recoveryId:${reqId} tabId:${targetTabId || 'none'} bridgeInstanceId:${bridgeId} requestId:${reqId}`);
      console.log(`[RECONNECT] COMPLETE timestamp:${nowIso} recoveryId:${reqId} tabId:${targetTabId || 'none'} bridgeInstanceId:${bridgeId} requestId:${reqId}`);

      const newState: ExtensionInspectionState = {
        extensionDetected: true,
        tabDetected: isTabFound,
        isLoggedIn: isAuth,
        authStatus: isTabFound ? (rawAuthStatus || (isAuth ? 'AUTHENTICATED' : 'NOT_LOGGED_IN')) : 'NO_TAB',
        formDetected: finalFormDetected,
        pageType: finalPageType as any,
        tabUrl: isTabFound ? (dongkrakState.tabUrl || dongkrakState.url || dongkrakState.lastKnownUrl || payload.url) : null,
        tabId: targetTabId,
        liveInspectionStatus: isTabFound ? (dongkrakState.liveInspectionStatus || 'SUCCESS') : 'NO_TAB',
        liveInspectionError: isTabFound ? (dongkrakState.liveInspectionError || payload.errorMessage || null) : null,
        fieldsDiscovered: finalFields,
        rawControlCount: isTabFound ? (dongkrakState.rawControlCount ?? payload.rawControlCount ?? 0) : 0,
        formControlCount: isTabFound ? (dongkrakState.formControlCount ?? payload.formControlCount ?? 0) : 0,
        excludedControlCount: isTabFound ? (dongkrakState.excludedControlCount ?? payload.excludedControlCount ?? 0) : 0,
        duplicateCount: isTabFound ? (dongkrakState.duplicateCount ?? payload.duplicateCount ?? 0) : 0,
        validFieldCount: isTabFound ? (dongkrakState.validFieldCount ?? payload.validFieldCount ?? finalFieldsCount) : 0,
        authoritativeForm: isTabFound ? (dongkrakState.authoritativeForm ?? payload.authoritativeForm ?? null) : null,
        lastCheckedAt: dongkrakState.lastInspectionAt || payload.timestamp || new Date().toLocaleTimeString('id-ID'),
        lastStateSync: dongkrakState.lastStateSync || new Date().toLocaleTimeString('id-ID'),
        errorMessage: isTabFound ? (dongkrakState.message || payload.errorMessage || null) : 'No open DongkrakUsaha tab detected.'
      };

      if (!isExplicitNoTab && (finalFieldsCount > 0 || (isTabFound && isAuth))) {
        setTimeout(() => setLastVerifiedState(newState), 0);
      }

      return newState;
    });
  };

  // Setup global message listener for extension responses and page visibility/focus recovery
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === 'DONGKRAK_AUTOFILL_RESULT' || event.data.type === 'DONGKRAK_SUBMIT_RESULT') {
        if (event.data.requestId && event.data.requestId !== autopostRequestRef.current) return;
        if (autopostTimeoutRef.current) clearTimeout(autopostTimeoutRef.current);
        const result = event.data.payload || {};
        setAutopostResult(result);
        if (result.success && event.data.type === 'DONGKRAK_SUBMIT_RESULT') showResult({ title: 'Terkirim', lines: [activeCampaign.businessData.name, 'Status: Submitted'] });
        setAutopostStatus(result.success
          ? (event.data.type === 'DONGKRAK_SUBMIT_RESULT'
            ? 'Submit terkirim dan tercatat sebagai Submitted. DongkrakUsaha baru menyediakan URL publik ~24 jam kemudian — isi manual di kolom di bawah setelah itu tersedia.'
            : `Autofill selesai: ${result.filledCount ?? result.filled?.length ?? 0} field diisi${result.missingCount || result.missing?.length ? `, ${result.missingCount ?? result.missing.length} belum ditemukan` : ''}${result.imageReady === false ? ' Foto belum berhasil dipasang.' : ''}.`)
          : `Autopost berhenti: ${result.error || 'unknown error'}`);
      }

      if (event.data.type === 'DONGKRAK_BRIDGE_CONTEXT_INVALIDATED') {
        const deadInstanceId = event.data.bridgeInstanceId;
        const nowIso = new Date().toISOString();
        console.warn(`[APP RECOVERY] BRIDGE_CONTEXT_INVALIDATED for bridgeInstanceId:${deadInstanceId} at ${nowIso}`);
        
        activeBridgeInstanceIdRef.current = 'none';
        
        addDiagnosticLog('CONTEXT_INVALIDATED', 'FAILED', 'Extension context was invalidated or re-enabled', {
          bridgeInstanceId: deadInstanceId,
          timestamp: nowIso
        });

        setConnectionStatus({
          extensionRuntime: 'UNAVAILABLE',
          appBridge: 'DISCONNECTED',
          dongkrakTab: 'UNKNOWN',
          dongkrakInspection: 'FAILED',
          lastFailureReason: 'Extension context invalidated'
        });

        setDiagnostic({
          extensionInstalled: false,
          appContentScriptLoaded: false,
          bridgeInstanceId: 'none',
          handshakeStatus: 'FAILED',
          backgroundWorkerResponding: false,
          extensionVersion: '1.0.0',
          stateSource: 'DISCONNECTED'
        });
      }

      if (event.data.type === 'DONGKRAK_EXT_BRIDGE_READY') {
        const instanceId = event.data.bridgeInstanceId || 'unknown';
        const eventUrl = event.data.url || window.location.href;
        const nowIso = new Date().toISOString();

        if (activeBridgeInstanceIdRef.current === instanceId && instanceId !== 'none' && instanceId !== 'unknown') {
          console.log(`[APP RECOVERY] Ignoring duplicate BRIDGE_READY for active bridgeInstanceId:${instanceId}`);
          return;
        }

        if (recoveryTestTrackerRef.current.active) {
          recoveryTestTrackerRef.current.bridgeReadyEventReceived = true;
          recoveryTestTrackerRef.current.bridgeReadyOriginMatch = (eventUrl === window.location.href);
          if (instanceId !== recoveryTestTrackerRef.current.oldBridgeId) {
            recoveryTestTrackerRef.current.newBridgeId = instanceId;
          }
        }

        activeBridgeInstanceIdRef.current = instanceId;
        console.log(`[APP RECOVERY] BRIDGE_READY_RECEIVED bridgeInstanceId:${instanceId} url:${eventUrl} timestamp:${nowIso}`);
        
        addDiagnosticLog('BRIDGE_READY_RECEIVED', 'SUCCESS', `Bridge instance: ${instanceId}`, {
          bridgeInstanceId: instanceId,
          timestamp: nowIso
        });

        setConnectionStatus(prev => ({
          ...prev,
          extensionRuntime: 'AVAILABLE',
          appBridge: 'CONNECTED',
          lastFailureReason: null
        }));

        setDiagnostic(prev => ({
          ...prev,
          extensionInstalled: true,
          appContentScriptLoaded: true,
          bridgeInstanceId: instanceId,
          handshakeStatus: 'SUCCESS',
          backgroundWorkerResponding: true,
          extensionVersion: event.data.version || '1.0.0',
          stateSource: 'LIVE'
        }));

        requestExtensionState('bridge-init-' + Date.now());
      }

      if (event.data.type === 'DONGKRAK_FIELD_MEASURE') {
        setFieldMeasure(event.data.payload || null);
        return;
      }

      if (event.data.type === 'DONGKRAK_EXTENSION_HANDSHAKE_RESPONSE' || event.data.type === 'DONGKRAK_REAL_EXT_INSPECT_RES') {
        console.warn('[TRACE-REACT-HANDSHAKE-RES]', { reqSeq: event.data.requestSequence, stateSeq: event.data.stateSequence });
        setIsTesting(false);
        isRecoveringRef.current = false;
        const payload = event.data.payload || {};
        const reqId = event.data.requestId || payload.requestId || 'res-' + Date.now();
        const reqSeq = event.data.requestSequence || payload.requestSequence || 0;
        const bridgeId = event.data.bridgeInstanceId || payload.bridgeInstanceId || activeBridgeInstanceIdRef.current;
        if (bridgeId) activeBridgeInstanceIdRef.current = bridgeId;

        const dongkrakState = payload.dongkrakState || payload;
        const isConnected = !!(payload.extensionConnected || payload.backgroundWorkerReady || payload.extensionInstalled || dongkrakState.extensionConnected);

        if (recoveryTestTrackerRef.current.active) {
          if (isConnected) {
            recoveryTestTrackerRef.current.workerResponseReceived = true;
            recoveryTestTrackerRef.current.stateUpdatedToLive = true;
          }
        }

        const startTime = requestStartTimesRef.current.get(reqId);
        const durationMs = startTime ? Date.now() - startTime : undefined;

        if (reqSeq > 0 && reqSeq < requestSequenceRef.current) {
          console.log(`[PUBLISHING HUB] IGNORING STALE RESPONSE FOR REQ_SEQ ${reqSeq} < ${requestSequenceRef.current}`);
          addDiagnosticLog('STALE_RESPONSE_IGNORED', 'INFO', `Req #${reqSeq} < Current #${requestSequenceRef.current}`, {
            requestId: reqId,
            requestSequence: reqSeq,
            durationMs
          });
          return;
        }

        pendingRequestsRef.current.delete(reqId);

        if (!isConnected && !payload.dongkrakState && payload.errorMessage) {
          consecutiveTimeoutsRef.current++;
          console.warn("[EXT RECOVERY] STATE SYNC failed - Explicit disconnection:", payload.errorMessage);
          
          addDiagnosticLog('EXPLICIT_DISCONNECT', 'FAILED', payload.errorMessage, {
            requestId: reqId,
            requestSequence: reqSeq,
            durationMs
          });

          setConnectionStatus({
            extensionRuntime: 'UNAVAILABLE',
            appBridge: 'DISCONNECTED',
            dongkrakTab: 'UNKNOWN',
            dongkrakInspection: 'FAILED',
            lastFailureReason: payload.errorMessage
          });

          setDiagnostic({
            extensionInstalled: false,
            appContentScriptLoaded: true,
            bridgeInstanceId: bridgeId,
            handshakeStatus: 'FAILED',
            backgroundWorkerResponding: false,
            extensionVersion: '1.0.0',
            stateSource: 'DISCONNECTED'
          });

          setExtState(prev => ({
            extensionDetected: false,
            tabDetected: false,
            isLoggedIn: false,
            authStatus: 'DISCONNECTED',
            formDetected: false,
            pageType: 'PUBLIC_PAGE',
            liveInspectionStatus: 'DISCONNECTED',
            liveInspectionError: payload.errorMessage,
            fieldsDiscovered: [],
            lastCheckedAt: new Date().toLocaleTimeString('id-ID'),
            lastStateSync: new Date().toLocaleTimeString('id-ID'),
            errorMessage: 'Extension disabled or disconnected: ' + payload.errorMessage
          }));
          return;
        }

        // SUCCESSFUL HANDSHAKE RESPONSE
        consecutiveTimeoutsRef.current = 0;
        const fields = payload.discoveredFields || payload.fieldsDiscovered || dongkrakState.discoveredFields || dongkrakState.fieldsDiscovered || [];
        let isTabFound = !!(dongkrakState.tabDetected ?? dongkrakState.dongkrakusahaDetected ?? payload.tabDetected);
        
        // Soft fallback: If we already have verified fields in memory and extension is connected, treat tab as detected
        if (!isTabFound && (extState.fieldsDiscovered.length > 0 || fields.length > 0)) {
          isTabFound = true;
        }

        setConnectionStatus(prev => ({
          ...prev,
          extensionRuntime: 'AVAILABLE',
          appBridge: 'CONNECTED',
          dongkrakTab: isTabFound ? 'DETECTED' : 'NOT_DETECTED',
          dongkrakInspection: !isTabFound ? 'NO_TAB' : ((fields.length > 0 || prev.dongkrakInspection === 'SUCCESS') ? 'SUCCESS' : 'SUCCESS'),
          lastSuccessfulResponseAt: new Date().toLocaleTimeString('id-ID'),
          lastFailureReason: null
        }));

        addDiagnosticLog('HANDSHAKE_SUCCESS', 'SUCCESS', `State sequence #${dongkrakState.stateSequence || 0}, Tab: ${isTabFound ? 'DETECTED' : 'NOT DETECTED'}, Fields: ${fields.length}`, {
          requestId: reqId,
          requestSequence: reqSeq,
          bridgeInstanceId: bridgeId,
          durationMs
        });

        setDiagnostic({
          extensionInstalled: true,
          appContentScriptLoaded: true,
          bridgeInstanceId: bridgeId,
          handshakeStatus: 'SUCCESS',
          backgroundWorkerResponding: true,
          extensionVersion: payload.extensionVersion || '1.0.0',
          stateSource: 'REAL EXTENSION'
        });

        updateExtStateFromPayload(payload, reqId);
      }
    };

    window.addEventListener('message', handleMessage);

    // Initial state request on component mount
    requestExtensionState('mount-init-' + Date.now());

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        requestExtensionState('visibility-' + Date.now());
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [requestExtensionState, addDiagnosticLog]);

  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const handleDownloadExtensionZip = async () => {
    setIsDownloadingZip(true);
    try {
      // Cache-busting query param + no-store: guards against any CDN/edge/browser
      // cache serving a stale zip even after the server has been fixed/redeployed.
      const res = await fetch(`/api/download-extension-zip?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('API download error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dongkrakusaha-publisher-extension.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement('a');
      a.href = `/dongkrakusaha-publisher-extension.zip?t=${Date.now()}`;
      a.download = 'dongkrakusaha-publisher-extension.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleExportJson = () => {
    const exportData = campaigns.map(c => c.dongkrakListingData || c.businessData);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DongkrakUsaha_Export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const headers = ['Business Name', 'Category', 'Phone/WhatsApp', 'Address', 'SEO Title', 'Price', 'Main Keyword'];
    const rows = campaigns.map(c => [
      `"${c.businessData.name.replace(/"/g, '""')}"`,
      `"${c.businessData.category.replace(/"/g, '""')}"`,
      `"${c.businessData.phoneWhatsApp}"`,
      `"${c.businessData.address.replace(/"/g, '""')}"`,
      `"${(c.generatedContent?.seoTitle || c.businessData.name).replace(/"/g, '""')}"`,
      `"${c.businessData.priceRange}"`,
      `"${c.seoStrategy.mainKeyword}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DongkrakUsaha_Listings_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="du-card bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" />
              Publishing & Distribution Hub
            </h2>
            <span className="text-3xs font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded border border-blue-200">
              Ekstensi Chrome v1.1
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Koneksi riil ke tab browser DongkrakUsaha melalui Chrome Extension Manifest V3.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadExtensionZip}
            disabled={isDownloadingZip}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Download className={`w-3.5 h-3.5 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
            DOWNLOAD CHROME EXTENSION (.ZIP)
          </button>
          <button
            onClick={onNavigateHistory}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Lihat Riwayat Publish
          </button>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="du-tabs flex gap-2 p-1 bg-slate-100 rounded-lg w-max border border-slate-200">
        <button
          onClick={() => setPublisherMode('EXTENSION')}
          data-active={publisherMode === 'EXTENSION' ? 'true' : 'false'}
          className={`du-tab px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
            publisherMode === 'EXTENSION' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Puzzle className="w-3.5 h-3.5 text-blue-600" />
          Ekstensi Chrome
        </button>
        <button
          onClick={() => setPublisherMode('MANUAL')}
          data-active={publisherMode === 'MANUAL' ? 'true' : 'false'}
          data-guide="publish.mode"
          className={`du-tab px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
            publisherMode === 'MANUAL' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          Manual Assist
        </button>
        <button
          onClick={() => setPublisherMode('EXPORT')}
          data-active={publisherMode === 'EXPORT' ? 'true' : 'false'}
          className={`du-tab px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
            publisherMode === 'EXPORT' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Download className="w-3.5 h-3.5 text-emerald-600" />
          Export Data
        </button>
      </div>

      {/* Connection Notice */}
      {!isConnected ? (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Akun DongkrakUsaha Belum Terkonfigurasi di App</span>
              <span className="text-amber-800">
                Untuk hasil optimal, simpan username/profile DongkrakUsaha Anda di menu Connection Settings.
              </span>
            </div>
          </div>
          <button
            onClick={onNavigateSettings}
            className="px-3.5 py-2 bg-amber-800 text-white text-xs font-bold rounded-lg hover:bg-amber-900 shrink-0 cursor-pointer"
          >
            Pengaturan Akun
          </button>
        </div>
      ) : (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Kredensial Profil: <strong>{connectionConfig.username || 'Terdaftar'}</strong></span>
          </div>
          <button
            onClick={onNavigateSettings}
            className="text-2xs text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" /> Kelola Profil
          </button>
        </div>
      )}

      {/* Active Campaign Info Header */}
      <div className="du-card bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-3xs font-bold uppercase text-slate-400 tracking-wider">Active Campaign</span>
          <h3 className="text-base font-extrabold text-slate-900">{activeCampaign.businessData.name}</h3>
          <p className="text-xs text-slate-500">{activeCampaign.generatedContent?.seoTitle || activeCampaign.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Status Campaign:</span>
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-md border border-blue-200">
            {activeCampaign.status}
          </span>
        </div>
      </div>

      {/* Feedback Messages */}
      {activeCampaign.status === 'Published' && activeCampaign.publishedUrl && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Campaign ini sudah Published.</span>
          </div>
          <a
            href={activeCampaign.publishedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline shrink-0"
          >
            Buka Listing <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* EXTENSION PUBLISHER */}
      {/* A dead bridge is invisible from the page: every request it sends goes nowhere
          and nothing comes back. Say so, and say the two things that fix it. */}
      {connectionStatus.appBridge === 'DISCONNECTED' && /invalidated/i.test(connectionStatus.lastFailureReason || '') && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 leading-relaxed">
            <span className="font-bold">Extension baru saja di-reload atau di-update</span>, jadi jembatan ke halaman ini mati dan hasil pemindaian tidak bisa masuk.
            Klik ikon extension → <span className="font-bold">Refresh Status</span> (status akan dikirim ulang ke sini), atau muat ulang halaman ini.
          </div>
          <button type="button" onClick={() => window.location.reload()} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Muat ulang halaman
          </button>
        </div>
      )}

      {publisherMode === 'EXTENSION' && (
        <div className="space-y-6">
          {/* 4 Distinct Connection Status Cards */}
          <div className="du-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <MonitorPlay className="w-4 h-4 text-blue-600" />
                  Real Browser Connection Status
                </h3>
                {extState.lastCheckedAt && (
                  <span className="text-3xs text-slate-400">Terakhir diperiksa: {extState.lastCheckedAt}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadExtensionZip}
                  disabled={isDownloadingZip}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className={`w-3.5 h-3.5 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
                  DOWNLOAD CHROME EXTENSION (.ZIP)
                </button>
                <button
                  onClick={handleTestBrowserConnection}
                  disabled={isTesting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  {isTesting ? 'Checking...' : 'TEST BROWSER CONNECTION'}
                </button>
                <button
                  onClick={() => setShowExtensionGuide(!showExtensionGuide)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" /> Cara Install
                </button>
              </div>
            </div>

            {/* 5 Connection Status Indicators Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Extension Runtime */}
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider block">1. Extension Runtime</span>
                <div className="flex items-center gap-2 font-bold text-xs">
                  {connectionStatus.extensionRuntime === 'AVAILABLE' ? (
                    <span className="text-emerald-600 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Runtime Available
                    </span>
                  ) : connectionStatus.extensionRuntime === 'UNAVAILABLE' ? (
                    <span className="text-rose-600 flex items-center gap-1.5">
                      <XCircle className="w-4 h-4" /> Unavailable / Disabled
                    </span>
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4" /> Checking Runtime...
                    </span>
                  )}
                </div>
              </div>

              {/* 2. App Bridge */}
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider block">2. App Content Bridge</span>
                <div className="flex items-center gap-2 font-bold text-xs">
                  {connectionStatus.appBridge === 'CONNECTED' ? (
                    <span className="text-emerald-600 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Bridge Connected
                    </span>
                  ) : connectionStatus.appBridge === 'RECOVERING' ? (
                    <span className="text-cyan-600 flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Recovering Bridge...
                    </span>
                  ) : (
                    <span className="text-rose-600 flex items-center gap-1.5">
                      <XCircle className="w-4 h-4" /> Disconnected
                    </span>
                  )}
                </div>
              </div>

              {/* 3. DongkrakUsaha Tab */}
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider block">3. DongkrakUsaha Tab</span>
                <div className="flex items-center gap-2 font-bold text-xs">
                  {connectionStatus.dongkrakTab === 'DETECTED' ? (
                    <span className="text-emerald-600 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Tab Detected
                    </span>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Tab Not Found
                    </span>
                  )}
                </div>
                {extState.tabUrl && connectionStatus.dongkrakTab === 'DETECTED' && (
                  <span className="text-3xs text-slate-400 block truncate" title={extState.tabUrl}>
                    {extState.tabUrl}
                  </span>
                )}
              </div>

              {/* 4. Live Dongkrak Inspection */}
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="text-3xs font-bold text-slate-400 uppercase tracking-wider block">4. Live Inspection</span>
                <div className="flex items-center gap-2 font-bold text-xs">
                  {connectionStatus.dongkrakInspection === 'SUCCESS' ? (
                    <span className="text-emerald-600 flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4" /> Inspection Live
                    </span>
                  ) : connectionStatus.dongkrakInspection === 'IN_PROGRESS' ? (
                    <span className="text-cyan-600 flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Inspecting...
                    </span>
                  ) : connectionStatus.dongkrakInspection === 'NO_TAB' ? (
                    <span className="text-amber-600 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-amber-500" /> No Open Tab
                    </span>
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-rose-500" /> Inspection Failed
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Error / Status Messages */}
            {extState.errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
                {extState.errorMessage}
              </div>
            )}

            {/* DEVELOPER DIAGNOSTICS PANEL (ARCHITECTURAL VERIFICATION) */}
            <div className="mt-4 bg-slate-900 text-slate-200 rounded-xl p-4 border border-slate-800 font-mono text-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-slate-300 flex items-center gap-2 text-xs">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  DEVELOPER EXTENSION ARCHITECTURE DIAGNOSTICS
                </span>
                <span className={`text-3xs font-extrabold px-2.5 py-0.5 rounded uppercase tracking-wider border ${
                  diagnostic.extensionInstalled && diagnostic.backgroundWorkerResponding
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border-rose-800'
                }`}>
                  {diagnostic.extensionInstalled ? 'REAL EXTENSION WORKER ACTIVE' : 'NO EXTENSION WORKER'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* 1. Extension Installed */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">1. Extension Installed</span>
                  <span className={`font-bold block ${diagnostic.extensionInstalled ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {diagnostic.extensionInstalled ? 'YES' : 'NO'}
                  </span>
                </div>

                {/* 2. App Content Script */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">2. App Content Script</span>
                  <span className={`font-bold block ${diagnostic.appContentScriptLoaded ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {diagnostic.appContentScriptLoaded ? 'LOADED' : 'NOT LOADED'}
                  </span>
                </div>

                {/* 3. Extension Handshake */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">3. Handshake Status</span>
                  <span className={`font-bold block ${
                    diagnostic.handshakeStatus === 'SUCCESS' ? 'text-emerald-400' :
                    diagnostic.handshakeStatus === 'PENDING' ? 'text-cyan-400' :
                    diagnostic.handshakeStatus === 'TIMEOUT' ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {diagnostic.handshakeStatus}
                  </span>
                </div>

                {/* 4. Background Worker */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">4. Background Worker</span>
                  <span className={`font-bold block ${diagnostic.backgroundWorkerResponding ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {diagnostic.backgroundWorkerResponding ? 'RESPONDING' : 'NOT RESPONDING'}
                  </span>
                </div>

                {/* 5. Extension Version */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">5. Extension Version</span>
                  <span className="font-bold text-slate-200 block truncate">
                    {diagnostic.extensionVersion}
                  </span>
                </div>

                {/* 6. DongkrakUsaha Tab */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">6. DongkrakUsaha Tab</span>
                  <span className={`font-bold block ${extState.tabDetected ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {extState.tabDetected ? 'DETECTED' : 'NOT DETECTED'}
                  </span>
                </div>

                {/* 7. Authentication */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">7. Authentication</span>
                  <span className={`font-bold block ${extState.isLoggedIn ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {extState.authStatus || (extState.isLoggedIn ? 'AUTHENTICATED' : 'NOT LOGGED IN')}
                  </span>
                </div>

                {/* 8. Product Input */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">8. Product Input Form</span>
                  <span className={`font-bold block ${extState.formDetected ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {extState.formDetected ? 'DETECTED' : 'NOT DETECTED'}
                  </span>
                </div>

                {/* 9. Discovered Fields */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">9. Discovered Fields</span>
                  <span className="font-bold text-amber-300 block">
                    {extState.fieldsDiscovered.length} FIELDS
                  </span>
                </div>

                {/* 10. State Source */}
                <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80 space-y-1">
                  <span className="text-slate-500 text-3xs block font-sans uppercase tracking-wider">10. State Source</span>
                  <span className={`font-bold block truncate ${diagnostic.extensionInstalled ? 'text-blue-400' : 'text-slate-500'}`}>
                    {diagnostic.stateSource}
                  </span>
                </div>
              </div>

              {/* Developer Diagnostics Timeline */}
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-3xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-sans">
                    <Activity className="w-3.5 h-3.5 text-blue-400" />
                    Bridge Connection Lifecycle & Hop Timeline (Last 20 Events)
                  </span>
                  <span className="text-3xs font-mono text-slate-500">
                    Active Bridge: {diagnostic.bridgeInstanceId || activeBridgeInstanceIdRef.current || 'unknown'}
                  </span>
                </div>

                <div className="bg-slate-950 rounded-lg border border-slate-800/80 p-2 max-h-48 overflow-y-auto font-mono text-3xs space-y-1">
                  {diagnosticLogs.length === 0 ? (
                    <div className="text-slate-600 text-center py-2 italic font-sans">Monitoring connection lifecycle events...</div>
                  ) : (
                    diagnosticLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between gap-2 py-1 border-b border-slate-900/80 last:border-none">
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <span className="text-slate-500 shrink-0 font-mono">{log.timestamp}</span>
                          <span className={`px-1.5 py-0.2 rounded text-3xs font-bold shrink-0 ${
                            log.status === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' :
                            log.status === 'PENDING' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60' :
                            log.status === 'DEGRADED' ? 'bg-amber-950 text-amber-400 border border-amber-800/60' :
                            log.status === 'FAILED' ? 'bg-rose-950 text-rose-400 border border-rose-800/60' :
                            'bg-slate-900 text-slate-400'
                          }`}>
                            {log.status}
                          </span>
                          <span className="text-slate-200 font-semibold truncate">{log.event}</span>
                          {log.details && <span className="text-slate-400 truncate font-sans text-3xs">({log.details})</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-slate-500 font-mono text-3xs">
                          {log.durationMs !== undefined && <span className="text-emerald-400">{log.durationMs}ms</span>}
                          {log.requestId && <span className="text-slate-600 truncate max-w-[120px]">{log.requestId}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Developer Bridge Recovery Diagnostic Test Section */}
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-3xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 font-sans">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Developer Diagnostic Test: [TEST APP BRIDGE RECOVERY]
                  </span>
                  <button
                    type="button"
                    onClick={runAppBridgeRecoveryTest}
                    disabled={bridgeRecoveryTestResult.running}
                    className="px-2.5 py-1 text-3xs font-bold font-mono rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
                  >
                    {bridgeRecoveryTestResult.running ? 'RUNNING TEST...' : '[TEST APP BRIDGE RECOVERY]'}
                  </button>
                </div>

                {bridgeRecoveryTestResult.steps.length > 0 && (
                  <div className="bg-slate-950 rounded-lg border border-slate-800/80 p-3 space-y-2">
                    <div className="flex items-center justify-between text-2xs font-mono font-bold pb-1 border-b border-slate-900">
                      <span>VERIFICATION STATUS:</span>
                      <span className={`px-2 py-0.5 rounded text-3xs ${
                        bridgeRecoveryTestResult.overallStatus === 'RECOVERY_SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        bridgeRecoveryTestResult.overallStatus === 'IN_PROGRESS' ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
                        'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        {bridgeRecoveryTestResult.overallStatus}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-3xs">
                      {bridgeRecoveryTestResult.steps.map(s => (
                        <div key={s.step} className="flex items-start justify-between gap-1 p-1 rounded bg-slate-900/60 border border-slate-800/50">
                          <span className="text-slate-300 font-semibold">{s.name}</span>
                          <span className={`shrink-0 font-bold ${
                            s.status === 'SUCCESS' ? 'text-emerald-400' :
                            s.status === 'PENDING' ? 'text-cyan-400' : 'text-rose-400'
                          }`}>
                            {s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DONGKRAKUSAHA LOGIN BOOTSTRAP WORKFLOW CARD */}
          {!extState.isLoggedIn && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-3xs font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded">
                      Authentication Required
                    </span>
                    <span className="text-2xs text-amber-800 font-medium">(Ini BUKAN Error)</span>
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-sm">
                    DongkrakUsaha Account Session: <span className="text-amber-800 font-bold">NOT LOGGED IN</span>
                  </h4>
                  <p className="text-xs text-slate-700 max-w-2xl leading-relaxed">
                    Browser Publisher telah terhubung, namun akun DongkrakUsaha Anda belum terautentikasi di browser. Silakan klik tombol di bawah untuk membuka halaman login resmi DongkrakUsaha.
                  </p>
                </div>

                <button
                  onClick={handleOpenDongkrakLogin}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all shrink-0 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  LOGIN TO DONGKRAKUSAHA
                  <ExternalLink className="w-3.5 h-3.5 text-blue-200" />
                </button>
              </div>

              {/* Zero-Trust Security Note */}
              <div className="p-3 bg-white/80 rounded-lg border border-amber-200 text-2xs text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-800 block">Jaminan Keamanan & Privasi Otentikasi:</span>
                  <p>
                    Anda melakukan login secara manual langsung pada domain resmi DongkrakUsaha (<code className="font-mono text-slate-800 font-semibold">https://dongkrakusaha.com/panelMember/</code>). Aplikasi SEO ini <strong>TIDAK PERNAH</strong> meminta, menyimpan, membaca, atau mengekstrak kata sandi maupun cookie sesi Anda. Ekstensi hanya memantau status keberhasilan login Anda secara lokal di DOM browser.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* AUTHENTICATED STATE - ACTION TO OPEN PRODUCT INPUT */}
          {extState.isLoggedIn && !extState.formDetected && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-5 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-3xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                      Session Authenticated
                    </span>
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-sm">
                    Status Sesi: <span className="text-emerald-600">AUTHENTICATED</span> — Siap Buka Form Input Produk
                  </h4>
                  <p className="text-xs text-slate-700 max-w-2xl">
                    Sesi login member DongkrakUsaha terdeteksi aktif. Silakan buka halaman form <strong>Input Produk</strong> untuk melanjutkan inspeksi field DOM secara riil.
                  </p>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={handleOpenInputProduk}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Buka Form Input Produk (klik otomatis)
                  </button>
                  <button
                    onClick={handleOpenProductForm}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-emerald-800 hover:bg-emerald-100 font-semibold text-2xs rounded-lg transition-colors cursor-pointer"
                  >
                    Hanya buka daftar produk <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {inputProdukStatus && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs flex items-start gap-2 ${
              inputProdukStatus.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : inputProdukStatus.tone === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              {inputProdukStatus.tone === 'info' ? <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" /> : <Terminal className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <span className="break-all">{inputProdukStatus.text}</span>
            </div>
          )}

          {/* Extension Installation Guide Collapsible */}
          {showExtensionGuide && (
            <div className="bg-slate-900 text-slate-100 p-5 rounded-xl space-y-4 text-xs">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h4 className="font-bold text-sm flex items-center gap-2 text-blue-400">
                  <Puzzle className="w-4 h-4" />
                  Langkah-Langkah Install Chrome Extension Unpacked
                </h4>
                <button
                  onClick={() => setShowExtensionGuide(false)}
                  className="text-slate-400 hover:text-white"
                >
                  Tutup
                </button>
              </div>

              <ol className="list-decimal pl-5 space-y-2.5 text-slate-300">
                <li>
                  Klik tombol <strong className="text-emerald-400">DOWNLOAD CHROME EXTENSION (.ZIP)</strong> untuk mengunduh paket ekstensi lengkap <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono">dongkrakusaha-publisher-extension.zip</code>.
                </li>
                <li>
                  <strong>Ekstrak file ZIP</strong> tersebut di komputer Anda. Anda akan mendapatkan folder bernama <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono">dongkrakusaha-publisher-extension</code> yang berisi <code className="text-slate-200">manifest.json</code>, <code className="text-slate-200">background.js</code>, <code className="text-slate-200">content.js</code>, <code className="text-slate-200">popup.html</code>, <code className="text-slate-200">popup.js</code>, dan <code className="text-slate-200">styles.css</code>.
                </li>
                <li>Buka Google Chrome dan ketik pada address bar: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300 font-mono">chrome://extensions</code></li>
                <li>Aktifkan toggle <strong>Developer mode</strong> di pojok kanan atas browser Chrome.</li>
                <li>Klik tombol <strong>Load unpacked</strong> di pojok kiri atas halaman Extensions.</li>
                <li>Pilih folder hasil ekstrak: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono">dongkrakusaha-publisher-extension</code>.</li>
                <li>Buka tab baru <a href="https://dongkrakusaha.com/panelMember/" target="_blank" rel="noreferrer" className="text-blue-400 font-bold underline">https://dongkrakusaha.com/panelMember/</a> dan lakukan login ke akun Anda.</li>
                <li>Kembali ke aplikasi ini dan klik tombol <strong className="text-blue-400">TEST BROWSER CONNECTION</strong> untuk memverifikasi koneksi riil.</li>
              </ol>

              <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-white text-sm block">Paket Ekstensi Manifest V3 Siap Pakai</span>
                  <span className="text-2xs text-slate-400">Deteksi tab & sesi login, pembacaan field form, isi otomatis, submit dengan konfirmasi, dan klik "Input Produk".</span>
                </div>
                <button
                  onClick={handleDownloadExtensionZip}
                  disabled={isDownloadingZip}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg flex items-center gap-2 shrink-0 cursor-pointer shadow-sm"
                >
                  <Download className={`w-4 h-4 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
                  DOWNLOAD CHROME EXTENSION (.ZIP)
                </button>
              </div>
            </div>
          )}

          {/* DEVELOPER FIELD AUDIT & PROVENANCE PANEL */}
          <div className="du-dark du-card bg-slate-950 text-slate-100 p-5 rounded-xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h4 className="font-bold text-sm text-slate-200">Developer Field Discovery Audit & Provenance</h4>
                </div>
                <p className="text-2xs text-slate-400 mt-0.5">
                  Live breakdown of authoritative form filtering, deduplication, and field provenance from live DongkrakUsaha DOM.
                </p>
              </div>

              <button
                onClick={() => requestExtensionState('refresh-live-dom-' + Date.now())}
                disabled={isTesting}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                REFRESH LIVE DOM
              </button>
            </div>

            {/* Authoritative Form Metadata Banner */}
            {extState.authoritativeForm ? (
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400 uppercase tracking-wider text-3xs">Authoritative Form Locked</span>
                  <span className="font-mono text-slate-400">Method: {extState.authoritativeForm.method || 'POST'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-slate-300">
                  <div><strong className="text-slate-500">Selector:</strong> {extState.authoritativeForm.selector || '-'}</div>
                  <div><strong className="text-slate-500">Action:</strong> {extState.authoritativeForm.action || '-'}</div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-950/40 rounded-lg border border-amber-800/60 text-2xs text-amber-300">
                ⚠️ Authoritative form container not yet locked onto live page. Please ensure you are on <code className="font-mono text-amber-200">https://dongkrakusaha.com/panelMember/index.php?menu=produk</code>.
              </div>
            )}

            {/* Audit Statistics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono text-2xs">
              <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                <span className="text-3xs text-slate-500 uppercase block font-sans">1. Raw Controls</span>
                <span className="text-base font-extrabold text-slate-200">{extState.rawControlCount ?? 0}</span>
                <span className="text-3xs text-slate-500 block">Total on document</span>
              </div>

              <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                <span className="text-3xs text-slate-500 uppercase block font-sans">2. In Product Form</span>
                <span className="text-base font-extrabold text-blue-400">{extState.formControlCount ?? 0}</span>
                <span className="text-3xs text-slate-500 block">Inside auth form</span>
              </div>

              <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                <span className="text-3xs text-slate-500 uppercase block font-sans">3. Excluded</span>
                <span className="text-base font-extrabold text-rose-400">{extState.excludedControlCount ?? 0}</span>
                <span className="text-3xs text-slate-500 block">Buttons, CSRF, login</span>
              </div>

              <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                <span className="text-3xs text-slate-500 uppercase block font-sans">4. Duplicates Removed</span>
                <span className="text-base font-extrabold text-amber-400">{extState.duplicateCount ?? 0}</span>
                <span className="text-3xs text-slate-500 block">Identical keys/paths</span>
              </div>

              <div className="p-2.5 bg-slate-900 rounded border border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-3xs text-slate-500 uppercase block font-sans">5. Valid Fields</span>
                <span className="text-base font-extrabold text-emerald-400">{extState.fieldsDiscovered.length}</span>
                <span className="text-3xs text-slate-500 block">Authoritative fields</span>
              </div>
            </div>

            <FieldMeasurePanel measure={fieldMeasure} sentText={activeCampaign.generatedContent?.seoDescription} />

            {/* Provenance Table */}
            {extState.fieldsDiscovered.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-300">Field Provenance Matrix ({extState.fieldsDiscovered.length})</span>
                  <span className="text-3xs text-slate-500 font-mono">Source: REAL_DONGKRAKUSAHA_DOM</span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left border-collapse text-2xs font-mono">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                        <th className="p-2">#</th>
                        <th className="p-2">Label</th>
                        <th className="p-2">Tag/Type</th>
                        <th className="p-2">Name / ID</th>
                        <th className="p-2">DOM Selector</th>
                        <th className="p-2">Visible</th>
                        <th className="p-2">Frame</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950">
                      {extState.fieldsDiscovered.map((field) => (
                        <tr key={field.index} className="hover:bg-slate-900/60">
                          <td className="p-2 text-slate-500 font-bold">{field.index}</td>
                          <td className="p-2 font-sans font-bold text-slate-200">{field.label || '-'}</td>
                          <td className="p-2 text-purple-400">&lt;{field.tagName}&gt; ({field.type})</td>
                          <td className="p-2 text-blue-300">
                            {field.name ? `name="${field.name}"` : field.id ? `id="${field.id}"` : '-'}
                          </td>
                          <td className="p-2 text-slate-400 text-3xs max-w-[180px] truncate" title={field.selector || '-'}>
                            {field.selector || '-'}
                          </td>
                          <td className="p-2">
                            {field.visible !== false ? (
                              <span className="text-emerald-400 font-bold">YES</span>
                            ) : (
                              <span className="text-slate-500">NO</span>
                            )}
                          </td>
                          <td className="p-2 text-slate-400">{field.frame || 'main'}</td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-3xs font-sans font-bold">
                              AUTHORITATIVE
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Form Discovery Inspection Results */}
          <div className="du-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Code className="w-4 h-4 text-emerald-600" />
                  DongkrakUsaha Authoritative Product Form
                </h4>
                <p className="text-2xs text-slate-500">
                  Hasil pemindaian elemen form HTML riil pada tab DongkrakUsaha yang terverifikasi.
                </p>
              </div>

              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold text-xs rounded-full border border-slate-200">
                {extState.fieldsDiscovered.length} Field Terverifikasi
              </span>
            </div>

            {extState.fieldsDiscovered.length > 0 ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-2xs rounded-lg font-medium flex items-center justify-between">
                  <span>✓ Berhasil memvalidasi {extState.fieldsDiscovered.length} field dari form terotorisasi DongkrakUsaha.</span>
                  <button data-guide="publish.refresh-dom"
                    onClick={() => requestExtensionState('refresh-live-dom-' + Date.now())}
                    className="text-emerald-700 hover:underline font-bold text-2xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> REFRESH LIVE DOM
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">Label</th>
                        <th className="p-2.5">Tag</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">ID</th>
                        <th className="p-2.5">Selector</th>
                        <th className="p-2.5">Required</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-2xs">
                      {extState.fieldsDiscovered.map((field) => (
                        <tr key={field.index} className="hover:bg-slate-50/80">
                          <td className="p-2.5 font-bold text-slate-400">{field.index}</td>
                          <td className="p-2.5 font-sans font-bold text-slate-800">{field.label || '-'}</td>
                          <td className="p-2.5 text-blue-600">&lt;{field.tagName}&gt;</td>
                          <td className="p-2.5 text-purple-600">{field.type}</td>
                          <td className="p-2.5 text-slate-600">{field.name || '-'}</td>
                          <td className="p-2.5 text-slate-500">{field.id || '-'}</td>
                          <td className="p-2.5 text-slate-400 text-3xs max-w-[150px] truncate" title={field.selector}>{field.selector || '-'}</td>
                          <td className="p-2.5">
                            {field.required ? (
                              <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Yes</span>
                            ) : (
                              <span className="text-slate-400">No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-3">
                <Terminal className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="space-y-1">
                  <h5 className="font-bold text-slate-700 text-xs">Belum Ada Form Terdeteksi</h5>
                  <p className="text-2xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Untuk mendeteksi form secara riil, buka browser DongkrakUsaha di menu: <br />
                    <strong className="text-slate-800">MASTER DATA → PRODUK → Input Produk</strong> <br />
                    lalu klik tombol <strong>REFRESH LIVE DOM</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button data-guide="publish.buka-form"
                    onClick={handleOpenInputProduk}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" /> Buka Form Input Produk (klik otomatis)
                  </button>
                  <button
                    onClick={handleOpenProductForm}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Hanya buka daftar produk <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MANUAL ASSIST MODE */}
      {publisherMode === 'MANUAL' && (
        <div className="du-card bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-2">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Langkah Publishing Manual Assist:
              </h4>
              <div className="flex items-center gap-3">
                <button data-guide="publish.buka-form" onClick={handleOpenInputProduk} className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline cursor-pointer">
                  <Zap className="w-3.5 h-3.5" /> Buka Form Input Produk (klik otomatis)
                </button>
                <a href="https://dongkrakusaha.com/panelMember/index.php?menu=produk" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-500 font-semibold hover:underline">
                  daftar produk saja <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            
            <ol className="list-decimal pl-5 space-y-1.5 text-slate-700">
              <li>Pastikan Anda sudah login dan membuka halaman <strong>Input Produk</strong>.</li>
              <li>Gunakan autopost untuk mengisi field dari campaign aktif, lalu tinjau hasilnya.</li>
            </ol>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-start gap-2 text-amber-900 text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Autopost berhenti sebelum submit. Submit hanya berjalan setelah konfirmasi dan akan diblokir jika CAPTCHA terdeteksi.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAutofillCampaign}
                  data-guide="publish.isi-form"
                  disabled={!activeCampaign.dongkrakListingData || !extState.formDetected}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" /> Isi Form Otomatis
                </button>
                <button data-guide="publish.submit"
                  onClick={handleSubmitCampaign}
                  disabled={!autopostResult?.success || autopostResult?.captchaDetected || autopostResult?.imageReady === false}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> Konfirmasi & Submit
                </button>
              </div>
              {autopostStatus && <p className="text-2xs font-semibold text-slate-700">{autopostStatus}</p>}
              {autopostResult?.missing?.length > 0 && (
                <p className="text-2xs text-amber-800">Field belum ditemukan: {autopostResult.missing.join(', ')}</p>
              )}
              {autopostResult?.captchaDetected && (
                <p className="text-2xs font-bold text-red-700">CAPTCHA terdeteksi. Submit otomatis diblokir.</p>
              )}
              {autopostResult?.imageReady === false && (
                <p className="text-2xs font-bold text-red-700">Foto wajib belum terpasang: {autopostResult.image?.error || 'unknown image error'}.</p>
              )}
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-4 mt-3">
              <h5 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2">Form Data DongkrakUsaha</h5>
              
              {activeCampaign.dongkrakListingData && (
                <div className="space-y-3">
                  <FieldCopyRow label="Kategori" value={activeCampaign.dongkrakListingData.kategori} />
                  <FieldCopyRow label="Penawaran" value={activeCampaign.dongkrakListingData.penawaran} />
                  <FieldCopyRow label="Nama Produk Dongkrakusaha.com" value={activeCampaign.dongkrakListingData.namaProduk} />
                  
                  {/* Image hint */}
                  <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-blue-800">Upload File Gambar Produk</span>
                        <span className="text-blue-600 text-2xs">Download gambar utama dan pastikan ukurannya di bawah 1 MB.</span>
                      </div>
                    </div>
                    {activeCampaign.dongkrakListingData.images && activeCampaign.dongkrakListingData.images.length > 0 && (
                      <a 
                        href={activeCampaign.dongkrakListingData.images[0]}
                        download={`gambar_${activeCampaign.id}.jpg`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-sm shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" /> Unduh Gambar
                      </a>
                    )}
                  </div>

                  <FieldCopyRow label="Harga (Tanpa titik/koma)" value={activeCampaign.dongkrakListingData.harga} />
                  <FieldCopyRow label="Harga Sebelum Diskon" value={activeCampaign.dongkrakListingData.hargaSebelumDiskon || '0'} />
                  
                  <div>
                    <label className="block text-2xs font-semibold text-slate-500 mb-1">Deskripsi</label>
                    <div className="relative group">
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-2xs">
                        {activeCampaign.dongkrakListingData.deskripsi}
                      </div>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(activeCampaign.dongkrakListingData?.deskripsi || '');
                          alert('Deskripsi disalin!');
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-white border border-slate-200 rounded shadow-sm text-slate-500 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy text"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  
                  <FieldCopyRow label="Meta Keyword (Limit 155 Karakter)" value={activeCampaign.dongkrakListingData.metaKeyword} isWarning={activeCampaign.dongkrakListingData.metaKeyword.length > 155} />
                  <FieldCopyRow label="Meta Deskripsi Dongkrakusaha.com (Limit 165 Karakter)" value={activeCampaign.dongkrakListingData.metaDeskripsi} isWarning={activeCampaign.dongkrakListingData.metaDeskripsi.length > 165} />
                  <FieldCopyRow label="NO WhatsApp" value={activeCampaign.dongkrakListingData.noWhatsApp} />
                  <FieldCopyRow label="Text WhatsApp" value={activeCampaign.dongkrakListingData.textWhatsApp} />
                  <FieldCopyRow label="Link Order Bukalapak" value={activeCampaign.dongkrakListingData.linkBukalapak} />
                  <FieldCopyRow label="Link Order Tokopedia" value={activeCampaign.dongkrakListingData.linkTokopedia} />
                  <FieldCopyRow label="Link Order Shopee" value={activeCampaign.dongkrakListingData.linkShopee} />
                </div>
              )}
              {!activeCampaign.dongkrakListingData && (
                <div className="text-center p-4 text-slate-500">
                  Data form belum digenerate. Silakan buka tab SEO Strategy & Content dan simpan perubahan konten terlebih dahulu.
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 p-3 bg-blue-50/60 border-blue-100 rounded-lg text-xs text-blue-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Setelah klik <strong>Konfirmasi & Submit</strong> di atas, campaign otomatis tercatat sebagai <strong>Submitted</strong> di{' '}
                <button onClick={onNavigateHistory} className="font-bold underline hover:text-blue-700 cursor-pointer">Riwayat Publish</button>.
                URL listing publik DongkrakUsaha baru tersedia ~24 jam kemudian — isi URL-nya langsung dari halaman Riwayat Publish begitu sudah ada.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT MODE */}
      {publisherMode === 'EXPORT' && (
        <div className="du-card bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Download className="w-4 h-4 text-emerald-600" />
              Export Mode (Manual Listing Exporter)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Export seluruh data listing terstruktur dalam format JSON atau CSV untuk pendaftaran manual di DongkrakUsaha.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportJson}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-xs rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <FileCode className="w-4 h-4 text-blue-600" />
              Export Format JSON
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-xs rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              Export Table CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FieldCopyRow = ({ label, value, isWarning = false }: { label: string; value: string; isWarning?: boolean }) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <label className="text-2xs font-semibold text-slate-500">{label}</label>
      {isWarning && <span className="text-3xs font-bold text-amber-600">Melebihi batas aman</span>}
    </div>
    <div className="flex gap-2">
      <input
        type="text"
        readOnly
        value={value}
        className={`flex-1 text-xs bg-slate-50 border ${isWarning ? 'border-amber-300' : 'border-slate-200'} rounded-lg p-2.5 text-slate-700 outline-none`}
      />
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
        }}
        className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm"
        title="Copy"
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  </div>
);
