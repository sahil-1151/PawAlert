const API_BASE = window.PAWALERT_API_URL || (location.port === "4173" ? "http://127.0.0.1:8080" : "");
const setStatus = (form, text, type = "") => { const status = form.querySelector(".form-status"); status.textContent = text; status.className = `form-status ${type}`; };
const currentUser = () => JSON.parse(localStorage.getItem("pawalert_user") || "null");
function updateNavigation() {
  const user = currentUser();
  if (!user) return;
  document.querySelectorAll(".site-header nav").forEach((nav) => {
    nav.querySelectorAll('a[href="login.html"], a[href="signup.html"]').forEach((link) => link.remove());
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
    if (!nav.querySelector(".account-menu")) {
      const menu = document.createElement("div");
      menu.className = "account-menu";
      menu.innerHTML = `<strong>${escapeHtml(user.name || "PawAlert user")}</strong><span>${escapeHtml(user.email || "")}</span><small>${escapeHtml(labelForRole(user.role || "citizen"))}</small><a href="dashboard.html">Dashboard</a><button type="button" data-logout>Log out</button>`;
      nav.append(menu);
    }
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

async function submitPendingReport() {
  const stored = sessionStorage.getItem("pawalert_pending_report");
  if (!stored) return null;
  const report = await post("/reports/full", JSON.parse(stored), true);
  sessionStorage.removeItem("pawalert_pending_report");
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
    setStatus(form, "Verifying your code…"); await post("/auth/verify-otp", { email: values.email, otp: values.otp }); const user = await post("/users", { name: values.name, email: values.email, password: values.password }); localStorage.setItem("pawalert_user", JSON.stringify({ ...user, email: values.email })); location.assign("dashboard.html");
  } catch (error) { setStatus(form, error.message, "error"); } finally { button.disabled = false; }
}));

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const labelForRole = (role) => ({ citizen: "Citizen", moderator: "Moderator", admin: "Administrator" }[role] || role);
updateNavigation();
function reportCards(reports, emptyText, canUpload = false) {
  if (!reports?.length) return `<p class="empty-state">${emptyText}</p>`;
  return reports.map((r) => `<article class="report-card ${r.completion_photo ? "report-card-photo" : ""}"><div><span class="status status-${escapeHtml(r.status).toLowerCase()}">${escapeHtml(r.status)}</span><h3>${escapeHtml(r.animal_type)}</h3><p>${escapeHtml(r.condition)} · ${escapeHtml(r.location || r.area)}, ${escapeHtml(r.city || r.area)}</p>${r.completion_photo ? `<button class="completion-photo-button" type="button" data-completion-photo="${escapeHtml(r.completion_photo)}" data-completion-caption="Treatment completed · ${escapeHtml(r.animal_type)}"><img class="completion-photo" src="${escapeHtml(r.completion_photo)}" alt="Animal after treatment for report #${escapeHtml(r.report_id)}" loading="lazy" decoding="async"><span>View treatment photo</span></button>` : ""}${r.status === "completed" && !r.completion_photo ? `<p class="photo-pending">${canUpload ? "Add a post-treatment photo below." : "Treatment completed · photo update awaited from the rescue team."}</p>` : ""}${canUpload && r.status === "completed" && !r.completion_photo ? `<label class="completion-upload">Add treatment photo<input type="file" accept="image/jpeg,image/png,image/webp" data-completion-upload="${escapeHtml(r.report_id)}"></label>` : ""}</div><div class="report-meta"><strong>#${escapeHtml(r.report_id)}</strong><span>${new Date(r.created_at).toLocaleDateString()}</span></div></article>`).join("");
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
    const data = await request("/dashboard", { authenticated: true }); const citizen = data.profile.role === "citizen"; const focusTitle = citizen ? "My reports" : data.profile.role === "moderator" ? "Reports in my area" : "All reports"; const focusReports = Array.isArray(citizen ? data.my_reports : data.managed_reports) ? (citizen ? data.my_reports : data.managed_reports) : []; const communityReports = Array.isArray(data.community_reports) ? data.community_reports : [];
    const canUpload = ["moderator", "admin"].includes(data.profile.role);
    container.innerHTML = `<section class="dashboard-hero"><div><p class="eyebrow"><span></span> ${labelForRole(data.profile.role)} dashboard</p><h1>Welcome, ${escapeHtml(data.profile.name)}.</h1><p>Keep up with the cases and people who need your attention.</p></div><aside class="profile-card"><div class="profile-avatar">${escapeHtml(data.profile.name.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(data.profile.name)}</strong><span>${escapeHtml(data.profile.email)}</span><small>${labelForRole(data.profile.role)}</small></div></aside></section><section class="dashboard-stats"><article><span>${citizen ? "Reports submitted" : "Cases in view"}</span><strong>${data.stats.total_cases}</strong></article><article><span>Pending attention</span><strong>${data.stats.pending_cases}</strong></article><article><span>Community updates</span><strong>${communityReports.length}</strong></article></section><section class="dashboard-section"><div class="section-title"><div><p class="eyebrow"><span></span> Your workspace</p><h2>${focusTitle}</h2></div>${citizen ? '<a class="button button-primary" href="report.html">Make a report <span>→</span></a>' : ""}</div><div class="report-grid">${reportCards(focusReports, "No reports are available yet.", canUpload)}</div></section>`;
    attachCompletionUploads(container);
  } catch (error) { container.innerHTML = `<section class="dashboard-error"><h1>Dashboard unavailable</h1><p>${escapeHtml(error.message)}</p><a class="button button-primary" href="login.html">Log in again</a></section>`; }
}
async function loadCommunity() {
  const container = document.querySelector("#community-page"); if (!container) return;
  if (!currentUser()?.token) { location.replace("login.html"); return; }
  container.innerHTML = dashboardSkeleton(false);
  await afterNextPaint();
  try {
    const data = await request("/dashboard", { authenticated: true });
    const reports = Array.isArray(data.community_reports) ? data.community_reports : [];
    const urgentCount = reports.filter((report) => report.priority === "urgent").length;
    const pendingCount = reports.filter((report) => report.status === "pending").length;
    const canUpload = ["moderator", "admin"].includes(data.profile.role);
    container.innerHTML = `<section class="community-page-heading"><p class="eyebrow"><span></span> PawAlert community</p><h1>Reports that need local care.</h1><p>See recent animal-welfare reports from across the PawAlert community.</p></section><section class="community-insights"><article><span>Recent reports</span><strong>${reports.length}</strong></article><article><span>Urgent attention</span><strong>${urgentCount}</strong></article><article><span>Pending updates</span><strong>${pendingCount}</strong></article></section><section class="dashboard-section community-section"><div class="community-toolbar"><div class="community-filters" aria-label="Filter community reports"><button class="active" data-community-filter="all">All reports</button><button data-community-filter="urgent">Urgent</button><button data-community-filter="pending">Pending</button></div></div><div class="report-grid" data-community-results>${reportCards(reports, "No reports are available yet.", canUpload)}</div></section><section class="community-guide"><div><p class="eyebrow"><span></span> Help safely</p><h2>What to do while help is on the way</h2></div><div class="guide-cards"><article><strong>01</strong><h3>Keep a safe distance</h3><p>Do not approach a frightened or injured animal suddenly. Keep people and traffic away when possible.</p></article><article><strong>02</strong><h3>Share clear details</h3><p>Add a landmark, condition, and location so a nearby moderator can respond without delay.</p></article><article><strong>03</strong><h3>Do not give medicine</h3><p>Offer water only if safe. Wait for trained rescue support before attempting treatment or transport.</p></article></div></section>`;
    const results = container.querySelector("[data-community-results]");
    container.querySelectorAll("[data-community-filter]").forEach((button) => button.addEventListener("click", () => {
      const filter = button.dataset.communityFilter;
      const filtered = filter === "all" ? reports : reports.filter((report) => filter === "urgent" ? report.priority === "urgent" : report.status === "pending");
      container.querySelectorAll("[data-community-filter]").forEach((item) => item.classList.toggle("active", item === button));
      results.innerHTML = reportCards(filtered, `No ${filter} community reports right now.`, canUpload);
      attachCompletionUploads(container);
    }));
  } catch (error) { container.innerHTML = `<section class="dashboard-error"><h1>Community unavailable</h1><p>${escapeHtml(error.message)}</p></section>`; }
}
function attachCompletionUploads(container) {
  container.querySelectorAll("[data-completion-upload]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert("Please choose an image smaller than 3 MB."); input.value = ""; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try { await post(`/reports/${input.dataset.completionUpload}/completion-photo`, { photo: reader.result }, true); location.reload(); }
      catch (error) { alert(error.message); input.value = ""; }
    };
    reader.readAsDataURL(file);
  }));
}
document.addEventListener("click", (event) => {
  const photo = event.target.closest("[data-completion-photo]");
  if (photo) {
    const dialog = document.createElement("div");
    dialog.className = "photo-lightbox";
    dialog.innerHTML = `<div class="photo-lightbox-panel" role="dialog" aria-modal="true" aria-label="Treatment completion photo"><button class="photo-lightbox-close" type="button" aria-label="Close photo">×</button><img src="${photo.dataset.completionPhoto}" alt="${photo.dataset.completionCaption}"><p>${photo.dataset.completionCaption}</p></div>`;
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
