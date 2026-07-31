const STAT_ORDER = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
const TIER_MAX = 6;
const STORAGE_KEY = "pokemmoBreedCalc.v1";

const state = {
  plan: null,
  purchases: [],
};

const els = {
  targetName: document.getElementById("targetName"),
  natureName: document.getElementById("natureName"),
  requireHA: document.getElementById("requireHA"),
  haChance: document.getElementById("haChance"),
  single31Market: document.getElementById("single31Market"),
  single31Self: document.getElementById("single31Self"),
  singleHAMarket: document.getElementById("singleHAMarket"),
  singleHASelf: document.getElementById("singleHASelf"),
  natureMarket: document.getElementById("natureMarket"),
  natureSelf: document.getElementById("natureSelf"),
  braceCost: document.getElementById("braceCost"),
  everstoneCost: document.getElementById("everstoneCost"),
  breedFee: document.getElementById("breedFee"),
  buyFinalHA: document.getElementById("buyFinalHA"),
  tierGrid: document.getElementById("tierGrid"),
  calculateBtn: document.getElementById("calculateBtn"),
  summary: document.getElementById("summary"),
  steps: document.getElementById("steps"),
  treeSvg: document.getElementById("treeSvg"),
  downloadPlanBtn: document.getElementById("downloadPlanBtn"),
  addPurchaseBtn: document.getElementById("addPurchaseBtn"),
  purchaseBody: document.getElementById("purchaseBody"),
  purchaseSummary: document.getElementById("purchaseSummary"),
};

init();

function init() {
  buildTierInputs();
  loadState();
  bindEvents();
  if (!state.purchases.length) {
    addPurchase({ item: "Sample: Brace", qty: 2, unitCost: 10000, note: "Edit or delete" });
  }
  calculate();
}

function bindEvents() {
  els.calculateBtn.addEventListener("click", calculate);
  els.downloadPlanBtn.addEventListener("click", downloadPlan);
  els.addPurchaseBtn.addEventListener("click", () => {
    addPurchase({ item: "", qty: 1, unitCost: 0, note: "" });
    saveState();
    renderPurchases();
  });

  document.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("change", () => {
      saveState();
      calculate();
    });
  });
}

function buildTierInputs() {
  for (let tier = 2; tier <= TIER_MAX; tier += 1) {
    const wrapper = document.createElement("label");
    wrapper.innerHTML = `
      Buy ${tier}x31 Breeder (optional)
      <input id="tier${tier}Price" type="number" min="0" value="0" />
    `;
    els.tierGrid.appendChild(wrapper);
  }
}

function readNumber(id, fallback = 0) {
  const value = Number.parseFloat(els[id].value);
  return Number.isFinite(value) ? value : fallback;
}

function selectedStats() {
  return [...document.querySelectorAll("input[data-stat]:checked")].map((i) => i.dataset.stat);
}

