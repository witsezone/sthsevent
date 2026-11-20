/**
 * STHS EventHub — Main Umbrella Landing Page Controller
 * Loads official Wits School of Therapeutic Sciences events from Supabase when linked,
 * while maintaining the official STHS events catalog immediately for public discovery.
 */
(function () {
  const OFFICIAL_STHS_EVENTS = [
    {
      id: "official-gameon-2027",
      slug: "game-on-symposium-2027",
      title: "GO Game-On! Symposium 2027",
      tagline: "Playing Our Stories: Educational, Digital & Traditional Games for Learning, Teaching and Community",
      description:
        "Flagship hybrid symposium hosted by Wits University, School of Therapeutic Sciences & eFundanathi eZone, supported by ZAG and DiGRA South Africa. Features 4 peer-reviewed tracks, hybrid Zoom/MS Teams stages, Playtest Expo, Amazing Race, Scavenger Hunt, and interactive 3D Sponsorship Prospectus.",
      department: "eFundanathi eZone & Cross-School",
      host_unit: "Wits School of Therapeutic Sciences & eFundanathi eZone",
      venue: "eFundanathi eZone, Wits Education Campus & Online",
      start_date: "2027-03-11",
      end_date: "2027-03-12",
      date_label: "11–12 March 2027",
      format: "Hybrid (In-Person + Zoom & MS Teams)",
      status: "registration_open",
      site_path: "./game-on-symposium-2027/",
      accent_color: "#17787e",
      contact_email: "help.efundanathi@wits.ac.za",
      contact_phone: "+27 11 717 3259",
      is_featured: true
    },
    {
      id: "official-sths-research-day",
      slug: "sths-biennial-research-day-2027",
      title: "STHS Biennial Research Day 2027",
      tagline: "Advancing Resilient Health Systems & Interprofessional Clinical Research in Africa",
      description:
        "The School of Therapeutic Sciences flagship biennial showcase bringing together postgraduate researchers, clinicians, NRF-rated scientists, and community health leaders across all 5 STHS departments for oral tracks, poster exhibitions, and clinical roundtables.",
      department: "All 5 STHS Departments",
      host_unit: "Wits School of Therapeutic Sciences Research Committee",
      venue: "Wits Education Campus & Health Sciences Auditorium, Parktown",
      start_date: "2027-08-26",
      end_date: "2027-08-27",
      date_label: "26–27 August 2027",
      format: "Hybrid (In-Person + MS Teams)",
      status: "upcoming",
      site_path: "",
      accent_color: "#007377",
      contact_email: "efundanathi.ezone@wits.ac.za",
      contact_phone: "+27 11 717 3259",
      is_featured: false
    },
    {
      id: "official-health-innovation-fair",
      slug: "health-sciences-innovation-fair-2027",
      title: "Wits Health Sciences Innovation Fair & BioHub Showcase",
      tagline: "From Bench, Clinic & BioHub to Community Health Impact",
      description:
        "Transdisciplinary showcase featuring WADDP advanced drug delivery, CENTRIC nanopharmaceutical research, clinical simulation technologies, and student health innovations across the Faculty of Health Sciences.",
      department: "Pharmacy & Pharmacology · BioHub",
      host_unit: "Wits Faculty of Health Sciences & School of Therapeutic Sciences",
      venue: "Wits Health Sciences BioHub, Parktown & Zoom",
      start_date: "2027-05-20",
      end_date: "2027-05-20",
      date_label: "20 May 2027",
      format: "Hybrid (In-Person + Zoom)",
      status: "upcoming",
      site_path: "",
      accent_color: "#003B5C",
      contact_email: "efundanathi.ezone@wits.ac.za",
      contact_phone: "+27 11 717 1000",
      is_featured: false
    },
    {
      id: "official-ipe-colloquium",
      slug: "ipe-clinical-simulation-colloquium-2027",
      title: "Interprofessional Education (IPE) & Clinical Simulation Colloquium",
      tagline: "Collaborative Patient-Centred Training Across Therapeutic Professions",
      description:
        "Joint academic colloquium led by Nursing Education, Physiotherapy, and Occupational Therapy exploring multidisciplinary clinical learning groups, patient safety simulations, and community health outreach.",
      department: "Nursing Education · Physiotherapy · Occupational Therapy",
      host_unit: "Wits STHS Interprofessional Education Working Group",
      venue: "Parktown Health Sciences Campus & MS Teams",
      start_date: "2027-06-17",
      end_date: "2027-06-18",
      date_label: "17–18 June 2027",
      format: "Hybrid (In-Person + MS Teams)",
      status: "upcoming",
      site_path: "",
      accent_color: "#006d72",
      contact_email: "efundanathi.ezone@wits.ac.za",
      contact_phone: "+27 11 717 1000",
      is_featured: false
    },
    {
      id: "official-essm-summit",
      slug: "essm-activity-advocates-summit-2027",
      title: "ESSM Activity Advocates & Sports Medicine Summit",
      tagline: "Exercise Is Medicine: Prescribing Physical Activity for Health & Recovery",
      description:
        "Hosted by the Department of Exercise Science & Sports Medicine (ESSM) and Wits Sports Clinic — connecting sports physicians, biokineticists, oncology exercise researchers, and South Africa's Activity Advocates chapter.",
      department: "Exercise Science & Sports Medicine (ESSM)",
      host_unit: "Department of Exercise Science & Sports Medicine · Wits Sports Clinic",
      venue: "Wits Education Campus & Zylstra Sports Complex",
      start_date: "2027-09-16",
      end_date: "2027-09-17",
      date_label: "16–17 September 2027",
      format: "Hybrid (In-Person + Zoom)",
      status: "upcoming",
      site_path: "",
      accent_color: "#c59627",
      contact_email: "efundanathi.ezone@wits.ac.za",
      contact_phone: "+27 11 717 1000",
      is_featured: false
    }
  ];

  let allEvents = [...OFFICIAL_STHS_EVENTS];
  let activeDeptFilter = "ALL";
  let searchQuery = "";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function startCountdown() {
    const target = new Date("2027-03-11T08:30:00+02:00").getTime();
    function tick() {
      const diff = Math.max(0, target - Date.now());
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const d = document.getElementById("hubCdDays");
      if (!d) return;
      d.textContent = String(days);
      document.getElementById("hubCdHours").textContent = String(hours).padStart(2, "0");
      document.getElementById("hubCdMins").textContent = String(mins).padStart(2, "0");
      document.getElementById("hubCdSecs").textContent = String(secs).padStart(2, "0");
    }
    tick();
    setInterval(tick, 1000);
  }

  function downloadEventIcs(ev) {
    const startStr = (ev.start_date || "2027-03-11").replace(/-/g, "") + "T083000";
    const endStr = (ev.end_date || ev.start_date || "2027-03-12").replace(/-/g, "") + "T163000";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Wits STHS EventHub//EN",
      "BEGIN:VEVENT",
      `UID:${ev.slug}@sthsevent.wits.ac.za`,
      `DTSTART;TZID=Africa/Johannesburg:${startStr}`,
      `DTEND;TZID=Africa/Johannesburg:${endStr}`,
      `SUMMARY:${ev.title}`,
      `LOCATION:${ev.venue}`,
      `DESCRIPTION:${ev.tagline} — ${ev.host_unit}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${ev.slug}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.STHS_DB.showToast(`Calendar file downloaded for ${ev.title}`, "📅");
  }

  async function loadEventsFromSupabase() {
    const sb = window.STHS_DB?.getClient();
    if (!sb) return;
    const { data, error } = await sb
      .from("events")
      .select("*")
      .eq("is_published", true)
      .order("is_featured", { ascending: false })
      .order("start_date", { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      allEvents = data;
      renderEvents();
    }
  }

  function renderEvents() {
    const grid = document.getElementById("hubEventsGrid");
    const countLabel = document.getElementById("hubEventsCountLabel");
    if (!grid) return;

    const q = searchQuery.toLowerCase().trim();
    const filtered = allEvents.filter((ev) => {
      const deptMatch =
        activeDeptFilter === "ALL" ||
        (ev.department || "").toLowerCase().includes(activeDeptFilter.toLowerCase()) ||
        (ev.host_unit || "").toLowerCase().includes(activeDeptFilter.toLowerCase());
      const textMatch =
        !q ||
        `${ev.title} ${ev.tagline} ${ev.description} ${ev.department} ${ev.venue}`.toLowerCase().includes(q);
      return deptMatch && textMatch;
    });

    if (countLabel) {
      countLabel.textContent = `Showing ${filtered.length} of ${allEvents.length} school events`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1; background:#fff; border:1.5px dashed var(--border-strong); border-radius:18px; padding:2.5rem; text-align:center;">
          <strong style="color:var(--wits-navy);">No matching STHS events found.</strong>
          <p style="font-size:0.88rem; color:var(--text-muted); margin:0.4rem 0 0;">Try clearing your filter or search terms.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered
      .map((ev) => {
        const hasLiveSubsite = Boolean(ev.site_path && ev.site_path.startsWith("./"));
        const isOpen = ev.status === "registration_open" || ev.status === "active";
        const statusLabel = ev.status === "active" ? "Live Now" : isOpen ? "Registration Open" : "Upcoming 2027";
        return `
          <article class="hub-event-card ${ev.is_featured ? "featured" : ""}">
            <div class="hub-event-accent" style="background:${escapeHtml(ev.accent_color || "#007377")};"></div>
            <div class="hub-event-body">
              <div class="hub-event-top-row">
                <span class="hub-status-pill ${isOpen ? "open" : "upcoming"}">${statusLabel}</span>
                <span class="hub-event-date">📅 ${escapeHtml(ev.date_label)}</span>
              </div>
              <h3 class="hub-event-title">${escapeHtml(ev.title)}</h3>
              <div class="hub-event-dept">${escapeHtml(ev.department)}</div>
              <p class="hub-event-desc">${escapeHtml(ev.tagline || ev.description)}</p>
              <div class="hub-event-meta-list">
                <span>📍 ${escapeHtml(ev.venue)}</span>
                <span>📡 ${escapeHtml(ev.format)}</span>
              </div>
              <div class="hub-event-actions">
                ${
                  hasLiveSubsite
                    ? `<a href="${escapeHtml(ev.site_path)}" class="sths-btn sths-btn-primary sths-btn-sm" style="flex:1;">Enter Event Site →</a>`
                    : `<button type="button" class="sths-btn sths-btn-navy sths-btn-sm" data-open-event-detail="${escapeHtml(ev.slug)}" style="flex:1;">View Event &amp; Register</button>`
                }
                <button type="button" class="sths-btn sths-btn-outline sths-btn-sm" data-ics-slug="${escapeHtml(ev.slug)}" title="Add to Calendar (.ICS)">.ICS</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-open-event-detail]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = allEvents.find((item) => item.slug === btn.dataset.openEventDetail);
        if (ev) openEventDetailModal(ev);
      });
    });

    grid.querySelectorAll("[data-ics-slug]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = allEvents.find((item) => item.slug === btn.dataset.icsSlug);
        if (ev) downloadEventIcs(ev);
      });
    });
  }

  function openEventDetailModal(ev) {
    const modal = document.getElementById("hubEventDetailModal");
    document.getElementById("hubDetailBadge").textContent = ev.date_label;
    document.getElementById("hubDetailTitle").textContent = ev.title;
    document.getElementById("hubDetailDept").textContent = `${ev.department} · ${ev.host_unit}`;

    document.getElementById("hubDetailBody").innerHTML = `
      <p style="font-size:0.95rem; font-weight:700; color:var(--sths-teal-dark); margin:0 0 0.65rem;">${escapeHtml(ev.tagline)}</p>
      <p style="font-size:0.9rem; color:var(--text-secondary); margin:0 0 1.2rem; line-height:1.65;">${escapeHtml(ev.description)}</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:0.7rem; background:var(--surface-canvas); border:1px solid var(--border-light); border-radius:14px; padding:1rem; margin-bottom:1.25rem; font-size:0.84rem;">
        <div><strong>Dates:</strong><br/>${escapeHtml(ev.date_label)}</div>
        <div><strong>Venue:</strong><br/>${escapeHtml(ev.venue)}</div>
        <div><strong>Format:</strong><br/>${escapeHtml(ev.format)}</div>
        <div><strong>Event Desk:</strong><br/><a href="mailto:${escapeHtml(ev.contact_email)}" style="color:var(--sths-teal-dark); font-weight:700;">${escapeHtml(ev.contact_email)}</a></div>
      </div>
      <div style="display:flex; gap:0.7rem; flex-wrap:wrap;">
        <button type="button" class="sths-btn sths-btn-primary" id="hubRegisterInterestBtn">Register / RSVP with My Account</button>
        <button type="button" class="sths-btn sths-btn-outline" id="hubDetailIcsBtn">📅 Add to Calendar (.ICS)</button>
        <a href="mailto:${escapeHtml(ev.contact_email)}?subject=${encodeURIComponent(ev.title + " Enquiry")}" class="sths-btn sths-btn-outline">✉️ Email Organizers</a>
      </div>
    `;

    modal.classList.add("open");
    document.getElementById("hubDetailIcsBtn")?.addEventListener("click", () => downloadEventIcs(ev));
    document.getElementById("hubRegisterInterestBtn")?.addEventListener("click", async () => {
      if (!window.STHS_AUTH.requireAuth("register for this STHS event")) return;
      const sb = window.STHS_DB.getClient();
      const authState = window.STHS_AUTH.getState();
      // Only write to Supabase if event has a real UUID from Postgres
      if (!/^[0-9a-f-]{36}$/i.test(ev.id)) {
        window.STHS_DB.showToast("Please run supabase/seed_sths_events.sql so this event has a live database ID.", "ℹ️");
        return;
      }
      const { error } = await sb.from("event_registrations").upsert(
        {
          event_id: ev.id,
          user_id: authState.user.id,
          role: "delegate",
          attendance_mode: "in_person"
        },
        { onConflict: "event_id,user_id" }
      );
      if (error) window.STHS_DB.showToast(error.message, "⚠️");
      else {
        window.STHS_DB.showToast(`You are registered for ${ev.title}!`, "🎉");
        modal.classList.remove("open");
      }
    });
  }

  function syncAuthUi(authState) {
    const labelEl = document.getElementById("hubUserLabel");
    const initEl = document.getElementById("hubUserInitials");
    const createBtn = document.getElementById("hubCreateEventBtn");
    const statusBtn = document.getElementById("hubSupabaseStatusBtn");

    if (statusBtn) {
      statusBtn.textContent = window.STHS_DB.isConfigured()
        ? "Supabase Connected · Production"
        : "Connect witsezone Supabase Backend";
    }

    if (authState.user) {
      const name = [authState.profile?.academic_title, authState.profile?.full_name].filter(Boolean).join(" ") || authState.user.email;
      if (labelEl) labelEl.textContent = name.split(" ").slice(0, 2).join(" ");
      if (initEl) initEl.textContent = window.STHS_AUTH.initialsFrom(authState.profile?.full_name, authState.user.email);
      if (createBtn) createBtn.style.display = window.STHS_AUTH.isOrganizer() ? "inline-flex" : "none";
    } else {
      if (labelEl) labelEl.textContent = "Sign In / Register";
      if (initEl) initEl.textContent = "→";
      if (createBtn) createBtn.style.display = "none";
    }
  }

  function bindHubEvents() {
    document.querySelectorAll("#hubDeptFilterChips .hub-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        activeDeptFilter = chip.dataset.dept;
        document.querySelectorAll("#hubDeptFilterChips .hub-chip").forEach((c) => c.classList.toggle("active", c === chip));
        renderEvents();
      });
    });

    document.querySelectorAll("[data-jump-dept]").forEach((card) => {
      card.addEventListener("click", () => {
        const target = card.dataset.jumpDept;
        const matchChip = document.querySelector(`#hubDeptFilterChips .hub-chip[data-dept="${target}"]`);
        if (matchChip) matchChip.click();
        document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
      });
    });

    document.getElementById("hubEventSearch")?.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderEvents();
    });

    document.getElementById("hubAccountBtn")?.addEventListener("click", () => window.STHS_AUTH.openAuthModal());
    document.getElementById("hubDockAccountBtn")?.addEventListener("click", () => window.STHS_AUTH.openAuthModal());
    document.getElementById("hubSupabaseStatusBtn")?.addEventListener("click", () => window.STHS_AUTH.openAuthModal());

    document.querySelectorAll("[data-close-hub-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(btn.dataset.closeHubModal)?.classList.remove("open");
      });
    });

    ["hubEventDetailModal", "hubCreateEventModal"].forEach((id) => {
      const m = document.getElementById(id);
      m?.addEventListener("click", (e) => {
        if (e.target === m) m.classList.remove("open");
      });
    });

    document.getElementById("hubCreateEventBtn")?.addEventListener("click", () => {
      document.getElementById("hubCreateEventModal")?.classList.add("open");
    });

    document.getElementById("hubCreateEventForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!window.STHS_AUTH.requireAuth("publish an STHS event")) return;
      const sb = window.STHS_DB.getClient();
      const user = window.STHS_AUTH.getState().user;
      const slug = document.getElementById("newEvSlug").value.trim().toLowerCase();
      const payload = {
        slug,
        title: document.getElementById("newEvTitle").value.trim(),
        department: document.getElementById("newEvDept").value,
        date_label: document.getElementById("newEvDateLabel").value.trim(),
        venue: document.getElementById("newEvVenue").value.trim(),
        status: document.getElementById("newEvStatus").value,
        tagline: document.getElementById("newEvTagline").value.trim(),
        description: document.getElementById("newEvDesc").value.trim(),
        subdomain_hint: `${slug}.sthsevent.wits.ac.za`,
        created_by: user.id
      };
      const { error } = await sb.from("events").insert(payload);
      if (error) {
        window.STHS_DB.showToast(error.message, "⚠️");
      } else {
        window.STHS_DB.showToast("New STHS event published live!", "🎉");
        document.getElementById("hubCreateEventForm").reset();
        document.getElementById("hubCreateEventModal").classList.remove("open");
        await loadEventsFromSupabase();
      }
    });
  }

  async function boot() {
    window.STHS_APP.init({ swPath: "./sw.js" });
    startCountdown();
    renderEvents();
    bindHubEvents();

    window.STHS_AUTH.subscribe(syncAuthUi);
    await window.STHS_AUTH.init({ eventId: null, eventTitle: "STHS EventHub" });
    await loadEventsFromSupabase();
  }

  boot();
})();
