const API_BASE = window.PAWALERT_API_URL || (location.port === "4173" ? "http://127.0.0.1:8080" : "");
const setStatus = (form, text, type = "") => { const status = form.querySelector(".form-status"); status.textContent = text; status.className = `form-status ${type}`; };
const currentUser = () => JSON.parse(localStorage.getItem("pawalert_user") || "null");
function updateNavigation() {
  const user = currentUser();
  if (!user) return;
  document.querySelectorAll(".site-header nav").forEach((nav) => {
    nav.querySelectorAll('a[href="login.html"], a[href="signup.html"]').forEach((link) => link.remove());
    if (user.role === "moderator" || user.role === "admin") nav.querySelectorAll('a[href="report.html"]').forEach((link) => link.remove());
    if (!nav.querySelector('[data-community-link], a[href="community.html"]')) {
      const community = document.createElement("a");
      community.href = "community.html";
      community.textContent = "Community";
      community.dataset.communityLink = "true";
      nav.append(community);
    }
    let profile = nav.querySelector("[data-profile-toggle]");
    if (!profile) {
      profile = document.createElement("button");
      profile.type = "button";
      profile.dataset.profileToggle = "true";
      nav.append(profile);
    }
    profile.className = "nav-profile";
    profile.title = "Open account menu";
    profile.setAttribute("aria-label", "Open account menu");
    profile.textContent = (user.name || "P").charAt(0).toUpperCase();
    let menu = nav.querySelector(".account-menu");
    if (!menu) { menu = document.createElement("div"); menu.className = "account-menu"; nav.append(menu); }
    menu.innerHTML = `<strong>${escapeHtml(user.name || "PawAlert user")}</strong><span>${escapeHtml(user.email || "")}</span><small>${escapeHtml(labelForRole(user.role || "citizen"))}</small><a href="dashboard.html">Dashboard</a><button type="button" data-logout>Log out</button>`;
  });
}

async function request(path, { method = "GET", body, authenticated = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authenticated) { const user = currentUser(); if (!user?.token) throw new Error("Please log in first"); headers.Authorization = user.token; }
  const response = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || "Something went wrong");
  return data;
}
const post = (path, body, authenticated = false) => request(path, { method: "POST", body, authenticated });
const dashboardCacheKey = "pawalert_dashboard_cache";
const clearDashboardCache = () => sessionStorage.removeItem(dashboardCacheKey);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function cachedDashboard() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(dashboardCacheKey) || "null");
    const user = currentUser();
    return cached && cached.token === user?.token && Date.now() - cached.savedAt < 30000 ? cached.data : null;
  } catch (_) { return null; }
}
async function getDashboardData(showWelcomeCat = false) {
  const cached = cachedDashboard();
  if (cached) return cached;
  const startedAt = performance.now();
  const data = await request("/dashboard", { authenticated: true });
  try { sessionStorage.setItem(dashboardCacheKey, JSON.stringify({ token: currentUser()?.token, savedAt: Date.now(), data })); } catch (_) { /* A large photo should never prevent the dashboard from opening. */ }
  if (showWelcomeCat) await pause(Math.max(0, 1200 - (performance.now() - startedAt)));
  return data;
}

