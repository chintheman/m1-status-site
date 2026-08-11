// M1 Status — public dashboard client. Reads masked JSON from the same repo.
const DATA_URL = "data/latest-public.json";
const HIST_URL = "data/history-public.jsonl";

const $ = (id) => document.getElementById(id);
const statusColor = (s) => (s === "green" ? "green" : s === "yellow" ? "yellow" : "red");
// escape user-visible strings (data is from our own collector, but never assume)
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtAge(ts) {
  const age = (Date.now() - new Date(ts).getTime()) / 1000;
  if (!isFinite(age)) return "unknown";
  if (age < 90) return "just now";
  if (age < 3600) return Math.round(age / 60) + "m ago";
  return Math.round(age / 3600) + "h ago";
}

function renderCard(key, statEl, subEl, stat, sub) {
  const el = $(statEl);
  el.textContent = stat;
  el.className = "stat " + statusColor(key);
  $(subEl).textContent = sub;
}

function render(d) {
  const st = d.status || {};
  const pill = $("pill");
  pill.textContent = st.overall || "unknown";
  pill.className = "pill pill-" + (st.overall || "unknown");
  $("lastseen").textContent = "last seen " + fmtAge(d.ts);
  $("freshness").textContent = d.ts + " (" + fmtAge(d.ts) + ")";
  $("collector-v").textContent = d.collector_version || "—";

  const p = d.power || {};
  const bc = d.battery_condition || {};
  renderCard(st.details.power, "power-stat", "power-sub",
    p.source === "AC Power" ? "AC ⚡" : "Battery " + (p.charge_pct ?? "?") + "%",
    (p.charge_pct ?? "—") + "% · " + (bc.max_capacity_pct ? bc.max_capacity_pct + "% health" : "") + (p.temperature_c ? " · " + p.temperature_c + "°C" : ""));

  const m = d.memory || {};
  renderCard(st.details.memory, "memory-stat", "memory-sub",
    m.free_pct + "% free",
    (m.swap_used_mb ?? 0) + "MB swap · " + (m.pressure_level || "—"));

  const c = d.cpu || {};
  renderCard(st.details.cpu_thermal, "cpu-stat", "cpu-sub",
    "load " + (c.load1 ?? "—"),
    (c.thermal_pressure || "—") + " · " + (c.cpu_speed_limit_pct ?? 100) + "% speed limit");

  const k = d.disk || {};
  renderCard(st.details.disk, "disk-stat", "disk-sub",
    (k.free_gb ?? "—") + " GB free",
    (k.pct_used ?? "—") + "% used · " + (k.smart_status || "no SMART"));

  const n = d.network || {};
  renderCard(st.details.network, "net-stat", "net-sub",
    (n.latency_ms != null ? n.latency_ms + " ms" : "—"),
    (n.packet_loss_pct ?? "—") + "% loss · WiFi " + (n.wifi ? n.wifi.signal_dbm + " dBm" : "—"));

  const sv = d.services || {};
  renderCard(st.details.services, "svc-stat", "svc-sub",
    sv.cloudflared ? "tunnel up" : "TUNNEL DOWN",
    "dashboard " + (sv.hermes_dashboard_9119 ? "up" : "down") + " · tailscale " + (sv.tailscaled ? "up" : "off"));

  // tokens
  const tok = d.token_usage || {};
  const tbody = $("tokens");
  const h = tok.hermes || {}, cl = tok.claude || {};
  const fmt = (x) => (x == null ? "—" : x.toLocaleString());
  tbody.innerHTML = [
    ["Hermes sessions (24h)", fmt(h.sessions)],
    ["Hermes tokens (24h)", fmt(h.total_tokens)],
    ["Hermes top model", h.top_model || "—"],
    ["Claude output (24h)", fmt(cl.output_tokens_24h)],
    ["Claude cache-read (24h)", fmt(cl.cache_read_24h)],
    ["Active Claude sessions", fmt(cl.active_files_24h)],
  ].map(([a, b]) => `<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join("");

  // system
  const sy = d.system || {};
  const upDays = sy.uptime_s ? (sy.uptime_s / 86400).toFixed(1) : "—";
  const up = d.updates || {};
  const upd = ((up.brew && up.brew.count) || 0) + ((up.macos && up.macos.count) || 0);
  $("sysinfo").innerHTML = [
    ["macOS", sy.macos_version || "—"],
    ["Uptime", upDays + " days"],
    ["Boot", sy.boot_time || "—"],
    ["Panics (7d)", sy.panic_count_7d ?? "—"],
    ["Running apps", (d.activity && d.activity.running_apps) ?? "—"],
    ["Active sessions", (d.activity && d.activity.active_claude_sessions) ?? "—"],
    ["SSH failures (24h)", (d.security && d.security.ssh_failures_24h) ?? "—"],
    ["Updates pending", upd + " (brew " + ((up.brew && up.brew.count) || 0) + " · macos " + ((up.macos && up.macos.count) || 0) + ")"],
  ].map(([a, b]) => `<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join("");
}

const charts = {};
function lineChart(id, labels, values, color) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ data: values, borderColor: color, backgroundColor: color + "22", fill: true, tension: .3, pointRadius: 0, borderWidth: 2 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { ticks: { font: { size: 10 } } } },
      animation: false,
    },
  });
}

function renderHistory(lines) {
  const n = lines.length;
  if (!n) return;
  const labels = lines.map((l) => new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  lineChart("ch-battery", labels, lines.map((l) => l.power && l.power.charge_pct), "#1E3C78");
  lineChart("ch-memory", labels, lines.map((l) => l.memory && l.memory.free_pct), "#2F9E44");
  lineChart("ch-load", labels, lines.map((l) => l.cpu && l.cpu.load1), "#FF6B6B");
  lineChart("ch-disk", labels, lines.map((l) => l.disk && l.disk.free_gb), "#E8A53A");
}

async function load() {
  try {
    const [dRes, hRes] = await Promise.all([fetch(DATA_URL), fetch(HIST_URL)]);
    const d = await dRes.json();
    render(d);
    const hist = (await hRes.text()).trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    renderHistory(hist);
  } catch (e) {
    $("pill").textContent = "offline";
    $("pill").className = "pill pill-red";
    $("lastseen").textContent = "couldn't fetch data (" + e.message + ")";
  }
}
load();
setInterval(load, 60000);
