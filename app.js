const STORAGE_KEY = "pokemmoFamilyTreePlanner.v1";
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
  partnerGallery: document.getElementById("partnerGallery"),
  requireHA: document.getElementById("requireHA"),
  haChance: document.getElementById("haChance"),
  natureName: document.getElementById("natureName"),
  single31Cost: document.getElementById("single31Cost"),
  tier2Cost: document.getElementById("tier2Cost"),
  tier3Cost: document.getElementById("tier3Cost"),
  tier4Cost: document.getElementById("tier4Cost"),
  tier5Cost: document.getElementById("tier5Cost"),
  tier6Cost: document.getElementById("tier6Cost"),
  natureParentCost: document.getElementById("natureParentCost"),
  haDonorCost: document.getElementById("haDonorCost"),
  braceCost: document.getElementById("braceCost"),
  everstoneCost: document.getElementById("everstoneCost"),
  breedFee: document.getElementById("breedFee"),
  buildPlanBtn: document.getElementById("buildPlanBtn"),
  planSummary: document.getElementById("planSummary"),
  treeIndividual: document.getElementById("treeIndividual"),
  treeOptimized: document.getElementById("treeOptimized"),
  suggestedParents: document.getElementById("suggestedParents"),
  shoppingBody: document.getElementById("shoppingBody"),
  shoppingSummary: document.getElementById("shoppingSummary"),
  downloadPlanBtn: document.getElementById("downloadPlanBtn"),
};

init();

async function init() {
  if (!validateElements()) {
    return;
  }

  bindEvents();
  loadPersistedInputs();
  renderTargetInfo();
  renderPlanSummary("Load a target Pokemon first.");
  await loadPokemonNames();
}

function validateElements() {
  const required = [
    "targetName",
    "pokemonList",
    "loadTargetBtn",
    "loadState",
    "targetInfo",
    "partnerGallery",
    "requireHA",
    "haChance",
    "natureName",
    "single31Cost",
    "tier2Cost",
    "tier3Cost",
    "tier4Cost",
    "tier5Cost",
    "tier6Cost",
    "natureParentCost",
    "haDonorCost",
    "braceCost",
    "everstoneCost",
    "breedFee",
    "buildPlanBtn",
    "planSummary",
    "treeIndividual",
    "treeOptimized",
    "suggestedParents",
    "shoppingBody",
    "shoppingSummary",
    "downloadPlanBtn",
  ];

  const missing = required.filter((key) => !els[key]);
  if (!missing.length) {
    return true;
  }

  console.error("Planner could not start. Missing elements:", missing.join(", "));
  return false;
}

