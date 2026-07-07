// ── Constants ──────────────────────────────────────────────
const STORAGE_EXPENSES = "trackr_expenses_v1";
const STORAGE_BUDGETS = "trackr_budgets_v1";
const STORAGE_INCOME = "trackr_income_v1";
const STORAGE_USERS = "trackr_users_v1";
const STORAGE_CURRENT_USER = "trackr_current_user_v1";
const STORAGE_USER_PREFIX = "trackr_user_data_";

const CATEGORIES = [
  { name: "Food", emoji: "🍽", color: "#E85D04", bg: "#FFF0E6" },
  { name: "Transport", emoji: "🚗", color: "#2D6BE4", bg: "#EBF1FD" },
  { name: "Shopping", emoji: "🛍", color: "#9333EA", bg: "#F5EDFE" },
  { name: "Health", emoji: "❤️", color: "#DC2626", bg: "#FEE9E9" },
  { name: "Entertainment", emoji: "🎬", color: "#0891B2", bg: "#E6F7FB" },
  { name: "Bills", emoji: "📄", color: "#16A34A", bg: "#E8F8EE" },
  { name: "Education", emoji: "📚", color: "#CA8A04", bg: "#FEF9E6" },
  { name: "Investments", emoji: "📈", color: "#0F766E", bg: "#E6FFFA" },
  { name: "Other", emoji: "📦", color: "#64748B", bg: "#F1F5F9" },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.name, c]));

// ── State ──────────────────────────────────────────────────
let users = JSON.parse(localStorage.getItem(STORAGE_USERS) || "[]");
let currentUser = JSON.parse(
  localStorage.getItem(STORAGE_CURRENT_USER) || "null",
);
let expenses = [];
let budgets = {};
let income = 0;
let activeFilter = "All";
let editingId = null;
let searchQuery = "";
let selectedMonth = new Date().toISOString().slice(0, 7);
let pieInst = null;
let barInst = null;
let authMode = "signin";

// ── Helpers ────────────────────────────────────────────────
const fmt = (n) => "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");

function sanitizeUsername(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getUserStorageKey(username) {
  return `${STORAGE_USER_PREFIX}${sanitizeUsername(username)}`;
}

function loadUserData() {
  if (currentUser) {
    const saved = JSON.parse(
      localStorage.getItem(getUserStorageKey(currentUser.username)) ||
        '{"expenses":[],"budgets":{},"income":0}',
    );
    expenses = saved.expenses || [];
    budgets = saved.budgets || {};
    income = Number(saved.income) || 0;
    return;
  }

  expenses = JSON.parse(localStorage.getItem(STORAGE_EXPENSES) || "[]");
  budgets = JSON.parse(localStorage.getItem(STORAGE_BUDGETS) || "{}");
  income = parseFloat(localStorage.getItem(STORAGE_INCOME) || "0");
}

function save() {
  if (currentUser) {
    localStorage.setItem(
      getUserStorageKey(currentUser.username),
      JSON.stringify({ expenses, budgets, income }),
    );
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(currentUser));
    return;
  }

  localStorage.setItem(STORAGE_EXPENSES, JSON.stringify(expenses));
  localStorage.setItem(STORAGE_BUDGETS, JSON.stringify(budgets));
  localStorage.setItem(STORAGE_INCOME, income);
}

function getMonthExpenses(monthValue = selectedMonth) {
  const [year, month] = (monthValue || selectedMonth).split("-").map(Number);
  return expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month - 1;
  });
}

function getCatTotals(list) {
  const t = {};
  list.forEach((e) => {
    t[e.cat] = (t[e.cat] || 0) + e.amt;
  });
  return t;
}