function calculate() {
  const stats = selectedStats();
  const wantHA = els.requireHA.value === "yes";
  const nature = els.natureName.value.trim();
  const targetName = els.targetName.value.trim() || "Target";

  if (!stats.length) {
    state.plan = null;
    renderEmpty("Select at least one perfect IV stat.");
    renderPurchases();
    return;
  }

  const cfg = {
    targetName,
    stats,
    nature,
    wantHA,
    haChance: clamp(readNumber("haChance", 60), 1, 100) / 100,
    costs: {
      single31: minPositive(readNumber("single31Market", 0), readNumber("single31Self", 0)),
      singleHA: minPositive(readNumber("singleHAMarket", 0), readNumber("singleHASelf", 0)),
      nature: minPositive(readNumber("natureMarket", 0), readNumber("natureSelf", 0)),
      brace: readNumber("braceCost", 0),
      everstone: readNumber("everstoneCost", 0),
      breedFee: readNumber("breedFee", 0),
      buyFinalHA: readNumber("buyFinalHA", 0),
      tiers: Array.from({ length: TIER_MAX + 1 }, (_, i) => {
        if (i < 2) return 0;
        const input = document.getElementById(`tier${i}Price`);
        return input ? Number.parseFloat(input.value) || 0 : 0;
      }),
    },
  };

  const ivPlan = solveIvPlan(cfg.stats.length, cfg.costs);
  let rootNode = ivPlan.node;
  let runningCost = ivPlan.totalCost;
  const assumptions = [
    "IV optimizer uses dynamic programming and can buy pre-built IV tiers when cheaper.",
    "Each IV merge attempt assumes 2 braces + 1 breeding fee.",
  ];

  if (nature) {
    const natureCost = cfg.costs.nature;
    const stepCost = cfg.costs.breedFee + cfg.costs.everstone + cfg.costs.brace;
    runningCost += natureCost + stepCost;
    rootNode = makeNode({
      kind: "merge",
      label: `Lock ${nature} nature`,
      cost: runningCost,
      stepCost,
      details: `Use Everstone parent + one brace to retain IV line`,
      children: [
        rootNode,
        makeNode({ kind: "leaf", label: `Nature parent (${nature})`, cost: natureCost, details: "Buy or self-source" }),
      ],
    });
    assumptions.push("Nature lock step assumes one Everstone and one brace.");
  }

  let haExpectedCost = null;
  if (wantHA) {
    const donorCost = cfg.costs.singleHA;
    const attemptItems = cfg.costs.breedFee + cfg.costs.brace + (nature ? cfg.costs.everstone : 0);
    const attemptCost = runningCost + donorCost + attemptItems;
    const expectedBreedToHA = attemptCost / cfg.haChance;
    const buyFinalHA = cfg.costs.buyFinalHA > 0 ? cfg.costs.buyFinalHA : Number.POSITIVE_INFINITY;

    if (buyFinalHA < expectedBreedToHA) {
      runningCost = buyFinalHA;
      rootNode = makeNode({
        kind: "buy",
        label: `Buy final HA target from market`,
        cost: runningCost,
        details: "Direct purchase beats expected breeding route",
        children: [],
      });
      assumptions.push("Final HA market buy was cheaper than expected HA breeding attempts.");
    } else {
      runningCost = expectedBreedToHA;
      rootNode = makeNode({
        kind: "merge",
        label: "Roll hidden ability on final step",
        cost: runningCost,
        stepCost: attemptItems,
        details: `Expected attempts = ${(1 / cfg.haChance).toFixed(2)}x`,
        children: [
          rootNode,
          makeNode({ kind: "leaf", label: "HA donor parent", cost: donorCost, details: "Buy or self-source" }),
        ],
      });
      assumptions.push("HA step is expected-value based and uses the configured inheritance chance.");
    }
    haExpectedCost = runningCost;
  }

  state.plan = {
    config: cfg,
    ivOnlyCost: ivPlan.totalCost,
    totalCost: runningCost,
    rootNode,
    assumptions,
    haExpectedCost,
    itemCounts: countItems(rootNode),
    pathSteps: flattenSteps(rootNode),
  };

  renderPlan();
  renderPurchases();
  saveState();
}

function solveIvPlan(statCount, costs) {
  const dp = Array.from({ length: statCount + 1 }, () => null);

  dp[1] = {
    totalCost: costs.single31,
    choice: { type: "leaf" },
  };

  for (let t = 2; t <= statCount; t += 1) {
    let best = {
      totalCost: Number.POSITIVE_INFINITY,
      choice: null,
    };

    for (let left = 1; left < t; left += 1) {
      const right = t - left;
      const mergeCost = dp[left].totalCost + dp[right].totalCost + costs.breedFee + costs.brace * 2;
      if (mergeCost < best.totalCost) {
        best = {
          totalCost: mergeCost,
          choice: { type: "merge", left, right, stepCost: costs.breedFee + costs.brace * 2 },
        };
      }
    }

    const buyCost = costs.tiers[t] > 0 ? costs.tiers[t] : Number.POSITIVE_INFINITY;
    if (buyCost < best.totalCost) {
      best = {
        totalCost: buyCost,
        choice: { type: "buy", tier: t },
      };
    }

    dp[t] = best;
  }

  const stats = STAT_ORDER.slice(0, statCount);
  const node = buildIvNode(statCount, dp, stats);

  return {
    totalCost: dp[statCount].totalCost,
    node,
  };
}

