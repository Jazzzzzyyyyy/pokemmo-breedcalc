const STORAGE_KEY = "pokemmoSimpleBreedPlanner.v2";
const STAT_ORDER = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];

const state = {
  pokemonNames: [],
  target: null,
  plan: null,
  shopping: [],
};

const els = {
  targetName: document.getElementById("targetName"),
  pokemonList: document.getElementById("pokemonList"),
  loadTargetBtn: document.getElementById("loadTargetBtn"),
  loadState: document.getElementById("loadState"),
  targetInfo: document.getElementById("targetInfo"),
  requireHA: document.getElementById("requireHA"),
  haChance: document.getElementById("haChance"),
  natureName: document.getElementById("natureName"),
  braceCost: document.getElementById("braceCost"),
  everstoneCost: document.getElementById("everstoneCost"),
  breedFee: document.getElementById("breedFee"),
  buildPlanBtn: document.getElementById("buildPlanBtn"),
  planSummary: document.getElementById("planSummary"),
  suggestedParents: document.getElementById("suggestedParents"),
  shoppingBody: document.getElementById("shoppingBody"),
  shoppingSummary: document.getElementById("shoppingSummary"),
  downloadPlanBtn: document.getElementById("downloadPlanBtn"),
};

init();

async function init() {
  bindEvents();
  loadPersistedInputs();
  renderTargetInfo();
  renderPlanSummary("Load a target Pokemon first.");
  await loadPokemonNames();
}

function bindEvents() {
  els.loadTargetBtn.addEventListener("click", () => {
    loadTargetData().catch((err) => {
      setLoadState(`Could not load target: ${err.message}`, true);
    });
  });

  els.buildPlanBtn.addEventListener("click", buildPlan);

  els.downloadPlanBtn.addEventListener("click", () => {
    if (!state.plan) return;
    const payload = {
      target: state.target,
      plan: state.plan,
      shopping: state.shopping,
      exportedAt: new Date().toISOString(),
    };
    downloadJson(payload, "pokemmo-shopping-plan.json");
  });

  document.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("change", () => {
      persistInputs();
      if (state.plan) {
        buildPlan();
      }
    });
  });
}

async function loadPokemonNames() {
  setLoadState("Loading Pokemon list...");
  const endpoint = "https://pokeapi.co/api/v2/pokemon-species?limit=1025";
  const response = await fetch(endpoint);
  if (!response.ok) {
    setLoadState("Could not load Pokemon list from PokeAPI.", true);
    return;
  }

  const data = await response.json();
  state.pokemonNames = data.results.map((p) => p.name).sort((a, b) => a.localeCompare(b));
  renderPokemonDatalist();
  setLoadState(`Loaded ${state.pokemonNames.length} species.`);
}

function renderPokemonDatalist() {
  els.pokemonList.innerHTML = "";
  state.pokemonNames.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    els.pokemonList.appendChild(option);
  });
}

async function loadTargetData() {
  const rawName = els.targetName.value.trim().toLowerCase();
  if (!rawName) {
    throw new Error("enter a Pokemon name");
  }

  setLoadState(`Loading data for ${rawName}...`);

  const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(rawName)}`);
  if (!speciesRes.ok) {
    throw new Error("species not found");
  }
  const species = await speciesRes.json();

  const pokemonRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(rawName)}`);
  if (!pokemonRes.ok) {
    throw new Error("pokemon details not found");
  }
  const pokemon = await pokemonRes.json();

  const eggGroups = species.egg_groups.map((g) => normalizeName(g.name));
  const hiddenAbilities = pokemon.abilities.filter((ab) => ab.is_hidden).map((ab) => normalizeName(ab.ability.name));

  const partnerSuggestions = await fetchPartnerSuggestions(species.egg_groups.map((g) => g.name), rawName);

  state.target = {
    name: normalizeName(species.name),
    eggGroups,
    hiddenAbilities,
    genderRate: species.gender_rate,
    hatchCounter: species.hatch_counter,
    partnerSuggestions,
  };

  renderTargetInfo();
  setLoadState(`Loaded ${state.target.name}.`);
  persistInputs();
}

async function fetchPartnerSuggestions(eggGroups, targetName) {
  const all = new Set();

  for (const group of eggGroups) {
    const res = await fetch(`https://pokeapi.co/api/v2/egg-group/${encodeURIComponent(group)}`);
    if (!res.ok) continue;
    const data = await res.json();
    data.pokemon_species.slice(0, 40).forEach((entry) => {
      const name = entry.name.toLowerCase();
      if (name !== targetName) all.add(normalizeName(name));
    });
  }

  return [...all].sort((a, b) => a.localeCompare(b)).slice(0, 20);
}

