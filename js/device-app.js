/**
 * STHS EventHub — Device Detection & Native-Like PWA App Shell Controller
 * Automatically detects phone / tablet / desktop, iOS / Android, and installed
 * standalone PWA mode so the web platform operates smoothly like a native app.
 */
(function () {
  const DISMISS_KEY = "sths_pwa_install_dismissed_v1";
  let deferredPrompt = null;

  function detectDevice() {
    const ua = navigator.userAgent || "";
    const width = window.innerWidth;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    let formFactor = "desktop";
    if (width < 768) formFactor = "mobile";
    else if (width < 1100) formFactor = "tablet";

    const os = isIOS ? "ios" : isAndroid ? "android" : /Mac/i.test(ua) ? "macos" : /Win/i.test(ua) ? "windows" : "other";

    document.documentElement.dataset.device = formFactor;
    document.documentElement.dataset.os = os;
    document.documentElement.dataset.pwa = isStandalone ? "standalone" : "browser";
    document.documentElement.dataset.touch = isTouch ? "true" : "false";

    return { formFactor, os, isIOS, isAndroid, isTouch, isStandalone };
  }

  function haptic(ms = 12) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }

  function registerServiceWorker(swPath) {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      return;
    }
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(swPath).catch((err) => {
        console.warn("[STHS PWA] Service worker registration skipped:", err.message);
      });
    });
  }

  function initNetworkStatus() {
    const bar = document.getElementById("networkStatusBar");
    if (!bar) return;
    function sync() {
      if (navigator.onLine) {
        bar.classList.remove("visible");
      } else {
        bar.textContent = "You are offline — showing cached conference schedule & resources. Live sync resumes automatically when reconnected.";
        bar.classList.add("visible");
      }
    }
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    sync();
  }

  function showIOSInstallModal() {
    let modal = document.getElementById("sthsIOSInstallModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "sthsIOSInstallModal";
      modal.className = "sths-modal-backdrop";
      modal.innerHTML = `
        <div class="sths-modal" role="dialog" aria-modal="true" aria-labelledby="iosInstallTitle">
          <div class="sths-modal-header">
            <div>
              <h3 id="iosInstallTitle" class="sths-modal-title">Install on iPhone or iPad</h3>
              <p class="sths-modal-subtitle">Run STHS EventHub full-screen like a native iOS conference app.</p>
            </div>
            <button type="button" class="sths-modal-close" data-close-ios-modal aria-label="Close">✕</button>
          </div>
          <ol style="margin:0; padding-left:1.25rem; display:flex; flex-direction:column; gap:0.65rem; font-size:0.9rem; color:var(--text-secondary);">
            <li>Tap the <strong>Share</strong> icon (square with upward arrow) in Safari's toolbar.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> — the app launches full-screen with instant access to your Agenda, Live Stream, QR Badge, and Amazing Race.</li>
          </ol>
          <div style="margin-top:1.25rem; display:flex; justify-content:flex-end;">
            <button type="button" class="sths-btn sths-btn-primary sths-btn-sm" data-close-ios-modal>Got it</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal || e.target.hasAttribute("data-close-ios-modal")) {
          modal.classList.remove("open");
        }
      });
    }
    modal.classList.add("open");
  }

  function initInstallFlow() {
    const info = detectDevice();
    const banner = document.getElementById("pwaInstallBanner");
    const installBtn = document.getElementById("pwaInstallBtn");
    const dismissBtn = document.getElementById("pwaDismissBtn");
    const headerInstallBtns = document.querySelectorAll("[data-install-app-trigger]");

    const dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";

    function triggerInstall() {
      haptic(14);
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choice) => {
          if (choice.outcome === "accepted") {
            window.STHS_DB?.showToast("Installing app to your device…", "📲");
            banner?.classList.remove("visible");
          }
          deferredPrompt = null;
        });
      } else if (info.isIOS) {
        showIOSInstallModal();
      } else {
        window.STHS_DB?.showToast("Use your browser menu → 'Install App' or 'Add to Home Screen' for full-screen app mode.", "📲");
      }
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!info.isStandalone && !dismissed && banner) {
        banner.classList.add("visible");
      } else if (!info.isStandalone) {
        headerInstallBtns.forEach((b) => (b.style.display = "inline-flex"));
      }
    });

    // Show clean iOS banner on mobile Safari when not already installed
    if (info.isIOS && !info.isStandalone && !dismissed && banner) {
      banner.classList.add("visible");
    }

    installBtn?.addEventListener("click", triggerInstall);
    headerInstallBtns.forEach((b) => b.addEventListener("click", triggerInstall));
    dismissBtn?.addEventListener("click", () => {
      sessionStorage.setItem(DISMISS_KEY, "1");
      banner?.classList.remove("visible");
      if (deferredPrompt && window.innerWidth >= 768) {
        headerInstallBtns.forEach((b) => (b.style.display = "inline-flex"));
      }
    });

    window.addEventListener("appinstalled", () => {
      banner?.classList.remove("visible");
      detectDevice();
      window.STHS_DB?.showToast("Installed! Open directly from your home screen anytime.", "✅");
    });
  }

  function init(options = {}) {
    detectDevice();
    window.addEventListener("resize", detectDevice);
    initNetworkStatus();
    initInstallFlow();
    if (options.swPath) {
      registerServiceWorker(options.swPath);
    }
    if (document.querySelector(".mobile-app-dock")) {
      document.body.classList.add("has-mobile-dock");
    }
    return detectDevice();
  }

  window.STHS_APP = {
    init,
    detectDevice,
    haptic,
    showIOSInstallModal
  };
})();