function buildIvNode(tier, dp, stats) {
  const choice = dp[tier].choice;
  if (tier === 1 || choice.type === "leaf") {
    return makeNode({
      kind: "leaf",
      label: `1x31 ${stats[0]} breeder`,
      cost: dp[tier].totalCost,
      details: "Buy or self-source",
      children: [],
    });
  }

  if (choice.type === "buy") {
    return makeNode({
      kind: "buy",
      label: `Buy ${tier}x31 breeder`,
      cost: dp[tier].totalCost,
      details: "Market shortcut",
      children: [],
    });
  }

  const leftStats = stats.slice(0, choice.left);
  const rightStats = stats.slice(choice.left);
  const leftNode = buildIvNode(choice.left, dp, leftStats);
  const rightNode = buildIvNode(choice.right, dp, rightStats);

  return makeNode({
    kind: "merge",
    label: `Breed to ${tier}x31 (${stats.join("/")})`,
    cost: dp[tier].totalCost,
    stepCost: choice.stepCost,
    details: "Two braces + breeding fee",
    children: [leftNode, rightNode],
  });
}

function makeNode(data) {
  return {
    id: Math.random().toString(36).slice(2),
    kind: data.kind,
    label: data.label,
    cost: data.cost,
    stepCost: data.stepCost || 0,
    details: data.details || "",
    children: data.children || [],
  };
}

function flattenSteps(root) {
  const steps = [];
  walk(root, (node) => {
    if (node.kind === "merge") {
      steps.push(node);
    }
  });
  return steps.reverse();
}

function countItems(root) {
  const counts = { braces: 0, everstones: 0, breedFees: 0 };
  walk(root, (node) => {
    if (node.kind === "merge") {
      const note = node.details.toLowerCase();
      if (note.includes("two braces")) counts.braces += 2;
      if (note.includes("one brace")) counts.braces += 1;
      if (note.includes("everstone")) counts.everstones += 1;
      counts.breedFees += 1;
    }
  });
  return counts;
}

function walk(node, fn) {
  fn(node);
  node.children.forEach((c) => walk(c, fn));
}

function renderEmpty(message) {
  els.summary.innerHTML = `<div class="metric"><span class="label">Status</span><span class="value">${escapeHtml(message)}</span></div>`;
  els.steps.innerHTML = "";
  clearTree();
}

function renderPlan() {
  const plan = state.plan;
  if (!plan) return;

  const spent = totalSpent();
  const diff = spent - plan.totalCost;

  els.summary.innerHTML = `
    <div class="metric"><span class="label">Target</span><span class="value">${escapeHtml(plan.config.targetName)}</span></div>
    <div class="metric"><span class="label">Perfect IV count</span><span class="value">${plan.config.stats.length}</span></div>
    <div class="metric"><span class="label">IV-only cheapest</span><span class="value">${money(plan.ivOnlyCost)}</span></div>
    <div class="metric"><span class="label">Expected total</span><span class="value">${money(plan.totalCost)}</span></div>
    <div class="metric"><span class="label">Spent so far</span><span class="value">${money(spent)}</span></div>
    <div class="metric"><span class="label">Plan variance</span><span class="value ${diff <= 0 ? "good" : "bad"}">${diff <= 0 ? "Under" : "Over"} by ${money(Math.abs(diff))}</span></div>
    <div class="metric"><span class="label">Estimated braces</span><span class="value">${plan.itemCounts.braces}</span></div>
    <div class="metric"><span class="label">Estimated everstones</span><span class="value">${plan.itemCounts.everstones}</span></div>
  `;

  els.steps.innerHTML = plan.pathSteps
    .map((step, idx) => {
      return `
        <article class="step">
          <strong>Step ${idx + 1}</strong>
          <div>${escapeHtml(step.label)}</div>
          <div>${escapeHtml(step.details)}</div>
          <div><strong>Cumulative:</strong> ${money(step.cost)}</div>
        </article>
      `;
    })
    .join("");

  const assumptions = document.createElement("article");
  assumptions.className = "step";
  assumptions.innerHTML = `
    <strong>Assumptions</strong>
    ${plan.assumptions.map((a) => `<div>${escapeHtml(a)}</div>`).join("")}
  `;
  els.steps.appendChild(assumptions);

  renderTree(plan.rootNode);
}

