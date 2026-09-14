document.addEventListener('DOMContentLoaded', () => {
  const tabStatusEl = document.getElementById('tabStatus');
  const loginStatusEl = document.getElementById('loginStatus');
  const formStatusEl = document.getElementById('formStatus');
  const fieldsCountEl = document.getElementById('fieldsCount');
  const btnCheck = document.getElementById('btnCheck');

  function checkStatus() {
    tabStatusEl.textContent = 'Memeriksa...';
    loginStatusEl.textContent = 'Memeriksa...';
    formStatusEl.textContent = 'Memeriksa...';

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      tabStatusEl.textContent = 'Context Missing';
      return;
    }

    chrome.runtime.sendMessage({ action: 'INSPECT_DONGKRAK_TAB' }, (res) => {
      const state = res?.dongkrakState || res || {};
      console.log("[DONGKRAK EXT POPUP] RECEIVED STATE:", state);

      const tabDetected = !!(state.tabDetected ?? state.dongkrakusahaDetected ?? res?.tabDetected ?? res?.dongkrakusahaDetected);
      const authStatus = state.authStatus || res?.authStatus || 'UNKNOWN';
      const isAuth = authStatus === 'AUTHENTICATED' || !!state.isLoggedIn || !!state.authenticated || !!res?.isLoggedIn || !!res?.authenticated;
      const isNotAuth = authStatus === 'NOT_LOGGED_IN';
      const formDetected = !!(state.formDetected ?? res?.formDetected);
      const fields = state.discoveredFields || state.fieldsDiscovered || res?.discoveredFields || res?.fieldsDiscovered || [];
      const fieldsCount = Array.isArray(fields) ? fields.length : (state.formFieldCount || res?.formFieldCount || 0);

      if (!res || !tabDetected) {
        tabStatusEl.textContent = 'Tidak Ditemukan';
        tabStatusEl.className = 'text-red';
        loginStatusEl.textContent = 'Tidak Ditemukan';
        formStatusEl.textContent = 'Tidak Ditemukan';
        fieldsCountEl.textContent = '0 Field Terdeteksi';
        return;
      }

      tabStatusEl.textContent = 'Terdeteksi';
      tabStatusEl.className = 'text-green';

      loginStatusEl.textContent = isAuth ? 'Logged In' : (isNotAuth ? 'Belum Login' : 'Unknown');
      loginStatusEl.className = isAuth ? 'text-green' : (isNotAuth ? 'text-red' : 'text-amber');

      if (formDetected && fieldsCount > 0) {
        formStatusEl.textContent = 'Form Discovered';
        formStatusEl.className = 'text-green';
      } else if (formDetected && fieldsCount === 0) {
        formStatusEl.textContent = 'Inspection Incomplete';
        formStatusEl.className = 'text-amber';
      } else {
        formStatusEl.textContent = 'Bukan Form Input';
        formStatusEl.className = 'text-slate';
      }

      fieldsCountEl.textContent = `${fieldsCount} Field Terdeteksi`;
    });
  }

  if (btnCheck) {
    btnCheck.addEventListener('click', checkStatus);
  }
  checkStatus();
});