function buildPlan() {
  if (!state.target) {
    renderPlanSummary("Load a target Pokemon first.");
    return;
  }

  const stats = selectedStats();
  if (!stats.length) {
    renderPlanSummary("Pick at least one perfect IV stat.");
    state.plan = null;
    state.shopping = [];
    renderShopping();
    return;
  }

  const wantHA = els.requireHA.value === "yes";
  const nature = els.natureName.value.trim();
  const haChance = clamp(readNumber(els.haChance, 60), 1, 100) / 100;

  const ivBreeds = Math.max(0, stats.length - 1);
  const natureBreeds = nature ? 1 : 0;
  const haExpectedAttempts = wantHA ? 1 / haChance : 0;

  const itemCounts = {
    braces: ivBreeds * 2 + natureBreeds + (wantHA ? haExpectedAttempts : 0),
    everstones: nature ? 1 + (wantHA ? haExpectedAttempts : 0) : 0,
    breedFees: ivBreeds + natureBreeds + (wantHA ? haExpectedAttempts : 0),
  };

  const parentRows = [];
  stats.forEach((stat) => {
    parentRows.push({
      key: `stat_${stat}`,
      kind: "pokemon",
      label: `1x31 ${stat} breeder in ${state.target.eggGroups.join(" / ")}`,
      qty: 1,
      defaultCost: 0,
      status: "buy",
      note: "Any compatible species works",
    });
  });

  if (nature) {
    parentRows.push({
      key: "nature_parent",
      kind: "pokemon",
      label: `${nature} nature breeder in ${state.target.eggGroups.join(" / ")}`,
      qty: 1,
      defaultCost: 0,
      status: "buy",
      note: "Used with Everstone",
    });
  }

  if (wantHA) {
    parentRows.push({
      key: "ha_donor",
      kind: "pokemon",
      label: `HA donor (${state.target.hiddenAbilities[0] || "Hidden Ability"})`,
      qty: haExpectedAttempts,
      defaultCost: 0,
      status: "buy",
      note: "Expected quantity based on HA chance",
    });
  }

  const itemRows = [
    {
      key: "item_brace",
      kind: "item",
      label: "Brace",
      qty: itemCounts.braces,
      defaultCost: readNumber(els.braceCost, 0),
      status: "buy",
      note: "Expected count",
    },
    {
      key: "item_everstone",
      kind: "item",
      label: "Everstone",
      qty: itemCounts.everstones,
      defaultCost: readNumber(els.everstoneCost, 0),
      status: "buy",
      note: "Expected count",
    },
    {
      key: "item_fee",
      kind: "service",
      label: "Breeding Fee",
      qty: itemCounts.breedFees,
      defaultCost: readNumber(els.breedFee, 0),
      status: "buy",
      note: "Expected count",
    },
  ];

  state.plan = {
    targetName: state.target.name,
    stats,
    nature,
    wantHA,
    haChance,
    eggGroups: state.target.eggGroups,
    hiddenAbilities: state.target.hiddenAbilities,
    itemCounts,
    notes: [
      "This planner focuses on shopping clarity and expected costs.",
      "Hidden ability rows use expected quantity (1 / chance).",
      "Set status to Have to remove an entry from buy total.",
    ],
  };

  state.shopping = mergeWithExistingShopping([...parentRows, ...itemRows], state.shopping);
  renderPlanSummary();
  renderSuggestedParents();
  renderShopping();
  persistInputs();
}

function mergeWithExistingShopping(rows, existing) {
  const existingMap = new Map(existing.map((r) => [r.key, r]));

  return rows.map((row) => {
    const old = existingMap.get(row.key);
    if (!old) return row;

    return {
      ...row,
      unitCost: Number.isFinite(old.unitCost) ? old.unitCost : row.defaultCost,
      status: old.status || row.status,
      note: old.note || row.note,
    };
  }).map((row) => ({
    ...row,
    unitCost: Number.isFinite(row.unitCost) ? row.unitCost : row.defaultCost,
  }));
}

function renderTargetInfo() {
  if (!state.target) {
    els.targetInfo.innerHTML = '<div class="muted">Target details will appear here after loading.</div>';
    return;
  }

  const haText = state.target.hiddenAbilities.length
    ? state.target.hiddenAbilities.join(", ")
    : "No hidden ability listed";

  const partners = state.target.partnerSuggestions.length
    ? state.target.partnerSuggestions.slice(0, 12).join(", ")
    : "No partner suggestions found";

  els.targetInfo.innerHTML = `
    <div class="metric"><span class="label">Target</span><span class="value">${escapeHtml(state.target.name)}</span></div>
    <div class="metric"><span class="label">Egg Groups</span><span class="value">${escapeHtml(state.target.eggGroups.join(" / "))}</span></div>
    <div class="metric"><span class="label">Hidden Ability</span><span class="value">${escapeHtml(haText)}</span></div>
    <div class="metric"><span class="label">Suggested Compatible Parents</span><span class="value">${escapeHtml(partners)}</span></div>
  `;
}