// ── Populate Selects ───────────────────────────────────────
function populateSelects() {
  const opts = CATEGORIES.map(
    (c) => `<option value="${c.name}">${c.emoji} ${c.name}</option>`,
  ).join("");
  ["addCat", "editCat", "budCat"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

// ── Tabs ───────────────────────────────────────────────────
const tabTitles = {
  dashboard: "Dashboard",
  add: "Add Expense",
  budgets: "Budgets",
  recurring: "Recurring",
};

function switchTab(tab) {
  document
    .querySelectorAll(".tab-section")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");
  document.getElementById("tabTitle").textContent = tabTitles[tab];
  if (tab === "dashboard") renderCharts();
  // close mobile sidebar
  document.querySelector(".sidebar").classList.remove("open");
}

// ── Metrics ────────────────────────────────────────────────
function renderMetrics() {
  const me = getMonthExpenses();
  const total = me.reduce((s, e) => s + e.amt, 0);
  const bal = income - total;

  document.getElementById("m-total").textContent = fmt(total);

  const incEl = document.getElementById("m-income");
  incEl.textContent = income ? fmt(income) : "—";

  const balEl = document.getElementById("m-balance");
  balEl.textContent = income ? fmt(bal) : "—";
  balEl.className =
    "metric-value " + (income ? (bal < 0 ? "red" : "green") : "");

  document.getElementById("m-count").textContent = me.length;

  const selectedDate = new Date(`${selectedMonth}-01`);
  document.getElementById("monthLabel").textContent =
    selectedDate.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
}

// ── Expense List ───────────────────────────────────────────
function renderExpenseList() {
  const me = getMonthExpenses();
  let list =
    activeFilter === "All" ? me : me.filter((e) => e.cat === activeFilter);

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter((e) => {
      const desc = e.desc.toLowerCase();
      const cat = e.cat.toLowerCase();
      return desc.includes(q) || cat.includes(q);
    });
  }
  const sort = document.getElementById("sortTrans").value;
  if (sort === "highToLow") list = [...list].sort((a, b) => b.amt - a.amt);
  if (sort === "lowToHigh") list = [...list].sort((a, b) => a.amt - b.amt);

  const el = document.getElementById("expenseList");
  if (!list.length) {
    const emptyMsg = searchQuery.trim()
      ? "No transactions match your search."
      : "No transactions for this filter.";
    el.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }

  el.innerHTML = list
    .map((e) => {
      const cat = CAT_MAP[e.cat] || CAT_MAP["Other"];
      const dateStr = new Date(e.date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      });
      return `
      <div class="expense-item">
        <div class="exp-icon" style="background:${cat.bg}">
          <span>${cat.emoji}</span>
        </div>
        <div class="exp-info">
          <div class="exp-name">${e.desc}</div>
          <div class="exp-meta">
            <span class="cat-badge" style="background:${cat.bg};color:${cat.color}">${cat.name}</span>
            ${dateStr}
            ${e.recur ? '<span class="recur-tag">↻ recurring</span>' : ""}
          </div>
        </div>
        <div class="exp-amount">-${fmt(e.amt)}</div>
        <div class="exp-actions">
          <button class="icon-btn" onclick="openEdit(${e.id})" title="Edit">✎</button>
          <button class="icon-btn del" onclick="deleteExpense(${e.id})" title="Delete">✕</button>
        </div>
      </div>`;
    })
    .join("");
}

// ── Category Filters ───────────────────────────────────────
function renderFilters() {
  const me = getMonthExpenses();
  const cats = ["All", ...new Set(me.map((e) => e.cat))];
  document.getElementById("catFilters").innerHTML = cats
    .map(
      (c) =>
        `<button class="pill ${c === activeFilter ? "active" : ""}" onclick="setFilter('${c}')">${c}</button>`,
    )
    .join("");
}

window.setFilter = function (c) {
  activeFilter = c;
  renderFilters();
  renderExpenseList();
};