async function submitPendingReport() {
  const stored = sessionStorage.getItem("pawalert_pending_report");
  if (!stored) return null;
  const report = await post("/reports/full", JSON.parse(stored), true);
  sessionStorage.removeItem("pawalert_pending_report");
  clearDashboardCache();
  return report;
}
const reportComplete = (report) => location.assign(report ? `success.html?report=${encodeURIComponent(report.report_id)}` : "success.html");
function openOtpDialog(form, email) {
  const dialog = document.createElement("div");
  dialog.className = "otp-modal";
  dialog.innerHTML = `<div class="otp-panel" role="dialog" aria-modal="true" aria-label="Enter verification code"><button class="otp-close" type="button" aria-label="Close">×</button><span class="otp-icon">✉</span><h2>Check your email</h2><p>We sent a 6-digit verification code to <strong>${escapeHtml(email)}</strong>.</p><input class="otp-modal-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="• • • • • •"><button class="button button-primary otp-confirm" type="button">Verify and create account <span>→</span></button><p class="otp-error" aria-live="polite"></p></div>`;
  const close = () => dialog.remove();
  dialog.querySelector(".otp-close").addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.querySelector(".otp-confirm").addEventListener("click", () => {
    const code = dialog.querySelector(".otp-modal-input").value.trim();
    if (!/^\d{6}$/.test(code)) { dialog.querySelector(".otp-error").textContent = "Enter the 6-digit code from your email."; return; }
    form.querySelector('[name="otp"]').value = code;
    form.dataset.otpSent = "true";
    close(); form.requestSubmit();
  });
  document.body.append(dialog); dialog.querySelector(".otp-modal-input").focus();
}
let capturedReportPhoto = "";
const conditionSelect = document.querySelector("#condition");
if (conditionSelect) {
  const customCondition = document.querySelector("#condition-other-field");
  const customInput = customCondition.querySelector("input");
  conditionSelect.addEventListener("change", () => {
    const showCustom = conditionSelect.value === "Other / not listed";
    customCondition.hidden = !showCustom;
    customInput.required = showCustom;
    if (!showCustom) customInput.value = "";
  });
}
const authoritySelect = document.querySelector("#authority-type");
if (authoritySelect) {
  const authorityNote = document.querySelector("#authority-note");
  const authorityMessages = {
    government: "Government reports are kept within the responsible local-response workflow.",
    ngo: "This report is routed for animal-welfare NGO follow-up; it is not shown publicly.",
    private_ngo: "This report is routed for private rescue follow-up; it is not shown publicly.",
    community: "This report will appear in PawAlert Community so local members can see its progress.",
    other: "This report is recorded for the selected local authority; it is not shown publicly."
  };
  authoritySelect.addEventListener("change", () => { authorityNote.textContent = authorityMessages[authoritySelect.value]; });
}
const speciesInput = document.querySelector('[name="animal_species"]');
if (speciesInput) {
  const breedList = document.createElement('datalist'); breedList.id = 'breed-suggestions'; document.body.append(breedList);
  speciesInput.setAttribute('list', breedList.id); speciesInput.setAttribute('autocomplete', 'off');
  let breedTimer;
  speciesInput.addEventListener('input', () => {
    clearTimeout(breedTimer); const query = speciesInput.value.trim(); if (query.length < 2) { breedList.innerHTML = ''; return; }
    breedTimer = setTimeout(async () => { try {
      const animal = document.querySelector('[name="animal_type"]')?.value || '';
      const response = await request(`/animal-breeds?q=${encodeURIComponent(query)}&animal=${encodeURIComponent(animal)}`);
      const breeds = Array.isArray(response) ? response : Object.values(response || {});
      breedList.innerHTML = breeds.map((breed) => `<option value="${escapeHtml(breed.name)}"></option>`).join('');
    } catch (_) { breedList.innerHTML = ''; } }, 180);
  });
}
let reportMap;
let reportPin;
let mapLookupController;
async function updateAddressFromPin(latitude, longitude) {
  const mapStatus = document.querySelector("#map-status");
  if (!mapStatus) return;
  if (mapLookupController) mapLookupController.abort();
  mapLookupController = new AbortController();
  mapStatus.textContent = "Pin selected. Finding the nearby address…";
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`;
    const response = await fetch(url, { signal: mapLookupController.signal });
    if (!response.ok) throw new Error("Address lookup failed");
    const data = await response.json(); const address = data.address || {};
    const fill = (name, value) => { const field = document.querySelector(`[name="${name}"]`); if (field && value) field.value = value; };
    fill("city", address.city || address.town || address.village || address.county);
    fill("state", address.state);
    fill("pincode", address.postcode);
    fill("location", data.display_name);
    mapStatus.textContent = "Address updated from your pin. You can still edit any field below.";
  } catch (error) { if (error.name !== "AbortError") mapStatus.textContent = "Pin saved. Enter the address manually if the lookup does not finish."; }
}
function setReportPin(latitude, longitude, zoom = true) {
  const lat = Number(latitude); const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  document.querySelector('[name="latitude"]').value = lat.toFixed(6);
  document.querySelector('[name="longitude"]').value = lng.toFixed(6);
  updateAddressFromPin(lat, lng);
  if (!reportMap) return;
  if (!reportPin) reportPin = L.marker([lat, lng], { draggable: true }).addTo(reportMap);
  else reportPin.setLatLng([lat, lng]);
  reportPin.off("dragend").on("dragend", () => { const point = reportPin.getLatLng(); setReportPin(point.lat, point.lng, false); });
  if (zoom) reportMap.setView([lat, lng], 16);
}
function initialiseReportMap() {
  const mapElement = document.querySelector("#report-map");
  if (!mapElement || !window.L) return;
  reportMap = L.map(mapElement, { zoomControl: true }).setView([30.3165, 78.0322], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(reportMap);
  reportMap.on("click", ({ latlng }) => setReportPin(latlng.lat, latlng.lng));
}
initialiseReportMap();
const takePhotoButton = document.querySelector("#take-photo");
if (takePhotoButton) takePhotoButton.addEventListener("click", async () => {
  const cameraStatus = document.querySelector("#camera-photo-status");
  if (!navigator.mediaDevices?.getUserMedia) { cameraStatus.textContent = "Camera is unavailable here. Please upload a photo instead."; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    const modal = document.createElement("div"); modal.className = "camera-modal";
    modal.innerHTML = `<div class="camera-panel"><button class="camera-close" type="button">×</button><video autoplay playsinline></video><canvas hidden></canvas><div class="camera-actions"><button class="camera-cancel" type="button">Cancel</button><button class="camera-capture" type="button">● Take photo</button></div></div>`;
    const video = modal.querySelector("video"); video.srcObject = stream;
    const close = () => { stream.getTracks().forEach((track) => track.stop()); modal.remove(); };
    modal.querySelectorAll(".camera-close, .camera-cancel").forEach((button) => button.addEventListener("click", close));
    modal.querySelector(".camera-capture").addEventListener("click", () => { const canvas = modal.querySelector("canvas"); const side = Math.min(video.videoWidth, video.videoHeight); canvas.width = side; canvas.height = side; canvas.getContext("2d").drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, side, side); const preview = canvas.toDataURL("image/jpeg", .84); video.hidden = true; canvas.hidden = false; const actions = modal.querySelector(".camera-actions"); actions.innerHTML = '<button class="camera-retake" type="button">↻ Retake</button><button class="camera-use" type="button">✓ Use photo</button>'; actions.querySelector(".camera-retake").addEventListener("click", () => { canvas.hidden = true; video.hidden = false; }); actions.querySelector(".camera-use").addEventListener("click", () => { capturedReportPhoto = preview; cameraStatus.textContent = "Photo captured and ready to submit."; cameraStatus.className = "camera-photo-status success"; close(); }); });
    document.body.append(modal);
  } catch (_) { cameraStatus.textContent = "Camera permission was not granted. You can upload a photo instead."; }
});

const locationButton = document.querySelector("#use-location");
if (locationButton) {
  const locationStatus = document.querySelector("#location-status");
  const setLocationStatus = (message, type = "") => { locationStatus.textContent = message; locationStatus.className = `location-status ${type}`; };
  const fill = (name, value) => { const field = document.querySelector(`[name="${name}"]`); if (field && value) field.value = value; };
  locationButton.addEventListener("click", () => {
    if (!navigator.geolocation) { setLocationStatus("Location is not supported in this browser. Please enter the details manually.", "error"); return; }
    locationButton.disabled = true;
    setLocationStatus("Requesting your location permission…");
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const fallback = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
      fill("location", fallback);
      setReportPin(coords.latitude, coords.longitude);
      try {
        setLocationStatus("Finding the nearby address…");
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(coords.latitude)}&lon=${encodeURIComponent(coords.longitude)}&zoom=18&addressdetails=1`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Address lookup failed");
        const data = await response.json(); const address = data.address || {};
        fill("city", address.city || address.town || address.village || address.county);
        fill("state", address.state);
        fill("pincode", address.postcode);
        fill("location", data.display_name || fallback);
        setLocationStatus("Location added. Please review the details before submitting.", "success");
      } catch (_) { setLocationStatus("GPS coordinates added. Complete the remaining details manually.", "success"); }
      locationButton.disabled = false;
    }, (error) => {
      const message = error.code === error.PERMISSION_DENIED ? "Location permission was denied. Please enter the details manually." : "Could not find your location. Please enter the details manually.";
      setLocationStatus(message, "error"); locationButton.disabled = false;
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
  });
}

