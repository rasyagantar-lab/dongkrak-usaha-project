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
      console.log("[DONGKRAK EXT POPUP] RECEIVED STATE:", res);

      if (!res || (!res.tabDetected && !res.dongkrakusahaDetected)) {
        tabStatusEl.textContent = 'Tidak Ditemukan';
        tabStatusEl.className = 'text-red';
        loginStatusEl.textContent = 'Tidak Ditemukan';
        formStatusEl.textContent = 'Tidak Ditemukan';
        fieldsCountEl.textContent = '0 Field Terdeteksi';
        return;
      }

      tabStatusEl.textContent = 'Terdeteksi';
      tabStatusEl.className = 'text-green';

      const isAuth = res.authStatus === 'AUTHENTICATED' || res.isLoggedIn || res.authenticated;
      const isNotAuth = res.authStatus === 'NOT_LOGGED_IN';

      loginStatusEl.textContent = isAuth ? 'Logged In' : (isNotAuth ? 'Belum Login' : 'Unknown');
      loginStatusEl.className = isAuth ? 'text-green' : (isNotAuth ? 'text-red' : 'text-amber');

      const fieldsCount = res.discoveredFields ? res.discoveredFields.length : (res.formFieldCount || 0);

      if (res.formDetected && fieldsCount > 0) {
        formStatusEl.textContent = 'Form Discovered';
        formStatusEl.className = 'text-green';
      } else if (res.formDetected && fieldsCount === 0) {
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