// ── Add Expense ────────────────────────────────────────────
document.getElementById("addBtn").addEventListener("click", () => {
  const desc = document.getElementById("addDesc").value.trim();
  const amt = parseFloat(document.getElementById("addAmount").value);
  const cat = document.getElementById("addCat").value;
  const date = document.getElementById("addDate").value;
  const recur = document.getElementById("addRecurring").checked;
  const info = document.getElementById("formInfo");

  if (!desc) {
    info.textContent = "Please enter a description.";
    return;
  }
  if (!amt || amt <= 0) {
    info.textContent = "Please enter a valid amount.";
    return;
  }
  if (!date) {
    info.textContent = "Please select a date.";
    return;
  }

  info.textContent = "";
  expenses.unshift({ id: Date.now(), desc, amt, cat, date, recur });
  selectedMonth = new Date().toISOString().slice(0, 7);
  save();
  document.getElementById("addDesc").value = "";
  document.getElementById("addAmount").value = "";
  document.getElementById("addRecurring").checked = false;
  document.getElementById("addDate").value = new Date()
    .toISOString()
    .split("T")[0];
  renderAll();
  switchTab("dashboard");
});

document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("addDesc").value = "";
  document.getElementById("addAmount").value = "";
  document.getElementById("addRecurring").checked = false;
  document.getElementById("formInfo").textContent = "";
});

// ── Delete Expense ─────────────────────────────────────────
window.deleteExpense = function (id) {
  expenses = expenses.filter((e) => e.id !== id);
  save();
  renderAll();
};

// ── Edit Modal ─────────────────────────────────────────────
window.openEdit = function (id) {
  const e = expenses.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  document.getElementById("editAmount").value = e.amt;
  document.getElementById("editDesc").value = e.desc;
  document.getElementById("editCat").value = e.cat;
  document.getElementById("editOverlay").classList.add("open");
};

document.getElementById("closeEdit").addEventListener("click", () => {
  document.getElementById("editOverlay").classList.remove("open");
});

document.getElementById("editOverlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("editOverlay"))
    document.getElementById("editOverlay").classList.remove("open");
});

document.getElementById("editTranBtn").addEventListener("click", () => {
  const amt = parseFloat(document.getElementById("editAmount").value);
  const desc = document.getElementById("editDesc").value.trim();
  const cat = document.getElementById("editCat").value;
  if (!desc || !amt || amt <= 0) return;
  const idx = expenses.findIndex((e) => e.id === editingId);
  if (idx !== -1) {
    expenses[idx] = { ...expenses[idx], amt, desc, cat };
    save();
    renderAll();
  }
  document.getElementById("editOverlay").classList.remove("open");
});

// ── Income ─────────────────────────────────────────────────
document.getElementById("saveIncome").addEventListener("click", () => {
  const v = parseFloat(document.getElementById("incomeInput").value);
  if (!v || v <= 0) return;
  income = v;
  save();
  renderAll();
});

// ── Budgets ────────────────────────────────────────────────
document.getElementById("saveBudBtn").addEventListener("click", () => {
  const cat = document.getElementById("budCat").value;
  const amt = parseFloat(document.getElementById("budAmt").value);
  if (!amt || amt <= 0) return;
  budgets[cat] = amt;
  save();
  renderBudgets();
});