function renderPlanSummary(overrideText) {
  if (overrideText) {
    els.planSummary.innerHTML = `<div class="metric"><span class="label">Status</span><span class="value">${escapeHtml(overrideText)}</span></div>`;
    els.suggestedParents.innerHTML = "";
    return;
  }

  const plan = state.plan;
  if (!plan) return;

  const totalBuy = computeTotals().buyTotal;

  els.planSummary.innerHTML = `
    <div class="metric"><span class="label">Target</span><span class="value">${escapeHtml(plan.targetName)}</span></div>
    <div class="metric"><span class="label">Perfect Stats</span><span class="value">${escapeHtml(plan.stats.join(", "))}</span></div>
    <div class="metric"><span class="label">Expected Brace Count</span><span class="value">${formatQty(plan.itemCounts.braces)}</span></div>
    <div class="metric"><span class="label">Expected Everstones</span><span class="value">${formatQty(plan.itemCounts.everstones)}</span></div>
    <div class="metric"><span class="label">Expected Breeding Fees</span><span class="value">${formatQty(plan.itemCounts.breedFees)}</span></div>
    <div class="metric"><span class="label">Current Buy Total</span><span class="value">${money(totalBuy)}</span></div>
  `;
}

function renderSuggestedParents() {
  if (!state.plan) {
    els.suggestedParents.innerHTML = "";
    return;
  }

  els.suggestedParents.innerHTML = state.plan.notes
    .map((note) => `<article class="step">${escapeHtml(note)}</article>`)
    .join("");
}

function renderShopping() {
  els.shoppingBody.innerHTML = "";

  state.shopping.forEach((row) => {
    const tr = document.createElement("tr");
    const total = row.status === "have" ? 0 : row.qty * row.unitCost;

    tr.innerHTML = `
      <td>${escapeHtml(row.label)}</td>
      <td><input type="number" step="0.01" min="0" data-k="qty" data-id="${row.key}" value="${row.qty}" /></td>
      <td><input type="number" min="0" data-k="unitCost" data-id="${row.key}" value="${row.unitCost}" /></td>
      <td>${money(total)}</td>
      <td>
        <select data-k="status" data-id="${row.key}">
          <option value="buy" ${row.status === "buy" ? "selected" : ""}>Buy</option>
          <option value="have" ${row.status === "have" ? "selected" : ""}>Have</option>
        </select>
      </td>
      <td><input data-k="note" data-id="${row.key}" value="${escapeAttr(row.note || "")}" /></td>
    `;

    els.shoppingBody.appendChild(tr);
  });

  els.shoppingBody.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("change", onShoppingEdit);
  });

  const totals = computeTotals();
  els.shoppingSummary.innerHTML = `
    <div class="metric"><span class="label">Buy Rows</span><span class="value">${totals.buyCount}</span></div>
    <div class="metric"><span class="label">Have Rows</span><span class="value">${totals.haveCount}</span></div>
    <div class="metric"><span class="label">Estimated Buy Total</span><span class="value">${money(totals.buyTotal)}</span></div>
  `;

  if (state.plan) {
    renderPlanSummary();
  }
}

function onShoppingEdit(event) {
  const id = event.target.dataset.id;
  const key = event.target.dataset.k;
  const row = state.shopping.find((r) => r.key === id);
  if (!row) return;

  if (key === "qty" || key === "unitCost") {
    row[key] = Number(event.target.value) || 0;
  } else {
    row[key] = event.target.value;
  }

  persistInputs();
  renderShopping();
}

function computeTotals() {
  let buyTotal = 0;
  let buyCount = 0;
  let haveCount = 0;

  state.shopping.forEach((row) => {
    if (row.status === "have") {
      haveCount += 1;
      return;
    }
    buyCount += 1;
    buyTotal += row.qty * row.unitCost;
  });

  return { buyTotal, buyCount, haveCount };
}

function selectedStats() {
  return [...document.querySelectorAll("input[data-stat]:checked")].map((cb) => cb.dataset.stat);
}

function setLoadState(message, isError = false) {
  els.loadState.textContent = message;
  els.loadState.className = isError ? "load-state bad" : "load-state";
}

function readNumber(inputEl, fallback) {
  const value = Number.parseFloat(inputEl.value);
  return Number.isFinite(value) ? value : fallback;
}

function formatQty(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function normalizeName(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function persistInputs() {
  const data = {
    targetName: els.targetName.value,
    requireHA: els.requireHA.value,
    haChance: els.haChance.value,
    natureName: els.natureName.value,
    braceCost: els.braceCost.value,
    everstoneCost: els.everstoneCost.value,
    breedFee: els.breedFee.value,
    selectedStats: selectedStats(),
    target: state.target,
    shopping: state.shopping,
    plan: state.plan,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadPersistedInputs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);
    els.targetName.value = data.targetName || "";
    els.requireHA.value = data.requireHA || "no";
    els.haChance.value = data.haChance || "60";
    els.natureName.value = data.natureName || "";
    els.braceCost.value = data.braceCost || "10000";
    els.everstoneCost.value = data.everstoneCost || "5500";
    els.breedFee.value = data.breedFee || "5000";

    if (Array.isArray(data.selectedStats)) {
      document.querySelectorAll("input[data-stat]").forEach((cb) => {
        cb.checked = data.selectedStats.includes(cb.dataset.stat);
      });
    }

    state.target = data.target || null;
    state.shopping = Array.isArray(data.shopping) ? data.shopping : [];
    state.plan = data.plan || null;

    if (state.target) renderTargetInfo();
    if (state.plan) {
      renderPlanSummary();
      renderSuggestedParents();
      renderShopping();
    }
  } catch (err) {
    console.error("Failed to load saved planner state", err);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
