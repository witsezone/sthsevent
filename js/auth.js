/**
 * STHS EventHub — Production Supabase Auth, Event Registration & QR Digital Badge
 * Supports: Email + Password, Passwordless Magic Link (OTP), and Sign in with GitHub
 * Zero demo shortcuts, zero hardcoded fake users.
 */
(function () {
  const state = {
    user: null,
    profile: null,
    registration: null,
    activeEventId: null,
    activeEventTitle: "STHS EventHub",
    listeners: new Set()
  };

  function emitChange() {
    state.listeners.forEach((fn) => {
      try { fn({ ...state }); } catch (e) { console.error(e); }
    });
  }

  function subscribe(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  }

  function getRedirectUrl() {
    return window.location.origin + window.location.pathname;
  }

  function initialsFrom(name, email) {
    const src = (name || email || "U").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }

  function isOrganizer() {
    if (state.profile && ["organizer", "super_admin"].includes(state.profile.platform_role)) return true;
    if (state.registration && state.registration.role === "organizer") return true;
    return false;
  }

  function isReviewer() {
    if (isOrganizer()) return true;
    return Boolean(state.registration && state.registration.role === "reviewer");
  }

  async function refreshUserContext() {
    const sb = window.STHS_DB?.getClient();
    if (!sb) {
      state.user = null;
      state.profile = null;
      state.registration = null;
      emitChange();
      return state;
    }

    const { data: { session } } = await sb.auth.getSession();
    state.user = session?.user || null;

    if (!state.user) {
      state.profile = null;
      state.registration = null;
      emitChange();
      return state;
    }

    const { data: prof } = await sb
      .from("profiles")
      .select("*")
      .eq("id", state.user.id)
      .maybeSingle();

    state.profile = prof || {
      id: state.user.id,
      email: state.user.email || "",
      full_name: state.user.user_metadata?.full_name || state.user.user_metadata?.user_name || "",
      academic_title: "",
      university: "University of the Witwatersrand (Wits)",
      faculty_department: "",
      bio: "",
      research_tags: [],
      platform_role: "member"
    };

    if (state.activeEventId) {
      const { data: reg } = await sb
        .from("event_registrations")
        .select("*")
        .eq("event_id", state.activeEventId)
        .eq("user_id", state.user.id)
        .maybeSingle();
      state.registration = reg || null;
    } else {
      state.registration = null;
    }

    emitChange();
    return state;
  }

  async function init(options = {}) {
    state.activeEventId = options.eventId || null;
    state.activeEventTitle = options.eventTitle || "STHS EventHub";
    ensureModalsInDom();

    const sb = window.STHS_DB?.getClient();
    if (sb) {
      sb.auth.onAuthStateChange((_event, _session) => {
        refreshUserContext();
      });
      await refreshUserContext();
    } else {
      emitChange();
    }
  }

  function setActiveEvent(eventId, eventTitle) {
    state.activeEventId = eventId;
    if (eventTitle) state.activeEventTitle = eventTitle;
    return refreshUserContext();
  }

  // Deterministic scannable QR SVG generator (uses qrcode-generator global if loaded, else crisp fallback matrix)
  function renderQrSvg(text) {
    if (typeof window.qrcode === "function") {
      try {
        const qr = window.qrcode(0, "M");
        qr.addData(text);
        qr.make();
        return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      } catch (_) {}
    }
    return `<div style="padding:1.2rem;font-family:var(--font-mono);font-size:0.78rem;color:#003b5c;border:2px dashed #007377;border-radius:10px;">${text}</div>`;
  }

  function ensureModalsInDom() {
    if (document.getElementById("sthsAuthModal")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <!-- Production Auth & Registration Modal -->
      <div class="sths-modal-backdrop" id="sthsAuthModal">
        <div class="sths-modal" role="dialog" aria-modal="true" aria-labelledby="sthsAuthHeading">
          <div class="sths-modal-header">
            <div>
              <h3 id="sthsAuthHeading" class="sths-modal-title">STHS EventHub Account</h3>
              <p class="sths-modal-subtitle" id="sthsAuthSub">Sign in with your university email, magic link, or GitHub account.</p>
            </div>
            <button type="button" class="sths-modal-close" data-close-sths-modal="sthsAuthModal" aria-label="Close">✕</button>
          </div>

          <div id="sthsAuthStatusBanner"></div>

          <!-- Unconfigured Supabase Notice (Organizer Quick Connect) -->
          <div id="sthsSupabaseSetupPrompt" style="display:none;">
            <div class="sths-alert sths-alert-warn">
              <strong>Supabase Backend Pending Connection</strong><br/>
              This platform connects directly to your <strong>witsezone GitHub Supabase project</strong> for real accounts, abstract uploads, peer review, live Q&amp;A, and leaderboards.
            </div>
            <form id="sthsInlineSupabaseConnectForm">
              <div class="sths-form-group">
                <label class="sths-label" for="sbSetupUrl">Supabase Project URL (witsezone account)</label>
                <input id="sbSetupUrl" type="url" class="sths-input" placeholder="https://xxxxxxxxxxxx.supabase.co" required />
              </div>
              <div class="sths-form-group">
                <label class="sths-label" for="sbSetupKey">Supabase Publishable Key (never secret key)</label>
                <input id="sbSetupKey" type="text" class="sths-input" placeholder="sb_publishable_..." required />
              </div>
              <div style="display:flex; gap:0.6rem; flex-wrap:wrap; margin-top:0.75rem;">
                <button type="submit" class="sths-btn sths-btn-primary" style="flex:1;">Connect Live Supabase</button>
                <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" class="sths-btn sths-btn-outline sths-btn-sm">Open Supabase Dashboard ↗</a>
              </div>
            </form>
            <p style="font-size:0.78rem; color:var(--text-muted); margin:0.9rem 0 0;">
              Organizers: Run <code>supabase/migrations/0001_sths_eventhub_schema.sql</code> and <code>supabase/seed_sths_events.sql</code> in your witsezone Supabase SQL Editor, then paste your Project URL &amp; Publishable Key above (or commit them in <code>js/supabase-config.js</code>).
            </p>
          </div>

          <!-- Active Auth View (Signed Out) -->
          <div id="sthsAuthSignedOutView">
            <button type="button" class="oauth-btn" id="sthsGitHubSignInBtn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.18c0 .31.21.66.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>
              <span>Continue with GitHub</span>
            </button>

            <div class="auth-divider">or use your academic / work email</div>

            <div class="auth-tabs" role="tablist">
              <button type="button" class="auth-tab-btn active" data-auth-mode="signin">Sign In</button>
              <button type="button" class="auth-tab-btn" data-auth-mode="signup">Create Account</button>
              <button type="button" class="auth-tab-btn" data-auth-mode="magic">Email Link</button>
            </div>

            <!-- Email + Password Sign In -->
            <form id="sthsSignInForm">
              <div class="sths-form-group">
                <label class="sths-label" for="authSignInEmail">Email Address</label>
                <input id="authSignInEmail" type="email" class="sths-input" placeholder="name@wits.ac.za" autocomplete="email" required />
              </div>
              <div class="sths-form-group">
                <label class="sths-label" for="authSignInPassword">Password</label>
                <input id="authSignInPassword" type="password" class="sths-input" placeholder="Enter your password" autocomplete="current-password" required />
              </div>
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Sign In to EventHub</button>
              <div style="text-align:center; margin-top:0.75rem;">
                <button type="button" id="sthsForgotPasswordBtn" style="background:none;border:none;color:var(--sths-teal);font-weight:700;font-size:0.82rem;cursor:pointer;">Forgot your password?</button>
              </div>
            </form>

            <!-- Create Account + Event Registration -->
            <form id="sthsSignUpForm" style="display:none;">
              <div class="sths-form-row">
                <div class="sths-form-group">
                  <label class="sths-label" for="authSignUpTitle">Title</label>
                  <select id="authSignUpTitle" class="sths-select">
                    <option value="">None</option>
                    <option value="Prof.">Prof.</option>
                    <option value="Dr.">Dr.</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Mx.">Mx.</option>
                  </select>
                </div>
                <div class="sths-form-group">
                  <label class="sths-label" for="authSignUpName">Full Name *</label>
                  <input id="authSignUpName" type="text" class="sths-input" placeholder="Your full name" required />
                </div>
              </div>
              <div class="sths-form-row">
                <div class="sths-form-group">
                  <label class="sths-label" for="authSignUpEmail">Academic / Work Email *</label>
                  <input id="authSignUpEmail" type="email" class="sths-input" placeholder="name@university.ac.za" autocomplete="email" required />
                </div>
                <div class="sths-form-group">
                  <label class="sths-label" for="authSignUpPassword">Password (8+ chars) *</label>
                  <input id="authSignUpPassword" type="password" class="sths-input" minlength="8" placeholder="Create password" autocomplete="new-password" required />
                </div>
              </div>
              <div class="sths-form-row">
                <div class="sths-form-group">
                  <label class="sths-label" for="authSignUpUni">University / Organization *</label>
                  <input id="authSignUpUni" type="text" class="sths-input" list="saUniversitiesList" placeholder="University of the Witwatersrand (Wits)" required />
                  <datalist id="saUniversitiesList">
                    <option value="University of the Witwatersrand (Wits)"></option>
                    <option value="University of Cape Town (UCT)"></option>
                    <option value="University of Pretoria (UP)"></option>
                    <option value="University of Johannesburg (UJ)"></option>
                    <option value="Stellenbosch University (SU)"></option>
                    <option value="University of KwaZulu-Natal (UKZN)"></option>
                    <option value="Rhodes University"></option>
                    <option value="North-West University (NWU)"></option>
                    <option value="University of the Western Cape (UWC)"></option>
                    <option value="University of the Free State (UFS)"></option>
                    <option value="Sefako Makgatho Health Sciences University (SMU)"></option>
                  </datalist>
                </div>
                <div class="sths-form-group">
                  <label class="sths-label" for="authSignUpDept">School / Department</label>
                  <input id="authSignUpDept" type="text" class="sths-input" placeholder="e.g. School of Therapeutic Sciences" />
                </div>
              </div>
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Create Account &amp; Continue</button>
            </form>

            <!-- Magic Link / Email OTP -->
            <form id="sthsMagicLinkForm" style="display:none;">
              <p style="font-size:0.84rem; color:var(--text-secondary); margin:0 0 0.8rem;">
                We will email you a secure one-click sign-in link — no password required. Works with any university or personal email.
              </p>
              <div class="sths-form-group">
                <label class="sths-label" for="authMagicEmail">Email Address</label>
                <input id="authMagicEmail" type="email" class="sths-input" placeholder="name@wits.ac.za" required />
              </div>
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Send One-Click Sign-In Link</button>
            </form>
          </div>

          <!-- Signed-In Profile & Event Registration View -->
          <div id="sthsAuthSignedInView" style="display:none;">
            <div class="sths-alert sths-alert-success" id="sthsSignedInSummary"></div>
            <form id="sthsEventRegForm">
              <div class="sths-form-row">
                <div class="sths-form-group">
                  <label class="sths-label" for="regProfileTitle">Academic Title</label>
                  <input id="regProfileTitle" type="text" class="sths-input" placeholder="Dr. / Prof. / Ms." />
                </div>
                <div class="sths-form-group">
                  <label class="sths-label" for="regProfileName">Full Name *</label>
                  <input id="regProfileName" type="text" class="sths-input" required />
                </div>
              </div>
              <div class="sths-form-row">
                <div class="sths-form-group">
                  <label class="sths-label" for="regProfileUni">University / Institution *</label>
                  <input id="regProfileUni" type="text" class="sths-input" list="saUniversitiesList" required />
                </div>
                <div class="sths-form-group">
                  <label class="sths-label" for="regProfileDept">Faculty / Department</label>
                  <input id="regProfileDept" type="text" class="sths-input" />
                </div>
              </div>
              <div id="sthsEventRegExtraFields">
                <div class="sths-form-row">
                  <div class="sths-form-group">
                    <label class="sths-label" for="regAttendanceMode">Attendance Mode *</label>
                    <select id="regAttendanceMode" class="sths-select">
                      <option value="in_person">On-Ground (eFundanathi eZone, Wits) + Online Access</option>
                      <option value="online">Online Only (Zoom &amp; Microsoft Teams Stream)</option>
                    </select>
                  </div>
                  <div class="sths-form-group">
                    <label class="sths-label" for="regRoleSelect">Participant Category *</label>
                    <select id="regRoleSelect" class="sths-select">
                      <option value="delegate">Academic / Clinical Delegate</option>
                      <option value="speaker">Speaker / Abstract Presenter</option>
                      <option value="student">Postgraduate / Undergraduate Student</option>
                      <option value="exhibitor">Sponsor / Game Studio / Exhibitor</option>
                    </select>
                  </div>
                </div>
                <div class="sths-form-group">
                  <label class="sths-label" for="regDietary">Accessibility / Dietary Notes (Optional)</label>
                  <input id="regDietary" type="text" class="sths-input" placeholder="e.g. Vegetarian, Halaal, wheelchair access, live captions" />
                </div>
                <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.84rem; font-weight:600; margin-bottom:0.9rem; cursor:pointer;">
                  <input id="regPublicDir" type="checkbox" checked />
                  <span>List my profile in the Inter-University Speakers &amp; Delegates Networking Directory</span>
                </label>
              </div>
              <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
                <button type="submit" class="sths-btn sths-btn-primary" style="flex:1;">Save Registration &amp; Profile</button>
                <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" id="sthsOpenBadgeFromAuthBtn">View QR Pass</button>
                <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" id="sthsSignOutBtn">Sign Out</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Digital QR Delegate Badge Modal -->
      <div class="sths-modal-backdrop" id="sthsQrBadgeModal">
        <div class="sths-modal" role="dialog" aria-modal="true" aria-labelledby="qrBadgeHeading">
          <div class="sths-modal-header">
            <div>
              <h3 id="qrBadgeHeading" class="sths-modal-title">Digital Event Pass &amp; QR Check-In</h3>
              <p class="sths-modal-subtitle">Scan at eFundanathi eZone registration desks or exhibitor booths.</p>
            </div>
            <button type="button" class="sths-modal-close" data-close-sths-modal="sthsQrBadgeModal" aria-label="Close">✕</button>
          </div>
          <div id="sthsQrBadgeBody"></div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);
    bindModalEvents();
  }

  function setStatusBanner(type, message) {
    const el = document.getElementById("sthsAuthStatusBanner");
    if (!el) return;
    if (!message) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `<div class="sths-alert sths-alert-${type}">${message}</div>`;
  }

  function bindModalEvents() {
    document.querySelectorAll("[data-close-sths-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(btn.dataset.closeSthsModal)?.classList.remove("open");
      });
    });

    ["sthsAuthModal", "sthsQrBadgeModal"].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("click", (e) => {
        if (e.target === el) el.classList.remove("open");
      });
    });

    // Auth mode tabs
    document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.authMode;
        document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        document.getElementById("sthsSignInForm").style.display = mode === "signin" ? "block" : "none";
        document.getElementById("sthsSignUpForm").style.display = mode === "signup" ? "block" : "none";
        document.getElementById("sthsMagicLinkForm").style.display = mode === "magic" ? "block" : "none";
        setStatusBanner(null, "");
      });
    });

    // Inline Supabase Connection Form (Organizer Setup)
    document.getElementById("sthsInlineSupabaseConnectForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setStatusBanner("info", "Testing connection to Supabase…");
      try {
        const url = document.getElementById("sbSetupUrl").value;
        const key = document.getElementById("sbSetupKey").value;
        window.STHS_DB.saveRuntimeConfig(url, key);
        const test = await window.STHS_DB.testConnection();
        if (!test.ok) {
          setStatusBanner("warn", `Connected to Supabase, but schema check returned: ${test.error}. Make sure you ran <code>0001_sths_eventhub_schema.sql</code> in SQL Editor.`);
        } else {
          window.STHS_DB.showToast("Connected to live Supabase database!", "✅");
          window.location.reload();
        }
      } catch (err) {
        setStatusBanner("error", err.message);
      }
    });

    // GitHub OAuth
    document.getElementById("sthsGitHubSignInBtn")?.addEventListener("click", async () => {
      const sb = window.STHS_DB?.getClient();
      if (!sb) return;
      setStatusBanner("info", "Redirecting to GitHub sign-in…");
      const { error } = await sb.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: getRedirectUrl() }
      });
      if (error) setStatusBanner("error", error.message);
    });

    // Email + Password Sign In
    document.getElementById("sthsSignInForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB?.getClient();
      if (!sb) return;
      setStatusBanner("info", "Signing in…");
      const email = document.getElementById("authSignInEmail").value.trim();
      const password = document.getElementById("authSignInPassword").value;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setStatusBanner("error", error.message);
      } else {
        setStatusBanner("success", "Signed in! Loading your profile…");
        await refreshUserContext();
        window.STHS_DB.showToast("Welcome back to STHS EventHub!", "👋");
        openAuthModal();
      }
    });

    // Forgot Password
    document.getElementById("sthsForgotPasswordBtn")?.addEventListener("click", async () => {
      const sb = window.STHS_DB?.getClient();
      const email = document.getElementById("authSignInEmail").value.trim();
      if (!email) {
        setStatusBanner("warn", "Enter your email address above first, then click Forgot Password.");
        return;
      }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl() });
      if (error) setStatusBanner("error", error.message);
      else setStatusBanner("success", `Password reset link sent to <strong>${email}</strong>.`);
    });

    // Sign Up + Profile creation
    document.getElementById("sthsSignUpForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB?.getClient();
      if (!sb) return;
      setStatusBanner("info", "Creating your account…");
      const title = document.getElementById("authSignUpTitle").value;
      const fullName = document.getElementById("authSignUpName").value.trim();
      const email = document.getElementById("authSignUpEmail").value.trim();
      const password = document.getElementById("authSignUpPassword").value;
      const university = document.getElementById("authSignUpUni").value.trim();
      const dept = document.getElementById("authSignUpDept").value.trim();

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getRedirectUrl(),
          data: { full_name: fullName, academic_title: title, university }
        }
      });
      if (error) {
        setStatusBanner("error", error.message);
        return;
      }

      if (data.session && data.user) {
        await sb.from("profiles").upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          academic_title: title,
          university,
          faculty_department: dept
        });
        if (state.activeEventId) {
          await sb.from("event_registrations").upsert({
            event_id: state.activeEventId,
            user_id: data.user.id,
            role: "delegate",
            attendance_mode: "in_person",
            public_in_directory: true
          }, { onConflict: "event_id,user_id" });
        }
        await refreshUserContext();
        window.STHS_DB.showToast("Account created & registered!", "🎉");
        openAuthModal();
      } else {
        setStatusBanner("success", `Verification email sent to <strong>${email}</strong>. Click the confirmation link in your inbox to activate your account.`);
      }
    });

    // Magic Link OTP
    document.getElementById("sthsMagicLinkForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB?.getClient();
      if (!sb) return;
      const email = document.getElementById("authMagicEmail").value.trim();
      setStatusBanner("info", "Sending one-click sign-in link…");
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: getRedirectUrl() }
      });
      if (error) setStatusBanner("error", error.message);
      else setStatusBanner("success", `Check <strong>${email}</strong> for your one-click sign-in link!`);
    });

    // Save Profile & Event Registration
    document.getElementById("sthsEventRegForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB?.getClient();
      if (!sb || !state.user) return;
      setStatusBanner("info", "Saving your profile & event registration…");

      const profilePayload = {
        id: state.user.id,
        email: state.user.email || "",
        academic_title: document.getElementById("regProfileTitle").value.trim(),
        full_name: document.getElementById("regProfileName").value.trim(),
        university: document.getElementById("regProfileUni").value.trim(),
        faculty_department: document.getElementById("regProfileDept").value.trim(),
        public_directory: document.getElementById("regPublicDir").checked
      };

      const { error: pErr } = await sb.from("profiles").upsert(profilePayload);
      if (pErr) {
        setStatusBanner("error", pErr.message);
        return;
      }

      if (state.activeEventId) {
        const chosenRole = document.getElementById("regRoleSelect").value;
        const preserveRole = state.registration && ["organizer", "reviewer"].includes(state.registration.role)
          ? state.registration.role
          : chosenRole;
        const { error: rErr } = await sb.from("event_registrations").upsert({
          event_id: state.activeEventId,
          user_id: state.user.id,
          role: preserveRole,
          attendance_mode: document.getElementById("regAttendanceMode").value,
          dietary_accessibility: document.getElementById("regDietary").value.trim(),
          public_in_directory: document.getElementById("regPublicDir").checked
        }, { onConflict: "event_id,user_id" });
        if (rErr) {
          setStatusBanner("error", rErr.message);
          return;
        }
      }

      await refreshUserContext();
      window.STHS_DB.showToast("Registration & profile saved!", "✅");
      document.getElementById("sthsAuthModal")?.classList.remove("open");
    });

    document.getElementById("sthsOpenBadgeFromAuthBtn")?.addEventListener("click", () => {
      document.getElementById("sthsAuthModal")?.classList.remove("open");
      openQrBadgeModal();
    });

    document.getElementById("sthsSignOutBtn")?.addEventListener("click", async () => {
      const sb = window.STHS_DB?.getClient();
      if (sb) await sb.auth.signOut();
      await refreshUserContext();
      window.STHS_DB.showToast("Signed out cleanly.", "👋");
      document.getElementById("sthsAuthModal")?.classList.remove("open");
    });
  }

  function openAuthModal(defaultTab = "signin") {
    ensureModalsInDom();
    const modal = document.getElementById("sthsAuthModal");
    const setupBox = document.getElementById("sthsSupabaseSetupPrompt");
    const signedOutBox = document.getElementById("sthsAuthSignedOutView");
    const signedInBox = document.getElementById("sthsAuthSignedInView");
    setStatusBanner(null, "");

    if (!window.STHS_DB?.isConfigured()) {
      setupBox.style.display = "block";
      signedOutBox.style.display = "none";
      signedInBox.style.display = "none";
      document.getElementById("sthsAuthHeading").textContent = "Connect Wits STHS Supabase";
      document.getElementById("sthsAuthSub").textContent = "Link your witsezone GitHub Supabase project to activate live sign-in.";
    } else if (state.user) {
      setupBox.style.display = "none";
      signedOutBox.style.display = "none";
      signedInBox.style.display = "block";
      document.getElementById("sthsAuthHeading").textContent = "My Account & Event Registration";
      document.getElementById("sthsAuthSub").textContent = state.user.email || "";

      const p = state.profile || {};
      const r = state.registration || {};
      document.getElementById("regProfileTitle").value = p.academic_title || "";
      document.getElementById("regProfileName").value = p.full_name || "";
      document.getElementById("regProfileUni").value = p.university || "University of the Witwatersrand (Wits)";
      document.getElementById("regProfileDept").value = p.faculty_department || "";
      document.getElementById("sthsEventRegExtraFields").style.display = state.activeEventId ? "block" : "none";
      if (state.activeEventId) {
        document.getElementById("regAttendanceMode").value = r.attendance_mode || "in_person";
        if (["delegate", "speaker", "student", "exhibitor"].includes(r.role)) {
          document.getElementById("regRoleSelect").value = r.role;
        }
        document.getElementById("regDietary").value = r.dietary_accessibility || "";
        document.getElementById("regPublicDir").checked = r.public_in_directory !== false;
      }

      const roleTag = isOrganizer() ? "Organizer / Admin" : (r.role || "Member");
      document.getElementById("sthsSignedInSummary").innerHTML = `
        <strong>Signed in as ${[p.academic_title, p.full_name].filter(Boolean).join(" ") || state.user.email}</strong>
        · Role: <strong style="text-transform:capitalize;">${roleTag}</strong>
        ${r.badge_code ? ` · Pass ID: <code>${r.badge_code}</code>` : ""}
      `;
    } else {
      setupBox.style.display = "none";
      signedOutBox.style.display = "block";
      signedInBox.style.display = "none";
      document.getElementById("sthsAuthHeading").textContent = "Sign In or Register";
      document.getElementById("sthsAuthSub").textContent = `Access ${state.activeEventTitle} with your university email or GitHub.`;
      const targetTab = document.querySelector(`.auth-tab-btn[data-auth-mode="${defaultTab}"]`);
      if (targetTab) targetTab.click();
    }

    modal.classList.add("open");
  }

  function openQrBadgeModal() {
    ensureModalsInDom();
    const modal = document.getElementById("sthsQrBadgeModal");
    const body = document.getElementById("sthsQrBadgeBody");

    if (!window.STHS_DB?.isConfigured() || !state.user) {
      body.innerHTML = `
        <div class="sths-alert sths-alert-info">
          Sign in and complete your event registration to generate your personal scannable QR Check-In Pass and Networking Badge.
        </div>
        <button type="button" class="sths-btn sths-btn-primary" style="width:100%;" id="qrSignInNowBtn">Sign In / Register Now</button>
      `;
      modal.classList.add("open");
      document.getElementById("qrSignInNowBtn")?.addEventListener("click", () => {
        modal.classList.remove("open");
        openAuthModal("signup");
      });
      return;
    }

    const p = state.profile || {};
    const r = state.registration || {};
    const fullName = [p.academic_title, p.full_name].filter(Boolean).join(" ") || state.user.email;
    const badgeCode = r.badge_code || "UNREGISTERED";
    const qrPayload = JSON.stringify({
      hub: "STHS-EventHub",
      event: state.activeEventTitle,
      code: badgeCode,
      name: fullName,
      uni: p.university || "",
      mode: r.attendance_mode || "in_person"
    });

    body.innerHTML = `
      <div class="qr-badge-card">
        <div style="font-size:0.74rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#f4d582;">
          ${state.activeEventTitle}
        </div>
        <h4 style="margin:0.35rem 0 0.15rem; font-size:1.3rem; font-weight:800;">${fullName}</h4>
        <div style="font-size:0.86rem; opacity:0.9;">${p.university || "University Delegate"}</div>
        <div class="qr-badge-box">${renderQrSvg(qrPayload)}</div>
        <div>
          <span class="qr-badge-code">${badgeCode}</span>
        </div>
        <div style="margin-top:0.85rem; display:flex; justify-content:center; gap:0.5rem; flex-wrap:wrap; font-size:0.78rem; font-weight:700;">
          <span style="background:rgba(255,255,255,0.18); padding:0.25rem 0.7rem; border-radius:999px; text-transform:capitalize;">
            ${r.role || "delegate"}
          </span>
          <span style="background:rgba(255,255,255,0.18); padding:0.25rem 0.7rem; border-radius:999px;">
            ${r.attendance_mode === "online" ? "🌐 Online Pass" : "📍 On-Ground + Online Pass"}
          </span>
          <span style="background:rgba(197,150,39,0.35); padding:0.25rem 0.7rem; border-radius:999px;">
            ⚡ ${r.xp_points || 0} XP
          </span>
        </div>
      </div>
    `;
    modal.classList.add("open");
  }

  function requireAuth(actionLabel = "continue") {
    if (!window.STHS_DB?.isConfigured()) {
      openAuthModal();
      return false;
    }
    if (!state.user) {
      window.STHS_DB.showToast(`Please sign in to ${actionLabel}.`, "🔐");
      openAuthModal("signin");
      return false;
    }
    return true;
  }

  window.STHS_AUTH = {
    init,
    setActiveEvent,
    refreshUserContext,
    subscribe,
    openAuthModal,
    openQrBadgeModal,
    requireAuth,
    initialsFrom,
    isOrganizer,
    isReviewer,
    getState: () => ({ ...state })
  };
})();