function renderBudgets() {
  const catTotals = getCatTotals(getMonthExpenses());
  const el = document.getElementById("budgetList");
  const keys = Object.keys(budgets);

  // Update budget header metrics
  const totalBudget = keys.length
    ? keys.reduce((s, k) => s + (budgets[k] || 0), 0)
    : 0;
  const totalSpent = Object.values(catTotals).reduce((a, b) => a + b, 0);
  const remaining = totalBudget - totalSpent;
  if (document.getElementById("m-total-budget"))
    document.getElementById("m-total-budget").textContent = totalBudget
      ? fmt(totalBudget)
      : "₹0";
  if (document.getElementById("m-bud-spent"))
    document.getElementById("m-bud-spent").textContent = fmt(totalSpent);
  if (document.getElementById("m-bud-remaining"))
    document.getElementById("m-bud-remaining").textContent = totalBudget
      ? fmt(remaining)
      : "—";
  const overallPct = totalBudget
    ? Math.min(100, Math.round((totalSpent / totalBudget) * 100))
    : 0;
  const overallLabel = document.getElementById("overallPctLabel");
  if (overallLabel)
    overallLabel.textContent = `${overallPct}% of monthly budget used`;
  const overallFill = document.getElementById("overallProgressFill");
  if (overallFill) overallFill.style.width = overallPct + "%";
  if (!keys.length) {
    el.innerHTML = '<div class="empty-state">No budgets set yet.</div>';
    return;
  }

  el.innerHTML = keys
    .map((cat) => {
      const spent = catTotals[cat] || 0;
      const limit = budgets[cat];
      const pct = Math.min(100, Math.round((spent / limit) * 100));
      const over = spent > limit;
      const color = over ? "#9B2335" : pct > 75 ? "#854F0B" : "#2D6A4F";
      const c = CAT_MAP[cat] || CAT_MAP["Other"];
      return `
      <div class="budget-row">
        <div class="budget-top">
          <div class="budget-name">
            <span>${c.emoji}</span> ${cat}
          </div>
          <div class="budget-nums">
            ${fmt(spent)} / ${fmt(limit)}
            ${over ? '<span class="over-badge">Over budget!</span>' : `<span style="color:var(--text-3)">${pct}%</span>`}
          </div>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
    })
    .join("");
}

// ── Category Grid (Budgets + quick actions) ───────────────
function renderCategoryGrid() {
  const catTotals = getCatTotals(getMonthExpenses());
  const counts = {};
  getMonthExpenses().forEach((e) => (counts[e.cat] = (counts[e.cat] || 0) + 1));
  const grid = document.getElementById("categoryGrid");
  if (!grid) return;

  grid.innerHTML = CATEGORIES.map((c) => {
    const spent = catTotals[c.name] || 0;
    const txCount = counts[c.name] || 0;
    const budgetSet = budgets[c.name] !== undefined;
    const budgetLabel = budgetSet
      ? fmt(budgets[c.name])
      : `<button class=\"btn-secondary small set-budget-btn\" onclick=\"setBudgetForCategory('${c.name}')\">Set Budget</button>`;
    return `
      <div class="cat-card">
          <div class="cat-top">
          <div class="cat-icon" style="background:${c.bg};color:${c.color}">${c.emoji}</div>
          <div class="cat-info">
            <div class="cat-name">${c.name}</div>
            <div class="cat-count">${txCount} transactions</div>
          </div>
        </div>
        <div class="cat-bottom">
          <div class="cat-amount">${fmt(spent)}</div>
          <div class="cat-action">${budgetLabel}</div>
        </div>
      </div>`;
  }).join("");
}

window.setBudgetForCategory = function (catName) {
  const select = document.getElementById("budCat");
  const amt = document.getElementById("budAmt");
  if (select) select.value = catName;
  if (amt) amt.focus();
  switchTab("budgets");
  // scroll the budget form into view
  document
    .querySelector("#tab-budgets .form-card")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
};

// ── Recurring ──────────────────────────────────────────────
function renderRecurring() {
  const recur = expenses.filter((e) => e.recur);
  const el = document.getElementById("recurList");
  if (!recur.length) {
    el.innerHTML =
      '<div class="empty-state">No recurring expenses. Mark one when adding.</div>';
    return;
  }

  const total = recur.reduce((s, e) => s + e.amt, 0);
  el.innerHTML =
    `<div class="recur-summary">Total monthly recurring: <strong>${fmt(total)}</strong></div>` +
    recur
      .map((e) => {
        const cat = CAT_MAP[e.cat] || CAT_MAP["Other"];
        return `
        <div class="expense-item">
          <div class="exp-icon" style="background:${cat.bg}"><span>${cat.emoji}</span></div>
          <div class="exp-info">
            <div class="exp-name">${e.desc}</div>
            <div class="exp-meta">
              <span class="cat-badge" style="background:${cat.bg};color:${cat.color}">${cat.name}</span>
              every month
            </div>
          </div>
          <div class="exp-amount">-${fmt(e.amt)}</div>
          <div class="exp-actions">
            <button class="icon-btn del" onclick="deleteExpense(${e.id})" title="Delete">✕</button>
          </div>
        </div>`;
      })
      .join("");
}

