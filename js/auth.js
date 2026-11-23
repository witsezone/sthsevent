/**
 * STHS EventHub — Launch-Ready User Accounts, Role Requests & Digital QR Pass
 * Supports Email + Password authentication, Password Recovery, and Approval-Gated Roles.
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
    ticketTiers: [],
    billingSettings: null,
    invoice: null,
    activeEventId: null,
    activeEventTitle: "STHS EventHub",
    listeners: new Set()
  };

  function escHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatZar(amount) {
    return `R ${Number(amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function paymentBadgeHtml(status) {
    const map = {
      paid: { label: "✓ PAID", bg: "#0f766e", color: "#fff" },
      complimentary: { label: "✓ COMPLIMENTARY", bg: "#007377", color: "#fff" },
      pop_submitted: { label: "⏳ PoP UNDER REVIEW", bg: "#1d4ed8", color: "#fff" },
      pro_forma: { label: "PRO-FORMA DUE", bg: "#b45309", color: "#fff" },
      cancelled: { label: "CANCELLED", bg: "#64748b", color: "#fff" },
      refunded: { label: "REFUNDED", bg: "#64748b", color: "#fff" }
    };
    const m = map[status] || { label: "PAYMENT PENDING", bg: "#b45309", color: "#fff" };
    return `<span style="display:inline-block;padding:0.18rem 0.55rem;border-radius:999px;font-size:0.7rem;font-weight:800;letter-spacing:0.04em;background:${m.bg};color:${m.color};">${m.label}</span>`;
  }

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

  async function loadEventBillingData() {
    const sb = window.STHS_DB?.getClient();
    if (!sb || !state.activeEventId) {
      state.ticketTiers = [];
      state.billingSettings = null;
      return;
    }
    const [tiersRes, billRes] = await Promise.all([
      sb.from("event_ticket_tiers").select("*").eq("event_id", state.activeEventId).eq("is_active", true).order("sort_order"),
      sb.from("event_billing_settings").select("*").eq("event_id", state.activeEventId).maybeSingle()
    ]);
    state.ticketTiers = tiersRes.data || [];
    state.billingSettings = billRes.data || null;
    populateSignUpTierOptions();
  }

  function getSelectableTiers(includeOrganizerOnly = false) {
    return (state.ticketTiers || []).filter((t) => includeOrganizerOnly || !t.requires_organizer_role);
  }

  function populateSignUpTierOptions(preferredRole = "") {
    const wrap = document.getElementById("authSignUpBillingBlock");
    const sel = document.getElementById("authSignUpTierSelect");
    if (!wrap || !sel) return;
    const tiers = getSelectableTiers(false);
    if (!state.activeEventId || !tiers.length) {
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "block";
    const prevVal = sel.value;
    sel.innerHTML = tiers
      .map((t) => `<option value="${t.id}" data-code="${escHtml(t.tier_code)}">${escHtml(t.name)} — ${t.price_zar > 0 ? formatZar(t.price_zar) : "Complimentary (R 0.00)"}</option>`)
      .join("");

    const role = preferredRole || document.getElementById("authSignUpRole")?.value || "delegate";
    let match = null;
    if (role === "student") match = tiers.find((t) => t.tier_code.includes("student"));
    else if (role === "speaker") match = tiers.find((t) => t.tier_code.includes("speaker"));
    else match = tiers.find((t) => t.tier_code === "in_person_delegate");

    if (match) sel.value = match.id;
    else if (prevVal && tiers.some((t) => t.id === prevVal)) sel.value = prevVal;
  }

  async function refreshUserContext() {
    const sb = window.STHS_DB?.getClient();
    if (!sb) {
      state.user = null;
      state.profile = null;
      state.registration = null;
      state.invoice = null;
      emitChange();
      return state;
    }

    if (state.activeEventId && !state.ticketTiers.length) {
      await loadEventBillingData();
    }

    const { data: { session } } = await sb.auth.getSession();
    state.user = session?.user || null;

    if (!state.user) {
      state.profile = null;
      state.registration = null;
      state.invoice = null;
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
      const [regRes, invRes] = await Promise.all([
        sb.from("event_registrations").select("*").eq("event_id", state.activeEventId).eq("user_id", state.user.id).maybeSingle(),
        sb.from("registration_invoices").select("*").eq("event_id", state.activeEventId).eq("user_id", state.user.id).order("created_at", { ascending: false }).limit(1)
      ]);
      state.registration = regRes.data || null;
      state.invoice = (invRes.data && invRes.data[0]) || null;
    } else {
      state.registration = null;
      state.invoice = null;
    }

    emitChange();
    return state;
  }

  async function init(options = {}) {
    state.activeEventId = options.eventId || null;
    state.activeEventTitle = options.eventTitle || "STHS EventHub";
    ensureModalsInDom();

    const urlErr = readAuthUrlError();
    const queryParams = new URLSearchParams(window.location.search);
    const paymentOutcome = queryParams.get("payment") || "";
    const paymentInv = queryParams.get("inv") || "";

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
      await loadEventBillingData();
      await refreshUserContext();
      if (state.user) {
        cleanAuthParamsFromUrl();
        if (paymentOutcome === "success") {
          window.history.replaceState({}, document.title, window.location.pathname);
          window.STHS_DB.showToast(`Payment received for ${paymentInv || "your registration"}! Loading your official receipt…`, "🎉");
          setTimeout(() => openInvoiceModal(), 450);
        } else if (paymentOutcome === "cancelled") {
          window.history.replaceState({}, document.title, window.location.pathname);
          window.STHS_DB.showToast("Online payment was cancelled. Your Pro-Forma Invoice remains available anytime.", "ℹ️");
          setTimeout(() => openInvoiceModal(), 450);
        }
      } else if (urlErr) {
        cleanAuthParamsFromUrl();
        openAuthModal("signin");
        setStatusBanner(
          "warn",
          `That verification or reset link could not be completed (${urlErr.replace(/\+/g, " ")}). Please sign in with your password or request a fresh password reset.`
        );
      }
    } else {
      emitChange();
    }
  }

  async function setActiveEvent(eventId, eventTitle) {
    state.activeEventId = eventId;
    if (eventTitle) state.activeEventTitle = eventTitle;
    await loadEventBillingData();
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
              <p class="sths-modal-subtitle" id="sthsAuthSub">Sign in or register with your academic or work email and password.</p>
            </div>
            <button type="button" class="sths-modal-close" data-close-sths-modal="sthsAuthModal" aria-label="Close">✕</button>
          </div>

          <div id="sthsAuthStatusBanner"></div>

          <!-- Signed Out View -->
          <div id="sthsAuthSignedOutView">
            <div class="auth-tabs" role="tablist">
              <button type="button" class="auth-tab-btn active" data-auth-mode="signin">Sign In</button>
              <button type="button" class="auth-tab-btn" data-auth-mode="signup">Register</button>
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
              <div id="authSignUpBillingBlock" style="display:none; background:#f8fafc; border:1.5px solid #dbe4ee; border-radius:12px; padding:0.8rem 0.9rem; margin-bottom:0.85rem;">
                <div style="font-size:0.74rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#003b5c; margin-bottom:0.5rem;">Symposium Registration Fee &amp; Invoice</div>
                <div class="sths-form-group" style="margin-bottom:0.65rem;">
                  <label class="sths-label" for="authSignUpTierSelect">Registration Pass / Fee Tier *</label>
                  <select id="authSignUpTierSelect" class="sths-select"></select>
                </div>
                <div class="sths-form-row">
                  <div class="sths-form-group" style="margin-bottom:0;">
                    <label class="sths-label" for="authSignUpPaymentMethod">Payment Option *</label>
                    <select id="authSignUpPaymentMethod" class="sths-select">
                      <option value="payfast">PayFast Online (Card / Instant EFT)</option>
                      <option value="eft">Institutional Bank EFT (Pro-Forma Invoice)</option>
                      <option value="purchase_order">University Purchase Order (PO)</option>
                    </select>
                  </div>
                  <div class="sths-form-group" style="margin-bottom:0;">
                    <label class="sths-label" for="authSignUpPoRef">PO / VAT No. (Optional)</label>
                    <input id="authSignUpPoRef" type="text" class="sths-input" placeholder="e.g. PO-2027-014" />
                  </div>
                </div>
              </div>
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Create Account &amp; Generate Invoice</button>
            </form>

            <!-- Forgot Password Form (toggled cleanly from Sign In) -->
            <form id="sthsForgotPasswordForm" style="display:none;">
              <p style="font-size:0.84rem; color:var(--text-secondary); margin:0 0 0.85rem;">
                Enter the email address you registered with and we will send you a secure password reset link from <strong>eFundanathi eZone</strong>.
              </p>
              <div class="sths-form-group">
                <label class="sths-label" for="authForgotEmail">Registered Email Address</label>
                <input id="authForgotEmail" type="email" class="sths-input" placeholder="name@wits.ac.za" autocomplete="email" required />
              </div>
              <button type="submit" class="sths-btn sths-btn-primary" style="width:100%;">Send Password Reset Link</button>
              <div style="text-align:center; margin-top:0.75rem;">
                <button type="button" id="sthsBackToSignInBtn" style="background:none;border:none;color:var(--sths-teal);font-weight:700;font-size:0.82rem;cursor:pointer;">← Back to Sign In</button>
              </div>
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
              <div style="display:flex; gap:0.55rem; flex-wrap:wrap;">
                <button type="submit" class="sths-btn sths-btn-primary" style="flex:1; min-width:170px;">Save Profile &amp; Registration</button>
                <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" id="sthsOpenInvoiceFromAuthBtn">🧾 Payment &amp; Invoice</button>
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

      <!-- Registration Payment Gateway, EFT PoP Upload & Printable Tax Invoice Modal -->
      <div class="sths-modal-backdrop" id="sthsInvoiceModal">
        <div class="sths-modal" role="dialog" aria-modal="true" aria-labelledby="sthsInvoiceHeading" style="max-width:600px;">
          <div class="sths-modal-header">
            <div>
              <h3 id="sthsInvoiceHeading" class="sths-modal-title">Symposium Payment &amp; Official Invoice</h3>
              <p class="sths-modal-subtitle" id="sthsInvoiceSub">Pay securely via PayFast, upload Institutional EFT Proof of Payment, or download your PDF invoice.</p>
            </div>
            <button type="button" class="sths-modal-close" data-close-sths-modal="sthsInvoiceModal" aria-label="Close">✕</button>
          </div>
          <div id="sthsInvoiceBody"></div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);
    bindModalEvents();
  }

  function formatAuthError(err) {
    const msg = String(err?.message || err || "Unable to complete sign-in.");
    if (/rate limit/i.test(msg) || err?.status === 429) {
      return "Our email delivery quota is temporarily busy. Please wait a few minutes and try again, or contact help.efundanathi@wits.ac.za if you need immediate assistance.";
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

    ["sthsAuthModal", "sthsQrBadgeModal", "sthsInvoiceModal"].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("click", (e) => { if (e.target === el) el.classList.remove("open"); });
    });

    document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.authMode;
        document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
        document.getElementById("sthsSignInForm").style.display = mode === "signin" ? "block" : "none";
        document.getElementById("sthsSignUpForm").style.display = mode === "signup" ? "block" : "none";
        document.getElementById("sthsForgotPasswordForm").style.display = "none";
        if (mode === "signup") populateSignUpTierOptions();
        setStatusBanner(null, "");
      });
    });

    document.getElementById("authSignUpRole")?.addEventListener("change", (e) => {
      const hint = document.getElementById("authSignUpApprovalHint");
      if (hint) hint.style.display = isPrivilegedRole(e.target.value) ? "block" : "none";
      populateSignUpTierOptions(e.target.value);
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

    document.getElementById("sthsForgotPasswordBtn")?.addEventListener("click", () => {
      const prefill = document.getElementById("authSignInEmail")?.value.trim() || "";
      document.getElementById("sthsSignInForm").style.display = "none";
      document.getElementById("sthsSignUpForm").style.display = "none";
      document.getElementById("sthsForgotPasswordForm").style.display = "block";
      if (prefill) document.getElementById("authForgotEmail").value = prefill;
      setStatusBanner(null, "");
    });

    document.getElementById("sthsBackToSignInBtn")?.addEventListener("click", () => {
      document.getElementById("sthsForgotPasswordForm").style.display = "none";
      document.getElementById("sthsSignInForm").style.display = "block";
      setStatusBanner(null, "");
    });

    document.getElementById("sthsForgotPasswordForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB?.getClient();
      if (!sb) return;
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const email = document.getElementById("authForgotEmail").value.trim();
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending reset link…";
      }
      setStatusBanner("info", "Sending password reset instructions…");
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl() });
      if (error) {
        setStatusBanner("error", formatAuthError(error));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Send Password Reset Link";
        }
      } else {
        setStatusBanner("success", `Password reset instructions sent to <strong>${email}</strong>. Please check your inbox (and Spam/Junk folder).`);
        if (submitBtn) {
          let secs = 60;
          submitBtn.textContent = `Sent — resend in ${secs}s`;
          const timer = setInterval(() => {
            secs -= 1;
            if (secs <= 0) {
              clearInterval(timer);
              submitBtn.disabled = false;
              submitBtn.textContent = "Send Password Reset Link";
            } else {
              submitBtn.textContent = `Sent — resend in ${secs}s`;
            }
          }, 1000);
        }
      }
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

        let createdInvoice = null;
        if (state.activeEventId) {
          const selectedTierId = document.getElementById("authSignUpTierSelect")?.value || "";
          const selectedTierObj = state.ticketTiers.find((t) => t.id === selectedTierId);
          const payMethod = document.getElementById("authSignUpPaymentMethod")?.value || "eft";
          const poRef = document.getElementById("authSignUpPoRef")?.value.trim() || "";

          await sb.from("event_registrations").upsert({
            event_id: state.activeEventId,
            user_id: data.user.id,
            role: isPrivilegedRole(chosenRole) ? "delegate" : chosenRole,
            requested_role: isPrivilegedRole(chosenRole) ? chosenRole : "",
            attendance_mode: selectedTierObj?.attendance_mode || "in_person",
            public_in_directory: true
          }, { onConflict: "event_id,user_id" });

          const isRootAdmin = email.toLowerCase() === "spha.msimang@wits.ac.za";
          const compTier = isRootAdmin ? state.ticketTiers.find((t) => t.is_complimentary) : null;
          const finalTierId = compTier?.id || selectedTierId || state.ticketTiers[0]?.id;

          if (finalTierId) {
            const { data: invRpc } = await sb.rpc("create_or_get_my_invoice", {
              p_event_id: state.activeEventId,
              p_tier_id: finalTierId,
              p_payment_method: compTier ? "complimentary" : payMethod,
              p_billing_org: university,
              p_billing_po: poRef
            });
            if (invRpc?.ok && invRpc.invoice) createdInvoice = invRpc.invoice;
          }

          // Fire automated branded registration confirmation email (from efundanathi@wits.ac.za when SMTP configured)
          sb.functions
            .invoke("send-sths-email", {
              body: {
                type: "registration_confirmed",
                event_id: state.activeEventId,
                invoice_id: createdInvoice?.id || ""
              }
            })
            .catch(() => {});
        }

        await refreshUserContext();
        window.STHS_DB.showToast(
          isPrivilegedRole(chosenRole)
            ? `Account created! Request for ${formatRoleLabel(chosenRole)} sent for approval & invoice generated.`
            : "Registration confirmed & official invoice generated!",
          "🎉"
        );
        document.getElementById("sthsAuthModal")?.classList.remove("open");
        if (state.activeEventId) {
          openInvoiceModal();
        }
      } else {
        setStatusBanner(
          "success",
          `Confirmation email sent to <strong>${escHtml(email)}</strong>. Click the verification link in your inbox to activate your account and access your invoice.`
        );
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

    document.getElementById("sthsOpenInvoiceFromAuthBtn")?.addEventListener("click", () => {
      document.getElementById("sthsAuthModal")?.classList.remove("open");
      openInvoiceModal();
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
        const roleSel = document.getElementById("regRoleSelect");
        roleSel.querySelectorAll('option[data-assigned-role="true"]').forEach((opt) => opt.remove());
        const targetRole = isSuperAdmin() ? "super_admin" : (r.requested_role || r.role || "delegate");
        if (!Array.from(roleSel.options).some((opt) => opt.value === targetRole)) {
          const dynOpt = document.createElement("option");
          dynOpt.value = targetRole;
          dynOpt.dataset.assignedRole = "true";
          dynOpt.textContent = `${formatRoleLabel(targetRole)} (Assigned)`;
          roleSel.appendChild(dynOpt);
        }
        roleSel.value = targetRole;
        document.getElementById("regDietary").value = r.dietary_accessibility || "";
        document.getElementById("regPublicDir").checked = r.public_in_directory !== false;
      }

      const activeRoleLabel = formatRoleLabel(getEffectiveRole());
      const invStatus = state.invoice?.payment_status || r.payment_status || (isSuperAdmin() ? "complimentary" : "pro_forma");
      document.getElementById("sthsSignedInSummary").innerHTML = `
        <strong>${escHtml([p.academic_title, p.full_name].filter(Boolean).join(" ") || state.user.email)}</strong>
        · Active Access: <strong>${escHtml(activeRoleLabel)}</strong>
        ${r.badge_code ? ` · Pass ID: <code>${escHtml(r.badge_code)}</code>` : ""}
        ${state.activeEventId ? ` · ${paymentBadgeHtml(invStatus)}` : ""}
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
        ${
          state.activeEventId
            ? `<div style="margin-top:0.9rem; display:flex; justify-content:center; align-items:center; gap:0.55rem; flex-wrap:wrap;">
                ${paymentBadgeHtml(state.invoice?.payment_status || r.payment_status || (isSuperAdmin() ? "complimentary" : "pro_forma"))}
                <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" id="qrOpenInvoiceBtn" style="background:rgba(255,255,255,0.14); color:#fff; border-color:rgba(255,255,255,0.4);">🧾 Payment &amp; Invoice</button>
              </div>`
            : ""
        }
      </div>
    `;
    modal.classList.add("open");
    document.getElementById("qrOpenInvoiceBtn")?.addEventListener("click", () => {
      modal.classList.remove("open");
      openInvoiceModal();
    });
  }

  function downloadSymposiumIcs() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Wits STHS EventHub//GO Game-On! Symposium 2027//EN",
      "BEGIN:VEVENT",
      "UID:go-game-on-2027@efundanathi.wits.ac.za",
      "DTSTAMP:20261123T080000Z",
      "DTSTART:20270311T063000Z",
      "DTEND:20270312T150000Z",
      "SUMMARY:GO Game-On! Symposium 2027 — Wits School of Therapeutic Sciences",
      "DESCRIPTION:Playing Our Way Forward: Traditional Games, Virtual Spaces and Community. Hosted by Wits School of Therapeutic Sciences & eFundanathi eZone. Portal: https://witsezone.github.io/sthsevent/game-on-symposium-2027/",
      "LOCATION:eFundanathi eZone, Wits Education Campus, Johannesburg & Online (Zoom / MS Teams)",
      "URL:https://witsezone.github.io/sthsevent/game-on-symposium-2027/",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "GO-Game-On-Symposium-2027.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function printInvoiceDocument(inv, billingOverride = null) {
    if (!inv) return;
    const b = billingOverride || state.billingSettings || {};
    const isPaid = inv.payment_status === "paid" || inv.payment_status === "complimentary";
    const docLabel =
      inv.payment_status === "paid"
        ? "OFFICIAL TAX INVOICE & PAYMENT RECEIPT"
        : inv.payment_status === "complimentary"
        ? "COMPLIMENTARY REGISTRATION CONFIRMATION"
        : "PRO-FORMA TAX INVOICE";
    const issuedStr = inv.issued_at ? new Date(inv.issued_at).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-ZA");
    const paidStr = inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }) : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(inv.invoice_number)} · ${escHtml(docLabel)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
    .sheet { max-width: 780px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 34px 38px; position: relative; overflow: hidden; }
    .watermark { position: absolute; top: 38%; left: 50%; transform: translate(-50%,-50%) rotate(-24deg); font-size: 92px; font-weight: 900; letter-spacing: 8px; color: ${isPaid ? "rgba(15,118,110,0.09)" : "rgba(180,83,9,0.07)"}; pointer-events: none; user-select: none; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #003b5c; padding-bottom: 18px; margin-bottom: 22px; gap: 20px; }
    .brand-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #007377; }
    .brand-title { font-size: 20px; font-weight: 800; color: #003b5c; margin: 4px 0 4px; }
    .brand-meta { font-size: 12px; color: #475569; line-height: 1.5; }
    .doc-box { text-align: right; }
    .doc-type { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.6px; color: #fff; background: ${isPaid ? "#0f766e" : "#b45309"}; }
    .inv-num { font-size: 18px; font-weight: 800; color: #003b5c; margin: 8px 0 2px; font-family: ui-monospace, SFMono-Regular, monospace; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; }
    .panel { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; font-size: 12.5px; line-height: 1.55; }
    .panel h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; color: #64748b; }
    table.items { width: 100%; border-collapse: collapse; margin: 14px 0 18px; font-size: 13px; }
    table.items th { background: #003b5c; color: #fff; text-align: left; padding: 10px 12px; font-size: 11.5px; letter-spacing: 0.5px; text-transform: uppercase; }
    table.items td { padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-left: auto; width: 300px; font-size: 13.5px; }
    .totals tr td { padding: 5px 0; }
    .totals tr.grand td { border-top: 2px solid #003b5c; padding-top: 9px; font-size: 16px; font-weight: 800; color: #003b5c; }
    .bank { margin-top: 22px; padding: 15px 18px; border-radius: 8px; border: 1px solid #99f6e4; background: #f0fdfa; font-size: 12.5px; line-height: 1.55; }
    .bank h4 { margin: 0 0 8px; color: #003b5c; font-size: 13px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; gap: 12px; }
    .no-print { text-align: center; margin-bottom: 16px; }
    .no-print button { background: #007377; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-weight: 700; font-size: 14px; cursor: pointer; margin: 0 5px; }
    .no-print button.sec { background: #334155; }
    @media print { body { background: #fff; padding: 0; } .sheet { border: none; border-radius: 0; padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="sec" onclick="window.close()">Close Window</button>
  </div>
  <div class="sheet">
    <div class="watermark">${isPaid ? (inv.payment_status === "complimentary" ? "COMPLIMENTARY" : "PAID") : "PRO-FORMA"}</div>
    <div class="hdr">
      <div>
        <div class="brand-eyebrow">Wits School of Therapeutic Sciences · STHS EventHub</div>
        <div class="brand-title">${escHtml(b.institution_legal_name || "University of the Witwatersrand, Johannesburg — School of Therapeutic Sciences")}</div>
        <div class="brand-meta">
          ${escHtml(b.unit_name || "eFundanathi eZone (STHS)")}<br/>
          ${escHtml(b.billing_address || "Wits Education Campus, 27 St Andrews Road, Parktown, Johannesburg, 2193, South Africa")}<br/>
          Finance &amp; Enquiries: ${escHtml(b.finance_contact_email || "efundanathi@wits.ac.za")} · ${escHtml(b.finance_reference_note || "Public Higher Education Institution")}
        </div>
      </div>
      <div class="doc-box">
        <span class="doc-type">${escHtml(docLabel)}</span>
        <div class="inv-num">${escHtml(inv.invoice_number)}</div>
        <div class="brand-meta">
          Issued: <strong>${escHtml(issuedStr)}</strong><br/>
          ${paidStr ? `Paid Date: <strong style="color:#0f766e;">${escHtml(paidStr)}</strong><br/>` : ""}
          ${inv.payment_reference ? `Payment Ref: <code>${escHtml(inv.payment_reference)}</code>` : ""}
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="panel">
        <h4>Billed To (Delegate / Institution)</h4>
        <strong>${escHtml(inv.billing_name || "Registered Delegate")}</strong><br/>
        ${escHtml(inv.billing_organization || "University / Partner Institution")}<br/>
        Email: ${escHtml(inv.billing_email || "")}<br/>
        ${inv.billing_vat_or_po ? `PO / VAT Reference: <strong>${escHtml(inv.billing_vat_or_po)}</strong>` : ""}
      </div>
      <div class="panel">
        <h4>Symposium Details</h4>
        <strong>${escHtml(state.activeEventTitle || "GO Game-On! Symposium 2027")}</strong><br/>
        Dates: <strong>11–12 March 2027</strong><br/>
        Venue: eFundanathi eZone, Wits Education Campus &amp; Online<br/>
        Attendance Mode: <strong>${inv.attendance_mode === "online" ? "Online (Zoom & MS Teams)" : "In-Person + Online Hybrid"}</strong>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit Price (ZAR)</th>
          <th class="num">Total (ZAR)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${escHtml(inv.tier_name)}</strong><br/>
            <span style="font-size:11.5px;color:#64748b;">GO Game-On! Symposium 2027 · Full program access, digital pass, and proceedings</span>
          </td>
          <td class="num">1</td>
          <td class="num">${formatZar(inv.amount_zar)}</td>
          <td class="num"><strong>${formatZar(inv.amount_zar)}</strong></td>
        </tr>
      </tbody>
    </table>

    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${formatZar(inv.amount_zar)}</td></tr>
      <tr><td>VAT (Higher Education Institution)</td><td class="num">R 0.00</td></tr>
      <tr class="grand"><td>${isPaid ? "Total Paid (ZAR)" : "Amount Due (ZAR)"}</td><td class="num">${formatZar(inv.amount_zar)}</td></tr>
    </table>

    ${
      !isPaid
        ? `<div class="bank">
            <h4>Institutional EFT / Bank Transfer Details (South Africa)</h4>
            Bank: <strong>${escHtml(b.bank_name || "First National Bank (FNB)")}</strong> · Account Holder: <strong>${escHtml(b.account_holder || "University of the Witwatersrand")}</strong><br/>
            Account Number: <strong>${escHtml(b.account_number || "")}</strong> · Branch Code: <strong>${escHtml(b.branch_code || "250655")}</strong> · SWIFT: <strong>${escHtml(b.swift_code || "FIRNZAJJ")}</strong><br/>
            Cost Centre / Event Code: <strong>${escHtml(b.cost_centre_reference || "GO2027-STHS")}</strong> · <strong>Mandatory Payment Reference: ${escHtml(inv.invoice_number)}</strong><br/>
            <span style="font-size:11.5px;color:#334155;">${escHtml(b.invoice_terms || "")}</span>
          </div>`
        : `<div class="bank" style="background:#ecfdf5;border-color:#6ee7b7;">
            <h4>✓ Payment Confirmed — Official Receipt</h4>
            This document confirms full settlement of <strong>${formatZar(inv.amount_zar)}</strong> via <strong style="text-transform:uppercase;">${escHtml(inv.payment_method)}</strong>${inv.payment_reference ? ` (Reference: <strong>${escHtml(inv.payment_reference)}</strong>)` : ""}. Please present your Digital QR Pass at eFundanathi eZone check-in or join online via the live symposium portal.
          </div>`
    }

    <div class="footer">
      <span>Generated via Wits STHS EventHub · https://witsezone.github.io/sthsevent/game-on-symposium-2027/</span>
      <span>Contact: ${escHtml(b.finance_contact_email || "efundanathi@wits.ac.za")}</span>
    </div>
  </div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=960");
    if (!win) {
      window.STHS_DB.showToast("Please allow pop-ups in your browser to download/print your PDF invoice.", "⚠️");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  async function openInvoiceModal() {
    ensureModalsInDom();
    const modal = document.getElementById("sthsInvoiceModal");
    const body = document.getElementById("sthsInvoiceBody");

    if (!state.user) {
      openAuthModal("signup");
      return;
    }

    if (!state.ticketTiers.length && state.activeEventId) {
      await loadEventBillingData();
    }

    const sb = window.STHS_DB?.getClient();
    // Auto-issue a default invoice if signed-in user registered earlier without one
    if (sb && state.activeEventId && !state.invoice && state.ticketTiers.length) {
      const compEligible = isOrganizer() || isReviewer();
      const defaultTier =
        (compEligible && state.ticketTiers.find((t) => t.is_complimentary)) ||
        state.ticketTiers.find((t) => !t.requires_organizer_role) ||
        state.ticketTiers[0];
      if (defaultTier) {
        const { data: rpcRes } = await sb.rpc("create_or_get_my_invoice", {
          p_event_id: state.activeEventId,
          p_tier_id: defaultTier.id,
          p_payment_method: defaultTier.is_complimentary ? "complimentary" : "eft",
          p_billing_org: state.profile?.university || "",
          p_billing_po: ""
        });
        if (rpcRes?.ok && rpcRes.invoice) {
          state.invoice = rpcRes.invoice;
        }
      }
    }

    const inv = state.invoice;
    const b = state.billingSettings || {};
    const isPaid = inv && ["paid", "complimentary"].includes(inv.payment_status);
    const selectableTiers = getSelectableTiers(isOrganizer() || isReviewer());

    if (!inv) {
      body.innerHTML = `<div class="sths-alert sths-alert-info">Registration billing tiers are being finalized by the Organizing Committee. Please check back shortly.</div>`;
      modal.classList.add("open");
      return;
    }

    body.innerHTML = `
      <div style="background:#f8fafc; border:1.5px solid #dbe4ee; border-radius:12px; padding:0.95rem 1.05rem; margin-bottom:0.95rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
          <div>
            <div style="font-size:0.72rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Invoice Number</div>
            <div style="font-family:var(--font-mono); font-weight:800; font-size:1.05rem; color:#003b5c;">${escHtml(inv.invoice_number)}</div>
          </div>
          ${paymentBadgeHtml(inv.payment_status)}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:0.5rem; border-top:1px solid #e2e8f0; padding-top:0.55rem;">
          <div style="font-size:0.86rem; font-weight:700; color:#1e293b;">${escHtml(inv.tier_name)}</div>
          <div style="font-size:1.25rem; font-weight:900; color:#003b5c;">${formatZar(inv.amount_zar)}</div>
        </div>
        ${inv.payment_reference ? `<div style="font-size:0.78rem; color:#0f766e; margin-top:0.35rem;">Payment Reference: <code>${escHtml(inv.payment_reference)}</code></div>` : ""}
      </div>

      ${
        !isPaid
          ? `
        <details style="margin-bottom:0.9rem; background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; padding:0.65rem 0.85rem;">
          <summary style="cursor:pointer; font-size:0.82rem; font-weight:700; color:#003b5c;">✏️ Change Registration Tier or PO / VAT Reference</summary>
          <form id="sthsUpdateInvoiceTierForm" style="margin-top:0.7rem; display:flex; flex-direction:column; gap:0.6rem;">
            <div>
              <label class="sths-label" for="invSwitchTierSel">Registration Pass</label>
              <select id="invSwitchTierSel" class="sths-select">
                ${selectableTiers
                  .map((t) => `<option value="${t.id}" ${t.id === inv.tier_id ? "selected" : ""}>${escHtml(t.name)} — ${t.price_zar > 0 ? formatZar(t.price_zar) : "Complimentary"}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="sths-form-row">
              <div>
                <label class="sths-label" for="invSwitchOrgInput">Billed Institution</label>
                <input id="invSwitchOrgInput" type="text" class="sths-input" value="${escHtml(inv.billing_organization || state.profile?.university || "")}" />
              </div>
              <div>
                <label class="sths-label" for="invSwitchPoInput">PO / VAT Number</label>
                <input id="invSwitchPoInput" type="text" class="sths-input" value="${escHtml(inv.billing_vat_or_po || "")}" placeholder="Optional PO #" />
              </div>
            </div>
            <button type="submit" class="sths-btn sths-btn-outline sths-btn-sm">Update Pro-Forma Invoice</button>
          </form>
        </details>

        <!-- Option 1: PayFast Online Checkout -->
        <div style="background:#f0fdfa; border:1.5px solid #99f6e4; border-radius:12px; padding:0.9rem 1rem; margin-bottom:0.85rem;">
          <div style="font-weight:800; color:#003b5c; font-size:0.9rem; margin-bottom:0.3rem;">💳 Option 1 · Instant Online Payment (PayFast)</div>
          <p style="font-size:0.8rem; color:#334155; margin:0 0 0.65rem;">Pay securely with Visa, Mastercard, Instant EFT, Apple Pay, or Samsung Pay. Your official PAID Tax Invoice is issued automatically.</p>
          <button type="button" class="sths-btn sths-btn-primary" id="sthsPayFastBtn" style="width:100%;">Pay ${formatZar(inv.amount_zar)} Online with PayFast →</button>
          <div id="sthsPayFastStatus" style="margin-top:0.5rem;"></div>
        </div>

        <!-- Option 2: Institutional EFT / Purchase Order -->
        <div style="background:#fffbeb; border:1.5px solid #fde68a; border-radius:12px; padding:0.9rem 1rem; margin-bottom:0.95rem;">
          <div style="font-weight:800; color:#78350f; font-size:0.9rem; margin-bottom:0.35rem;">🏦 Option 2 · Institutional Bank EFT / University Purchase Order</div>
          <div style="font-size:0.79rem; color:#451a03; line-height:1.55; margin-bottom:0.65rem;">
            <strong>Bank:</strong> ${escHtml(b.bank_name || "First National Bank (FNB)")}<br/>
            <strong>Account Holder:</strong> ${escHtml(b.account_holder || "University of the Witwatersrand")}<br/>
            <strong>Account Number:</strong> ${escHtml(b.account_number || "")} · <strong>Branch:</strong> ${escHtml(b.branch_code || "250655")}<br/>
            <strong>Mandatory Reference:</strong> <code style="font-weight:800; color:#003b5c;">${escHtml(inv.invoice_number)}</code>
          </div>
          <form id="sthsUploadPopForm" style="display:flex; flex-direction:column; gap:0.55rem;">
            <label class="sths-label" for="sthsPopFileInput" style="margin-bottom:0;">Upload Proof of Payment (PoP) or University Purchase Order (PDF / PNG / JPG)</label>
            <input id="sthsPopFileInput" type="file" class="sths-input" accept=".pdf,.png,.jpg,.jpeg,.webp" required />
            <button type="submit" class="sths-btn sths-btn-outline sths-btn-sm" id="sthsUploadPopBtn">📤 Submit Proof of Payment for Finance Verification</button>
          </form>
          ${inv.pop_file_name ? `<div style="font-size:0.78rem; color:#1d4ed8; font-weight:700; margin-top:0.45rem;">✓ Submitted: ${escHtml(inv.pop_file_name)} (awaiting Wits Finance verification)</div>` : ""}
        </div>
      `
          : `
        <div class="sths-alert sths-alert-success" style="margin-bottom:0.95rem;">
          <strong>✓ Registration Paid &amp; Confirmed!</strong> Your official PAID Tax Invoice &amp; Receipt is ready to download or print below.
        </div>
      `
      }

      <div style="display:flex; gap:0.55rem; flex-wrap:wrap;">
        <button type="button" class="sths-btn sths-btn-primary" id="sthsPrintInvoiceBtn" style="flex:1; min-width:190px;">
          🖨️ ${isPaid ? "Download / Print PAID Invoice (PDF)" : "Download / Print Pro-Forma Invoice (PDF)"}
        </button>
        <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" id="sthsEmailInvoiceBtn">✉️ Email Copy</button>
        <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" id="sthsDownloadIcsBtn">📅 Add to Calendar</button>
      </div>
    `;

    modal.classList.add("open");

    document.getElementById("sthsPrintInvoiceBtn")?.addEventListener("click", () => {
      printInvoiceDocument(state.invoice, state.billingSettings);
    });

    document.getElementById("sthsDownloadIcsBtn")?.addEventListener("click", () => {
      downloadSymposiumIcs();
      window.STHS_DB.showToast("Symposium calendar invite (.ics) downloaded!", "📅");
    });

    document.getElementById("sthsEmailInvoiceBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        const { data, error } = await sb.functions.invoke("send-sths-email", {
          body: {
            type: isPaid ? "payment_receipt" : "registration_confirmed",
            event_id: state.activeEventId,
            invoice_id: inv.id
          }
        });
        if (error) throw error;
        if (data?.sent) {
          window.STHS_DB.showToast(`Confirmation & invoice emailed to ${data.to} from efundanathi@wits.ac.za!`, "✉️");
        } else {
          window.STHS_DB.showToast("Automated Wits email dispatch is being activated by IT. You can download your PDF invoice directly right now.", "ℹ️");
        }
      } catch (err) {
        window.STHS_DB.showToast(err.message || "Could not send email copy.", "⚠️");
      } finally {
        btn.disabled = false;
        btn.textContent = "✉️ Email Copy";
      }
    });

    document.getElementById("sthsUpdateInvoiceTierForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newTierId = document.getElementById("invSwitchTierSel").value;
      const newOrg = document.getElementById("invSwitchOrgInput").value.trim();
      const newPo = document.getElementById("invSwitchPoInput").value.trim();
      const { data: rpcRes, error } = await sb.rpc("create_or_get_my_invoice", {
        p_event_id: state.activeEventId,
        p_tier_id: newTierId,
        p_payment_method: inv.payment_method || "eft",
        p_billing_org: newOrg,
        p_billing_po: newPo
      });
      if (error || !rpcRes?.ok) {
        window.STHS_DB.showToast(error?.message || rpcRes?.error || "Could not update invoice.", "⚠️");
        return;
      }
      state.invoice = rpcRes.invoice;
      await refreshUserContext();
      window.STHS_DB.showToast("Invoice updated!", "✅");
      openInvoiceModal();
    });

    document.getElementById("sthsPayFastBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const statusBox = document.getElementById("sthsPayFastStatus");
      btn.disabled = true;
      btn.textContent = "Connecting to PayFast…";
      try {
        const { data, error } = await sb.functions.invoke("payfast-checkout", {
          body: { invoice_id: inv.id }
        });
        if (error) throw error;
        if (data?.ok && data.action_url && data.fields) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = data.action_url;
          Object.entries(data.fields).forEach(([k, v]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = k;
            input.value = String(v);
            form.appendChild(input);
          });
          document.body.appendChild(form);
          form.submit();
          return;
        }
        statusBox.innerHTML = `<div class="sths-alert sths-alert-warn" style="font-size:0.79rem;margin:0;">${escHtml(data?.message || "Online PayFast checkout is not yet active. Please use Institutional EFT below.")}</div>`;
      } catch (err) {
        statusBox.innerHTML = `<div class="sths-alert sths-alert-error" style="font-size:0.79rem;margin:0;">${escHtml(err.message || "PayFast checkout error.")}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = `Pay ${formatZar(inv.amount_zar)} Online with PayFast →`;
      }
    });

    document.getElementById("sthsUploadPopForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = document.getElementById("sthsPopFileInput")?.files?.[0];
      if (!file) return;
      const btn = document.getElementById("sthsUploadPopBtn");
      btn.disabled = true;
      btn.textContent = "Uploading Proof of Payment…";
      try {
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const storagePath = `${state.user.id}/proof-of-payment/${safeName}`;
        const { error: upErr } = await sb.storage.from("event-submissions").upload(storagePath, file, { upsert: true });
        if (upErr) throw upErr;

        const { error: updErr } = await sb
          .from("registration_invoices")
          .update({
            payment_method: inv.payment_method === "purchase_order" ? "purchase_order" : "eft",
            pop_file_url: storagePath,
            pop_file_name: file.name
          })
          .eq("id", inv.id);
        if (updErr) throw updErr;

        await refreshUserContext();
        window.STHS_DB.showToast("Proof of Payment uploaded! Wits Finance will verify and issue your official PAID receipt.", "✅");
        openInvoiceModal();
      } catch (err) {
        window.STHS_DB.showToast(err.message || "Upload failed.", "⚠️");
        btn.disabled = false;
        btn.textContent = "📤 Submit Proof of Payment for Finance Verification";
      }
    });
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
    loadEventBillingData,
    subscribe,
    openAuthModal,
    openQrBadgeModal,
    openInvoiceModal,
    printInvoiceDocument,
    downloadSymposiumIcs,
    formatZar,
    paymentBadgeHtml,
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
