/**
 * STHS EventHub — Launch-Ready User Accounts, Role Requests & Digital QR Pass
 * Supports Email + Password and One-Click Email Sign-In Link.
 * Enforces Approval-Gated Roles: Super Admin, Planning Committee, Peer Reviewer,
 * Sponsor Partner, Session Chair, and Check-In Volunteer.
 */
(function () {
  const ROLE_META = {
    super_admin: { label: "Super Admin", privileged: true, badge: "badge-terracotta" },
    planning_committee: { label: "Planning Committee", privileged: true, badge: "badge-navy" },
    reviewer: { label: "Peer Reviewer", privileged: true, badge: "badge-teal" },
    session_chair: { label: "Session Chair", privileged: true, badge: "badge-teal" },
    volunteer: { label: "Check-In Volunteer", privileged: true, badge: "badge-mustard" },
    sponsor: { label: "Sponsor / Exhibitor", privileged: true, badge: "badge-mustard" },
    speaker: { label: "Speaker / Presenter", privileged: false, badge: "badge-teal" },
    student: { label: "Student / Emerging Scholar", privileged: false, badge: "badge-mustard" },
    delegate: { label: "Delegate", privileged: false, badge: "badge-navy" }
  };

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
    let path = window.location.pathname.replace(/\/index\.html$/i, "/");
    if (!path.endsWith("/")) path += "/";
    return window.location.origin + path;
  }

  function cleanAuthParamsFromUrl() {
    try {
      const url = new URL(window.location.href);
      const authQueryKeys = ["code", "error", "error_code", "error_description", "type", "token_hash"];
      let changed = false;
      authQueryKeys.forEach((k) => {
        if (url.searchParams.has(k)) {
          url.searchParams.delete(k);
          changed = true;
        }
      });
      if (url.hash && /(access_token|refresh_token|error|error_description|type=magiclink|type=recovery|type=signup)=/i.test(url.hash)) {
        url.hash = "";
        changed = true;
      }
      if (changed) {
        window.history.replaceState({}, document.title, url.pathname + url.search);
      }
    } catch (_) {}
  }

  function readAuthUrlError() {
    const query = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    return (
      hashParams.get("error_description") ||
      query.get("error_description") ||
      hashParams.get("error") ||
      query.get("error") ||
      ""
    );
  }

  function formatRoleLabel(role) {
    return ROLE_META[role]?.label || "Delegate";
  }

  function isPrivilegedRole(role) {
    return Boolean(ROLE_META[role]?.privileged);
  }

  function initialsFrom(name, email) {
    const src = (name || email || "U").trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }

  function isSuperAdmin() {
    if (state.profile?.platform_role === "super_admin") return true;
    if (state.registration?.role === "super_admin" && state.registration?.approval_status === "approved") return true;
    return false;
  }

  function isCommittee() {
    if (isSuperAdmin()) return true;
    if (state.profile?.platform_role === "planning_committee") return true;
    if (state.registration?.role === "planning_committee" && state.registration?.approval_status === "approved") return true;
    return false;
  }

  function isOrganizer() {
    return isCommittee();
  }

  function isReviewer() {
    if (isCommittee()) return true;
    return state.registration?.role === "reviewer" && state.registration?.approval_status === "approved";
  }

  function isModerator() {
    if (isCommittee()) return true;
    return state.registration?.role === "session_chair" && state.registration?.approval_status === "approved";
  }

  function isVolunteer() {
    if (isCommittee()) return true;
    return state.registration?.role === "volunteer" && state.registration?.approval_status === "approved";
  }

  function isSponsor() {
    if (isCommittee()) return true;
    return state.registration?.role === "sponsor" && state.registration?.approval_status === "approved";
  }

  function getEffectiveRole() {
    if (isSuperAdmin()) return "super_admin";
    if (state.registration?.role) return state.registration.role;
    if (state.profile?.platform_role === "planning_committee") return "planning_committee";
    return "delegate";
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
      academic_title: state.user.user_metadata?.academic_title || "",
      university: state.user.user_metadata?.university || "University of the Witwatersrand (Wits)",
      faculty_department: state.user.user_metadata?.faculty_department || "",
      bio: "",
      research_tags: [],
      platform_role: "member",
      requested_platform_role: "",
      approval_status: "approved"
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

    const urlErr = readAuthUrlError();
    const sb = window.STHS_DB?.getClient();
    if (sb) {
      sb.auth.onAuthStateChange((event, _session) => {
        if (event === "SIGNED_IN") {
          cleanAuthParamsFromUrl();
        }
        if (event === "PASSWORD_RECOVERY") {
          cleanAuthParamsFromUrl();
          openPasswordResetModal();
        }
        refreshUserContext();
      });
      await refreshUserContext();
      if (state.user) {
        cleanAuthParamsFromUrl();
      } else if (urlErr) {
        cleanAuthParamsFromUrl();
        openAuthModal("magic");
        setStatusBanner(
          "warn",
          `That sign-in link could not be verified (${urlErr.replace(/\+/g, " ")}). Please request a fresh one-click email link or sign in with your password.`
        );
      }
    } else {
      emitChange();
    }
  }

  function setActiveEvent(eventId, eventTitle) {
    state.activeEventId = eventId;
    if (eventTitle) state.activeEventTitle = eventTitle;
    return refreshUserContext();
  }

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

  function roleOptionsHtml() {
    return `
      <optgroup label="Instant Registration Access">
        <option value="delegate">Delegate / Academic &amp; Clinical Participant</option>
        <option value="student">Student / Emerging Scholar</option>
        <option value="speaker">Speaker / Presenter / Game Demo Exhibitor</option>
      </optgroup>
      <optgroup label="Restricted Access (Requires Admin Approval)">
        <option value="planning_committee">Planning &amp; Organizing Committee (Approval Required)</option>
        <option value="reviewer">Scientific Peer Reviewer (Approval Required)</option>
        <option value="sponsor">Sponsor / Exhibitor Partner (Approval Required)</option>
        <option value="session_chair">Session Chair / Stage Moderator (Approval Required)</option>
        <option value="volunteer">On-Ground Check-In &amp; eZone Volunteer (Approval Required)</option>
        <option value="super_admin">Super Admin Access Request (Approval Required)</option>
      </optgroup>
    `;
  }

  function ensureModalsInDom() {
    if (document.getElementById("sthsAuthModal")) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <!-- Clean Launch-Ready Account & Event Registration Modal -->
      <div class="sths-modal-backdrop" id="sthsAuthModal">
        <div class="sths-modal" role="dialog" aria-modal="true" aria-labelledby="sthsAuthHeading">
          <div class="sths-modal-header">
            <div>
              <h3 id="sthsAuthHeading" class="sths-modal-title">STHS EventHub Account</h3>
              <p class="sths-modal-subtitle" id="sthsAuthSub">Sign in with your academic or work email, or request a one-click email link.</p>
            </div>
            <button type="button" class="sths-modal-close" data-close-sths-modal="sthsAuthModal" aria-label="Close">✕</button>
          </div>

          <div id="sthsAuthStatusBanner"></div>

          <!-- Signed Out View -->
          <div id="sthsAuthSignedOutView">
            <div class="auth-tabs" role="tablist">
              <button type="button" class="auth-tab-btn active" data-auth-mode="signin">Sign In</button>
              <button type="button" class="auth-tab-btn" data-auth-mode="signup">Register</button>
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
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Sign In</button>
              <div style="text-align:center; margin-top:0.75rem;">
                <button type="button" id="sthsForgotPasswordBtn" style="background:none;border:none;color:var(--sths-teal);font-weight:700;font-size:0.82rem;cursor:pointer;">Forgot your password?</button>
              </div>
            </form>

            <!-- Create Account & Choose Function / Role -->
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
              <div class="sths-form-group">
                <label class="sths-label" for="authSignUpRole">Role / Function *</label>
                <select id="authSignUpRole" class="sths-select">${roleOptionsHtml()}</select>
              </div>
              <div id="authSignUpApprovalHint" class="sths-alert sths-alert-info" style="display:none; font-size:0.8rem;">
                You will receive immediate <strong>Delegate</strong> access upon sign-up while your requested committee/reviewer/partner permissions await administrator approval.
              </div>
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Create Account &amp; Register</button>
            </form>

            <!-- Magic Link -->
            <form id="sthsMagicLinkForm" style="display:none;">
              <p style="font-size:0.84rem; color:var(--text-secondary); margin:0 0 0.8rem;">
                Enter your email address and we will send you a secure one-click sign-in link — no password required.
              </p>
              <div class="sths-form-group">
                <label class="sths-label" for="authMagicEmail">Email Address</label>
                <input id="authMagicEmail" type="email" class="sths-input" placeholder="name@wits.ac.za" required />
              </div>
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Send One-Click Sign-In Link</button>
            </form>
          </div>

          <!-- Signed-In Profile, Role Status & Event Registration View -->
          <div id="sthsAuthSignedInView" style="display:none;">
            <div class="sths-alert sths-alert-success" id="sthsSignedInSummary"></div>
            <div class="sths-alert sths-alert-warn" id="sthsPendingRoleNotice" style="display:none;"></div>

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
                      <option value="online">Online Only (Zoom &amp; Microsoft Teams)</option>
                    </select>
                  </div>
                  <div class="sths-form-group">
                    <label class="sths-label" for="regRoleSelect">Role / Access Request *</label>
                    <select id="regRoleSelect" class="sths-select">${roleOptionsHtml()}</select>
                  </div>
                </div>
                <div class="sths-form-group">
                  <label class="sths-label" for="regDietary">Accessibility / Dietary Notes (Optional)</label>
                  <input id="regDietary" type="text" class="sths-input" placeholder="e.g. Vegetarian, Halaal, wheelchair access, captions" />
                </div>
                <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.84rem; font-weight:600; margin-bottom:0.9rem; cursor:pointer;">
                  <input id="regPublicDir" type="checkbox" checked />
                  <span>List my profile in the Inter-University Speakers &amp; Delegates Networking Directory</span>
                </label>
              </div>
              <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
                <button type="submit" class="sths-btn sths-btn-primary" style="flex:1;">Save Profile &amp; Registration</button>
                <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" id="sthsOpenBadgeFromAuthBtn">QR Pass</button>
                <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" id="sthsSignOutBtn">Sign Out</button>
              </div>
            </form>
          </div>

          <!-- Password Recovery View -->
          <div id="sthsResetPasswordView" style="display:none;">
            <form id="sthsResetPasswordForm">
              <div class="sths-form-group">
                <label class="sths-label" for="authNewPassword">New Password (8+ characters) *</label>
                <input id="authNewPassword" type="password" class="sths-input" minlength="8" placeholder="Enter new password" autocomplete="new-password" required />
              </div>
              <div class="sths-form-group">
                <label class="sths-label" for="authConfirmPassword">Confirm New Password *</label>
                <input id="authConfirmPassword" type="password" class="sths-input" minlength="8" placeholder="Re-enter new password" autocomplete="new-password" required />
              </div>
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Update Password &amp; Continue</button>
            </form>
          </div>
        </div>
      </div>

      <!-- Digital QR Delegate Pass Modal -->
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

  function formatAuthError(err) {
    const msg = String(err?.message || err || "Unable to complete sign-in.");
    if (/rate limit/i.test(msg) || err?.status === 429) {
      return "Too many sign-in emails were requested recently. Please wait a few minutes before requesting another link, or sign in with your email and password.";
    }
    return msg;
  }

  function setStatusBanner(type, message) {
    const el = document.getElementById("sthsAuthStatusBanner");
    if (!el) return;
    if (!message) { el.innerHTML = ""; return; }
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
      el?.addEventListener("click", (e) => { if (e.target === el) el.classList.remove("open"); });
    });

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

    document.getElementById("authSignUpRole")?.addEventListener("change", (e) => {
      const hint = document.getElementById("authSignUpApprovalHint");
      if (hint) hint.style.display = isPrivilegedRole(e.target.value) ? "block" : "none";
    });

    document.getElementById("sthsResetPasswordForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB?.getClient();
      if (!sb) return;
      const p1 = document.getElementById("authNewPassword").value;
      const p2 = document.getElementById("authConfirmPassword").value;
      if (p1 !== p2) {
        setStatusBanner("error", "Passwords do not match. Please re-enter.");
        return;
      }
      setStatusBanner("info", "Updating your password…");
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) {
        setStatusBanner("error", formatAuthError(error));
        return;
      }
      document.getElementById("sthsResetPasswordForm").reset();
      await refreshUserContext();
      window.STHS_DB.showToast("Password updated! You are now signed in.", "✅");
      document.getElementById("sthsAuthModal")?.classList.remove("open");
    });

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
        await refreshUserContext();
        window.STHS_DB.showToast("Welcome back to STHS EventHub!", "👋");
        document.getElementById("sthsAuthModal")?.classList.remove("open");
      }
    });

    document.getElementById("sthsForgotPasswordBtn")?.addEventListener("click", async () => {
      const sb = window.STHS_DB?.getClient();
      const email = document.getElementById("authSignInEmail").value.trim();
      if (!email) {
        setStatusBanner("warn", "Enter your email address above first, then click Forgot Password.");
        return;
      }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl() });
      if (error) setStatusBanner("error", formatAuthError(error));
      else setStatusBanner("success", `Password reset instructions sent to <strong>${email}</strong>.`);
    });

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
      const chosenRole = document.getElementById("authSignUpRole").value;

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getRedirectUrl(),
          data: {
            full_name: fullName,
            academic_title: title,
            university,
            faculty_department: dept,
            requested_role: chosenRole
          }
        }
      });
      if (error) {
        setStatusBanner("error", formatAuthError(error));
        return;
      }

      if (data.session && data.user) {
        await sb.from("profiles").upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          academic_title: title,
          university,
          faculty_department: dept,
          requested_platform_role: ["super_admin", "planning_committee"].includes(chosenRole) ? chosenRole : ""
        });

        if (state.activeEventId) {
          await sb.from("event_registrations").upsert({
            event_id: state.activeEventId,
            user_id: data.user.id,
            role: isPrivilegedRole(chosenRole) ? "delegate" : chosenRole,
            requested_role: isPrivilegedRole(chosenRole) ? chosenRole : "",
            attendance_mode: "in_person",
            public_in_directory: true
          }, { onConflict: "event_id,user_id" });
        }

        await refreshUserContext();
        window.STHS_DB.showToast(
          isPrivilegedRole(chosenRole)
            ? `Account created! Your request for ${formatRoleLabel(chosenRole)} access has been sent for administrator approval.`
            : "Account created & registered!",
          "🎉"
        );
        document.getElementById("sthsAuthModal")?.classList.remove("open");
      } else {
        setStatusBanner(
          "success",
          `Confirmation email sent to <strong>${email}</strong>. Click the verification link in your inbox to activate your account.`
        );
      }
    });

    document.getElementById("sthsMagicLinkForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB?.getClient();
      if (!sb) return;
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const email = document.getElementById("authMagicEmail").value.trim();
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending link…";
      }
      setStatusBanner("info", "Sending your secure sign-in link…");
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: getRedirectUrl() }
      });
      if (error) {
        setStatusBanner("error", formatAuthError(error));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Send One-Click Sign-In Link";
        }
      } else {
        setStatusBanner("success", `Check <strong>${email}</strong> for your one-click sign-in link (please check Spam/Junk if it does not arrive within 1 minute).`);
        if (submitBtn) {
          let secs = 60;
          submitBtn.textContent = `Link sent — resend in ${secs}s`;
          const timer = setInterval(() => {
            secs -= 1;
            if (secs <= 0) {
              clearInterval(timer);
              submitBtn.disabled = false;
              submitBtn.textContent = "Send One-Click Sign-In Link";
            } else {
              submitBtn.textContent = `Link sent — resend in ${secs}s`;
            }
          }, 1000);
        }
      }
    });

    document.getElementById("sthsEventRegForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB?.getClient();
      if (!sb || !state.user) return;
      setStatusBanner("info", "Saving your profile & event registration…");

      const chosenRole = document.getElementById("regRoleSelect")?.value || "delegate";
      const currentRole = state.registration?.role || "delegate";
      const requestingUpgrade = isPrivilegedRole(chosenRole) && chosenRole !== currentRole && !isSuperAdmin();

      const profilePayload = {
        id: state.user.id,
        email: state.user.email || "",
        academic_title: document.getElementById("regProfileTitle").value.trim(),
        full_name: document.getElementById("regProfileName").value.trim(),
        university: document.getElementById("regProfileUni").value.trim(),
        faculty_department: document.getElementById("regProfileDept").value.trim(),
        public_directory: document.getElementById("regPublicDir").checked
      };
      if (requestingUpgrade && ["super_admin", "planning_committee"].includes(chosenRole)) {
        profilePayload.requested_platform_role = chosenRole;
      }

      const { error: pErr } = await sb.from("profiles").upsert(profilePayload);
      if (pErr) { setStatusBanner("error", pErr.message); return; }

      if (state.activeEventId) {
        const regPayload = {
          event_id: state.activeEventId,
          user_id: state.user.id,
          attendance_mode: document.getElementById("regAttendanceMode").value,
          dietary_accessibility: document.getElementById("regDietary").value.trim(),
          public_in_directory: document.getElementById("regPublicDir").checked
        };
        if (requestingUpgrade) {
          regPayload.role = currentRole;
          regPayload.requested_role = chosenRole;
        } else if (!isPrivilegedRole(chosenRole)) {
          regPayload.role = isPrivilegedRole(currentRole) ? currentRole : chosenRole;
        }

        const { error: rErr } = await sb.from("event_registrations").upsert(regPayload, { onConflict: "event_id,user_id" });
        if (rErr) { setStatusBanner("error", rErr.message); return; }
      }

      await refreshUserContext();
      window.STHS_DB.showToast(
        requestingUpgrade
          ? `Profile saved! Your request for ${formatRoleLabel(chosenRole)} access is pending approval.`
          : "Registration & profile updated!",
        "✅"
      );
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

  function openPasswordResetModal() {
    ensureModalsInDom();
    const modal = document.getElementById("sthsAuthModal");
    document.getElementById("sthsAuthSignedOutView").style.display = "none";
    document.getElementById("sthsAuthSignedInView").style.display = "none";
    document.getElementById("sthsResetPasswordView").style.display = "block";
    document.getElementById("sthsAuthHeading").textContent = "Set a New Password";
    document.getElementById("sthsAuthSub").textContent = "Choose a strong password for your STHS EventHub account.";
    setStatusBanner("info", "Your reset link has been verified. Enter your new password below.");
    modal.classList.add("open");
  }

  function openAuthModal(defaultTab = "signin") {
    ensureModalsInDom();
    const modal = document.getElementById("sthsAuthModal");
    const signedOutBox = document.getElementById("sthsAuthSignedOutView");
    const signedInBox = document.getElementById("sthsAuthSignedInView");
    const resetBox = document.getElementById("sthsResetPasswordView");
    if (resetBox) resetBox.style.display = "none";
    setStatusBanner(null, "");

    if (state.user) {
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
        document.getElementById("regRoleSelect").value = r.requested_role || r.role || "delegate";
        document.getElementById("regDietary").value = r.dietary_accessibility || "";
        document.getElementById("regPublicDir").checked = r.public_in_directory !== false;
      }

      const activeRoleLabel = formatRoleLabel(getEffectiveRole());
      document.getElementById("sthsSignedInSummary").innerHTML = `
        <strong>${[p.academic_title, p.full_name].filter(Boolean).join(" ") || state.user.email}</strong>
        · Active Access: <strong>${activeRoleLabel}</strong>
        ${r.badge_code ? ` · Pass ID: <code>${r.badge_code}</code>` : ""}
      `;

      const pendingBox = document.getElementById("sthsPendingRoleNotice");
      const reqRole = r.requested_role || p.requested_platform_role;
      if ((r.approval_status === "pending" || p.approval_status === "pending") && reqRole) {
        pendingBox.style.display = "block";
        pendingBox.innerHTML = `<strong>Pending Administrator Approval:</strong> Your request for <strong>${formatRoleLabel(reqRole)}</strong> access is awaiting review. You have full ${activeRoleLabel} access in the meantime.`;
      } else {
        pendingBox.style.display = "none";
      }
    } else {
      signedOutBox.style.display = "block";
      signedInBox.style.display = "none";
      document.getElementById("sthsAuthHeading").textContent = "Sign In or Register";
      document.getElementById("sthsAuthSub").textContent = `Access ${state.activeEventTitle} with your academic or work email.`;
      const targetTab = document.querySelector(`.auth-tab-btn[data-auth-mode="${defaultTab}"]`);
      if (targetTab) targetTab.click();
    }

    modal.classList.add("open");
  }

  function openQrBadgeModal() {
    ensureModalsInDom();
    const modal = document.getElementById("sthsQrBadgeModal");
    const body = document.getElementById("sthsQrBadgeBody");

    if (!state.user) {
      body.innerHTML = `
        <div class="sths-alert sths-alert-info">
          Sign in and complete your registration to generate your personal scannable QR Check-In Pass and Networking Badge.
        </div>
        <button type="button" class="sths-btn sths-btn-primary" style="width:100%;" id="qrSignInNowBtn">Sign In / Register</button>
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
        <div><span class="qr-badge-code">${badgeCode}</span></div>
        <div style="margin-top:0.85rem; display:flex; justify-content:center; gap:0.5rem; flex-wrap:wrap; font-size:0.78rem; font-weight:700;">
          <span style="background:rgba(255,255,255,0.18); padding:0.25rem 0.7rem; border-radius:999px;">${formatRoleLabel(getEffectiveRole())}</span>
          <span style="background:rgba(255,255,255,0.18); padding:0.25rem 0.7rem; border-radius:999px;">
            ${r.attendance_mode === "online" ? "🌐 Online Pass" : "📍 On-Ground + Online Pass"}
          </span>
          <span style="background:rgba(197,150,39,0.35); padding:0.25rem 0.7rem; border-radius:999px;">⚡ ${r.xp_points || 0} XP</span>
        </div>
      </div>
    `;
    modal.classList.add("open");
  }

  function requireAuth(actionLabel = "continue") {
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
    formatRoleLabel,
    isPrivilegedRole,
    isSuperAdmin,
    isCommittee,
    isOrganizer,
    isReviewer,
    isModerator,
    isVolunteer,
    isSponsor,
    getEffectiveRole,
    ROLE_META,
    getState: () => ({ ...state })
  };
})();