document.querySelectorAll("form[data-api]").forEach((form) => form.addEventListener("submit", async (event) => {
  event.preventDefault(); const mode = form.dataset.api; const values = Object.fromEntries(new FormData(form)); const button = form.querySelector("button"); button.disabled = true;
  try {
    if (mode === "report") { const photo = form.querySelector('[name="upload_photo"]').files?.[0]; delete values.upload_photo; if (capturedReportPhoto) values.photo = capturedReportPhoto; else if (photo) { if (photo.size > 3 * 1024 * 1024) throw new Error("Please choose an image smaller than 3 MB"); values.photo = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(photo); }); } else delete values.photo; sessionStorage.setItem("pawalert_pending_report", JSON.stringify(values)); if (!currentUser()?.token) location.assign("login.html?next=report"); else reportComplete(await submitPendingReport()); return; }
    if (mode === "login") { setStatus(form, "Logging you in…"); const user = await post("/login", values); localStorage.setItem("pawalert_user", JSON.stringify({ ...user, email: values.email })); const report = await submitPendingReport(); if (report) reportComplete(report); else { sessionStorage.setItem("pawalert_login_loading", "true"); location.assign("dashboard.html"); } return; }
    if (!form.dataset.otpSent) { setStatus(form, "Sending verification code…"); const result = await post("/auth/send-otp", { email: values.email, purpose: "signup" }); setStatus(form, result.message || "Verification code sent.", "success"); openOtpDialog(form, values.email); return; }
    setStatus(form, "Verifying your code…"); await post("/auth/verify-otp", { email: values.email, otp: values.otp }); const user = await post("/users", { name: values.name, email: values.email, password: values.password }); localStorage.setItem("pawalert_user", JSON.stringify({ ...user, email: values.email })); sessionStorage.setItem("pawalert_login_loading", "true"); location.assign("dashboard.html");
  } catch (error) { setStatus(form, error.message, "error"); } finally { button.disabled = false; }
}));

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const labelForRole = (role) => ({ citizen: "Citizen", moderator: "Moderator", admin: "Administrator" }[role] || role);
updateNavigation();
if (document.querySelector('form[data-api="report"]') && ["moderator", "admin"].includes(currentUser()?.role)) location.replace("dashboard.html");
function reportCards(reports, emptyText, canUpload = false) {
  if (!reports?.length) return `<p class="empty-state">${emptyText}</p>`;
  return reports.map((r) => `<article class="report-card"><div>${r.report_photo ? `<button class="report-photo-button" type="button" data-report-photo="${escapeHtml(r.report_photo)}" data-report-caption="Report photo · ${escapeHtml(r.animal_type)}"><img class="report-photo-thumb" src="${escapeHtml(r.report_photo)}" alt="Photo submitted for report #${escapeHtml(r.report_id)}" loading="lazy" decoding="async"><span>View report pics</span></button>` : ""}<h3>${escapeHtml(r.animal_type)}${r.animal_species ? ` <small>· ${escapeHtml(r.animal_species)}</small>` : ""}</h3><p>${escapeHtml(r.condition)} · ${escapeHtml(r.location || r.area)}, ${escapeHtml(r.city || r.area)}</p>${r.authority_type === "community" ? '<span class="community-label">Community report</span>' : ""}${r.completion_photo ? `<button class="completion-photo-button" type="button" data-completion-photo="${escapeHtml(r.completion_photo)}" data-completion-caption="Treatment completed · ${escapeHtml(r.animal_type)}"><img class="completion-photo" src="${escapeHtml(r.completion_photo)}" alt="Animal after treatment for report #${escapeHtml(r.report_id)}" loading="lazy" decoding="async"><span>View treatment photo</span></button>` : ""}${r.status === "completed" && !r.completion_photo ? `<p class="photo-pending">${canUpload ? "Add a post-treatment photo below." : "Treatment completed · photo update awaited from the rescue team."}</p>` : ""}${canUpload && r.status === "completed" && !r.completion_photo ? `<label class="completion-upload">Add treatment photo<input type="file" accept="image/jpeg,image/png,image/webp" data-completion-upload="${escapeHtml(r.report_id)}"></label>` : ""}</div><div class="report-meta"><strong>#${escapeHtml(r.report_id)}</strong><button class="status status-${escapeHtml(r.status).toLowerCase()} status-button" type="button" data-case-status="${escapeHtml(r.status)}" data-report-id="${escapeHtml(r.report_id)}" aria-label="View progress for report ${escapeHtml(r.report_id)}">${escapeHtml(r.status).replaceAll("_", " ")}</button><time>${new Date(r.created_at).toLocaleDateString()}</time></div></article>`).join("");
}
function dashboardSkeleton(withCat = false) {
  return `<section class="dashboard-skeleton" aria-label="Loading dashboard"><div class="skeleton-line skeleton-eyebrow"></div><div class="skeleton-line skeleton-heading"></div><div class="skeleton-line skeleton-copy"></div><div class="skeleton-stat-row"><span></span><span></span><span></span></div><div class="skeleton-section"><div class="skeleton-line skeleton-title"></div><div class="skeleton-card-grid"><article></article><article></article></div></div>${withCat ? '<div class="welcome-cat-loader"><span>🐈</span><p>Preparing your PawAlert dashboard…</p></div>' : ''}</section>`;
}
const afterNextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
async function loadDashboard() {
  const container = document.querySelector("#dashboard"); if (!container) return;
  if (!currentUser()?.token) { location.replace("login.html"); return; }
  const showWelcomeCat = sessionStorage.getItem("pawalert_login_loading") === "true";
  sessionStorage.removeItem("pawalert_login_loading");
  container.innerHTML = dashboardSkeleton(showWelcomeCat);
  await afterNextPaint();
  try {
    const data = await getDashboardData(showWelcomeCat); const savedUser = currentUser(); localStorage.setItem("pawalert_user", JSON.stringify({ ...savedUser, name: data.profile.name, email: data.profile.email, role: data.profile.role })); updateNavigation(); container.dataset.role = data.profile.role; const citizen = data.profile.role === "citizen"; const moderator = data.profile.role === "moderator"; const focusTitle = citizen ? "My reports" : moderator ? "My active cases" : "All reports"; const focusReports = Array.isArray(citizen ? data.my_reports : data.managed_reports) ? (citizen ? data.my_reports : data.managed_reports) : []; const availableReports = moderator && Array.isArray(data.available_reports) ? data.available_reports : []; const communityReports = Array.isArray(data.community_reports) ? data.community_reports : [];
    const canUpload = ["moderator", "admin"].includes(data.profile.role);
    container.innerHTML = `<section class="dashboard-hero"><div><p class="eyebrow"><span></span> ${labelForRole(data.profile.role)} dashboard</p><h1>Welcome, ${escapeHtml(data.profile.name)}.</h1><p>Keep up with the cases and people who need your attention.</p></div><aside class="profile-card"><div class="profile-avatar">${escapeHtml(data.profile.name.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(data.profile.name)}</strong><span>${escapeHtml(data.profile.email)}</span><small>${labelForRole(data.profile.role)}</small></div></aside></section><section class="dashboard-stats"><article><span>${citizen ? "Reports submitted" : "Cases in view"}</span><strong>${data.stats.total_cases}</strong></article><article><span>Pending attention</span><strong>${data.stats.pending_cases}</strong></article><article><span>Community updates</span><strong>${communityReports.length}</strong></article></section><section class="dashboard-section"><div class="section-title"><div><p class="eyebrow"><span></span> Your workspace</p><h2>${focusTitle}</h2></div>${citizen ? '<a class="button button-primary" href="report.html">Make a report <span>→</span></a>' : ""}</div><div class="report-grid">${reportCards(focusReports, "No reports are available yet.", canUpload)}</div></section>${moderator ? `<section class="dashboard-section"><div class="section-title"><div><p class="eyebrow"><span></span> Local response queue</p><h2>Available cases in your area</h2><p>Accept a case to add it to your active workspace and open directions.</p></div></div><div class="report-grid">${reportCards(availableReports, "No unassigned reports need a responder in your area.", false)}</div></section>` : ""}`;
    attachCompletionUploads(container);
    attachModeratorLocationControl(container, data.profile.role);
    attachModeratorCaseActions(container, [...focusReports, ...availableReports], data.profile);
  } catch (error) { container.innerHTML = `<section class="dashboard-error"><h1>Dashboard unavailable</h1><p>${escapeHtml(error.message)}</p><a class="button button-primary" href="login.html">Log in again</a></section>`; }
}
async function loadCommunity() {
  const container = document.querySelector("#community-page"); if (!container) return;
  if (!currentUser()?.token) { location.replace("login.html"); return; }
  container.innerHTML = dashboardSkeleton(false);
  await afterNextPaint();
  try {
    const data = await getDashboardData();
    const reports = Array.isArray(data.community_reports) ? data.community_reports : [];
    const verifiedCount = reports.filter((report) => report.status === "verified").length;
    const activeCount = reports.filter((report) => report.status === "in_progress").length;
    const canUpload = ["moderator", "admin"].includes(data.profile.role);
    container.innerHTML = `<section class="community-page-heading"><p class="eyebrow"><span></span> PawAlert community</p><h1>Confirmed local reports.</h1><p>Verified and active cases in your area. Pending reports remain private until a moderator confirms them.</p></section><section class="community-insights"><article><span>Confirmed reports</span><strong>${reports.length}</strong></article><article><span>Verified</span><strong>${verifiedCount}</strong></article><article><span>Rescue in progress</span><strong>${activeCount}</strong></article></section><section class="dashboard-section community-section"><div class="community-toolbar"><div class="community-filters" aria-label="Filter community reports"><button class="active" data-community-filter="all">All</button><button data-community-filter="verified">Verified</button><button data-community-filter="in_progress">In progress</button><button data-community-filter="completed">Completed</button></div></div><div class="report-grid" data-community-results>${reportCards(reports, "No confirmed reports are available in your area.", canUpload)}</div></section><section class="community-guide"><div><p class="eyebrow"><span></span> Help safely</p><h2>What to do while help is on the way</h2></div><div class="guide-cards"><article><strong>01</strong><h3>Keep a safe distance</h3><p>Do not approach a frightened or injured animal suddenly. Keep people and traffic away when possible.</p></article><article><strong>02</strong><h3>Share clear details</h3><p>Add a landmark, condition, and location so a nearby moderator can respond without delay.</p></article><article><strong>03</strong><h3>Do not give medicine</h3><p>Offer water only if safe. Wait for trained rescue support before attempting treatment or transport.</p></article></div></section>`;
    const results = container.querySelector("[data-community-results]");
    attachModeratorCaseActions(container, reports, data.profile);
    container.querySelectorAll("[data-community-filter]").forEach((button) => button.addEventListener("click", () => {
      const filter = button.dataset.communityFilter;
      const filtered = filter === "all" ? reports : reports.filter((report) => report.status === filter);
      container.querySelectorAll("[data-community-filter]").forEach((item) => item.classList.toggle("active", item === button));
      results.innerHTML = reportCards(filtered, `No ${filter} community reports right now.`, canUpload);
      attachCompletionUploads(container);
      attachModeratorCaseActions(container, filtered, data.profile);
    }));
  } catch (error) { container.innerHTML = `<section class="dashboard-error"><h1>Community unavailable</h1><p>${escapeHtml(error.message)}</p></section>`; }
}
function attachCompletionUploads(container) {
  container.querySelectorAll("[data-completion-upload]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert("Please choose an image smaller than 3 MB."); input.value = ""; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try { await post(`/reports/${input.dataset.completionUpload}/completion-photo`, { photo: reader.result }, true); clearDashboardCache(); location.reload(); }
      catch (error) { alert(error.message); input.value = ""; }
    };
    reader.readAsDataURL(file);
  }));
}
function attachModeratorCaseActions(container, reports, profile) {
  if (!['moderator', 'admin'].includes(profile.role)) return;
  container.querySelectorAll('.report-card').forEach((card, index) => {
    const report = reports[index]; if (!report || card.querySelector('[data-case-action]')) return;
    const actions = document.createElement('div'); actions.className = 'case-actions';
    if (!report.assigned_moderator_user_id && report.status !== 'completed') actions.innerHTML = `<button type="button" data-case-action="accept" data-case-report="${report.report_id}" data-case-animal="${escapeHtml(report.animal_type)}" data-case-latitude="${report.latitude || ''}" data-case-longitude="${report.longitude || ''}">${report.status === 'pending' ? 'Accept & verify' : 'Take over active case'}</button>`;
    else if (report.assigned_moderator_user_id === profile.user_id || profile.role === 'admin') {
      if (report.status === 'pending') actions.innerHTML = `<button type="button" data-case-action="directions" data-case-report="${report.report_id}" data-case-animal="${escapeHtml(report.animal_type)}" data-case-latitude="${report.latitude || ''}" data-case-longitude="${report.longitude || ''}">Open route</button><button type="button" data-case-action="verified" data-case-report="${report.report_id}">Verify on site & add comment</button>`;
      else if (report.status === 'verified') actions.innerHTML = `<button type="button" data-case-action="in_progress" data-case-report="${report.report_id}">Start rescue & add update</button>`;
      else if (report.status === 'in_progress') actions.innerHTML = `<button type="button" data-case-action="completed" data-case-report="${report.report_id}">Complete with note</button>`;
    }
    if (actions.innerHTML) card.firstElementChild.append(actions);
  });
}
let moderatorLocationWatch;
function pawAlertVanIcon() {
  return window.L?.divIcon ? L.divIcon({ className: "pawalert-rescue-icon", html: '<div class="pawalert-rescue-marker" title="PawAlert rescue van">🚑<span>PawAlert</span></div>', iconSize: [58, 48], iconAnchor: [29, 41] }) : undefined;
}
async function snapToRoad(latitude, longitude) {
  try {
    const response = await fetch(`https://router.project-osrm.org/nearest/v1/driving/${longitude},${latitude}`);
    const data = await response.json(); const point = data.waypoints?.[0]?.location;
    if (Array.isArray(point) && point.length === 2) return [point[1], point[0]];
  } catch (_) { /* Keep the device GPS point when road matching is unavailable. */ }
  return [latitude, longitude];
}
function openModeratorDirections(destinationLatitude, destinationLongitude, reportId, animalName = "Animal") {
  const latitude = Number(destinationLatitude), longitude = Number(destinationLongitude);
  if (!window.L || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) { alert('This report does not have a map pin yet.'); return; }
  const dialog = document.createElement('div'); dialog.className = 'directions-modal';
  dialog.innerHTML = `<div class="directions-panel" role="dialog" aria-modal="true" aria-label="Route to report"><button class="directions-close" type="button" aria-label="Close directions">×</button><p class="eyebrow"><span></span> PawAlert route</p><h2>${escapeHtml(animalName)}</h2><p data-directions-note>Finding route…</p><div class="directions-map"></div></div>`;
  let routeWatch; let routeLine; let vanMarker; let lastRouteAt = 0; let positionVersion = 0;
  const close = () => { if (routeWatch !== undefined) navigator.geolocation?.clearWatch(routeWatch); dialog.remove(); };
  dialog.addEventListener('click', (event) => { if (event.target === dialog || event.target.closest('.directions-close')) close(); }); document.body.append(dialog);
  const map = L.map(dialog.querySelector('.directions-map'), { zoomControl: false }).setView([latitude, longitude], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  map.attributionControl.setPrefix(false);
  L.marker([latitude, longitude]).addTo(map);
  const note = dialog.querySelector('[data-directions-note]');
  const updateRoute = async ({ coords }) => {
    if (!document.body.contains(dialog)) return;
    const version = ++positionVersion;
    const start = await snapToRoad(coords.latitude, coords.longitude);
    if (!document.body.contains(dialog) || version !== positionVersion) return;
    if (!vanMarker) vanMarker = L.marker(start, { icon: pawAlertVanIcon() }).addTo(map);
    else vanMarker.setLatLng(start);
    map.setView(start, 17, { animate: true, duration: .75 });
    post('/moderator/location', { latitude: String(start[0]), longitude: String(start[1]) }, true).catch(() => {});
    if (Date.now() - lastRouteAt < 5000) return;
    lastRouteAt = Date.now();
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${longitude},${latitude}?overview=full&geometries=geojson`);
      const data = await response.json(); const route = data.routes?.[0]; if (!route) throw new Error('No route');
      if (routeLine) routeLine.remove(); routeLine = L.geoJSON(route.geometry, { style: { color: '#e85f6c', weight: 5, opacity: .88 } }).addTo(map);
      note.textContent = `${(route.distance / 1000).toFixed(1)} km · ETA ${Math.ceil(route.duration / 60)} min`;
    } catch (_) { note.textContent = 'Route unavailable'; }
  };
  navigator.geolocation?.getCurrentPosition(updateRoute, () => { note.textContent = 'Allow location access to draw your route. The destination pin is shown on the map.'; }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 });
  routeWatch = navigator.geolocation?.watchPosition(updateRoute, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function attachModeratorLocationControl(container, role) {
  if (!['moderator', 'admin'].includes(role) || container.querySelector('[data-share-location]')) return;
  const profile = container.querySelector('.profile-card'); if (!profile) return;
  const control = document.createElement('div'); control.className = 'moderator-location-control';
  control.innerHTML = '<button class="button button-location" type="button" data-share-location>⌖ Share live location</button><p aria-live="polite">Off until you choose to share.</p>';
  control.querySelector('[data-share-location]').addEventListener('click', () => {
    const note = control.querySelector('p');
    if (!navigator.geolocation) { note.textContent = 'Location is unavailable in this browser.'; return; }
    note.textContent = 'Requesting permission…';
    const update = async ({ coords }) => { try { await post('/moderator/location', { latitude: String(coords.latitude), longitude: String(coords.longitude) }, true); note.textContent = `Live location shared · updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; } catch (error) { note.textContent = error.message; } };
    navigator.geolocation.getCurrentPosition(update, () => { note.textContent = 'Location permission was not granted.'; }, { enableHighAccuracy: true, timeout: 10000 });
    if (moderatorLocationWatch !== undefined) navigator.geolocation.clearWatch(moderatorLocationWatch);
    moderatorLocationWatch = navigator.geolocation.watchPosition(update, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  });
  profile.append(control);
}
document.addEventListener("click", (event) => {
  const caseAction = event.target.closest('[data-case-action]');
  if (caseAction) {
    const reportId = caseAction.dataset.caseReport; const action = caseAction.dataset.caseAction;
    caseAction.disabled = true;
    (async () => { try {
      if (action === 'directions') { openModeratorDirections(caseAction.dataset.caseLatitude, caseAction.dataset.caseLongitude, reportId, caseAction.dataset.caseAnimal); caseAction.disabled = false; return; }
      if (action === 'accept') { await post(`/reports/${reportId}/accept`, {}, true); openModeratorDirections(caseAction.dataset.caseLatitude, caseAction.dataset.caseLongitude, reportId, caseAction.dataset.caseAnimal); }
      else { const label = action === 'verified' ? 'Add verification comment / suggestion for admin:' : action === 'completed' ? 'Add a completion note or suggestion:' : 'Add a responder update or suggestion:'; const note = prompt(label); if (note === null || (action === 'verified' && !note.trim())) { caseAction.disabled = false; return; } await request(`/reports/${reportId}/status`, { method: 'PATCH', body: { status: action, note }, authenticated: true }); }
      clearDashboardCache();
      if (action === 'accept') { caseAction.textContent = 'Accepted · open route above'; caseAction.disabled = true; return; }
      location.reload();
    } catch (error) { alert(error.message); caseAction.disabled = false; } })(); return;
  }
  const statusButton = event.target.closest("[data-case-status]");
  if (statusButton) {
    const current = statusButton.dataset.caseStatus.toLowerCase().replaceAll("_", " ");
    const progressOrder = ["pending", "verified", "in progress", "completed"];
    const currentIndex = Math.max(0, progressOrder.indexOf(current));
    const labels = ["Report received", "Verified", "Rescue in progress", "Completed"];
    const details = ["Your report has reached the PawAlert queue.", "A responder has reviewed the report details.", "A rescue team is working on the case.", "The case has been marked complete."];
    const dialog = document.createElement("div"); dialog.className = "progress-modal";
    dialog.innerHTML = `<div class="progress-panel" role="dialog" aria-modal="true" aria-label="Report progress"><button class="progress-close" type="button" aria-label="Close progress">×</button><p class="eyebrow"><span></span> Report #${escapeHtml(statusButton.dataset.reportId)}</p><h2>Case progress</h2><p class="progress-summary">Current status: <strong>${escapeHtml(current)}</strong></p><ol class="progress-timeline">${labels.map((label, index) => `<li class="${index < currentIndex ? "done" : index === currentIndex ? "current" : ""}"><span>${index < currentIndex ? "✓" : index + 1}</span><div><strong>${label}</strong><p>${details[index]}</p></div></li>`).join("")}</ol><section class="tracking-panel"><strong>Live responder location</strong><p data-tracking-note>Checking for a responder location…</p><div class="tracking-map" data-tracking-map hidden></div></section></div>`;
    let trackingTimer;
    dialog.addEventListener("click", (click) => { if (click.target === dialog || click.target.closest(".progress-close")) { clearInterval(trackingTimer); dialog.remove(); } });
    document.body.append(dialog);
    let map; let responderMarker; let destinationMarker; let routeLine;
    const rescueVanIcon = pawAlertVanIcon();
    const refreshTracking = () => request(`/reports/${statusButton.dataset.reportId}/tracking`, { authenticated: true }).then((tracking) => {
      const note = dialog.querySelector('[data-tracking-note]');
      if (!tracking.available) { note.textContent = 'No responder has shared a live location yet.'; return; }
      note.textContent = `${tracking.moderator_name}'s PawAlert rescue van is live · updated ${new Date(tracking.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
      const mapElement = dialog.querySelector('[data-tracking-map]');
      if (!window.L) return;
      mapElement.hidden = false;
      const moderatorPoint = [tracking.latitude, tracking.longitude]; const destinationPoint = [tracking.destination_latitude, tracking.destination_longitude];
      const hasDestination = Number.isFinite(destinationPoint[0]) && Number.isFinite(destinationPoint[1]) && !(destinationPoint[0] === 0 && destinationPoint[1] === 0);
      if (!map) { map = L.map(mapElement, { zoomControl: false, attributionControl: false }).setView(moderatorPoint, 15); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map); responderMarker = L.marker(moderatorPoint, { icon: rescueVanIcon }).addTo(map).bindPopup('PawAlert rescue van').openPopup(); }
      else responderMarker.setLatLng(moderatorPoint);
      if (!hasDestination) return;
      if (!destinationMarker) destinationMarker = L.marker(destinationPoint).addTo(map).bindPopup('Your report location'); else destinationMarker.setLatLng(destinationPoint);
      fetch(`https://router.project-osrm.org/route/v1/driving/${tracking.longitude},${tracking.latitude};${tracking.destination_longitude},${tracking.destination_latitude}?overview=full&geometries=geojson`).then((response) => response.json()).then((routeData) => {
        const route = routeData.routes?.[0]; if (!route) throw new Error('No route'); if (routeLine) routeLine.remove(); routeLine = L.geoJSON(route.geometry, { style: { color: '#e85f6c', weight: 4 } }).addTo(map); map.fitBounds(routeLine.getBounds(), { padding: [22, 22], maxZoom: 15 }); note.textContent = `${tracking.moderator_name}'s PawAlert rescue van is ${(route.distance / 1000).toFixed(1)} km away · about ${Math.ceil(route.duration / 60)} min by road. Live updates are on while this window is open.`;
      }).catch(() => { map.fitBounds(L.latLngBounds([moderatorPoint, destinationPoint]), { padding: [22, 22] }); });
    }).catch(() => { const note = dialog.querySelector('[data-tracking-note]'); note.textContent = 'Live tracking is available only to the report owner and assigned response team.'; });
    refreshTracking();
    trackingTimer = setInterval(() => { if (document.body.contains(dialog)) refreshTracking(); else clearInterval(trackingTimer); }, 7000);
    return;
  }
  const photo = event.target.closest("[data-completion-photo], [data-report-photo]");
  if (photo) {
    const src = photo.dataset.completionPhoto || photo.dataset.reportPhoto;
    const caption = photo.dataset.completionCaption || photo.dataset.reportCaption;
    const label = photo.dataset.reportPhoto ? "Report photo" : "Treatment completion photo";
    const dialog = document.createElement("div");
    dialog.className = "photo-lightbox";
    dialog.innerHTML = `<div class="photo-lightbox-panel" role="dialog" aria-modal="true" aria-label="${label}"><button class="photo-lightbox-close" type="button" aria-label="Close photo">×</button><img src="${src}" alt="${caption}"><p>${caption}</p></div>`;
    dialog.addEventListener("click", (click) => { if (click.target === dialog || click.target.closest(".photo-lightbox-close")) dialog.remove(); });
    document.body.append(dialog); return;
  }
  const toggle = event.target.closest("[data-profile-toggle]");
  if (toggle) { toggle.parentElement.classList.toggle("menu-open"); return; }
  document.querySelectorAll(".menu-open").forEach((nav) => nav.classList.remove("menu-open"));
});
document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", () => { localStorage.removeItem("pawalert_user"); location.assign("index.html"); }));
loadDashboard();
loadCommunity();
const successMessage = document.querySelector("#success-message"); if (successMessage) { const id = new URLSearchParams(location.search).get("report"); if (id) successMessage.textContent = `Report #${id} is now in the PawAlert queue.`; }
const cat = document.querySelector("#cat-companion"); if (cat) cat.style.setProperty("--cat-delay", `-${Math.round(performance.now() % 26000)}ms`);