function renderTree(root) {
  clearTree();

  const nodeRadiusX = 88;
  const nodeRadiusY = 26;
  const levelHeight = 100;
  const minNodeGap = 230;

  const layers = [];
  const leafOrder = [];

  function collect(node, depth = 0) {
    if (!layers[depth]) layers[depth] = [];
    layers[depth].push(node);
    if (!node.children.length) {
      leafOrder.push(node);
    }
    node.children.forEach((child) => collect(child, depth + 1));
  }

  collect(root);

  const pos = new Map();
  leafOrder.forEach((leaf, idx) => {
    pos.set(leaf.id, { x: idx * minNodeGap + 130, y: 0 });
  });

  for (let depth = layers.length - 2; depth >= 0; depth -= 1) {
    layers[depth].forEach((node) => {
      if (!node.children.length) return;
      const childXs = node.children.map((c) => pos.get(c.id).x);
      const x = childXs.reduce((a, b) => a + b, 0) / childXs.length;
      pos.set(node.id, { x, y: depth * levelHeight + 48 });
    });
  }

  leafOrder.forEach((leaf) => {
    const p = pos.get(leaf.id);
    p.y = (layers.length - 1) * levelHeight + 48;
  });

  const width = Math.max(760, leafOrder.length * minNodeGap + 180);
  const height = layers.length * levelHeight + 96;
  els.treeSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  walk(root, (node) => {
    node.children.forEach((child) => {
      const a = pos.get(node.id);
      const b = pos.get(child.id);
      const path = createSvg("path", {
        d: `M ${a.x} ${a.y + nodeRadiusY} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y - nodeRadiusY}`,
        stroke: "#5d706f",
        "stroke-width": "2",
        fill: "none",
        opacity: "0.75",
      });
      els.treeSvg.appendChild(path);
    });
  });

  walk(root, (node) => {
    const p = pos.get(node.id);
    const fill = node.kind === "buy" ? "#ffe6c8" : node.kind === "leaf" ? "#d5efe7" : "#f9f4e5";

    const rect = createSvg("rect", {
      x: String(p.x - nodeRadiusX),
      y: String(p.y - nodeRadiusY),
      width: String(nodeRadiusX * 2),
      height: String(nodeRadiusY * 2),
      rx: "14",
      fill,
      stroke: "#1a3131",
      "stroke-width": "1",
    });

    const label = createSvg("text", {
      x: String(p.x),
      y: String(p.y - 2),
      "text-anchor": "middle",
      "font-size": "12",
      "font-family": "Space Grotesk, sans-serif",
      fill: "#132123",
    });
    label.textContent = clampText(node.label, 28);

    const cost = createSvg("text", {
      x: String(p.x),
      y: String(p.y + 14),
      "text-anchor": "middle",
      "font-size": "11",
      "font-family": "IBM Plex Mono, monospace",
      fill: "#29514d",
    });
    cost.textContent = money(node.cost);

    els.treeSvg.appendChild(rect);
    els.treeSvg.appendChild(label);
    els.treeSvg.appendChild(cost);
  });
}

