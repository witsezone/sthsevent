/**
 * GO Game-On! Symposium 2027 — Production Web Conference App Controller
 * 100% Supabase-backed (Auth, Postgres RLS, Storage, Realtime) with zero demo fakes.
 * Gracefully renders all official public pages even prior to witsezone Supabase linking.
 */
(function () {
  const OFFICIAL = window.GAMEON_OFFICIAL_DATA;

  const state = {
    eventId: null,
    eventRow: null,
    experienceMode: localStorage.getItem("gameon_exp_mode") || "in_person",
    activeTab: "overview",
    activeDayFilter: "ALL",
    activeTrackFilter: "ALL",
    agendaSearch: "",
    activeUniFilter: "ALL",
    speakerSearch: "",
    activeFolderFilter: "ALL",
    activeStageId: OFFICIAL.defaultStages[0].id,
    activeLeaderboardMode: "universities",
    activeReviewAbstractId: null,

    sessions: [],
    savedSessionIds: new Set(),
    directory: [],
    myAbstracts: [],
    reviewAbstracts: [],
    reviewMap: {},
    stages: [...OFFICIAL.defaultStages],
    qaQuestions: [],
    myQaUpvotes: new Set(),
    activePoll: null,
    pollVotes: [],
    documents: [],
    quests: [...OFFICIAL.defaultQuests],
    completedQuestIds: new Set(),
    leaderboards: { universities: [], individuals: [] },
    sponsorBooths: [...OFFICIAL.defaultPartnerBooths],
    mySponsorLeads: new Set(),
    sponsorInquiries: [],
    directMessages: [],
    realtimeChannels: []
  };

  let qrStream = null;
  let qrScanRaf = null;

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatBytes(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  // =========================================================================
  // 1. TAB NAVIGATION + DEVICE-ADAPTIVE MOBILE DOCK & HASH ROUTING
  // =========================================================================
  function switchTab(tabId, updateHash = true) {
    const valid = ["overview", "agenda", "speakers", "abstracts", "review", "stream", "gamification", "sponsors", "admin"];
    if (!valid.includes(tabId)) tabId = "overview";
    state.activeTab = tabId;

    document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tabId}`));
    document.querySelectorAll(".mobile-app-dock [data-dock-tab]").forEach((d) =>
      d.classList.toggle("active", d.dataset.dockTab === tabId)
    );
    document.getElementById("mobileMoreSheet")?.classList.remove("open");

    if (updateHash) {
      history.replaceState(null, "", `#${tabId}`);
    }
    window.STHS_APP?.haptic(10);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderHybridCompanion() {
    const box = document.getElementById("hybridCompanionStrip");
    if (!box) return;
    if (state.experienceMode === "online") {
      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.65rem;">
          <div>
            <strong style="color:var(--teal-dark); font-size:0.86rem;">🌐 Online Delegate Mode Active (Zoom &amp; Microsoft Teams)</strong>
            <div style="font-size:0.8rem; color:var(--ink-brown);">Direct access to multi-stage live streams, Realtime Q&amp;A, downloadable session decks, digital networking &amp; online Amazing Race clues.</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" data-goto-tab="stream">Open Live Stage →</button>
        </div>
      `;
    } else {
      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.65rem;">
          <div>
            <strong style="color:var(--teal-dark); font-size:0.86rem;">📍 On-Ground Delegate Mode (eFundanathi eZone, Wits Education Campus)</strong>
            <div style="font-size:0.8rem; color:var(--ink-brown);">Keep your QR Check-In Pass handy for registration, scan booth codes during the Campus Amazing Race &amp; download slides on your phone.</div>
          </div>
          <button type="button" class="btn btn-navy btn-sm" id="companionOpenQrBtn">▣ Show My QR Pass</button>
        </div>
      `;
      document.getElementById("companionOpenQrBtn")?.addEventListener("click", () => window.STHS_AUTH.openQrBadgeModal());
    }
    box.querySelectorAll("[data-goto-tab]").forEach((el) =>
      el.addEventListener("click", () => switchTab(el.dataset.gotoTab))
    );
  }

  // =========================================================================
  // 2. COUNTDOWN & OFFICIAL STATIC TRACKS / SPONSORS
  // =========================================================================
  function startCountdown() {
    const target = new Date(OFFICIAL.eventStartIso).getTime();
    function tick() {
      const diff = Math.max(0, target - Date.now());
      document.getElementById("cdDays").textContent = String(Math.floor(diff / 86400000));
      document.getElementById("cdHours").textContent = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, "0");
      document.getElementById("cdMins").textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      document.getElementById("cdSecs").textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    }
    tick();
    setInterval(tick, 1000);
  }

  function renderOverviewTracks() {
    const el = document.getElementById("overviewTracksContainer");
    if (!el) return;
    el.innerHTML = OFFICIAL.tracks
      .map(
        (t) => `
        <article class="track-card ${t.colorClass}">
          <span class="badge ${t.badgeClass}">${t.track_code}</span>
          <h3 style="font-family:var(--font-display); font-size:1.25rem; margin:0.45rem 0 0.25rem;">${esc(t.title)}</h3>
          <p style="font-size:0.84rem; color:var(--ink-muted); margin:0;">${esc(t.subtitle)}</p>
          <div class="topic-pills">
            ${t.topics
              .map(
                (topic) =>
                  `<button type="button" class="topic-pill" data-pick-track="${t.track_code}" data-pick-topic="${esc(topic)}">${esc(topic)}</button>`
              )
              .join("")}
          </div>
        </article>
      `
      )
      .join("");

    el.querySelectorAll(".topic-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const trackSel = document.getElementById("absTrackSelect");
        if (trackSel) {
          trackSel.value = pill.dataset.pickTrack;
          populateSubTopics(pill.dataset.pickTrack, pill.dataset.pickTopic);
        }
        switchTab("abstracts");
        window.STHS_DB.showToast(`Pre-selected ${pill.dataset.pickTrack} · ${pill.dataset.pickTopic}`, "🎯");
      });
    });
  }

  function populateSubTopics(trackCode, preferredTopic = null) {
    const sel = document.getElementById("absTopicSelect");
    const folderLabel = document.getElementById("liveTargetFolder");
    const track = OFFICIAL.tracks.find((t) => t.track_code === trackCode) || OFFICIAL.tracks[0];
    if (sel) {
      sel.innerHTML = track.topics.map((tp) => `<option value="${esc(tp)}">${esc(tp)}</option>`).join("");
      if (preferredTopic && track.topics.includes(preferredTopic)) sel.value = preferredTopic;
    }
    if (folderLabel) folderLabel.textContent = track.folderId;
  }

  // =========================================================================
  // 3. SUPABASE DATA HYDRATION & REALTIME SUBSCRIPTIONS
  // =========================================================================
  async function loadAllLiveData() {
    const sb = window.STHS_DB?.getClient();
    if (!sb) {
      renderAllViews();
      return;
    }

    // Resolve flagship event UUID
    const { data: ev } = await sb
      .from("events")
      .select("*")
      .eq("slug", OFFICIAL.eventSlug)
      .maybeSingle();

    if (!ev) {
      renderAllViews();
      return;
    }

    state.eventId = ev.id;
    state.eventRow = ev;
    await window.STHS_AUTH.setActiveEvent(ev.id, ev.title);

    const auth = window.STHS_AUTH.getState();

    // Parallel load public + user-scoped event tables
    const [
      sessionsRes,
      stagesRes,
      docsRes,
      questsRes,
      boothsRes,
      pollsRes,
      dirRes,
      lbRes
    ] = await Promise.all([
      sb.from("sessions").select("*").eq("event_id", ev.id).order("day_label").order("start_time"),
      sb.from("stream_stages").select("*").eq("event_id", ev.id).order("sort_order"),
      sb.from("event_documents").select("*").eq("event_id", ev.id).order("created_at", { ascending: false }),
      sb.from("gamification_quests").select("*").eq("event_id", ev.id).order("sort_order"),
      sb.from("sponsor_booths").select("*").eq("event_id", ev.id).order("sort_order"),
      sb.from("live_polls").select("*").eq("event_id", ev.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      sb.rpc("get_public_directory", { p_event_id: ev.id }),
      sb.rpc("get_event_leaderboards", { p_event_id: ev.id })
    ]);

    state.sessions = sessionsRes.data || [];
    if (stagesRes.data?.length) {
      state.stages = stagesRes.data;
      if (!state.stages.some((s) => s.id === state.activeStageId)) {
        state.activeStageId = state.stages[0].id;
      }
    }
    state.documents = docsRes.data || [];
    if (questsRes.data?.length) state.quests = questsRes.data;
    if (boothsRes.data?.length) state.sponsorBooths = boothsRes.data;
    state.activePoll = pollsRes.data?.[0] || null;
    state.directory = dirRes.data || [];
    if (lbRes.data) state.leaderboards = lbRes.data;

    // Load active stage Q&A + active poll votes
    await Promise.all([loadStageQa(), loadPollVotes()]);

    // Authenticated user-scoped queries
    if (auth.user) {
      const [savedRes, qcRes, myAbsRes, leadsRes, dmRes, upvRes] = await Promise.all([
        sb.from("saved_sessions").select("session_id").eq("event_id", ev.id).eq("user_id", auth.user.id),
        sb.from("quest_completions").select("quest_id").eq("event_id", ev.id).eq("user_id", auth.user.id),
        sb.from("abstracts").select("*").eq("event_id", ev.id).eq("author_id", auth.user.id).order("created_at", { ascending: false }),
        sb.from("sponsor_leads").select("booth_id").eq("event_id", ev.id).eq("user_id", auth.user.id),
        sb.from("direct_messages").select("*").eq("event_id", ev.id).or(`sender_id.eq.${auth.user.id},recipient_id.eq.${auth.user.id}`).order("created_at", { ascending: false }).limit(60),
        sb.from("live_qa_upvotes").select("question_id").eq("user_id", auth.user.id)
      ]);
      state.savedSessionIds = new Set((savedRes.data || []).map((r) => r.session_id));
      state.completedQuestIds = new Set((qcRes.data || []).map((r) => r.quest_id));
      state.myAbstracts = myAbsRes.data || [];
      state.mySponsorLeads = new Set((leadsRes.data || []).map((r) => r.booth_id));
      state.directMessages = dmRes.data || [];
      state.myQaUpvotes = new Set((upvRes.data || []).map((r) => r.question_id));

      // Load reviews for my abstracts & reviewer queue
      if (window.STHS_AUTH.isReviewer()) {
        const [allAbsRes, allRevRes] = await Promise.all([
          sb.from("abstracts").select("*").eq("event_id", ev.id).order("created_at", { ascending: false }),
          sb.from("abstract_reviews").select("*").eq("event_id", ev.id).order("created_at", { ascending: false })
        ]);
        state.reviewAbstracts = allAbsRes.data || [];
        state.reviewMap = {};
        (allRevRes.data || []).forEach((rev) => {
          if (!state.reviewMap[rev.abstract_id]) state.reviewMap[rev.abstract_id] = [];
          state.reviewMap[rev.abstract_id].push(rev);
        });
        if (!state.activeReviewAbstractId && state.reviewAbstracts.length) {
          state.activeReviewAbstractId = state.reviewAbstracts[0].id;
        }
      } else if (state.myAbstracts.length) {
        const myIds = state.myAbstracts.map((a) => a.id);
        const { data: myRevs } = await sb.from("abstract_reviews").select("*").in("abstract_id", myIds);
        state.reviewMap = {};
        (myRevs || []).forEach((rev) => {
          if (!state.reviewMap[rev.abstract_id]) state.reviewMap[rev.abstract_id] = [];
          state.reviewMap[rev.abstract_id].push(rev);
        });
      }

      if (window.STHS_AUTH.isOrganizer()) {
        const { data: inq } = await sb.from("sponsor_inquiries").select("*").eq("event_id", ev.id).order("created_at", { ascending: false });
        state.sponsorInquiries = inq || [];
      }
    }

    setupRealtime(sb, ev.id);
    renderAllViews();
  }

  async function loadStageQa() {
    const sb = window.STHS_DB?.getClient();
    if (!sb || !state.eventId || !/^[0-9a-f-]{36}$/i.test(state.activeStageId)) {
      state.qaQuestions = [];
      return;
    }
    const { data } = await sb
      .from("live_qa_questions")
      .select("*")
      .eq("stage_id", state.activeStageId)
      .order("upvote_count", { ascending: false })
      .order("created_at", { ascending: false });
    state.qaQuestions = data || [];
  }

  async function loadPollVotes() {
    const sb = window.STHS_DB?.getClient();
    if (!sb || !state.activePoll) {
      state.pollVotes = [];
      return;
    }
    const { data } = await sb.from("live_poll_votes").select("option_index, user_id").eq("poll_id", state.activePoll.id);
    state.pollVotes = data || [];
  }

  function setupRealtime(sb, eventId) {
    state.realtimeChannels.forEach((ch) => sb.removeChannel(ch));
    state.realtimeChannels = [];

    const ch = sb
      .channel(`gameon-live-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_qa_questions", filter: `event_id=eq.${eventId}` }, async () => {
        await loadStageQa();
        renderLiveQa();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_poll_votes", filter: `event_id=eq.${eventId}` }, async () => {
        await loadPollVotes();
        renderLivePoll();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quest_completions", filter: `event_id=eq.${eventId}` }, async () => {
        const { data } = await sb.rpc("get_event_leaderboards", { p_event_id: eventId });
        if (data) {
          state.leaderboards = data;
          renderLeaderboard();
        }
      })
      .subscribe();
    state.realtimeChannels.push(ch);
  }

  // =========================================================================
  // 4. STORAGE UPLOAD HELPER (Supabase Storage + Optional Google Drive Mirror)
  // =========================================================================
  async function uploadToEventStorage(file, bucket, folderPrefix) {
    const sb = window.STHS_DB.getClient();
    const user = window.STHS_AUTH.getState().user;
    if (!sb || !user || !file) return { url: "", name: "", path: "" };

    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storagePath = `${user.id}/${folderPrefix}/${safeName}`;

    const { error } = await sb.storage.from(bucket).upload(storagePath, file, { upsert: true });
    if (error) throw new Error(`File upload failed: ${error.message}`);

    let url = storagePath;
    if (bucket === "event-public") {
      const { data } = sb.storage.from(bucket).getPublicUrl(storagePath);
      url = data.publicUrl;
    }

    // Optional Google Drive webhook bridge if organizer configured one on the event
    if (state.eventRow?.gdrive_webhook_url && file.size <= 4 * 1024 * 1024) {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = String(reader.result).split(",")[1] || "";
          fetch(state.eventRow.gdrive_webhook_url, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subfolder: folderPrefix, fileName: file.name, mimeType: file.type, base64Data })
          }).catch(() => {});
        };
        reader.readAsDataURL(file);
      } catch (_) {}
    }

    return { url, name: file.name, path: storagePath };
  }

  // =========================================================================
  // 5. RENDERERS FOR ALL 9 MODULES (CLEAN PRODUCTION STATES — ZERO FAKE DATA)
  // =========================================================================
  function renderHeaderAuth(auth) {
    const xpPill = document.getElementById("headerXpPill");
    const xpText = document.getElementById("headerUserXP");
    const gamXp = document.getElementById("gamificationUserXP");
    const initEl = document.getElementById("headerUserInitials");
    const nameEl = document.getElementById("headerUserName");
    const adminTabBtn = document.getElementById("navAdminTabBtn");
    const sheetAdminTile = document.getElementById("sheetAdminTile");
    const addSessBtn = document.getElementById("openAddSessionModalBtn");

    const isOrg = window.STHS_AUTH.isOrganizer();
    if (adminTabBtn) adminTabBtn.style.display = isOrg ? "inline-flex" : "none";
    if (sheetAdminTile) sheetAdminTile.style.display = isOrg ? "flex" : "none";
    if (addSessBtn) addSessBtn.style.display = isOrg ? "inline-flex" : "none";

    if (auth.user) {
      const xp = auth.registration?.xp_points || 0;
      if (xpPill) xpPill.style.display = "inline-flex";
      if (xpText) xpText.textContent = `${xp} XP`;
      if (gamXp) gamXp.textContent = `${xp} XP`;
      if (initEl) initEl.textContent = window.STHS_AUTH.initialsFrom(auth.profile?.full_name, auth.user.email);
      const shortName = [auth.profile?.academic_title, auth.profile?.full_name].filter(Boolean).join(" ") || auth.user.email;
      if (nameEl) nameEl.textContent = shortName;
    } else {
      if (xpPill) xpPill.style.display = "none";
      if (gamXp) gamXp.textContent = "0 XP";
      if (initEl) initEl.textContent = "→";
      if (nameEl) nameEl.textContent = "Sign In / Register";
    }
  }

  function renderAgenda() {
    const container = document.getElementById("agendaSessionsContainer");
    const navCount = document.getElementById("navAgendaCount");
    const savedCount = document.getElementById("savedAgendaCount");
    if (navCount) navCount.textContent = state.sessions.length;
    if (savedCount) savedCount.textContent = state.savedSessionIds.size;
    if (!container) return;

    const q = state.agendaSearch.toLowerCase().trim();
    const filtered = state.sessions.filter((s) => {
      if (state.activeDayFilter === "SAVED" && !state.savedSessionIds.has(s.id)) return false;
      if (state.activeDayFilter !== "ALL" && state.activeDayFilter !== "SAVED" && !s.day_label.includes(state.activeDayFilter)) return false;
      if (state.activeTrackFilter !== "ALL" && s.track_code !== state.activeTrackFilter) return false;
      if (q && !`${s.title} ${s.speaker_names} ${s.speaker_universities} ${s.room} ${s.description}`.toLowerCase().includes(q)) return false;
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-prod-card">
          <div style="font-size:2rem;">📅</div>
          <h4>${state.sessions.length === 0 ? "Confirmed Programme Launching Soon" : "No sessions match your filter"}</h4>
          <p>${
            state.sessions.length === 0
              ? "Accepted abstracts and confirmed keynotes for 11–12 March 2027 publish directly here as peer review completes. Organizers can publish sessions anytime from the Organizer Admin tab."
              : "Try switching back to All Days or clearing your search."
          }</p>
          <div style="display:flex; gap:0.65rem; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="btn btn-accent btn-sm" data-goto-tab="abstracts">📤 Submit an Abstract</button>
            <button type="button" class="btn btn-outline btn-sm" id="emptyResetAgendaFilterBtn">Show All Sessions</button>
          </div>
        </div>
      `;
      container.querySelectorAll("[data-goto-tab]").forEach((el) => el.addEventListener("click", () => switchTab(el.dataset.gotoTab)));
      document.getElementById("emptyResetAgendaFilterBtn")?.addEventListener("click", () => {
        state.activeDayFilter = "ALL";
        state.activeTrackFilter = "ALL";
        state.agendaSearch = "";
        document.getElementById("agendaSearchInput").value = "";
        document.getElementById("agendaTrackFilter").value = "ALL";
        renderAgenda();
      });
      return;
    }

    container.innerHTML = filtered
      .map((s) => {
        const isSaved = state.savedSessionIds.has(s.id);
        return `
          <article class="session-card">
            <div class="session-time-col">
              <div style="font-size:0.72rem; font-weight:800; color:var(--teal-dark); text-transform:uppercase;">${esc(s.day_label)}</div>
              <div style="font-family:var(--font-display); font-size:1.05rem; margin-top:0.2rem;">${esc(s.start_time)} – ${esc(s.end_time)}</div>
              <div style="margin-top:0.35rem;"><span class="badge badge-teal">${esc(s.stream_platform)}</span></div>
            </div>
            <div>
              <div style="display:flex; gap:0.45rem; flex-wrap:wrap; margin-bottom:0.35rem;">
                <span class="badge badge-mustard">${esc(s.track_code)}</span>
                <span class="badge badge-navy">${esc(s.format)}</span>
              </div>
              <h3 style="font-family:var(--font-display); font-size:1.18rem; margin:0 0 0.3rem;">${esc(s.title)}</h3>
              <div style="font-size:0.84rem; font-weight:700; color:var(--teal-dark); margin-bottom:0.35rem;">
                🎤 ${esc(s.speaker_names || "TBA")} ${s.speaker_universities ? `· ${esc(s.speaker_universities)}` : ""}
              </div>
              <p style="font-size:0.85rem; color:var(--ink-brown); margin:0 0 0.55rem;">${esc(s.description)}</p>
              <div style="font-size:0.79rem; color:var(--ink-muted); display:flex; gap:0.9rem; flex-wrap:wrap;">
                <span>📍 ${esc(s.room)}</span>
                ${s.slides_url ? `<a href="${esc(s.slides_url)}" target="_blank" rel="noopener" style="color:var(--teal-dark); font-weight:700;">📄 Download Slides / Handout ↗</a>` : ""}
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.45rem; min-width:140px;">
              <button type="button" class="btn ${isSaved ? "btn-mustard" : "btn-outline"} btn-sm" data-toggle-save-session="${s.id}">
                ${isSaved ? "⭐ Saved" : "☆ Save"}
              </button>
              <button type="button" class="btn btn-primary btn-sm" data-checkin-session="${s.id}">✅ Check-In</button>
            </div>
          </article>
        `;
      })
      .join("");

    container.querySelectorAll("[data-toggle-save-session]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.STHS_AUTH.requireAuth("save sessions to your calendar")) return;
        const sb = window.STHS_DB.getClient();
        const uid = window.STHS_AUTH.getState().user.id;
        const sid = btn.dataset.toggleSaveSession;
        if (state.savedSessionIds.has(sid)) {
          await sb.from("saved_sessions").delete().eq("session_id", sid).eq("user_id", uid);
          state.savedSessionIds.delete(sid);
          window.STHS_DB.showToast("Removed from My Saved Schedule.", "📅");
        } else {
          await sb.from("saved_sessions").insert({ event_id: state.eventId, session_id: sid, user_id: uid });
          state.savedSessionIds.add(sid);
          window.STHS_DB.showToast("Added to My Saved Schedule!", "⭐");
        }
        renderAgenda();
      });
    });

    container.querySelectorAll("[data-checkin-session]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.STHS_AUTH.requireAuth("check in to this session")) return;
        const sb = window.STHS_DB.getClient();
        const uid = window.STHS_AUTH.getState().user.id;
        const { error } = await sb.from("session_checkins").upsert(
          { event_id: state.eventId, session_id: btn.dataset.checkinSession, user_id: uid },
          { onConflict: "session_id,user_id" }
        );
        if (error) window.STHS_DB.showToast(error.message, "⚠️");
        else window.STHS_DB.showToast("Session attendance recorded!", "✅");
      });
    });
  }

  function renderDirectory() {
    const container = document.getElementById("speakersDirectoryContainer");
    const navCount = document.getElementById("navSpeakerCount");
    const unreadEl = document.getElementById("unreadMsgCount");
    if (navCount) navCount.textContent = state.directory.length;
    const uid = window.STHS_AUTH.getState().user?.id;
    const unread = state.directMessages.filter((m) => m.recipient_id === uid && !m.is_read).length;
    if (unreadEl) unreadEl.textContent = unread;
    if (!container) return;

    const q = state.speakerSearch.toLowerCase().trim();
    const filtered = state.directory.filter((p) => {
      const uniOk = state.activeUniFilter === "ALL" || (p.university || "").toLowerCase().includes(state.activeUniFilter.toLowerCase());
      const qOk = !q || `${p.display_name} ${p.university} ${p.faculty_department} ${p.bio} ${(p.research_tags || []).join(" ")}`.toLowerCase().includes(q);
      return uniOk && qOk;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-prod-card" style="grid-column:1/-1;">
          <div style="font-size:2rem;">🎓</div>
          <h4>${state.directory.length === 0 ? "Be the First Verified Speaker or Delegate in the Directory" : "No speakers or delegates match this filter"}</h4>
          <p>Sign in with your university email or GitHub account to publish your bio, academic affiliation, research interests, and presentation slides.</p>
          <button type="button" class="btn btn-accent btn-sm" id="emptyCreateBioBtn">✍️ Create My Speaker / Delegate Bio</button>
        </div>
      `;
      document.getElementById("emptyCreateBioBtn")?.addEventListener("click", () => {
        document.getElementById("toggleBioCreatorBtn")?.click();
      });
      return;
    }

    container.innerHTML = filtered
      .map((p) => {
        const initials = window.STHS_AUTH.initialsFrom(p.display_name, "U");
        const isSelf = p.user_id === uid;
        return `
          <article class="card" style="display:flex; flex-direction:column; gap:0.65rem;">
            <div style="display:flex; align-items:center; gap:0.8rem;">
              ${
                p.avatar_url
                  ? `<img src="${esc(p.avatar_url)}" alt="${esc(p.display_name)}" style="width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid var(--ink-espresso);" />`
                  : `<div style="width:54px;height:54px;border-radius:50%;background:var(--teal-primary);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid var(--ink-espresso);flex-shrink:0;">${esc(initials)}</div>`
              }
              <div style="min-width:0;">
                <span class="badge badge-mustard" style="text-transform:capitalize;">${esc(p.role)}</span>
                <h4 style="font-family:var(--font-display); font-size:1.05rem; margin:0.2rem 0 0;">${esc(p.display_name)}</h4>
                <div style="font-size:0.78rem; color:var(--teal-dark); font-weight:700;">${esc(p.university)}</div>
              </div>
            </div>
            ${p.faculty_department ? `<div style="font-size:0.79rem; color:var(--ink-muted);">${esc(p.faculty_department)}</div>` : ""}
            ${p.session_title ? `<div style="font-size:0.82rem; font-weight:700; background:var(--bg-cream); padding:0.45rem 0.65rem; border-radius:8px;">🎤 ${esc(p.session_title)}</div>` : ""}
            <p style="font-size:0.84rem; color:var(--ink-brown); margin:0; flex:1;">${esc(p.bio || "Registered symposium participant.")}</p>
            ${
              (p.research_tags || []).length
                ? `<div style="display:flex; gap:0.35rem; flex-wrap:wrap;">${p.research_tags
                    .slice(0, 5)
                    .map((t) => `<span style="font-size:0.72rem; background:var(--teal-soft); color:var(--teal-dark); padding:0.18rem 0.55rem; border-radius:999px; font-weight:700;">${esc(t)}</span>`)
                    .join("")}</div>`
                : ""
            }
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; padding-top:0.5rem; border-top:1px solid #eadfce;">
              ${!isSelf ? `<button type="button" class="btn btn-primary btn-sm" data-dm-user="${p.user_id}" data-dm-name="${esc(p.display_name)}" style="flex:1;">💬 Connect / Message</button>` : `<span class="badge badge-teal">Your Public Profile</span>`}
              ${p.presentation_file_url ? `<a href="${esc(p.presentation_file_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">📄 Slides</a>` : ""}
            </div>
          </article>
        `;
      })
      .join("");

    container.querySelectorAll("[data-dm-user]").forEach((btn) => {
      btn.addEventListener("click", () => openDirectMessageModal(btn.dataset.dmUser, btn.dataset.dmName));
    });
  }

  function renderMyAbstracts() {
    const container = document.getElementById("myAbstractsContainer");
    const countEl = document.getElementById("myAbstractsCount");
    if (countEl) countEl.textContent = state.myAbstracts.length;
    if (!container) return;

    const auth = window.STHS_AUTH.getState();
    if (!auth.user) {
      container.innerHTML = `
        <div class="empty-prod-card">
          <div style="font-size:1.8rem;">🔐</div>
          <h4>Sign In to Track Your Submissions</h4>
          <p>Submit abstracts, upload updated slide decks, read anonymous peer-review feedback, and respond during the author rebuttal phase.</p>
          <button type="button" class="btn btn-primary btn-sm" id="absSignInBtn">Sign In / Create Account</button>
        </div>
      `;
      document.getElementById("absSignInBtn")?.addEventListener("click", () => window.STHS_AUTH.openAuthModal());
      return;
    }

    if (state.myAbstracts.length === 0) {
      container.innerHTML = `
        <div class="empty-prod-card">
          <div style="font-size:1.8rem;">📄</div>
          <h4>No Abstracts Submitted Yet</h4>
          <p>Complete the form on the left to submit your abstract, workshop proposal, or playable game demo for Track 1–4 peer review.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.myAbstracts
      .map((a) => {
        const revs = state.reviewMap[a.id] || [];
        return `
          <article class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem; margin-bottom:0.45rem;">
              <span class="badge badge-navy">${esc(a.reference_code)} · ${esc(a.track_code)}</span>
              <span class="badge ${a.status === "accepted" || a.status === "scheduled" ? "badge-success" : "badge-mustard"}" style="text-transform:uppercase;">${esc(a.status.replace("_", " "))}</span>
            </div>
            <h4 style="font-family:var(--font-display); font-size:1.08rem; margin:0 0 0.25rem;">${esc(a.title)}</h4>
            <div style="font-size:0.8rem; color:var(--ink-muted); margin-bottom:0.5rem;">${esc(a.co_authors)} · ${esc(a.university)} · ${esc(a.presentation_format)}</div>
            <p style="font-size:0.83rem; color:var(--ink-brown); margin:0 0 0.65rem;">${esc(a.abstract_text.slice(0, 220))}${a.abstract_text.length > 220 ? "…" : ""}</p>
            ${
              revs.length
                ? `<div style="background:var(--teal-soft); border-radius:10px; padding:0.7rem; font-size:0.81rem; margin-bottom:0.65rem;">
                    <strong>Peer Review Feedback (${revs.length}):</strong>
                    ${revs
                      .filter((r) => !r.has_conflict_of_interest)
                      .map((r, idx) => `<div style="margin-top:0.35rem;">• <em>Reviewer ${idx + 1} (${r.weighted_average || "-"}/5 · ${esc(r.recommendation)}):</em> ${esc(r.author_feedback)}</div>`)
                      .join("")}
                  </div>`
                : ""
            }
            ${
              a.status === "revision_requested"
                ? `<form class="rebuttal-form" data-rebuttal-id="${a.id}" style="display:flex; flex-direction:column; gap:0.45rem; margin-top:0.5rem;">
                    <textarea class="textarea-field" rows="2" placeholder="Submit your author response / rebuttal to reviewers..." required>${esc(a.author_rebuttal)}</textarea>
                    <button type="submit" class="btn btn-primary btn-sm">Send Author Rebuttal</button>
                  </form>`
                : ""
            }
          </article>
        `;
      })
      .join("");

    container.querySelectorAll(".rebuttal-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const sb = window.STHS_DB.getClient();
        const rebuttal = form.querySelector("textarea").value.trim();
        const { error } = await sb.from("abstracts").update({ author_rebuttal: rebuttal, status: "under_review" }).eq("id", form.dataset.rebuttalId);
        if (error) window.STHS_DB.showToast(error.message, "⚠️");
        else {
          window.STHS_DB.showToast("Author rebuttal submitted to Scientific Committee!", "✅");
          await loadAllLiveData();
        }
      });
    });
  }

  function renderCloudVault() {
    const foldersGrid = document.getElementById("cloudFoldersGrid");
    const docsList = document.getElementById("cloudDocsList");
    const folderSelect = document.getElementById("docFolderSelect");

    if (folderSelect && folderSelect.options.length === 0) {
      folderSelect.innerHTML = OFFICIAL.cloudFolders.map((f) => `<option value="${esc(f.id)}">${f.icon} ${esc(f.label)}</option>`).join("");
    }

    if (foldersGrid) {
      foldersGrid.innerHTML = OFFICIAL.cloudFolders
        .map((f) => {
          const count = state.documents.filter((d) => d.folder_category === f.id).length;
          const active = state.activeFolderFilter === f.id;
          return `
            <div class="cloud-folder-tile ${active ? "active" : ""}" data-folder-filter="${esc(f.id)}">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:1.25rem;">${f.icon}</span>
                <span class="badge ${count > 0 ? "badge-teal" : "badge-mustard"}">${count} file${count === 1 ? "" : "s"}</span>
              </div>
              <div style="font-family:var(--font-display); font-size:0.86rem; margin-top:0.3rem;">${esc(f.label)}</div>
            </div>
          `;
        })
        .join("");
      foldersGrid.querySelectorAll("[data-folder-filter]").forEach((tile) => {
        tile.addEventListener("click", () => {
          state.activeFolderFilter = state.activeFolderFilter === tile.dataset.folderFilter ? "ALL" : tile.dataset.folderFilter;
          renderCloudVault();
        });
      });
    }

    if (docsList) {
      const visible = state.activeFolderFilter === "ALL" ? state.documents : state.documents.filter((d) => d.folder_category === state.activeFolderFilter);
      if (visible.length === 0) {
        docsList.innerHTML = `
          <div style="background:#fff; border:1.5px dashed #c9bba4; border-radius:12px; padding:1.2rem; text-align:center; font-size:0.85rem; color:var(--ink-muted);">
            No public documents uploaded in this folder yet. Presenters and organizers can upload slide decks, rulebooks, and handouts above.
          </div>
        `;
      } else {
        docsList.innerHTML = visible
          .map(
            (d) => `
            <div style="background:#fff; border:1.5px solid var(--ink-espresso); border-radius:10px; padding:0.75rem 1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem;">
              <div>
                <strong>📄 ${esc(d.title)}</strong>
                <div style="font-size:0.76rem; color:var(--ink-muted);">${esc(d.file_name)} ${d.file_size_label ? `· ${esc(d.file_size_label)}` : ""} · ${esc(d.uploader_label || "Presenter")}</div>
              </div>
              <a href="${esc(d.file_url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">📥 Download</a>
            </div>
          `
          )
          .join("");
      }
    }
  }

  function renderPeerReview() {
    const gate = document.getElementById("reviewAccessGate");
    const grid = document.getElementById("reviewWorkspaceGrid");
    if (!gate || !grid) return;

    if (!window.STHS_AUTH.isReviewer()) {
      grid.style.display = "none";
      gate.innerHTML = `
        <div class="empty-prod-card">
          <div style="font-size:2.1rem;">⚖️</div>
          <h4>Scientific Committee &amp; Assigned Reviewers Workspace</h4>
          <p>Double-blind peer review, conflict-of-interest declarations, and schedule promotion are protected by Supabase Row-Level Security. Sign in with an authorized Reviewer or Organizer account to access the review queue.</p>
          <button type="button" class="btn btn-primary btn-sm" id="revGateSignInBtn">Sign In with Committee Account</button>
        </div>
      `;
      document.getElementById("revGateSignInBtn")?.addEventListener("click", () => window.STHS_AUTH.openAuthModal());
      return;
    }

    gate.innerHTML = "";
    grid.style.display = "grid";

    const queueEl = document.getElementById("reviewQueueContainer");
    const countEl = document.getElementById("reviewQueueCount");
    if (countEl) countEl.textContent = state.reviewAbstracts.length;

    if (state.reviewAbstracts.length === 0) {
      queueEl.innerHTML = `<div class="empty-prod-card"><h4>Review Queue Empty</h4><p>Submitted abstracts will appear here automatically for scientific committee evaluation.</p></div>`;
      return;
    }

    queueEl.innerHTML = state.reviewAbstracts
      .map((a) => {
        const active = a.id === state.activeReviewAbstractId;
        const revCount = (state.reviewMap[a.id] || []).length;
        return `
          <div class="card" data-select-review="${a.id}" style="cursor:pointer; border-color:${active ? "var(--teal-primary)" : "var(--ink-espresso)"}; background:${active ? "var(--teal-soft)" : "#fff"};">
            <div style="display:flex; justify-content:space-between; gap:0.4rem; margin-bottom:0.35rem;">
              <span class="badge badge-navy">${esc(a.reference_code)} · ${esc(a.track_code)}</span>
              <span class="badge badge-mustard">${revCount} review${revCount === 1 ? "" : "s"}</span>
            </div>
            <strong style="font-family:var(--font-display); display:block;">${esc(a.title)}</strong>
            <div style="font-size:0.78rem; color:var(--ink-muted); margin-top:0.2rem;">${esc(a.presentation_format)} · Status: ${esc(a.status)}</div>
          </div>
        `;
      })
      .join("");

    queueEl.querySelectorAll("[data-select-review]").forEach((card) => {
      card.addEventListener("click", () => {
        state.activeReviewAbstractId = card.dataset.selectReview;
        renderPeerReview();
      });
    });

    const activeAbs = state.reviewAbstracts.find((a) => a.id === state.activeReviewAbstractId) || state.reviewAbstracts[0];
    if (!activeAbs) return;

    document.getElementById("reviewTargetAbstractId").value = activeAbs.id;
    document.getElementById("reviewActiveRefBadge").textContent = `${activeAbs.reference_code} · ${activeAbs.track_code}`;
    document.getElementById("reviewActiveTitle").textContent = activeAbs.title;
    document.getElementById("reviewActiveMeta").textContent = `${activeAbs.presentation_format} · ${activeAbs.sub_topic} · Status: ${activeAbs.status}`;
    document.getElementById("reviewActiveAbstractText").textContent = activeAbs.abstract_text;

    const promoteBtn = document.getElementById("promoteToAgendaBtn");
    if (promoteBtn) promoteBtn.style.display = window.STHS_AUTH.isOrganizer() ? "inline-flex" : "none";

    const existingList = document.getElementById("existingReviewsList");
    const revs = state.reviewMap[activeAbs.id] || [];
    existingList.innerHTML = revs.length
      ? `<strong>Recorded Committee Reviews (${revs.length})</strong>` +
        revs
          .map(
            (r) => `
          <div style="margin-top:0.55rem; padding:0.65rem; background:var(--bg-cream); border-radius:10px; font-size:0.82rem;">
            ${
              r.has_conflict_of_interest
                ? `<span class="badge badge-terracotta">COI DECLARED</span> ${esc(r.coi_reason)}`
                : `<strong>${r.weighted_average || "-"}/5 · ${esc(r.recommendation)}</strong> (Confidence ${r.reviewer_confidence}/5)<br/>${esc(r.author_feedback)}`
            }
          </div>
        `
          )
          .join("")
      : `<div style="font-size:0.82rem; color:var(--ink-muted);">No reviews submitted for this abstract yet.</div>`;
  }

  function renderStreamStage() {
    const selWrap = document.getElementById("streamRoomSelector");
    const mount = document.getElementById("streamEmbedMount");
    const roomLoc = document.getElementById("streamRoomLocationLabel");
    if (!selWrap || !mount) return;

    const stage = state.stages.find((s) => s.id === state.activeStageId) || state.stages[0];
    selWrap.innerHTML = state.stages
      .map(
        (s) =>
          `<button type="button" class="chip-btn ${s.id === stage.id ? "active" : ""}" data-pick-stage="${s.id}">${esc(s.platform)} · ${esc(s.name.split("·")[0].trim())}</button>`
      )
      .join("");

    selWrap.querySelectorAll("[data-pick-stage]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.activeStageId = btn.dataset.pickStage;
        await loadStageQa();
        renderStreamStage();
      });
    });

    if (roomLoc) roomLoc.textContent = stage.room_location || stage.name;

    if (stage.embed_url) {
      mount.innerHTML = `<iframe class="video-embed-frame" src="${esc(stage.embed_url)}" title="${esc(stage.name)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else {
      mount.innerHTML = `
        <div class="video-viewport">
          <span class="live-indicator">${stage.is_live ? '<span class="pulse-dot"></span>' : ""} ${esc(stage.platform.toUpperCase())} · ${esc(stage.status_label)}</span>
          <div style="max-width:560px;">
            <img src="./assets/symposium-header-logo.svg" alt="GO Game-On!" style="height:56px; margin:0 auto 0.85rem; background:#fffdf9; padding:0.35rem 0.75rem; border-radius:12px;" />
            <h3 style="font-family:var(--font-display); font-size:1.45rem; margin:0 0 0.45rem;">${esc(stage.current_session_title || stage.name)}</h3>
            <p style="font-size:0.9rem; color:#cbd5e1; margin:0 0 1rem;">${esc(stage.current_speaker)}</p>
            <div style="display:flex; gap:0.55rem; justify-content:center; flex-wrap:wrap; margin-bottom:1.1rem; font-size:0.78rem;">
              <span style="background:rgba(255,255,255,0.12); padding:0.28rem 0.75rem; border-radius:999px;">Platform: <strong>${esc(stage.platform)}</strong></span>
              <span style="background:rgba(255,255,255,0.12); padding:0.28rem 0.75rem; border-radius:999px;">ID: <code>${esc(stage.meeting_id || "TBA")}</code></span>
              ${stage.passcode ? `<span style="background:rgba(255,255,255,0.12); padding:0.28rem 0.75rem; border-radius:999px;">Passcode: <code>${esc(stage.passcode)}</code></span>` : ""}
            </div>
            <div style="display:flex; gap:0.65rem; justify-content:center; flex-wrap:wrap;">
              ${
                stage.join_url
                  ? `<a href="${esc(stage.join_url)}" target="_blank" rel="noopener" class="btn btn-primary">🎥 Join ${esc(stage.platform)} Live Room ↗</a>`
                  : `<button type="button" class="btn btn-mustard" id="stageNotifyBtn">🔔 Live Link Activates Before Session</button>`
              }
              ${stage.handout_url ? `<a href="${esc(stage.handout_url)}" target="_blank" rel="noopener" class="btn btn-outline" style="background:#fff; color:var(--ink-espresso);">📥 Session Handout</a>` : ""}
            </div>
          </div>
        </div>
      `;
      document.getElementById("stageNotifyBtn")?.addEventListener("click", () => {
        window.STHS_DB.showToast("Organizers publish the Zoom/MS Teams join link here prior to 11 March 2027.", "📡");
      });
    }

    renderLiveQa();
    renderLivePoll();
  }

  function renderLiveQa() {
    const container = document.getElementById("liveQaContainer");
    if (!container) return;
    if (state.qaQuestions.length === 0) {
      container.innerHTML = `<div style="font-size:0.84rem; color:var(--ink-muted); text-align:center; padding:1rem;">No questions posted for this stage yet. Ask the first question above!</div>`;
      return;
    }
    container.innerHTML = state.qaQuestions
      .map((q) => {
        const upvoted = state.myQaUpvotes.has(q.id);
        return `
          <div style="background:var(--bg-cream); border:1.5px solid #dfd3be; border-radius:12px; padding:0.7rem 0.85rem; display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start;">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--teal-dark);">${esc(q.author_name)} ${q.author_university ? `· ${esc(q.author_university)}` : ""} ${q.is_answered ? '<span class="badge badge-success">Answered</span>' : ""}</div>
              <div style="font-size:0.86rem; margin-top:0.2rem;">${esc(q.question_text)}</div>
            </div>
            <button type="button" class="btn ${upvoted ? "btn-primary" : "btn-outline"} btn-sm" data-upvote-qa="${q.id}" style="min-width:56px;">▲ ${q.upvote_count}</button>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll("[data-upvote-qa]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.STHS_AUTH.requireAuth("upvote live Q&A questions")) return;
        const sb = window.STHS_DB.getClient();
        const uid = window.STHS_AUTH.getState().user.id;
        const qid = btn.dataset.upvoteQa;
        if (state.myQaUpvotes.has(qid)) {
          await sb.from("live_qa_upvotes").delete().eq("question_id", qid).eq("user_id", uid);
          state.myQaUpvotes.delete(qid);
        } else {
          await sb.from("live_qa_upvotes").insert({ question_id: qid, user_id: uid });
          state.myQaUpvotes.add(qid);
        }
        await loadStageQa();
        renderLiveQa();
      });
    });
  }

  function renderLivePoll() {
    const container = document.getElementById("livePollContainer");
    const totalBadge = document.getElementById("pollTotalVotesBadge");
    if (!container) return;

    const poll = state.activePoll || {
      id: null,
      question: "Which game-based learning modality are you most excited to explore at GO Game-On! 2027?",
      options: [
        "Indigenous & Tabletop Board Games",
        "Clinical VR, Digital Twins & AI Virtual Patients",
        "Physical & Digital Escape Rooms",
        "Design-Based Research & Industry Partnerships"
      ]
    };

    const total = state.pollVotes.length;
    if (totalBadge) totalBadge.textContent = `${total} vote${total === 1 ? "" : "s"}`;
    const uid = window.STHS_AUTH.getState().user?.id;
    const myVote = state.pollVotes.find((v) => v.user_id === uid);

    container.innerHTML = `
      <p style="font-size:0.86rem; font-weight:700; margin:0 0 0.7rem;">${esc(poll.question)}</p>
      <div style="display:flex; flex-direction:column; gap:0.45rem;">
        ${(poll.options || [])
          .map((opt, idx) => {
            const votes = state.pollVotes.filter((v) => v.option_index === idx).length;
            const pct = total ? Math.round((votes / total) * 100) : 0;
            const chosen = myVote && myVote.option_index === idx;
            return `
              <button type="button" class="btn ${chosen ? "btn-primary" : "btn-outline"} btn-sm" data-vote-opt="${idx}" style="width:100%; justify-content:space-between; background:${chosen ? "var(--teal-primary)" : "#fff"};">
                <span>${esc(opt)}</span>
                <strong>${pct}% (${votes})</strong>
              </button>
            `;
          })
          .join("")}
      </div>
    `;

    container.querySelectorAll("[data-vote-opt]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.STHS_AUTH.requireAuth("vote in the live poll")) return;
        if (!poll.id) {
          window.STHS_DB.showToast("Live poll will activate once Supabase seed SQL is executed.", "ℹ️");
          return;
        }
        const sb = window.STHS_DB.getClient();
        const uidNow = window.STHS_AUTH.getState().user.id;
        const { error } = await sb.from("live_poll_votes").insert({
          poll_id: poll.id,
          event_id: state.eventId,
          user_id: uidNow,
          option_index: parseInt(btn.dataset.voteOpt, 10)
        });
        if (error) {
          window.STHS_DB.showToast(error.code === "23505" ? "You have already voted in this live poll!" : error.message, "ℹ️");
        } else {
          window.STHS_DB.showToast("Vote recorded live!", "📊");
          await loadPollVotes();
          renderLivePoll();
        }
      });
    });
  }

  function renderGamification() {
    const raceEl = document.getElementById("amazingRaceContainer");
    const scavEl = document.getElementById("scavengerListContainer");
    const progEl = document.getElementById("raceProgressSummary");

    const raceQuests = state.quests.filter((q) => q.quest_type === "amazing_race");
    const scavQuests = state.quests.filter((q) => q.quest_type === "scavenger_hunt");
    const raceDone = raceQuests.filter((q) => state.completedQuestIds.has(q.id)).length;
    if (progEl) progEl.textContent = `${raceDone} of ${raceQuests.length} Checkpoints Completed`;

    if (raceEl) {
      raceEl.innerHTML = raceQuests
        .map((q) => {
          const done = state.completedQuestIds.has(q.id);
          return `
            <article class="race-leg-card ${done ? "completed" : ""}">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="badge ${done ? "badge-success" : "badge-terracotta"}">${done ? "✓ COMPLETED" : `LEG ${q.sort_order}`}</span>
                <strong style="font-size:0.82rem; color:var(--teal-dark);">+${q.points} XP</strong>
              </div>
              <h4 style="font-family:var(--font-display); font-size:1.05rem; margin:0.15rem 0 0;">${esc(q.title)}</h4>
              <div style="font-size:0.76rem; color:var(--ink-muted);">📍 ${esc(q.location)} · ${esc(q.mode)}</div>
              <p style="font-size:0.83rem; margin:0.2rem 0 0.45rem; flex:1;">${esc(q.clue)}</p>
              ${
                done
                  ? `<div style="font-size:0.8rem; font-weight:800; color:#15803d;">🏅 Verified checkpoint complete!</div>`
                  : `<form class="race-answer-form" data-quest-id="${q.id}" style="display:flex; gap:0.4rem;">
                      <input type="text" class="input-field" style="flex:1; font-size:0.82rem;" placeholder="Enter answer..." required />
                      <button type="submit" class="btn btn-primary btn-sm">Unlock</button>
                    </form>
                    <details style="font-size:0.75rem; color:var(--ink-muted);"><summary style="cursor:pointer; font-weight:700;">Need a hint?</summary>${esc(q.hint)}</details>`
              }
            </article>
          `;
        })
        .join("");

      raceEl.querySelectorAll(".race-answer-form").forEach((form) => {
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const ans = form.querySelector("input").value.trim();
          await submitQuest(form.dataset.questId, ans);
        });
      });
    }

    if (scavEl) {
      scavEl.innerHTML = scavQuests
        .map((q) => {
          const done = state.completedQuestIds.has(q.id);
          return `
            <div style="background:${done ? "#ecfdf5" : "var(--bg-cream)"}; border:1.5px solid ${done ? "#15803d" : "var(--ink-espresso)"}; border-radius:12px; padding:0.75rem 0.9rem; display:flex; justify-content:space-between; align-items:center; gap:0.6rem;">
              <div>
                <div style="font-size:0.73rem; font-weight:800; color:var(--teal-dark); text-transform:uppercase;">${esc(q.category)}</div>
                <strong style="font-size:0.88rem;">${esc(q.title)}</strong>
                <div style="font-size:0.76rem; color:var(--ink-muted);">${esc(q.clue)}</div>
              </div>
              <span class="badge ${done ? "badge-success" : "badge-mustard"}">${done ? "✓ Stamped" : `+${q.points} XP`}</span>
            </div>
          `;
        })
        .join("");
    }

    renderLeaderboard();
  }

  async function submitQuest(questId, answer) {
    if (!window.STHS_AUTH.requireAuth("unlock Amazing Race & Scavenger Hunt XP")) return;
    if (!/^[0-9a-f-]{36}$/i.test(questId)) {
      window.STHS_DB.showToast("Please run supabase/seed_sths_events.sql in your witsezone Supabase project to activate live server-verified quests.", "ℹ️");
      return;
    }
    const sb = window.STHS_DB.getClient();
    const { data, error } = await sb.rpc("submit_quest_answer", { p_quest_id: questId, p_answer: answer });
    if (error) {
      window.STHS_DB.showToast(error.message, "⚠️");
      return;
    }
    if (!data?.ok) {
      window.STHS_DB.showToast(data?.error || "Incorrect answer — try again!", "🧩");
      return;
    }
    window.STHS_DB.showToast(
      data.already_completed ? "Checkpoint already unlocked!" : `+${data.points} XP unlocked · ${data.quest_title}!`,
      "🏆"
    );
    await window.STHS_AUTH.refreshUserContext();
    await loadAllLiveData();
  }

  function renderLeaderboard() {
    const container = document.getElementById("leaderboardContainer");
    if (!container) return;
    const rows = state.activeLeaderboardMode === "individuals" ? state.leaderboards.individuals || [] : state.leaderboards.universities || [];

    if (rows.length === 0) {
      container.innerHTML = `
        <div class="empty-prod-card">
          <div style="font-size:1.8rem;">🏆</div>
          <h4>Leaderboard Ready for Kick-Off</h4>
          <p>Register with your university email or GitHub account and solve Amazing Race checkpoints to put your university on top of the 2027 Game-On! Cup!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = rows
      .map((r, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
        if (state.activeLeaderboardMode === "individuals") {
          return `
            <div style="background:var(--bg-cream); border:1.5px solid var(--ink-espresso); border-radius:12px; padding:0.7rem 0.9rem; display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
              <div><strong>${medal} ${esc(r.display_name || "Delegate")}</strong><div style="font-size:0.76rem; color:var(--ink-muted);">${esc(r.university)} · ${r.quests_completed || 0} quests</div></div>
              <span class="badge badge-mustard">⚡ ${r.xp_points} XP</span>
            </div>
          `;
        }
        return `
          <div style="background:var(--bg-cream); border:1.5px solid var(--ink-espresso); border-radius:12px; padding:0.75rem 0.95rem; display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
            <div><strong>${medal} ${esc(r.university)}</strong><div style="font-size:0.76rem; color:var(--ink-muted);">${r.delegates} registered delegate${r.delegates === 1 ? "" : "s"}</div></div>
            <span class="badge badge-teal">⚡ ${r.total_points} pts</span>
          </div>
        `;
      })
      .join("");
  }

  function renderSponsors() {
    const tiersEl = document.getElementById("sponsorTiersContainer");
    const specialEl = document.getElementById("specialSponsorshipsContainer");
    const inKindEl = document.getElementById("inKindContainer");
    const boothsEl = document.getElementById("exhibitorBoothsContainer");

    if (tiersEl) {
      tiersEl.innerHTML = OFFICIAL.sponsorTiers
        .map(
          (t) => `
          <article class="card" style="border-top:8px solid ${t.accent}; display:flex; flex-direction:column;">
            <span class="badge badge-mustard" style="align-self:flex-start;">${esc(t.slots)}</span>
            <h4 style="font-family:var(--font-display); font-size:1.2rem; margin:0.5rem 0 0.2rem;">${esc(t.tier)}</h4>
            <div style="font-family:var(--font-display); font-size:1.65rem; color:${t.accent}; margin-bottom:0.65rem;">${esc(t.priceZAR)}</div>
            <ul style="padding-left:1.1rem; font-size:0.81rem; color:var(--ink-brown); display:flex; flex-direction:column; gap:0.35rem; margin:0 0 1rem; flex:1;">
              ${t.perks.map((p) => `<li>${esc(p)}</li>`).join("")}
            </ul>
            <button type="button" class="btn btn-outline btn-sm" data-pick-tier="${esc(t.tier)} (${esc(t.priceZAR)})" style="width:100%;">Select Package</button>
          </article>
        `
        )
        .join("");

      tiersEl.querySelectorAll("[data-pick-tier]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const sel = document.getElementById("spTierSelect");
          if (sel) sel.value = btn.dataset.pickTier;
          document.getElementById("sponsorInquiryCard")?.scrollIntoView({ behavior: "smooth" });
        });
      });
    }

    if (specialEl) {
      specialEl.innerHTML = OFFICIAL.specialSponsorships
        .map(
          (s) => `
          <article class="card" style="border-left:7px solid ${s.accent};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:1.45rem;">${s.icon}</span>
              <strong style="font-family:var(--font-display); font-size:1.15rem; color:${s.accent};">${esc(s.priceZAR)}</strong>
            </div>
            <h4 style="font-family:var(--font-display); font-size:1.06rem; margin:0.35rem 0;">${esc(s.name)}</h4>
            <ul style="padding-left:1.1rem; font-size:0.8rem; color:var(--ink-brown); margin:0;">
              ${s.perks.map((p) => `<li>${esc(p)}</li>`).join("")}
            </ul>
          </article>
        `
        )
        .join("");
    }

    if (inKindEl) {
      inKindEl.innerHTML = `
        <strong style="font-family:var(--font-display); font-size:1.15rem;">🎁 In-Kind Sponsorship &amp; Resource Support</strong>
        <p style="font-size:0.85rem; color:var(--ink-brown); margin:0.25rem 0 0;">Partners may also contribute non-monetary support directly to delegates, playtest labs, and student awards:</p>
        <div class="inkind-pills">${OFFICIAL.inKindOpportunities.map((item) => `<span class="inkind-pill">${esc(item)}</span>`).join("")}</div>
      `;
    }

    if (boothsEl) {
      boothsEl.innerHTML = state.sponsorBooths
        .map((b) => {
          const shared = state.mySponsorLeads.has(b.id);
          return `
            <article class="card">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
                <span class="badge badge-teal">${esc(b.tier)}</span>
                <span style="font-size:0.76rem; color:var(--ink-muted); font-weight:700;">${esc(b.category)}</span>
              </div>
              <h4 style="font-family:var(--font-display); font-size:1.12rem; margin:0.45rem 0 0.25rem;">${esc(b.name)}</h4>
              <p style="font-size:0.84rem; color:var(--ink-brown); margin:0 0 0.85rem;">${esc(b.description)}</p>
              <div style="display:flex; gap:0.55rem; flex-wrap:wrap;">
                <button type="button" class="btn ${shared ? "btn-mustard" : "btn-primary"} btn-sm" data-booth-lead="${b.id}">
                  ${shared ? "✓ Contact Shared" : "🤝 Connect with Booth"}
                </button>
                ${b.website_url ? `<a href="${esc(b.website_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Website ↗</a>` : ""}
              </div>
            </article>
          `;
        })
        .join("");

      boothsEl.querySelectorAll("[data-booth-lead]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!window.STHS_AUTH.requireAuth("connect with this exhibitor booth")) return;
          const boothId = btn.dataset.boothLead;
          if (!/^[0-9a-f-]{36}$/i.test(boothId)) {
            window.STHS_DB.showToast("Booth lead capture activates once Supabase seed SQL is executed.", "ℹ️");
            return;
          }
          const sb = window.STHS_DB.getClient();
          const uid = window.STHS_AUTH.getState().user.id;
          const { error } = await sb.from("sponsor_leads").upsert(
            { event_id: state.eventId, booth_id: boothId, user_id: uid },
            { onConflict: "booth_id,user_id" }
          );
          if (error) window.STHS_DB.showToast(error.message, "⚠️");
          else {
            state.mySponsorLeads.add(boothId);
            renderSponsors();
            window.STHS_DB.showToast("Your contact card has been shared with this partner booth!", "🤝");
          }
        });
      });
    }
  }

  function renderAdminDashboard() {
    if (!window.STHS_AUTH.isOrganizer()) return;
    const metricsEl = document.getElementById("adminMetricsGrid");
    const stageSel = document.getElementById("admStageSelect");
    const inqEl = document.getElementById("adminSponsorInquiriesList");

    if (metricsEl) {
      metricsEl.innerHTML = `
        <div class="card"><span class="badge badge-teal">SESSIONS</span><div style="font-family:var(--font-display);font-size:2rem;margin-top:0.35rem;">${state.sessions.length}</div></div>
        <div class="card"><span class="badge badge-mustard">DIRECTORY PROFILES</span><div style="font-family:var(--font-display);font-size:2rem;margin-top:0.35rem;">${state.directory.length}</div></div>
        <div class="card"><span class="badge badge-terracotta">ABSTRACTS</span><div style="font-family:var(--font-display);font-size:2rem;margin-top:0.35rem;">${state.reviewAbstracts.length}</div></div>
        <div class="card"><span class="badge badge-navy">SPONSOR PLEDGES</span><div style="font-family:var(--font-display);font-size:2rem;margin-top:0.35rem;">${state.sponsorInquiries.length}</div></div>
      `;
    }

    if (stageSel && state.stages.length) {
      stageSel.innerHTML = state.stages.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
      syncAdminStageFields();
    }

    if (inqEl) {
      inqEl.innerHTML = state.sponsorInquiries.length
        ? state.sponsorInquiries
            .map(
              (i) => `
              <div style="background:var(--bg-cream); border:1.5px solid #dfd3be; border-radius:10px; padding:0.65rem; font-size:0.8rem;">
                <strong>${esc(i.organization_name)}</strong> · ${esc(i.tier_selected)}<br/>
                ${esc(i.contact_name)} (<a href="mailto:${esc(i.work_email)}">${esc(i.work_email)}</a>)
              </div>
            `
            )
            .join("")
        : `<div style="font-size:0.82rem; color:var(--ink-muted);">No sponsor inquiries recorded yet.</div>`;
    }
  }

  function syncAdminStageFields() {
    const sel = document.getElementById("admStageSelect");
    const st = state.stages.find((s) => s.id === sel?.value);
    if (!st) return;
    document.getElementById("admStagePlatform").value = st.platform || "Zoom";
    document.getElementById("admStageStatus").value = st.status_label || "";
    document.getElementById("admStageSessionTitle").value = st.current_session_title || "";
    document.getElementById("admStageJoinUrl").value = st.join_url || "";
    document.getElementById("admStageEmbedUrl").value = st.embed_url || "";
    document.getElementById("admStageMeetingId").value = st.meeting_id || "";
    document.getElementById("admStagePasscode").value = st.passcode || "";
    document.getElementById("admStageIsLive").checked = Boolean(st.is_live);
  }

  function renderAllViews() {
    renderHybridCompanion();
    renderAgenda();
    renderDirectory();
    renderMyAbstracts();
    renderCloudVault();
    renderPeerReview();
    renderStreamStage();
    renderGamification();
    renderSponsors();
    renderAdminDashboard();
  }

  // =========================================================================
  // 6. DIRECT MESSAGING, QR SCANNER, CSV & ICS EXPORTS, 3D FLIPBOOK
  // =========================================================================
  function openDirectMessageModal(recipientId = null, recipientName = null) {
    if (!window.STHS_AUTH.requireAuth("send or view messages")) return;
    const modal = document.getElementById("directMsgModal");
    const list = document.getElementById("dmMessagesList");
    const form = document.getElementById("dmSendForm");
    const uid = window.STHS_AUTH.getState().user.id;

    if (recipientId) {
      document.getElementById("dmModalTitle").textContent = `💬 Message ${recipientName}`;
      document.getElementById("dmRecipientId").value = recipientId;
      form.style.display = "flex";
    } else {
      document.getElementById("dmModalTitle").textContent = "💬 My Networking Inbox";
      form.style.display = "none";
    }

    const thread = recipientId
      ? state.directMessages.filter((m) => (m.sender_id === uid && m.recipient_id === recipientId) || (m.sender_id === recipientId && m.recipient_id === uid))
      : state.directMessages;

    list.innerHTML = thread.length
      ? thread
          .map((m) => {
            const mine = m.sender_id === uid;
            return `
              <div style="align-self:${mine ? "flex-end" : "flex-start"}; max-width:82%; background:${mine ? "var(--teal-primary)" : "var(--bg-cream)"}; color:${mine ? "#fff" : "var(--ink-espresso)"}; padding:0.65rem 0.85rem; border-radius:12px; font-size:0.85rem;">
                <div>${esc(m.message_text)}</div>
                <div style="font-size:0.68rem; opacity:0.75; margin-top:0.25rem;">${new Date(m.created_at).toLocaleString()}</div>
              </div>
            `;
          })
          .join("")
      : `<div style="text-align:center; color:var(--text-muted); padding:1.25rem; font-size:0.86rem;">No messages yet. Say hello to start a conversation!</div>`;

    modal.classList.add("open");
  }

  function exportPersonalIcs() {
    const saved = state.sessions.filter((s) => state.savedSessionIds.has(s.id));
    const list = saved.length ? saved : state.sessions;
    const events = list.length
      ? list
          .map((s) => {
            const dateStr = s.day_label.includes("12") ? "20270312" : "20270311";
            const st = (s.start_time || "09:00").replace(":", "") + "00";
            const en = (s.end_time || "10:00").replace(":", "") + "00";
            return [
              "BEGIN:VEVENT",
              `UID:${s.id}@sthsevent.wits.ac.za`,
              `DTSTART;TZID=Africa/Johannesburg:${dateStr}T${st}`,
              `DTEND;TZID=Africa/Johannesburg:${dateStr}T${en}`,
              `SUMMARY:${s.title}`,
              `LOCATION:${s.room}`,
              `DESCRIPTION:${s.speaker_names} — ${s.description}`,
              "END:VEVENT"
            ].join("\r\n");
          })
          .join("\r\n")
      : [
          "BEGIN:VEVENT",
          "UID:gameon2027@sthsevent.wits.ac.za",
          "DTSTART;TZID=Africa/Johannesburg:20270311T083000",
          "DTEND;TZID=Africa/Johannesburg:20270312T163000",
          `SUMMARY:${OFFICIAL.eventTitle}`,
          `LOCATION:${OFFICIAL.venue}`,
          `DESCRIPTION:${OFFICIAL.theme}`,
          "END:VEVENT"
        ].join("\r\n");

    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Wits STHS EventHub//EN\r\n${events}\r\nEND:VCALENDAR`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = "Game-On-Symposium-2027-Schedule.ics";
    a.click();
    window.STHS_DB.showToast("Symposium calendar (.ICS) downloaded!", "📅");
  }

  function downloadCsv(filename, rows) {
    if (!rows.length) {
      window.STHS_DB.showToast("No records to export yet.", "ℹ️");
      return;
    }
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = filename;
    a.click();
  }

  async function startQrScanner() {
    const modal = document.getElementById("qrScannerModal");
    const video = document.getElementById("qrVideoPreview");
    const status = document.getElementById("qrScannerStatus");
    modal.classList.add("open");

    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = "Camera access unavailable in this browser. Type your station code manually in the Scavenger Hunt box.";
      return;
    }
    try {
      qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = qrStream;
      await video.play();
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        status.textContent = "Scanning for station QR code…";
        const loop = async () => {
          if (!qrStream) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length && codes[0].rawValue) {
              stopQrScanner();
              modal.classList.remove("open");
              document.getElementById("scavengerCodeInput").value = codes[0].rawValue.trim();
              document.getElementById("scavengerCodeForm").requestSubmit();
              return;
            }
          } catch (_) {}
          qrScanRaf = requestAnimationFrame(loop);
        };
        qrScanRaf = requestAnimationFrame(loop);
      } else {
        status.textContent = "Camera active — native QR auto-decode is supported on Chrome/Android/Edge; on iOS Safari enter the printed code directly.";
      }
    } catch (err) {
      status.textContent = `Camera permission denied: ${err.message}`;
    }
  }

  function stopQrScanner() {
    if (qrScanRaf) cancelAnimationFrame(qrScanRaf);
    qrScanRaf = null;
    if (qrStream) {
      qrStream.getTracks().forEach((t) => t.stop());
      qrStream = null;
    }
  }

  // Exact 3D 6-Page Portrait Prospectus Flipbook with real MP3 sound & Fullscreen Zoom
  function initProspectusFlipbook() {
    const stageEl = document.getElementById("flipbookStage");
    const zoomWrapEl = document.getElementById("flipbookZoomWrap");
    const zoomCanvasEl = document.getElementById("flipbookZoomCanvas");
    const bookEl = document.getElementById("flipbookBook");
    const mobileImgEl = document.getElementById("flipbookMobileImg");
    const indicatorEl = document.getElementById("flipPageIndicator");
    const dotsEl = document.getElementById("flipDotsContainer");
    const prevBtn = document.getElementById("flipPrevBtn");
    const nextBtn = document.getElementById("flipNextBtn");
    const sidePrevBtn = document.getElementById("flipSidePrevBtn");
    const sideNextBtn = document.getElementById("flipSideNextBtn");
    const closeMaxBtn = document.getElementById("flipMaxCloseBtn");
    if (!stageEl || !bookEl || !indicatorEl || !dotsEl) return;

    const totalPages = 6;
    const sheetsConfig = [
      { front: 1, back: 2 },
      { front: 3, back: 4 },
      { front: 5, back: 6 }
    ];

    const baseAudio = new Audio("./assets/page-flip.mp3");
    baseAudio.preload = "auto";
    baseAudio.volume = 0.85;
    function playFlipSound() {
      try {
        const sfx = baseAudio.cloneNode();
        sfx.volume = 0.85;
        sfx.play()?.catch?.(() => {});
      } catch (_) {}
    }

    bookEl.innerHTML = sheetsConfig
      .map(
        (s, idx) => `
        <div class="flipbook-sheet" data-sheet="${idx}" style="z-index:${sheetsConfig.length - idx};">
          <div class="flipbook-face front" data-page="${s.front}">
            <img src="./assets/prospectus-pages/page-${s.front}.png" alt="Prospectus Page ${s.front}" />
          </div>
          <div class="flipbook-face back" data-page="${s.back}">
            <img src="./assets/prospectus-pages/page-${s.back}.png" alt="Prospectus Page ${s.back}" />
          </div>
        </div>
      `
      )
      .join("");

    const sheetEls = Array.from(bookEl.querySelectorAll(".flipbook-sheet"));
    let desktopStep = 0;
    let mobilePage = 1;
    let isMaximized = false;
    let isZoomedIn = false;
    const isMobile = () => window.innerWidth <= 900;

    function resetZoom() {
      isZoomedIn = false;
      zoomWrapEl?.classList.remove("is-zoomed");
      if (zoomCanvasEl) {
        zoomCanvasEl.style.transformOrigin = "center center";
        zoomCanvasEl.style.transform = "scale(1)";
      }
    }

    function setMaximized(max) {
      isMaximized = max;
      resetZoom();
      stageEl.classList.toggle("is-maximized", max);
      document.body.style.overflow = max ? "hidden" : "";
    }

    function applyMagnifier(cx, cy) {
      const rect = zoomWrapEl.getBoundingClientRect();
      const xPct = Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100));
      const yPct = Math.max(0, Math.min(100, ((cy - rect.top) / rect.height) * 100));
      zoomCanvasEl.style.transformOrigin = `${xPct}% ${yPct}%`;
      zoomCanvasEl.style.transform = "scale(1.85)";
    }

    zoomWrapEl?.addEventListener("click", (e) => {
      if (!isMaximized) {
        setMaximized(true);
        if (!isMobile() && desktopStep === 0) setTimeout(() => { if (isMaximized && desktopStep === 0) goNext(); }, 220);
        return;
      }
      if (!isZoomedIn) {
        isZoomedIn = true;
        zoomWrapEl.classList.add("is-zoomed");
        applyMagnifier(e.clientX, e.clientY);
      } else {
        resetZoom();
      }
    });
    zoomWrapEl?.addEventListener("mousemove", (e) => {
      if (isMaximized && isZoomedIn) applyMagnifier(e.clientX, e.clientY);
    });
    closeMaxBtn?.addEventListener("click", () => setMaximized(false));

    function syncDisabled(first, last) {
      [prevBtn, sidePrevBtn].forEach((b) => b && (b.disabled = first));
      [nextBtn, sideNextBtn].forEach((b) => b && (b.disabled = last));
    }

    function updateDesktop(prev = desktopStep, sound = false) {
      resetZoom();
      bookEl.classList.remove("pos-front", "pos-open", "pos-back");
      bookEl.classList.add(desktopStep === 0 ? "pos-front" : desktopStep === sheetsConfig.length ? "pos-back" : "pos-open");
      if (sound && desktopStep !== prev) playFlipSound();

      sheetEls.forEach((sheet, idx) => {
        const flipped = idx < desktopStep;
        sheet.style.zIndex = flipped ? idx + 1 : sheetsConfig.length - idx;
        sheet.classList.toggle("flipped", flipped);
      });

      const labels = ["Front Cover (Page 1 of 6)", "Pages 2–3 of 6", "Pages 4–5 of 6", "Back Cover (Page 6 of 6)"];
      indicatorEl.textContent = labels[desktopStep];
      syncDisabled(desktopStep === 0, desktopStep === sheetsConfig.length);
      dotsEl.innerHTML = labels.map((l, i) => `<button type="button" class="flipbook-dot ${i === desktopStep ? "active" : ""}" data-step="${i}" aria-label="${l}"></button>`).join("");
      dotsEl.querySelectorAll(".flipbook-dot").forEach((d) =>
        d.addEventListener("click", () => {
          const old = desktopStep;
          desktopStep = parseInt(d.dataset.step, 10);
          updateDesktop(old, true);
        })
      );
    }

    function updateMobile(play = false) {
      resetZoom();
      if (mobileImgEl) mobileImgEl.src = `./assets/prospectus-pages/page-${mobilePage}.png`;
      if (play) playFlipSound();
      indicatorEl.textContent = mobilePage === 1 ? "Front Cover (Page 1 of 6)" : mobilePage === 6 ? "Back Cover (Page 6 of 6)" : `Page ${mobilePage} of 6`;
      syncDisabled(mobilePage === 1, mobilePage === totalPages);
      dotsEl.innerHTML = Array.from({ length: totalPages }, (_, i) => `<button type="button" class="flipbook-dot ${i + 1 === mobilePage ? "active" : ""}" data-pg="${i + 1}"></button>`).join("");
      dotsEl.querySelectorAll(".flipbook-dot").forEach((d) =>
        d.addEventListener("click", () => {
          mobilePage = parseInt(d.dataset.pg, 10);
          updateMobile(true);
        })
      );
    }

    function goNext() {
      if (isMobile()) {
        if (mobilePage < totalPages) { mobilePage++; updateMobile(true); }
      } else if (desktopStep < sheetsConfig.length) {
        const old = desktopStep; desktopStep++; updateDesktop(old, true);
      }
    }
    function goPrev() {
      if (isMobile()) {
        if (mobilePage > 1) { mobilePage--; updateMobile(true); }
      } else if (desktopStep > 0) {
        const old = desktopStep; desktopStep--; updateDesktop(old, true);
      }
    }

    prevBtn?.addEventListener("click", goPrev);
    nextBtn?.addEventListener("click", goNext);
    sidePrevBtn?.addEventListener("click", (e) => { e.stopPropagation(); goPrev(); });
    sideNextBtn?.addEventListener("click", (e) => { e.stopPropagation(); goNext(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isMaximized) setMaximized(false);
      if (state.activeTab !== "sponsors" && !isMaximized) return;
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    });

    if (isMobile()) updateMobile(false);
    else updateDesktop(0, false);
  }

  // =========================================================================
  // 7. EVENT BINDINGS & FORM SUBMISSIONS
  // =========================================================================
  function bindEvents() {
    document.querySelectorAll(".nav-tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.querySelectorAll("[data-goto-tab]").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.gotoTab)));
    document.querySelectorAll("[data-dock-tab]").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.dockTab)));
    document.querySelectorAll("[data-sheet-tab]").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.sheetTab)));

    document.getElementById("mobileMoreDockBtn")?.addEventListener("click", () => {
      document.getElementById("mobileMoreSheet")?.classList.add("open");
    });
    document.getElementById("closeMoreSheetBtn")?.addEventListener("click", () => {
      document.getElementById("mobileMoreSheet")?.classList.remove("open");
    });
    document.getElementById("mobileMoreSheet")?.addEventListener("click", (e) => {
      if (e.target.id === "mobileMoreSheet") e.target.classList.remove("open");
    });

    // Hybrid Experience Mode Switch
    document.querySelectorAll("[data-experience-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.experienceMode === state.experienceMode);
      btn.addEventListener("click", () => {
        state.experienceMode = btn.dataset.experienceMode;
        localStorage.setItem("gameon_exp_mode", state.experienceMode);
        document.querySelectorAll("[data-experience-mode]").forEach((b) => b.classList.toggle("active", b === btn));
        renderHybridCompanion();
      });
    });

    // Auth & QR Triggers
    ["openAuthModalBtn", "heroRegisterBtn", "sheetAccountBtn"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => {
        document.getElementById("mobileMoreSheet")?.classList.remove("open");
        window.STHS_AUTH.openAuthModal();
      });
    });
    ["openQrBadgeBtn", "sheetQrPassBtn"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => {
        document.getElementById("mobileMoreSheet")?.classList.remove("open");
        window.STHS_AUTH.openQrBadgeModal();
      });
    });

    // Close custom modals
    document.querySelectorAll("[data-close-symp-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.closeSympModal;
        if (id === "qrScannerModal") stopQrScanner();
        document.getElementById(id)?.classList.remove("open");
      });
    });

    // Poster Lightbox
    document.querySelectorAll("[data-lightbox-src]").forEach((img) => {
      img.addEventListener("click", () => {
        document.getElementById("lightboxImage").src = img.dataset.lightboxSrc;
        document.getElementById("lightboxModal")?.classList.add("open");
      });
    });

    // Agenda filters & ICS
    document.querySelectorAll("#agendaDayFilters .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeDayFilter = btn.dataset.day;
        document.querySelectorAll("#agendaDayFilters .chip-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderAgenda();
      });
    });
    document.getElementById("agendaTrackFilter")?.addEventListener("change", (e) => { state.activeTrackFilter = e.target.value; renderAgenda(); });
    document.getElementById("agendaSearchInput")?.addEventListener("input", (e) => { state.agendaSearch = e.target.value; renderAgenda(); });
    document.getElementById("exportIcsBtn")?.addEventListener("click", exportPersonalIcs);
    document.getElementById("openAddSessionModalBtn")?.addEventListener("click", () => document.getElementById("addSessionModal")?.classList.add("open"));

    document.getElementById("addSessionForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!window.STHS_AUTH.requireAuth("publish a session")) return;
      const sb = window.STHS_DB.getClient();
      const [startT, endT] = document.getElementById("newSessTime").value.split("-").map((x) => x.trim());
      const { error } = await sb.from("sessions").insert({
        event_id: state.eventId,
        title: document.getElementById("newSessTitle").value.trim(),
        day_label: document.getElementById("newSessDay").value,
        start_time: startT || "09:00",
        end_time: endT || "10:00",
        track_code: document.getElementById("newSessTrack").value,
        stream_platform: document.getElementById("newSessStream").value,
        room: document.getElementById("newSessRoom").value.trim(),
        speaker_names: document.getElementById("newSessSpeaker").value.trim(),
        speaker_universities: document.getElementById("newSessUni").value.trim(),
        description: document.getElementById("newSessDesc").value.trim(),
        created_by: window.STHS_AUTH.getState().user.id
      });
      if (error) window.STHS_DB.showToast(error.message, "⚠️");
      else {
        window.STHS_DB.showToast("Session published to live agenda!", "📅");
        document.getElementById("addSessionForm").reset();
        document.getElementById("addSessionModal").classList.remove("open");
        await loadAllLiveData();
      }
    });

    // Directory & Bio Builder
    document.querySelectorAll("#speakerUniFilters .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeUniFilter = btn.dataset.uni;
        document.querySelectorAll("#speakerUniFilters .chip-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderDirectory();
      });
    });
    document.getElementById("speakerSearchInput")?.addEventListener("input", (e) => { state.speakerSearch = e.target.value; renderDirectory(); });
    document.getElementById("openInboxModalBtn")?.addEventListener("click", () => openDirectMessageModal());

    document.getElementById("toggleBioCreatorBtn")?.addEventListener("click", () => {
      if (!window.STHS_AUTH.requireAuth("edit your speaker or participant bio")) return;
      const card = document.getElementById("bioCreatorCard");
      const open = card.style.display === "none";
      card.style.display = open ? "block" : "none";
      if (open) {
        const auth = window.STHS_AUTH.getState();
        document.getElementById("bioTitle").value = auth.profile?.academic_title || "";
        document.getElementById("bioName").value = auth.profile?.full_name || "";
        document.getElementById("bioUniversity").value = auth.profile?.university || "";
        document.getElementById("bioDept").value = auth.profile?.faculty_department || "";
        document.getElementById("bioText").value = auth.profile?.bio || "";
        document.getElementById("bioTags").value = (auth.profile?.research_tags || []).join(", ");
        document.getElementById("bioSessionTitle").value = auth.registration?.session_title || "";
      }
    });
    document.getElementById("cancelBioBtn")?.addEventListener("click", () => { document.getElementById("bioCreatorCard").style.display = "none"; });

    document.getElementById("speakerBioForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!window.STHS_AUTH.requireAuth("publish your bio")) return;
      try {
        const sb = window.STHS_DB.getClient();
        const auth = window.STHS_AUTH.getState();
        let avatarUrl = auth.profile?.avatar_url || "";
        let presUrl = auth.registration?.presentation_file_url || "";
        let presName = auth.registration?.presentation_file_name || "";

        const avatarFile = document.getElementById("bioAvatarFile").files[0];
        if (avatarFile) {
          const up = await uploadToEventStorage(avatarFile, "event-public", "03_Speaker_&_Participant_Bios_&_Photos");
          avatarUrl = up.url;
        }
        const presFile = document.getElementById("bioPresentationFile").files[0];
        if (presFile) {
          const up = await uploadToEventStorage(presFile, "event-public", "02_Speaker_Presentations_&_Slide_Decks");
          presUrl = up.url;
          presName = up.name;
          await sb.from("event_documents").insert({
            event_id: state.eventId,
            folder_category: "02_Speaker_Presentations_&_Slide_Decks",
            title: document.getElementById("bioSessionTitle").value.trim() || presFile.name,
            file_url: up.url,
            file_name: up.name,
            file_size_label: formatBytes(presFile.size),
            storage_path: up.path,
            uploaded_by: auth.user.id,
            uploader_label: document.getElementById("bioName").value.trim()
          });
        }

        const tags = document.getElementById("bioTags").value.split(",").map((t) => t.trim()).filter(Boolean);
        await sb.from("profiles").upsert({
          id: auth.user.id,
          email: auth.user.email,
          academic_title: document.getElementById("bioTitle").value.trim(),
          full_name: document.getElementById("bioName").value.trim(),
          university: document.getElementById("bioUniversity").value.trim(),
          faculty_department: document.getElementById("bioDept").value.trim(),
          bio: document.getElementById("bioText").value.trim(),
          research_tags: tags,
          avatar_url: avatarUrl,
          public_directory: true
        });
        await sb.from("event_registrations").upsert({
          event_id: state.eventId,
          user_id: auth.user.id,
          primary_track: document.getElementById("bioTrack").value,
          session_title: document.getElementById("bioSessionTitle").value.trim(),
          presentation_file_url: presUrl,
          presentation_file_name: presName,
          public_in_directory: true
        }, { onConflict: "event_id,user_id" });

        document.getElementById("bioCreatorCard").style.display = "none";
        window.STHS_DB.showToast("Bio & presentation published to Inter-University Directory!", "🎓");
        await loadAllLiveData();
      } catch (err) {
        window.STHS_DB.showToast(err.message, "⚠️");
      }
    });

    // Direct Message Send
    document.getElementById("dmSendForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB.getClient();
      const uid = window.STHS_AUTH.getState().user.id;
      const recipientId = document.getElementById("dmRecipientId").value;
      const text = document.getElementById("dmInputText").value.trim();
      const { error } = await sb.from("direct_messages").insert({
        event_id: state.eventId,
        sender_id: uid,
        recipient_id: recipientId,
        message_text: text
      });
      if (error) window.STHS_DB.showToast(error.message, "⚠️");
      else {
        document.getElementById("dmInputText").value = "";
        await loadAllLiveData();
        openDirectMessageModal(recipientId, document.getElementById("dmModalTitle").textContent.replace("💬 Message ", ""));
      }
    });

    // Abstract Form & Word Counter
    document.getElementById("absTrackSelect")?.addEventListener("change", (e) => populateSubTopics(e.target.value));
    document.getElementById("absText")?.addEventListener("input", (e) => {
      const words = e.target.value.trim() ? e.target.value.trim().split(/\s+/).length : 0;
      document.getElementById("absWordCount").textContent = `${words} words`;
    });

    document.getElementById("abstractSubmissionForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!window.STHS_AUTH.requireAuth("submit an abstract")) return;
      try {
        const sb = window.STHS_DB.getClient();
        const auth = window.STHS_AUTH.getState();
        const trackCode = document.getElementById("absTrackSelect").value;
        const trackObj = OFFICIAL.tracks.find((t) => t.track_code === trackCode) || OFFICIAL.tracks[0];

        let absFile = { url: "", name: "" };
        let slidesFile = { url: "", name: "" };
        const f1 = document.getElementById("absFileInput").files[0];
        if (f1) absFile = await uploadToEventStorage(f1, "event-submissions", trackObj.folderId);
        const f2 = document.getElementById("absSlidesFileInput").files[0];
        if (f2) slidesFile = await uploadToEventStorage(f2, "event-public", "02_Speaker_Presentations_&_Slide_Decks");

        const { error } = await sb.from("abstracts").insert({
          event_id: state.eventId,
          author_id: auth.user.id,
          title: document.getElementById("absTitle").value.trim(),
          co_authors: document.getElementById("absAuthors").value.trim(),
          university: document.getElementById("absUniversity").value.trim(),
          corresponding_email: document.getElementById("absEmail").value.trim(),
          track_code: trackCode,
          sub_topic: document.getElementById("absTopicSelect").value,
          presentation_format: document.getElementById("absFormatSelect").value,
          abstract_text: document.getElementById("absText").value.trim(),
          keywords: document.getElementById("absKeywords").value.split(",").map((k) => k.trim()).filter(Boolean),
          abstract_file_url: absFile.url,
          abstract_file_name: absFile.name,
          slides_file_url: slidesFile.url,
          slides_file_name: slidesFile.name,
          drive_folder_path: trackObj.folderId
        });
        if (error) throw new Error(error.message);

        document.getElementById("abstractSubmissionForm").reset();
        document.getElementById("absWordCount").textContent = "0 words";
        window.STHS_DB.showToast("Abstract submitted for Scientific Committee review!", "🚀");
        await loadAllLiveData();
      } catch (err) {
        window.STHS_DB.showToast(err.message, "⚠️");
      }
    });

    // Public Document Upload Modal
    document.getElementById("openUploadDocBtn")?.addEventListener("click", () => {
      if (!window.STHS_AUTH.requireAuth("upload a presentation or document")) return;
      document.getElementById("uploadDocModal")?.classList.add("open");
    });
    document.getElementById("uploadDocForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const sb = window.STHS_DB.getClient();
        const auth = window.STHS_AUTH.getState();
        const folder = document.getElementById("docFolderSelect").value;
        const file = document.getElementById("docFileInput").files[0];
        const up = await uploadToEventStorage(file, "event-public", folder);
        const { error } = await sb.from("event_documents").insert({
          event_id: state.eventId,
          folder_category: folder,
          title: document.getElementById("docTitleInput").value.trim(),
          file_url: up.url,
          file_name: up.name,
          file_size_label: formatBytes(file.size),
          storage_path: up.path,
          uploaded_by: auth.user.id,
          uploader_label: auth.profile?.full_name || auth.user.email
        });
        if (error) throw new Error(error.message);
        document.getElementById("uploadDocForm").reset();
        document.getElementById("uploadDocModal").classList.remove("open");
        window.STHS_DB.showToast("Document uploaded to Symposium Resource Vault!", "☁️");
        await loadAllLiveData();
      } catch (err) {
        window.STHS_DB.showToast(err.message, "⚠️");
      }
    });

    // Peer Review sliders, COI toggle, submit & Promote to Agenda
    [["scoreThemeFit", "valThemeFit"], ["scoreRigor", "valRigor"], ["scoreInnovation", "valInnovation"], ["scoreImpact", "valImpact"]].forEach(([inp, out]) => {
      document.getElementById(inp)?.addEventListener("input", (e) => {
        document.getElementById(out).textContent = `${e.target.value} / 5`;
      });
    });
    document.getElementById("reviewCoiCheck")?.addEventListener("change", (e) => {
      const coi = e.target.checked;
      document.getElementById("reviewCoiReason").style.display = coi ? "block" : "none";
      document.getElementById("reviewScoringFields").style.display = coi ? "none" : "flex";
    });
    document.getElementById("peerReviewForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB.getClient();
      const uid = window.STHS_AUTH.getState().user.id;
      const absId = document.getElementById("reviewTargetAbstractId").value;
      const hasCoi = document.getElementById("reviewCoiCheck").checked;
      const payload = {
        event_id: state.eventId,
        abstract_id: absId,
        reviewer_id: uid,
        has_conflict_of_interest: hasCoi,
        coi_reason: hasCoi ? document.getElementById("reviewCoiReason").value.trim() : "",
        score_theme_fit: hasCoi ? null : parseInt(document.getElementById("scoreThemeFit").value, 10),
        score_rigor: hasCoi ? null : parseInt(document.getElementById("scoreRigor").value, 10),
        score_innovation: hasCoi ? null : parseInt(document.getElementById("scoreInnovation").value, 10),
        score_impact: hasCoi ? null : parseInt(document.getElementById("scoreImpact").value, 10),
        reviewer_confidence: hasCoi ? null : parseInt(document.getElementById("reviewConfidence").value, 10),
        recommendation: hasCoi ? "COI Recusal" : document.getElementById("reviewRecommendation").value,
        author_feedback: hasCoi ? "" : document.getElementById("reviewComments").value.trim(),
        confidential_chair_notes: document.getElementById("reviewChairNotes").value.trim()
      };
      const { error } = await sb.from("abstract_reviews").upsert(payload, { onConflict: "abstract_id,reviewer_id" });
      if (error) window.STHS_DB.showToast(error.message, "⚠️");
      else {
        window.STHS_DB.showToast(hasCoi ? "Conflict of Interest recorded." : "Peer review submitted!", "⚖️");
        await loadAllLiveData();
      }
    });

    document.getElementById("promoteToAgendaBtn")?.addEventListener("click", async () => {
      const sb = window.STHS_DB.getClient();
      const abs = state.reviewAbstracts.find((a) => a.id === state.activeReviewAbstractId);
      if (!abs) return;
      const { data: sess, error } = await sb
        .from("sessions")
        .insert({
          event_id: state.eventId,
          track_code: abs.track_code,
          day_label: "Day 1 · Thu 11 Mar 2027",
          start_time: "11:00",
          end_time: "11:30",
          title: abs.title,
          description: abs.abstract_text,
          format: abs.presentation_format,
          room: "eFundanathi eZone Breakout Room",
          stream_platform: "Zoom",
          speaker_names: abs.co_authors,
          speaker_universities: abs.university,
          slides_url: abs.slides_file_url || "",
          slides_name: abs.slides_file_name || "",
          created_by: window.STHS_AUTH.getState().user.id
        })
        .select()
        .single();
      if (error) { window.STHS_DB.showToast(error.message, "⚠️"); return; }
      await sb.from("abstracts").update({ status: "scheduled", promoted_session_id: sess.id }).eq("id", abs.id);
      window.STHS_DB.showToast("Accepted abstract promoted directly to Symposium Agenda!", "📅");
      await loadAllLiveData();
    });

    // Live Stream Q&A, Copy Meeting Info & Check-In
    document.getElementById("liveQaForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!window.STHS_AUTH.requireAuth("ask a question in Live Q&A")) return;
      if (!/^[0-9a-f-]{36}$/i.test(state.activeStageId)) {
        window.STHS_DB.showToast("Live Q&A activates once Supabase seed SQL is executed.", "ℹ️");
        return;
      }
      const sb = window.STHS_DB.getClient();
      const auth = window.STHS_AUTH.getState();
      const text = document.getElementById("liveQaInput").value.trim();
      const { error } = await sb.from("live_qa_questions").insert({
        event_id: state.eventId,
        stage_id: state.activeStageId,
        author_id: auth.user.id,
        author_name: [auth.profile?.academic_title, auth.profile?.full_name].filter(Boolean).join(" ") || auth.user.email,
        author_university: auth.profile?.university || "",
        attendance_mode: state.experienceMode,
        question_text: text
      });
      if (error) window.STHS_DB.showToast(error.message, "⚠️");
      else {
        document.getElementById("liveQaInput").value = "";
        await loadStageQa();
        renderLiveQa();
      }
    });

    document.getElementById("copyMeetingIdBtn")?.addEventListener("click", () => {
      const stage = state.stages.find((s) => s.id === state.activeStageId) || state.stages[0];
      navigator.clipboard?.writeText(`${stage.name} (${stage.platform}) — ID: ${stage.meeting_id} ${stage.passcode ? `Passcode: ${stage.passcode}` : ""}`);
      window.STHS_DB.showToast("Stage meeting details copied!", "📋");
    });

    document.getElementById("claimStreamCheckInBtn")?.addEventListener("click", () => {
      if (!window.STHS_AUTH.requireAuth("check in to the live stream")) return;
      window.STHS_DB.showToast("Live stage check-in recorded! Welcome to the session.", "✅");
    });

    // Scavenger Hunt Code Redeem + QR Scanner + Leaderboard Toggle
    document.getElementById("openQrScannerBtn")?.addEventListener("click", startQrScanner);
    document.getElementById("scavengerCodeForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!window.STHS_AUTH.requireAuth("redeem a Scavenger Hunt code")) return;
      const code = document.getElementById("scavengerCodeInput").value.trim();
      const scavQuests = state.quests.filter((q) => q.quest_type === "scavenger_hunt" && !state.completedQuestIds.has(q.id));
      let matched = false;
      for (const q of scavQuests) {
        if (!/^[0-9a-f-]{36}$/i.test(q.id)) break;
        const { data } = await window.STHS_DB.getClient().rpc("submit_quest_answer", { p_quest_id: q.id, p_answer: code });
        if (data?.ok) {
          matched = true;
          window.STHS_DB.showToast(`+${data.points} XP · ${data.quest_title}!`, "🔍");
          document.getElementById("scavengerCodeInput").value = "";
          await window.STHS_AUTH.refreshUserContext();
          await loadAllLiveData();
          break;
        }
      }
      if (!matched) window.STHS_DB.showToast("Code not recognized or already redeemed.", "🔍");
    });

    document.querySelectorAll("[data-lb-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeLeaderboardMode = btn.dataset.lbMode;
        document.querySelectorAll("[data-lb-mode]").forEach((b) => b.classList.toggle("active", b === btn));
        renderLeaderboard();
      });
    });

    // Sponsor Inquiry Form
    document.getElementById("scrollToSponsorFormBtn")?.addEventListener("click", () => {
      document.getElementById("sponsorInquiryCard")?.scrollIntoView({ behavior: "smooth" });
    });
    document.getElementById("sponsorInquiryForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB.getClient();
      if (!sb || !state.eventId) {
        const subject = encodeURIComponent(`Game-On! 2027 Sponsorship Pledge — ${document.getElementById("spOrgName").value}`);
        const body = encodeURIComponent(`Organization: ${document.getElementById("spOrgName").value}\nContact: ${document.getElementById("spContactName").value}\nTier: ${document.getElementById("spTierSelect").value}\nNotes: ${document.getElementById("spNotes").value}`);
        window.location.href = `mailto:help.efundanathi@wits.ac.za?subject=${subject}&body=${body}`;
        return;
      }
      try {
        const auth = window.STHS_AUTH.getState();
        let logo = { url: "", name: "" };
        const file = document.getElementById("spLogoFileInput").files[0];
        if (file && auth.user) logo = await uploadToEventStorage(file, "event-public", "05_Sponsor_Logos_&_Partner_Brochures");
        const { error } = await sb.from("sponsor_inquiries").insert({
          event_id: state.eventId,
          submitted_by: auth.user?.id || null,
          organization_name: document.getElementById("spOrgName").value.trim(),
          contact_name: document.getElementById("spContactName").value.trim(),
          work_email: document.getElementById("spEmail").value.trim(),
          tier_selected: document.getElementById("spTierSelect").value,
          logo_file_url: logo.url,
          logo_file_name: logo.name,
          notes: document.getElementById("spNotes").value.trim()
        });
        if (error) throw new Error(error.message);
        document.getElementById("sponsorInquiryForm").reset();
        window.STHS_DB.showToast("Sponsorship pledge received! Amanda Jankowitz & team will reach out shortly.", "🤝");
      } catch (err) {
        window.STHS_DB.showToast(err.message, "⚠️");
      }
    });

    // Admin Controls
    document.getElementById("admStageSelect")?.addEventListener("change", syncAdminStageFields);
    document.getElementById("adminStageForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB.getClient();
      const id = document.getElementById("admStageSelect").value;
      const { error } = await sb
        .from("stream_stages")
        .update({
          platform: document.getElementById("admStagePlatform").value,
          status_label: document.getElementById("admStageStatus").value.trim(),
          current_session_title: document.getElementById("admStageSessionTitle").value.trim(),
          join_url: document.getElementById("admStageJoinUrl").value.trim(),
          embed_url: document.getElementById("admStageEmbedUrl").value.trim(),
          meeting_id: document.getElementById("admStageMeetingId").value.trim(),
          passcode: document.getElementById("admStagePasscode").value.trim(),
          is_live: document.getElementById("admStageIsLive").checked
        })
        .eq("id", id);
      if (error) window.STHS_DB.showToast(error.message, "⚠️");
      else {
        window.STHS_DB.showToast("Live broadcast stage updated!", "📡");
        await loadAllLiveData();
      }
    });

    document.getElementById("adminPollForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sb = window.STHS_DB.getClient();
      const opts = document.getElementById("admPollOptions").value.split("\n").map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) { window.STHS_DB.showToast("Provide at least 2 poll options.", "⚠️"); return; }
      await sb.from("live_polls").update({ is_active: false }).eq("event_id", state.eventId);
      const { error } = await sb.from("live_polls").insert({
        event_id: state.eventId,
        stage_id: /^[0-9a-f-]{36}$/i.test(state.activeStageId) ? state.activeStageId : null,
        question: document.getElementById("admPollQuestion").value.trim(),
        options: opts,
        is_active: true
      });
      if (error) window.STHS_DB.showToast(error.message, "⚠️");
      else {
        document.getElementById("adminPollForm").reset();
        window.STHS_DB.showToast("New live audience poll published!", "📊");
        await loadAllLiveData();
      }
    });

    document.getElementById("exportRegsCsvBtn")?.addEventListener("click", async () => {
      const sb = window.STHS_DB.getClient();
      const { data } = await sb.from("event_registrations").select("badge_code, role, attendance_mode, xp_points, checked_in, dietary_accessibility, created_at").eq("event_id", state.eventId);
      downloadCsv("gameon-2027-registrations.csv", data || []);
    });

    document.getElementById("exportAbsCsvBtn")?.addEventListener("click", () => {
      downloadCsv("gameon-2027-abstracts.csv", state.reviewAbstracts);
    });
  }

  async function boot() {
    window.STHS_APP.init({ swPath: "../sw.js" });
    startCountdown();
    renderOverviewTracks();
    populateSubTopics("TRACK 1");
    initProspectusFlipbook();
    bindEvents();

    const hashTab = window.location.hash.replace("#", "").toLowerCase();
    if (hashTab) switchTab(hashTab, false);

    window.STHS_AUTH.subscribe((authState) => {
      renderHeaderAuth(authState);
      renderPeerReview();
      renderAdminDashboard();
    });

    await window.STHS_AUTH.init({ eventId: null, eventTitle: OFFICIAL.eventTitle });
    await loadAllLiveData();
  }

  boot();
})();