function bindEvents() {
  els.loadTargetBtn.addEventListener("click", () => {
    loadTargetData().catch((err) => {
      setLoadState(`Could not load target: ${err.message}`, true);
    });
  });

  els.buildPlanBtn.addEventListener("click", buildPlan);

  els.downloadPlanBtn.addEventListener("click", () => {
    if (!state.plan) {
      return;
    }

    const payload = {
      target: state.target,
      plan: state.plan,
      shopping: state.shopping,
      exportedAt: new Date().toISOString(),
    };

    downloadJson(payload, "pokemmo-family-tree-plan.json");
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
  state.pokemonNames = data.results.map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
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

  const eggGroups = species.egg_groups.map((group) => normalizeName(group.name));
  const hiddenAbilities = pokemon.abilities
    .filter((ability) => ability.is_hidden)
    .map((ability) => normalizeName(ability.ability.name));

  const partnerSuggestions = await fetchPartnerSuggestions(species.egg_groups.map((group) => group.name), rawName);

  state.target = {
    id: pokemon.id,
    name: normalizeName(species.name),
    sprite: pokemon.sprites.other["official-artwork"].front_default || pokemon.sprites.front_default || "",
    eggGroups,
    hiddenAbilities,
    partnerSuggestions,
  };

  renderTargetInfo();
  renderPartnerGallery();
  setLoadState(`Loaded ${state.target.name}.`);
  persistInputs();
}

async function fetchPartnerSuggestions(eggGroups, targetName) {
  const partners = new Map();

  for (const group of eggGroups) {
    const response = await fetch(`https://pokeapi.co/api/v2/egg-group/${encodeURIComponent(group)}`);
    if (!response.ok) {
      continue;
    }

    const data = await response.json();
    data.pokemon_species.slice(0, 36).forEach((species) => {
      const raw = species.name.toLowerCase();
      if (raw === targetName) {
        return;
      }

      const id = idFromResourceUrl(species.url);
      if (!id) {
        return;
      }

      const normalized = normalizeName(raw);
      partners.set(normalized, {
        id,
        name: normalized,
        sprite: spriteUrl(id),
      });
    });
  }

  return [...partners.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20);
}

function buildPlan() {
  if (!state.target) {
    renderPlanSummary("Load a target Pokemon first.");
    return;
  }

  const stats = selectedStats();
  if (!stats.length) {
    state.plan = null;
    state.shopping = [];
    renderPlanSummary("Pick at least one perfect IV stat.");
    clearTrees();
    renderShopping();
    return;
  }

  const costs = {
    single31: readNumber(els.single31Cost, 0),
    tiers: {
      2: readNumber(els.tier2Cost, 0),
      3: readNumber(els.tier3Cost, 0),
      4: readNumber(els.tier4Cost, 0),
      5: readNumber(els.tier5Cost, 0),
      6: readNumber(els.tier6Cost, 0),
    },
    natureParent: readNumber(els.natureParentCost, 0),
    haDonor: readNumber(els.haDonorCost, 0),
    brace: readNumber(els.braceCost, 0),
    everstone: readNumber(els.everstoneCost, 0),
    breedFee: readNumber(els.breedFee, 0),
  };

  const nature = els.natureName.value.trim();
  const wantHA = els.requireHA.value === "yes";
  const haChance = clamp(readNumber(els.haChance, 60), 1, 100) / 100;

  const individualTree = buildIndividualTree(stats, costs);
  const optimizedTree = buildOptimizedTree(stats, costs);
  const extras = buildExtraCosts(costs, nature, wantHA, haChance, state.target.hiddenAbilities[0] || "Hidden Ability");

  const individualTotal = individualTree.total + extras.total;
  const optimizedTotal = optimizedTree.total + extras.total;
  const savings = individualTotal - optimizedTotal;

  state.plan = {
    targetName: state.target.name,
    targetSprite: state.target.sprite,
    stats,
    costs,
    nature,
    wantHA,
    haChance,
    extras,
    individualTree,
    optimizedTree,
    individualTotal,
    optimizedTotal,
    savings,
  };

  const speciesOptions = [
    { name: state.target.name, sprite: state.target.sprite },
    ...state.target.partnerSuggestions.slice(0, 8).map((p) => ({ name: p.name, sprite: p.sprite })),
  ];

  const shoppingRows = buildShoppingRows(optimizedTree, extras, speciesOptions);
  state.shopping = mergeWithExistingShopping(shoppingRows, state.shopping);

  renderPlanSummary();
  renderTrees();
  renderGuidance();
  renderShopping();
  persistInputs();
}

function buildIndividualTree(stats, costs) {
  if (stats.length === 1) {
    return {
      id: nodeId(),
      tier: 1,
      stats,
      method: "leaf",
      selfCost: costs.single31,
      total: costs.single31,
      left: null,
      right: null,
    };
  }

  const split = Math.floor(stats.length / 2);
  const left = buildIndividualTree(stats.slice(0, split), costs);
  const right = buildIndividualTree(stats.slice(split), costs);
  const mergeCost = costs.breedFee + costs.brace * 2;
  const total = left.total + right.total + mergeCost;

  return {
    id: nodeId(),
    tier: stats.length,
    stats,
    method: "breed",
    selfCost: mergeCost,
    total,
    left,
    right,
  };
}

function buildOptimizedTree(stats, costs) {
  const maxTier = stats.length;
  const dp = Array.from({ length: maxTier + 1 }, () => ({ cost: Number.POSITIVE_INFINITY, choice: null }));
  dp[1] = { cost: costs.single31, choice: { type: "leaf" } };

  for (let tier = 2; tier <= maxTier; tier += 1) {
    const buyCost = costs.tiers[tier] > 0 ? costs.tiers[tier] : Number.POSITIVE_INFINITY;
    if (buyCost < dp[tier].cost) {
      dp[tier] = { cost: buyCost, choice: { type: "buy", tier } };
    }

    for (let leftTier = 1; leftTier < tier; leftTier += 1) {
      const rightTier = tier - leftTier;
      const mergeCost = dp[leftTier].cost + dp[rightTier].cost + costs.breedFee + costs.brace * 2;
      if (mergeCost < dp[tier].cost) {
        dp[tier] = {
          cost: mergeCost,
          choice: { type: "breed", leftTier, rightTier },
        };
      }
    }
  }

  return buildNodeFromDp(stats, dp, costs);
}

function buildNodeFromDp(stats, dp, costs) {
  const tier = stats.length;
  const choice = dp[tier].choice;

  if (choice.type === "leaf") {
    return {
      id: nodeId(),
      tier,
      stats,
      method: "leaf",
      selfCost: costs.single31,
      total: costs.single31,
      left: null,
      right: null,
    };
  }

  if (choice.type === "buy") {
    return {
      id: nodeId(),
      tier,
      stats,
      method: "buy",
      selfCost: costs.tiers[tier],
      total: costs.tiers[tier],
      left: null,
      right: null,
    };
  }

  const leftStats = stats.slice(0, choice.leftTier);
  const rightStats = stats.slice(choice.leftTier);
  const left = buildNodeFromDp(leftStats, dp, costs);
  const right = buildNodeFromDp(rightStats, dp, costs);
  const mergeCost = costs.breedFee + costs.brace * 2;

  return {
    id: nodeId(),
    tier,
    stats,
    method: "breed",
    selfCost: mergeCost,
    total: left.total + right.total + mergeCost,
    left,
    right,
  };
}

function buildExtraCosts(costs, nature, wantHA, haChance, hiddenAbilityName) {
  let total = 0;
  const notes = [];

  if (nature) {
    const natureStep = costs.natureParent + costs.breedFee + costs.brace + costs.everstone;
    total += natureStep;
    notes.push(`Nature lock (${nature}): ${money(natureStep)}`);
  }

  if (wantHA) {
    const attempts = 1 / haChance;
    const perAttempt = costs.haDonor + costs.breedFee + costs.brace + (nature ? costs.everstone : 0);
    const expected = attempts * perAttempt;
    total += expected;
    notes.push(`HA step (${hiddenAbilityName}, expected ${attempts.toFixed(2)}x): ${money(expected)}`);
  }

  return {
    total,
    notes,
  };
}

function buildShoppingRows(tree, extras, speciesOptions) {
  const counts = {
    singles: 0,
    tierBuy: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    braces: 0,
    fees: 0,
    everstones: 0,
  };

  walkTree(tree, (node) => {
    if (node.method === "leaf") {
      counts.singles += 1;
    } else if (node.method === "buy") {
      counts.tierBuy[node.tier] += 1;
    } else if (node.method === "breed") {
      counts.braces += 2;
      counts.fees += 1;
    }
  });

  extras.notes.forEach((note) => {
    if (note.startsWith("Nature lock")) {
      counts.braces += 1;
      counts.fees += 1;
      counts.everstones += 1;
    }

    if (note.startsWith("HA step")) {
      const match = /expected\s([0-9.]+)x/.exec(note);
      const qty = match ? Number.parseFloat(match[1]) : 1;
      counts.braces += qty;
      counts.fees += qty;
    }
  });

  const rows = [];

  rows.push({
    key: "row_single31",
    kind: "pokemon",
    label: "1x31 breeders",
    qty: counts.singles,
    unitCost: readNumber(els.single31Cost, 0),
    status: "buy",
    note: "From chosen route",
    speciesName: speciesOptions[0]?.name || "",
    sprite: speciesOptions[0]?.sprite || "",
    speciesOptions,
  });

  for (let tier = 2; tier <= 6; tier += 1) {
    if (counts.tierBuy[tier] <= 0) {
      continue;
    }

    rows.push({
      key: `row_tier_${tier}`,
      kind: "pokemon",
      label: `${tier}x31 breeders (skip-step buys)`,
      qty: counts.tierBuy[tier],
      unitCost: readNumber(els[`tier${tier}Cost`], 0),
      status: "buy",
      note: "Bought directly",
      speciesName: speciesOptions[0]?.name || "",
      sprite: speciesOptions[0]?.sprite || "",
      speciesOptions,
    });
  }

  rows.push({
    key: "row_brace",
    kind: "item",
    label: "Braces",
    qty: counts.braces,
    unitCost: readNumber(els.braceCost, 0),
    status: "buy",
    note: "Expected count",
  });

  rows.push({
    key: "row_fee",
    kind: "service",
    label: "Breeding fees",
    qty: counts.fees,
    unitCost: readNumber(els.breedFee, 0),
    status: "buy",
    note: "Expected count",
  });

  if (counts.everstones > 0) {
    rows.push({
      key: "row_everstone",
      kind: "item",
      label: "Everstones",
      qty: counts.everstones,
      unitCost: readNumber(els.everstoneCost, 0),
      status: "buy",
      note: "Expected count",
    });
  }

  if (els.natureName.value.trim()) {
    rows.push({
      key: "row_nature_parent",
      kind: "pokemon",
      label: "Nature parent",
      qty: 1,
      unitCost: readNumber(els.natureParentCost, 0),
      status: "buy",
      note: "Nature lock support",
      speciesName: speciesOptions[0]?.name || "",
      sprite: speciesOptions[0]?.sprite || "",
      speciesOptions,
    });
  }

  if (els.requireHA.value === "yes") {
    rows.push({
      key: "row_ha_donor",
      kind: "pokemon",
      label: "HA donor",
      qty: 1 / clamp(readNumber(els.haChance, 60), 1, 100) * 100,
      unitCost: readNumber(els.haDonorCost, 0),
      status: "buy",
      note: "Expected quantity",
      speciesName: speciesOptions[0]?.name || "",
      sprite: speciesOptions[0]?.sprite || "",
      speciesOptions,
    });
  }

  return rows.filter((row) => row.qty > 0);
}

function mergeWithExistingShopping(rows, existingRows) {
  const existing = new Map(existingRows.map((row) => [row.key, row]));

  return rows.map((row) => {
    const old = existing.get(row.key);
    if (!old) {
      return row;
    }

    const merged = {
      ...row,
      qty: Number.isFinite(old.qty) ? old.qty : row.qty,
      unitCost: Number.isFinite(old.unitCost) ? old.unitCost : row.unitCost,
      status: old.status || row.status,
      note: old.note || row.note,
      speciesName: old.speciesName || row.speciesName,
    };

    if (row.kind === "pokemon" && Array.isArray(row.speciesOptions)) {
      const picked = row.speciesOptions.find((option) => option.name === merged.speciesName);
      merged.sprite = picked ? picked.sprite : row.sprite;
    }

    return merged;
  });
}

function renderTargetInfo() {
  if (!state.target) {
    els.targetInfo.innerHTML = '<div class="muted">Target details will appear here after loading.</div>';
    els.partnerGallery.innerHTML = "";
    return;
  }

  const eggGroupChips = state.target.eggGroups.map((group) => `<span class="chip">${escapeHtml(group)}</span>`).join("");
  const haText = state.target.hiddenAbilities.length ? state.target.hiddenAbilities.join(", ") : "No hidden ability listed";

  els.targetInfo.innerHTML = `
    <div class="target-hero">
      <img class="sprite-lg" src="${escapeAttr(state.target.sprite)}" alt="${escapeAttr(state.target.name)}" />
      <div>
        <h3>${escapeHtml(state.target.name)}</h3>
        <div class="chip-row">${eggGroupChips}</div>
        <p class="inline-note">Hidden Ability: ${escapeHtml(haText)}</p>
      </div>
    </div>
  `;
}

function renderPartnerGallery() {
  if (!state.target || !state.target.partnerSuggestions.length) {
    els.partnerGallery.innerHTML = "";
    return;
  }

  els.partnerGallery.innerHTML = state.target.partnerSuggestions.slice(0, 12).map((partner) => `
    <article class="partner-card">
      <img src="${escapeAttr(partner.sprite)}" alt="${escapeAttr(partner.name)}" loading="lazy" />
      <span>${escapeHtml(partner.name)}</span>
    </article>
  `).join("");
}

function renderPlanSummary(overrideText) {
  if (overrideText) {
    els.planSummary.innerHTML = `<div class="metric"><span class="label">Status</span><span class="value">${escapeHtml(overrideText)}</span></div>`;
    return;
  }

  const plan = state.plan;
  if (!plan) {
    return;
  }

  const betterLabel = plan.savings > 0 ? "Cheapest mixed route saves" : "No savings from skip-step buys";

  els.planSummary.innerHTML = `
    <div class="metric"><span class="label">All-individual total</span><span class="value">${money(plan.individualTotal)}</span></div>
    <div class="metric"><span class="label">Cheapest mixed total</span><span class="value">${money(plan.optimizedTotal)}</span></div>
    <div class="metric"><span class="label">${escapeHtml(betterLabel)}</span><span class="value">${money(Math.max(plan.savings, 0))}</span></div>
  `;
}

function renderTrees() {
  if (!state.plan) {
    clearTrees();
    return;
  }

  renderTreeInto(els.treeIndividual, state.plan.individualTree);
  renderTreeInto(els.treeOptimized, state.plan.optimizedTree);
}

function clearTrees() {
  els.treeIndividual.innerHTML = "";
  els.treeOptimized.innerHTML = "";
}

function renderTreeInto(container, tree) {
  container.innerHTML = "";
  const root = document.createElement("ul");
  root.className = "tree-root";
  root.appendChild(treeNodeElement(tree));
  container.appendChild(root);
}

function treeNodeElement(node) {
  const li = document.createElement("li");

  const card = document.createElement("div");
  card.className = `tree-node tree-node-${node.method}`;

  const title = document.createElement("div");
  title.className = "tree-title";
  title.textContent = `${node.tier}x31 ${node.stats.join("/")}`;

  const method = document.createElement("div");
  method.className = "tree-method";
  method.textContent = node.method === "breed" ? "Breed" : node.method === "buy" ? `Buy ${node.tier}x31` : "Buy 1x31";

  const cost = document.createElement("div");
  cost.className = "tree-cost";
  cost.textContent = `Total: ${money(node.total)}`;

  card.appendChild(title);
  card.appendChild(method);
  card.appendChild(cost);
  li.appendChild(card);

  if (node.left && node.right) {
    const childList = document.createElement("ul");
    childList.appendChild(treeNodeElement(node.left));
    childList.appendChild(treeNodeElement(node.right));
    li.appendChild(childList);
  }

  return li;
}

function renderGuidance() {
  if (!state.plan) {
    els.suggestedParents.innerHTML = "";
    return;
  }

  const notes = [
    "The left tree buys all parents as single 1x31 breeders before chaining breeds.",
    "The right tree can skip steps by buying higher-tier breeders when cheaper.",
    ...state.plan.extras.notes,
  ];

  els.suggestedParents.innerHTML = notes.map((note) => `<article class="step">${escapeHtml(note)}</article>`).join("");
}

function renderShopping() {
  els.shoppingBody.innerHTML = "";

  state.shopping.forEach((row) => {
    const tr = document.createElement("tr");
    const total = row.status === "have" ? 0 : row.qty * row.unitCost;

    const needCell = row.kind === "pokemon"
      ? renderPokemonNeedCell(row)
      : `<div class="need-cell"><span class="item-dot"></span><div><strong>${escapeHtml(row.label)}</strong></div></div>`;

    tr.innerHTML = `
      <td>${needCell}</td>
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

  const totals = computeShoppingTotals();
  els.shoppingSummary.innerHTML = `
    <div class="metric"><span class="label">Buy rows</span><span class="value">${totals.buyCount}</span></div>
    <div class="metric"><span class="label">Have rows</span><span class="value">${totals.haveCount}</span></div>
    <div class="metric"><span class="label">Shopping total</span><span class="value">${money(totals.buyTotal)}</span></div>
  `;
}

function renderPokemonNeedCell(row) {
  const options = Array.isArray(row.speciesOptions)
    ? row.speciesOptions.map((option) => `<option value="${escapeAttr(option.name)}" ${option.name === row.speciesName ? "selected" : ""}>${escapeHtml(option.name)}</option>`).join("")
    : "";

  return `
    <div class="need-cell">
      <img src="${escapeAttr(row.sprite || state.target?.sprite || "")}" alt="${escapeAttr(row.speciesName || row.label)}" loading="lazy" />
      <div>
        <strong>${escapeHtml(row.label)}</strong>
        <div class="small-line">${escapeHtml(state.target ? state.target.eggGroups.join(" / ") : "")}</div>
        ${options ? `<select data-k="speciesName" data-id="${row.key}">${options}</select>` : ""}
      </div>
    </div>
  `;
}

function onShoppingEdit(event) {
  const id = event.target.dataset.id;
  const key = event.target.dataset.k;
  const row = state.shopping.find((entry) => entry.key === id);
  if (!row) {
    return;
  }

  if (key === "qty" || key === "unitCost") {
    row[key] = Number(event.target.value) || 0;
  } else {
    row[key] = event.target.value;
  }

  if (key === "speciesName" && Array.isArray(row.speciesOptions)) {
    const picked = row.speciesOptions.find((option) => option.name === row.speciesName);
    if (picked) {
      row.sprite = picked.sprite;
    }
  }

  persistInputs();
  renderShopping();
}

function computeShoppingTotals() {
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

function walkTree(node, onNode) {
  onNode(node);
  if (node.left) {
    walkTree(node.left, onNode);
  }
  if (node.right) {
    walkTree(node.right, onNode);
  }
}

function selectedStats() {
  return [...document.querySelectorAll("input[data-stat]:checked")].map((input) => input.dataset.stat);
}

function setLoadState(message, isError = false) {
  els.loadState.textContent = message;
  els.loadState.className = isError ? "load-state bad" : "load-state";
}

function loadPersistedInputs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const data = JSON.parse(raw);

    const inputIds = [
      "targetName",
      "requireHA",
      "haChance",
      "natureName",
      "single31Cost",
      "tier2Cost",
      "tier3Cost",
      "tier4Cost",
      "tier5Cost",
      "tier6Cost",
      "natureParentCost",
      "haDonorCost",
      "braceCost",
      "everstoneCost",
      "breedFee",
    ];

    inputIds.forEach((id) => {
      if (data[id] !== undefined && els[id]) {
        els[id].value = String(data[id]);
      }
    });

    if (Array.isArray(data.selectedStats)) {
      document.querySelectorAll("input[data-stat]").forEach((input) => {
        input.checked = data.selectedStats.includes(input.dataset.stat);
      });
    }

    state.target = data.target || null;
    state.plan = data.plan || null;
    state.shopping = Array.isArray(data.shopping) ? data.shopping : [];

    if (state.target) {
      renderTargetInfo();
      renderPartnerGallery();
    }

    if (state.plan) {
      renderPlanSummary();
      renderTrees();
      renderGuidance();
      renderShopping();
    }
  } catch (error) {
    console.error("Failed to load saved state", error);
  }
}

function persistInputs() {
  const data = {
    targetName: els.targetName.value,
    requireHA: els.requireHA.value,
    haChance: els.haChance.value,
    natureName: els.natureName.value,
    single31Cost: els.single31Cost.value,
    tier2Cost: els.tier2Cost.value,
    tier3Cost: els.tier3Cost.value,
    tier4Cost: els.tier4Cost.value,
    tier5Cost: els.tier5Cost.value,
    tier6Cost: els.tier6Cost.value,
    natureParentCost: els.natureParentCost.value,
    haDonorCost: els.haDonorCost.value,
    braceCost: els.braceCost.value,
    everstoneCost: els.everstoneCost.value,
    breedFee: els.breedFee.value,
    selectedStats: selectedStats(),
    target: state.target,
    plan: state.plan,
    shopping: state.shopping,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function readNumber(input, fallback = 0) {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeName(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function idFromResourceUrl(url) {
  const match = /\/(\d+)\/?$/.exec(url);
  return match ? Number.parseInt(match[1], 10) : null;
}

function spriteUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

function nodeId() {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