// ── Charts ─────────────────────────────────────────────────
function renderCharts() {
  const me = getMonthExpenses();
  const catTotals = getCatTotals(me);
  const cats = Object.keys(catTotals);
  const vals = cats.map((c) => catTotals[c]);
  const colors = cats.map((c) => (CAT_MAP[c] || CAT_MAP["Other"]).color);

  // Pie
  if (pieInst) pieInst.destroy();
  const pieCtx = document.getElementById("pieChart").getContext("2d");
  if (cats.length) {
    pieInst = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: cats,
        datasets: [
          {
            data: vals,
            backgroundColor: colors,
            borderWidth: 3,
            borderColor: "#fff",
            hoverBorderColor: "#fff",
            radius: "90%",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.label}: ${fmt(ctx.raw)}` },
          },
        },
      },
    });
    const totalSpent = vals.reduce((a, b) => a + b, 0);
    document.getElementById("pieLegend").innerHTML = cats
      .map(
        (c, i) =>
          `<div class="legend-item">
        <span class="legend-dot" style="background:${colors[i]}"></span>
        ${c} <span style="color:var(--text-3)">${Math.round((vals[i] / totalSpent) * 100)}%</span>
      </div>`,
      )
      .join("");
  } else {
    document.getElementById("pieLegend").innerHTML = "";
    pieCtx.canvas
      .closest(".chart-card")
      .querySelector(".chart-wrap").innerHTML =
      '<div class="empty-state" style="padding:3rem 0">No data yet</div>';
  }

  // Bar (daily)
  if (barInst) barInst.destroy();
  const now = new Date();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const daily = Array(daysInMonth).fill(0);
  me.forEach((e) => {
    daily[new Date(e.date).getDate() - 1] += e.amt;
  });

  barInst = new Chart(document.getElementById("barChart").getContext("2d"), {
    type: "bar",
    data: {
      labels: Array.from({ length: daysInMonth }, (_, i) => i + 1),
      datasets: [
        {
          label: "Spent",
          data: daily,
          backgroundColor: "rgba(26,26,24,0.07)",
          borderColor: "rgba(26,26,24,0.5)",
          borderWidth: 1.5,
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 12, family: "DM Sans", weight: 500 },
            color: "#6B7280",
            maxTicksLimit: 12,
          },
        },
        y: {
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            font: { size: 12, family: "DM Sans", weight: 500 },
            color: "#6B7280",
            callback: (v) => (v === 0 ? "" : "₹" + Math.round(v / 1000) + "k"),
          },
        },
      },
    },
  });
}

// ── Mobile Menu ────────────────────────────────────────────
document.getElementById("mobileMenu").addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("open");
});

// ── Nav Clicks ─────────────────────────────────────────────
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ── Sort change ────────────────────────────────────────────
document
  .getElementById("sortTrans")
  .addEventListener("change", renderExpenseList);

// ── Search & Sort ────────────────────────────────────────
document.getElementById("searchTrans").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderExpenseList();
});

document.getElementById("monthPicker").addEventListener("change", (e) => {
  selectedMonth = e.target.value;
  renderAll();
});

document
  .getElementById("sortTrans")
  .addEventListener("change", renderExpenseList);
  
// ── Render All ─────────────────────────────────────────────
function renderAll() {
  renderMetrics();
  renderFilters();
  renderExpenseList();
  renderBudgets();
  renderRecurring();
  renderCategoryGrid();
  renderCharts();
}

// ── Init ───────────────────────────────────────────────────
loadUserData();
document.getElementById("addDate").value = new Date()
  .toISOString()
  .split("T")[0];
document.getElementById("monthPicker").value = selectedMonth;
if (income) document.getElementById("incomeInput").value = income;
populateSelects();
setAuthMode("signin");
updateAuthUI();
if (currentUser) {
  renderAll();
}

document
  .getElementById("authForm")
  .addEventListener("submit", handleAuthSubmit);
document
  .getElementById("showSignin")
  .addEventListener("click", () => setAuthMode("signin"));
document
  .getElementById("showSignup")
  .addEventListener("click", () => setAuthMode("signup"));
document.getElementById("authSwitchBtn").addEventListener("click", () => {
  setAuthMode(authMode === "signin" ? "signup" : "signin");
});
document.getElementById("logoutBtn").addEventListener("click", logoutUser);