function createSvg(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function clearTree() {
  els.treeSvg.innerHTML = "";
  els.treeSvg.setAttribute("viewBox", "0 0 760 340");
}

function addPurchase(purchase) {
  state.purchases.push({
    id: Math.random().toString(36).slice(2),
    item: purchase.item || "",
    qty: Number(purchase.qty) || 1,
    unitCost: Number(purchase.unitCost) || 0,
    note: purchase.note || "",
  });
}

function renderPurchases() {
  els.purchaseBody.innerHTML = "";

  state.purchases.forEach((purchase) => {
    const tr = document.createElement("tr");
    const total = purchase.qty * purchase.unitCost;

    tr.innerHTML = `
      <td><input value="${escapeAttr(purchase.item)}" data-k="item" data-id="${purchase.id}" /></td>
      <td><input type="number" min="0" value="${purchase.qty}" data-k="qty" data-id="${purchase.id}" /></td>
      <td><input type="number" min="0" value="${purchase.unitCost}" data-k="unitCost" data-id="${purchase.id}" /></td>
      <td>${money(total)}</td>
      <td><input value="${escapeAttr(purchase.note)}" data-k="note" data-id="${purchase.id}" /></td>
      <td><button class="small-btn" data-remove="${purchase.id}">Delete</button></td>
    `;

    els.purchaseBody.appendChild(tr);
  });

  els.purchaseBody.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", onPurchaseEdit);
  });
  els.purchaseBody.querySelectorAll("button[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.purchases = state.purchases.filter((p) => p.id !== btn.dataset.remove);
      saveState();
      renderPurchases();
      renderPlan();
    });
  });

  const spent = totalSpent();
  const planned = state.plan ? state.plan.totalCost : 0;
  const variance = spent - planned;

  els.purchaseSummary.innerHTML = `
    <div class="metric"><span class="label">Total purchases</span><span class="value">${money(spent)}</span></div>
    <div class="metric"><span class="label">Planned total</span><span class="value">${money(planned)}</span></div>
    <div class="metric"><span class="label">Variance</span><span class="value ${variance <= 0 ? "good" : "bad"}">${variance <= 0 ? "Under" : "Over"} by ${money(Math.abs(variance))}</span></div>
  `;
}

function onPurchaseEdit(event) {
  const input = event.target;
  const id = input.dataset.id;
  const key = input.dataset.k;
  const row = state.purchases.find((p) => p.id === id);
  if (!row) return;

  if (key === "qty" || key === "unitCost") {
    row[key] = Number(input.value) || 0;
  } else {
    row[key] = input.value;
  }

  saveState();
  renderPurchases();
  if (state.plan) renderPlan();
}

function totalSpent() {
  return state.purchases.reduce((sum, p) => sum + p.qty * p.unitCost, 0);
}

function downloadPlan() {
  if (!state.plan) return;
  const blob = new Blob([JSON.stringify(state.plan, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pokemmo-breeding-plan.json";
  a.click();
  URL.revokeObjectURL(url);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.inputs) {
      Object.entries(data.inputs).forEach(([key, value]) => {
        const input = document.getElementById(key);
        if (input) input.value = String(value);
      });
    }

    if (Array.isArray(data.stats)) {
      document.querySelectorAll("input[data-stat]").forEach((cb) => {
        cb.checked = data.stats.includes(cb.dataset.stat);
      });
    }

    if (Array.isArray(data.purchases)) {
      state.purchases = data.purchases;
    }
  } catch (err) {
    console.error("Failed to load saved state", err);
  }
}

function saveState() {
  const inputIds = [
    "targetName",
    "natureName",
    "requireHA",
    "haChance",
    "single31Market",
    "single31Self",
    "singleHAMarket",
    "singleHASelf",
    "natureMarket",
    "natureSelf",
    "braceCost",
    "everstoneCost",
    "breedFee",
    "buyFinalHA",
    ...Array.from({ length: TIER_MAX - 1 }, (_, i) => `tier${i + 2}Price`),
  ];

  const inputs = {};
  inputIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) inputs[id] = input.value;
  });

  const data = {
    inputs,
    stats: selectedStats(),
    purchases: state.purchases,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function minPositive(a, b) {
  const left = Number.isFinite(a) && a > 0 ? a : Number.POSITIVE_INFINITY;
  const right = Number.isFinite(b) && b > 0 ? b : Number.POSITIVE_INFINITY;
  const result = Math.min(left, right);
  return Number.isFinite(result) ? result : 0;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function clampText(input, max) {
  return input.length <= max ? input : `${input.slice(0, max - 1)}...`;
}

function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(v) {
  return escapeHtml(v);
}
