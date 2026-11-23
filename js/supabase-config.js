/**
 * STHS EventHub — Live Production Cloud Configuration
 * Pinned Client SDK: @supabase/supabase-js@2.119.2
 * Only public endpoint URL and publishable key are stored client-side.
 */
(function () {
  const PRODUCTION_CONFIG = {
    url: "https://ryabexxorzpsuvdfxzyo.supabase.co",
    publishableKey: "sb_publishable_w3Rl3GaoZy71EGK2WWTTjA_R0A7I3CJ"
  };

  let clientInstance = null;

  function getConfig() {
    return { ...PRODUCTION_CONFIG };
  }

  function isConfigured() {
    return Boolean(PRODUCTION_CONFIG.url && PRODUCTION_CONFIG.publishableKey);
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (clientInstance) return clientInstance;
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      console.error("[STHS_DB] Client SDK failed to load.");
      return null;
    }
    clientInstance = window.supabase.createClient(
      PRODUCTION_CONFIG.url,
      PRODUCTION_CONFIG.publishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce"
        }
      }
    );
    return clientInstance;
  }

  function showToast(message, icon = "✦") {
    let stack = document.getElementById("sthsToastStack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "sthsToastStack";
      stack.className = "sths-toast-stack";
      document.body.appendChild(stack);
    }
    const toast = document.createElement("div");
    toast.className = "sths-toast";
    toast.innerHTML = `<span aria-hidden="true">${icon}</span><span></span>`;
    toast.querySelector("span:last-child").textContent = message;
    stack.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      toast.style.transition = "all 0.22s ease";
      setTimeout(() => toast.remove(), 240);
    }, 4200);
  }

  window.STHS_DB = {
    getConfig,
    isConfigured,
    getClient,
    showToast
  };
})();
