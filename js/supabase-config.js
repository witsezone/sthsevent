/**
 * STHS EventHub — Production Supabase Client Configuration
 * Pinned SDK: @supabase/supabase-js@2.119.2 (loaded via ESM/UMD script tag)
 *
 * SECURITY NOTE:
 * Only the public Project URL and Publishable Key (or legacy anon key) belong here.
 * NEVER place a service_role or secret key in frontend code.
 *
 * To permanently connect your witsezone GitHub Supabase project:
 * Paste your Project URL and Publishable Key below, or run the Organizer Setup Wizard.
 */
(function () {
  const RUNTIME_KEY = "sths_eventhub_supabase_runtime_v1";

  // Committed production configuration for the witsezone GitHub Supabase project.
  // Populate `url` and `publishableKey` once your witsezone Supabase project is created.
  const COMMITTED_CONFIG = {
    url: "",
    publishableKey: ""
  };

  let clientInstance = null;

  function readRuntimeConfig() {
    try {
      const raw = localStorage.getItem(RUNTIME_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.url === "string" && typeof parsed.publishableKey === "string") {
        return { url: parsed.url.trim(), publishableKey: parsed.publishableKey.trim() };
      }
    } catch (_) {}
    return null;
  }

  function getConfig() {
    if (COMMITTED_CONFIG.url && COMMITTED_CONFIG.publishableKey) {
      return { ...COMMITTED_CONFIG, source: "committed" };
    }
    const rt = readRuntimeConfig();
    if (rt && rt.url && rt.publishableKey) {
      return { ...rt, source: "runtime" };
    }
    return { url: "", publishableKey: "", source: "unconfigured" };
  }

  function isConfigured() {
    const cfg = getConfig();
    return Boolean(cfg.url && cfg.publishableKey && /^https:\/\/.+\.supabase\.(co|in)/i.test(cfg.url));
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (clientInstance) return clientInstance;
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      console.error("[STHS_DB] @supabase/supabase-js SDK not loaded.");
      return null;
    }
    const cfg = getConfig();
    clientInstance = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    });
    return clientInstance;
  }

  function saveRuntimeConfig(url, publishableKey) {
    const cleanUrl = String(url || "").trim().replace(/\/+$/, "");
    const cleanKey = String(publishableKey || "").trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(cleanUrl)) {
      throw new Error("Please enter a valid Supabase Project URL (e.g. https://your-ref.supabase.co).");
    }
    if (cleanKey.length < 20) {
      throw new Error("Please enter a valid Supabase Publishable Key (or anon key).");
    }
    if (cleanKey.startsWith("sb_secret_")) {
      throw new Error("Security blocked: Never paste a secret/service_role key in the browser. Use the Publishable Key.");
    }
    localStorage.setItem(RUNTIME_KEY, JSON.stringify({ url: cleanUrl, publishableKey: cleanKey }));
    clientInstance = null;
    return getClient();
  }

  function clearRuntimeConfig() {
    localStorage.removeItem(RUNTIME_KEY);
    clientInstance = null;
  }

  async function testConnection() {
    const sb = getClient();
    if (!sb) return { ok: false, error: "Supabase not configured yet." };
    const { data, error } = await sb.from("events").select("id, slug, title").limit(3);
    if (error) return { ok: false, error: error.message };
    return { ok: true, count: (data || []).length };
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
    }, 4000);
  }

  window.STHS_DB = {
    getConfig,
    isConfigured,
    getClient,
    saveRuntimeConfig,
    clearRuntimeConfig,
    testConnection,
    showToast
  };
})();
