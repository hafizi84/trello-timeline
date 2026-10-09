/**
 * Trello Timeline Application
 * Live Gantt & Timeline Engine connected to Trello REST API
 */

// User's Trello Credentials
const TRELLO_CONFIG = {
  key: "dbbc85674e84318b89cb9355c2b7f4d7",
  token: "ATTA9fb2ac93bd4613434ec9ac642c4312aa108679da01dd61376eb277184388290d4F7EB0AC"
};

// Default Board: Hafizi - YCP Renoir TTD
const DEFAULT_BOARD_ID = "628595a5a6a64558821ec0dd";

// Global State
const urlParams = new URLSearchParams(window.location.search);
let currentBoardId = urlParams.get("boardId") || DEFAULT_BOARD_ID;
let currentViewMode = "label"; // Default to 'label' as requested
let zoomMode = "days"; // 'days' | 'weeks'
let totalVisibleDays = 9;

// Today & Date Calculations
let viewStartDate = getCenteredDate(new Date(), -2); // Center on Today (2 days before today)
let activeTasks = [];
let activeRows = [];
let unscheduledTasks = [];
let dependencies = [];
let rowNavIndexes = {}; // Tracks focused task index per row for double-click cycling

function getCenteredDate(baseDate, offsetDays) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Map Trello color names to Task Pill CSS color variants
function mapTrelloColorToPillColor(colorName) {
  if (!colorName) return "yellow";
  const c = colorName.toLowerCase();
  if (c.includes("blue_light") || c.includes("sky")) return "sky";
  if (c.includes("blue")) return "blue";
  if (c.includes("orange")) return "orange";
  if (c.includes("lime")) return "lime";
  if (c.includes("green")) return "green";
  if (c.includes("purple")) return "purple";
  if (c.includes("pink")) return "pink";
  if (c.includes("red")) return "red";
  if (c.includes("yellow")) return "yellow";
  if (c.includes("black")) return "gray";
  return "yellow";
}

// Get official Trello label hex color for the sidebar tag badge
function getLabelHexColor(colorName) {
  const map = {
    blue_light: "#388BFF",
    blue: "#0052CC",
    blue_dark: "#09326C",
    green_light: "#4BCE97",
    green: "#1F845A",
    green_dark: "#216E4E",
    yellow_light: "#F5CD47",
    yellow: "#E2B203",
    yellow_dark: "#CF9F02",
    orange_light: "#FEC57B",
    orange: "#FAA53D",
    orange_dark: "#E56910",
    red_light: "#F87168",
    red: "#CA3521",
    red_dark: "#AE2E24",
    purple_light: "#9F8FEF",
    purple: "#6E5DC6",
    purple_dark: "#5E4DB2",
    pink_light: "#FDD0EC",
    pink: "#E774BB",
    pink_dark: "#DA62AC",
    sky_light: "#6CC3E0",
    sky: "#22A0C9",
    sky_dark: "#206B83",
    lime_light: "#94C748",
    lime: "#6A9B26",
    lime_dark: "#4F761A",
    black: "#44546F"
  };
  return map[colorName] || "#0079BF";
}

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  loadTrelloBoards();
  fetchBoardData(currentBoardId);
  bindUIEvents();
});

// ==========================================================================
// Trello API Integration
// ==========================================================================
async function loadTrelloBoards() {
  const boardSelect = document.getElementById("boardSelect");
  try {
    const url = `https://api.trello.com/1/members/me/boards?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&filter=open`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not fetch boards");
    const boards = await res.json();

    boardSelect.innerHTML = "";
    boards.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `📋 ${b.name}`;
      if (b.id === currentBoardId) opt.selected = true;
      boardSelect.appendChild(opt);
    });

    document.getElementById("syncStatus").style.display = "flex";
  } catch (err) {
    console.warn("Could not load Trello boards list:", err);
  }
}

async function fetchBoardData(boardId) {
  const syncStatus = document.getElementById("syncStatus");
  syncStatus.innerHTML = `<span class="status-dot" style="background:#F59E0B"></span><span class="status-text">Syncing...</span>`;

  try {
    // Fetch Cards, Lists, and Members
    const [cardsRes, listsRes, membersRes] = await Promise.all([
      fetch(`https://api.trello.com/1/boards/${boardId}/cards?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&fields=name,due,start,idMembers,idList,labels,id`),
      fetch(`https://api.trello.com/1/boards/${boardId}/lists?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}`),
      fetch(`https://api.trello.com/1/boards/${boardId}/members?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}`)
    ]);

    const cards = await cardsRes.json();
    const lists = await listsRes.json();
    const members = await membersRes.json();

    // Separate Cards into Scheduled vs Unscheduled
    activeTasks = [];
    unscheduledTasks = [];
    dependencies = [];
    rowNavIndexes = {};
    const scheduledCards = [];

    cards.forEach((card, idx) => {
      const listObj = lists.find(l => l.id === card.idList);
      const listName = listObj ? listObj.name : "";

      const start = card.start ? card.start.split("T")[0] : null;
      const due = card.due ? card.due.split("T")[0] : null;

      if (start || due) {
        let sDate = start;
        let dDate = due;

        // If only due date exists, create a 2-day bar ending on due date
        if (!sDate && dDate) {
          const d = new Date(dDate);
          d.setDate(d.getDate() - 1);
          sDate = formatLocalDate(d);
        } else if (sDate && !dDate) {
          dDate = sDate;
        }

        scheduledCards.push({
          card,
          sDate,
          dDate,
          listName,
          idx
        });
      } else {
        unscheduledTasks.push({
          id: card.id,
          name: card.name,
          list: listName || "To Do",
          listId: card.idList,
          labels: card.labels || []
        });
      }
    });

    // Helper color chooser by list name or index
    function pickColor(listName, index) {
      if (!listName) return "yellow";
      const ln = listName.toLowerCase();
      if (ln.includes("incoming") || ln.includes("start") || ln.includes("todo") || ln.includes("to do")) return "yellow";
      if (ln.includes("progress") || ln.includes("work")) return "blue";
      if (ln.includes("approval") || ln.includes("review") || ln.includes("pending")) return "purple";
      if (ln.includes("completed") || ln.includes("live") || ln.includes("done")) return "green";
      const palette = ["yellow", "blue", "purple", "green", "orange", "sky"];
      return palette[index % palette.length];
    }

    const sidebarTitle = document.getElementById("sidebarHeaderTitle");

    // SETUP ROWS BASED ON GROUPING MODE
    if (currentViewMode === "label") {
      sidebarTitle.textContent = "Labels";
      const labelMap = new Map();

      // ONLY labels that have at least one scheduled task under them are added!
      scheduledCards.forEach(({ card, sDate, dDate, listName, idx }) => {
        let labelId, labelName, labelColor;

        if (card.labels && card.labels.length > 0) {
          // Use primary label (first label on the card)
          const primary = card.labels[0];
          labelId = primary.id;
          labelName = primary.name && primary.name.trim() !== ""
            ? primary.name.trim()
            : (primary.color ? primary.color.charAt(0).toUpperCase() + primary.color.slice(1) + " Label" : "Label");
          labelColor = primary.color || "blue_light";
        } else {
          // Card has no labels attached
          labelId = "no_label";
          labelName = "General / No Label";
          labelColor = "blue_light";
        }

        if (!labelMap.has(labelId)) {
          labelMap.set(labelId, {
            id: labelId,
            name: labelName,
            color: labelColor,
            isLabel: true,
            taskCount: 0
          });
        }
        labelMap.get(labelId).taskCount++;

        activeTasks.push({
          id: card.id,
          name: card.name,
          rowId: labelId,
          startDate: sDate,
          dueDate: dDate,
          color: mapTrelloColorToPillColor(labelColor),
          track: 0,
          listId: card.idList,
          labelId: labelId,
          labels: card.labels || []
        });
      });

      // Sort labels alphabetically, keep "no_label" at the bottom
      activeRows = Array.from(labelMap.values()).sort((a, b) => {
        if (a.id === "no_label") return 1;
        if (b.id === "no_label") return -1;
        return a.name.localeCompare(b.name);
      });

      if (activeRows.length === 0) {
        activeRows = [
          { id: "empty_info", name: "No Scheduled Tasks", isLabel: true, color: "blue_light" }
        ];
      }
    } else if (currentViewMode === "list") {
      sidebarTitle.textContent = "Lists & Status";
      const listMap = new Map();

      scheduledCards.forEach(({ card, sDate, dDate, listName, idx }) => {
        const lId = card.idList;
        const listObj = lists.find(l => l.id === lId);
        const lName = listObj ? listObj.name : "List";

        if (!listMap.has(lId)) {
          listMap.set(lId, {
            id: lId,
            name: lName,
            isList: true,
            taskCount: 0
          });
        }
        listMap.get(lId).taskCount++;

        activeTasks.push({
          id: card.id,
          name: card.name,
          rowId: lId,
          startDate: sDate,
          dueDate: dDate,
          color: pickColor(listName, idx),
          track: 0,
          listId: card.idList,
          labels: card.labels || []
        });
      });

      // Filter lists to only those with scheduled tasks
      activeRows = lists
        .filter(l => listMap.has(l.id))
        .map(l => listMap.get(l.id));

      if (activeRows.length === 0) {
        activeRows = lists.map(l => ({ id: l.id, name: l.name, isList: true }));
      }
    } else {
      sidebarTitle.textContent = "People & Assignees";
      const memberMap = new Map();

      scheduledCards.forEach(({ card, sDate, dDate, listName, idx }) => {
        const memId = (card.idMembers && card.idMembers[0]) ? card.idMembers[0] : "unassigned";
        const memObj = members.find(m => m.id === memId);
        const memName = memObj ? (memObj.fullName || memObj.username) : "Unassigned";
        const avatar = (memObj && memObj.avatarUrl) ? `${memObj.avatarUrl}/170.png` : null;

        if (!memberMap.has(memId)) {
          memberMap.set(memId, {
            id: memId,
            name: memName,
            avatar: avatar,
            taskCount: 0
          });
        }
        memberMap.get(memId).taskCount++;

        activeTasks.push({
          id: card.id,
          name: card.name,
          rowId: memId,
          startDate: sDate,
          dueDate: dDate,
          color: pickColor(listName, idx),
          track: 0,
          listId: card.idList,
          labels: card.labels || []
        });
      });

      activeRows = Array.from(memberMap.values());
      if (activeRows.length === 0) {
        activeRows.push({ id: "unassigned", name: "Unassigned", avatar: null });
      }
    }

    computeTaskTracks();

    // Always center view on Today
    const today = new Date();
    viewStartDate = getCenteredDate(today, -2);

    renderTimeline();
    renderUnscheduledDrawer();

    syncStatus.innerHTML = `<span class="status-dot"></span><span class="status-text">Connected</span>`;
  } catch (err) {
    console.error("Failed to fetch board data:", err);
    syncStatus.innerHTML = `<span class="status-dot" style="background:#EF4444"></span><span class="status-text">Error</span>`;
  }
}

// ==========================================================================
// Rendering Engine
// ==========================================================================
function renderTimeline() {
  const sidebarRows = document.getElementById("sidebarRows");
  const headerRow = document.getElementById("timelineHeaderRow");
  const gridBody = document.getElementById("timelineGridBody");
  const dateRangeLabel = document.getElementById("currentDateRange");
  const todayMarker = document.getElementById("todayMarkerLine");

  sidebarRows.innerHTML = "";
  headerRow.innerHTML = "";
  gridBody.innerHTML = "";

  // 1. Generate Days Array
  const days = [];
  const curr = new Date(viewStartDate);
  for (let i = 0; i < totalVisibleDays; i++) {
    days.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
  }

  // Update Range Label
  const startMonth = days[0].toLocaleString("default", { month: "long", year: "numeric" });
  dateRangeLabel.textContent = startMonth;

  // 2. Render Header Row (Today highlighted with blue circle)
  const todayStr = formatLocalDate(new Date());
  let todayColIndex = -1;

  days.forEach((day, index) => {
    const dayStr = formatLocalDate(day);
    const dayName = day.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum = day.getDate();
    const isToday = dayStr === todayStr;

    if (isToday) todayColIndex = index;

    const dayCol = document.createElement("div");
    dayCol.className = `timeline-day-header ${isToday ? "is-today" : ""}`;
    dayCol.innerHTML = `<span>${dayName}</span><span class="day-badge-pill">${dayNum}</span>`;
    headerRow.appendChild(dayCol);
  });

  // Position vertical red indicator line at Today
  if (todayColIndex !== -1) {
    const colWidth = zoomMode === "days" ? 140 : 100;
    const xPos = todayColIndex * colWidth + (colWidth / 2);
    todayMarker.style.display = "block";
    todayMarker.style.left = `${xPos}px`;
  } else {
    todayMarker.style.display = "none";
  }

  // 3. Render Left Sidebar Rows
  activeRows.forEach(row => {
    const rowEl = document.createElement("div");
    rowEl.className = `sidebar-row-cell ${row.isLabel ? "is-label-row" : ""} ${row.isMilestone ? "is-milestone-row" : ""}`;
    rowEl.dataset.rowId = row.id;

    const rowTasksCount = activeTasks.filter(t => t.rowId === row.id).length;
    rowEl.title = `${row.name} (${rowTasksCount} scheduled task${rowTasksCount === 1 ? '' : 's'})\n💡 Double-click to cycle through tasks (latest to oldest)`;

    if (row.isMilestone) {
      rowEl.innerHTML = `
        <div class="milestone-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
        </div>
        <span class="sidebar-name">${row.name}</span>
      `;
    } else if (row.isLabel) {
      const hexColor = getLabelHexColor(row.color);
      rowEl.innerHTML = `
        <div class="sidebar-label-tag" style="background-color: ${hexColor}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
            <line x1="7" y1="7" x2="7.01" y2="7"></line>
          </svg>
        </div>
        <span class="sidebar-name" title="${row.name}">${row.name}</span>
      `;
    } else if (row.avatar) {
      rowEl.innerHTML = `
        <img class="sidebar-avatar" src="${row.avatar}" alt="${row.name}">
        <span class="sidebar-name">${row.name}</span>
      `;
    } else {
      const initials = (row.name || "??").substring(0, 2).toUpperCase();
      const colors = ["#0079BF", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#6366F1"];
      const charCode = (row.name || "").charCodeAt(0) || 0;
      const bg = colors[charCode % colors.length];

      rowEl.innerHTML = `
        <div class="sidebar-avatar-placeholder" style="background-color: ${bg}">
          ${initials}
        </div>
        <span class="sidebar-name" title="${row.name}">${row.name}</span>
      `;
    }

    sidebarRows.appendChild(rowEl);

    // 4. Render Grid Body Row
    const gridRow = document.createElement("div");
    gridRow.className = "timeline-grid-row";
    gridRow.dataset.rowId = row.id;

    days.forEach(day => {
      const dayStr = formatLocalDate(day);
      const isToday = dayStr === todayStr;
      const cell = document.createElement("div");
      cell.className = `grid-col-cell ${isToday ? "is-today-col" : ""}`;
      gridRow.appendChild(cell);
    });

    // Append Task Pills for this row
    const rowTasks = activeTasks.filter(t => t.rowId === row.id);
    rowTasks.forEach(task => {
      const pill = createTaskPill(task, days);
      if (pill) gridRow.appendChild(pill);
    });

    gridBody.appendChild(gridRow);
  });

  setTimeout(drawDependencyCurves, 50);
}

// Create a single Task Pill
function createTaskPill(task, days) {
  const colWidth = zoomMode === "days" ? 140 : 100;
  const startDate = new Date(task.startDate + "T00:00:00");
  const dueDate = new Date(task.dueDate + "T00:00:00");

  const firstDay = new Date(days[0]);
  firstDay.setHours(0, 0, 0, 0);

  const startOffset = Math.round((startDate - firstDay) / (1000 * 60 * 60 * 24));
  const spanDays = Math.max(1, Math.round((dueDate - startDate) / (1000 * 60 * 60 * 24)) + 1);

  if (startOffset + spanDays < 0 || startOffset >= days.length) return null;

  const leftPx = startOffset * colWidth + 8;
  const widthPx = spanDays * colWidth - 16;

  const pill = document.createElement("div");
  pill.id = `task-pill-${task.id}`;
  pill.className = `task-pill color-${task.color || 'yellow'} track-${task.track || 0}`;
  pill.style.left = `${leftPx}px`;
  pill.style.width = `${Math.max(100, widthPx)}px`;

  pill.innerHTML = `<span>${task.name}</span>`;
  pill.title = `${task.name}\n${task.startDate} to ${task.dueDate}`;

  pill.addEventListener("click", () => openEditModal(task));

  return pill;
}

// Compute tracks for overlapping tasks within the same row
function computeTaskTracks() {
  const rows = {};
  activeTasks.forEach(t => {
    if (!rows[t.rowId]) rows[t.rowId] = [];
    rows[t.rowId].push(t);
  });

  Object.values(rows).forEach(taskList => {
    taskList.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const tracksEnd = [];

    taskList.forEach(task => {
      const s = new Date(task.startDate).getTime();
      const d = new Date(task.dueDate).getTime();

      let assignedTrack = 0;
      for (let i = 0; i < tracksEnd.length; i++) {
        if (s >= tracksEnd[i]) {
          assignedTrack = i;
          break;
        }
      }

      if (assignedTrack === tracksEnd.length) {
        tracksEnd.push(d);
      } else {
        tracksEnd[assignedTrack] = d;
      }

      task.track = Math.min(1, assignedTrack);
    });
  });
}

// Draw smooth SVG Bezier curves
function drawDependencyCurves() {
  const svg = document.getElementById("dependencySvgLayer");
  svg.innerHTML = "";

  dependencies.forEach(dep => {
    const fromEl = document.getElementById(`task-pill-${dep.from}`);
    const toEl = document.getElementById(`task-pill-${dep.to}`);

    if (!fromEl || !toEl) return;

    const scrollContainer = document.getElementById("timelineScrollContainer");
    const containerRect = scrollContainer.getBoundingClientRect();

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const x1 = fromRect.right - containerRect.left + scrollContainer.scrollLeft;
    const y1 = fromRect.top + fromRect.height / 2 - containerRect.top + scrollContainer.scrollTop - 48;

    const x2 = toRect.left - containerRect.left + scrollContainer.scrollLeft;
    const y2 = toRect.top + toRect.height / 2 - containerRect.top + scrollContainer.scrollTop - 48;

    const dx = Math.abs(x2 - x1) * 0.5;
    const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.setAttribute("class", "dependency-curve");
    svg.appendChild(path);
  });
}

// ==========================================================================
// Unscheduled Drawer & Modal
// ==========================================================================
function renderUnscheduledDrawer() {
  const countEl = document.getElementById("unscheduledCount");
  const listEl = document.getElementById("unscheduledCardsList");

  countEl.textContent = unscheduledTasks.length;
  listEl.innerHTML = "";

  if (unscheduledTasks.length === 0) {
    listEl.innerHTML = `<div style="color:#9CA3AF; font-size:0.85rem; padding:12px;">All cards have scheduled dates! 🎉</div>`;
    return;
  }

  unscheduledTasks.forEach(task => {
    const card = document.createElement("div");
    card.className = "unscheduled-card-item";
    card.innerHTML = `
      <div class="unscheduled-card-title">${task.name}</div>
      <span class="unscheduled-card-list">${task.list}</span>
    `;

    card.addEventListener("click", () => {
      // Default to Today and Tomorrow
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 2);

      let targetRowId = activeRows[0] ? activeRows[0].id : "";
      if (currentViewMode === "label" && task.labels && task.labels.length > 0) {
        const matchRow = activeRows.find(r => r.id === task.labels[0].id);
        if (matchRow) targetRowId = matchRow.id;
      } else if (currentViewMode === "list" && task.listId) {
        const matchRow = activeRows.find(r => r.id === task.listId);
        if (matchRow) targetRowId = matchRow.id;
      }

      openEditModal({
        id: task.id,
        name: task.name,
        startDate: formatLocalDate(today),
        dueDate: formatLocalDate(tomorrow),
        rowId: targetRowId,
        color: "yellow",
        isNewScheduled: true
      });
    });

    listEl.appendChild(card);
  });
}

function openEditModal(task) {
  const modal = document.getElementById("taskModalOverlay");
  const titleInput = document.getElementById("taskName");
  const startInput = document.getElementById("taskStartDate");
  const dueInput = document.getElementById("taskDueDate");
  const assigneeSelect = document.getElementById("taskAssignee");
  const colorSelect = document.getElementById("taskColor");
  const idInput = document.getElementById("editCardId");

  idInput.value = task.id;
  titleInput.value = task.name;
  startInput.value = task.startDate;
  dueInput.value = task.dueDate;
  colorSelect.value = task.color || "yellow";

  assigneeSelect.innerHTML = "";
  activeRows.forEach(r => {
    if (r.id === "milestone" || r.id === "empty_info") return;
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    if (r.id === task.rowId) opt.selected = true;
    assigneeSelect.appendChild(opt);
  });

  modal.classList.add("open");
}

function closeEditModal() {
  document.getElementById("taskModalOverlay").classList.remove("open");
}

// ==========================================================================
// UI Event Handlers
// ==========================================================================
function bindUIEvents() {
  document.getElementById("boardSelect").addEventListener("change", (e) => {
    currentBoardId = e.target.value;
    fetchBoardData(currentBoardId);
  });

  const pills = document.querySelectorAll("#groupByPills .pill-btn");
  pills.forEach(btn => {
    btn.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      currentViewMode = btn.dataset.group;
      fetchBoardData(currentBoardId);
    });
  });

  document.getElementById("prevBtn").addEventListener("click", () => {
    viewStartDate.setDate(viewStartDate.getDate() - 7);
    renderTimeline();
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    viewStartDate.setDate(viewStartDate.getDate() + 7);
    renderTimeline();
  });

  document.getElementById("todayBtn").addEventListener("click", () => {
    const today = new Date();
    viewStartDate = getCenteredDate(today, -2);
    renderTimeline();
  });

  const zoomBtns = document.querySelectorAll(".zoom-btn");
  zoomBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      zoomBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      zoomMode = btn.dataset.zoom;
      totalVisibleDays = zoomMode === "days" ? 9 : 14;
      document.documentElement.style.setProperty("--col-day-width", zoomMode === "days" ? "140px" : "100px");
      renderTimeline();
    });
  });

  const drawer = document.getElementById("unscheduledDrawer");
  document.getElementById("openUnscheduledBtn").addEventListener("click", () => {
    drawer.classList.toggle("open");
  });
  document.getElementById("closeDrawerBtn").addEventListener("click", () => {
    drawer.classList.remove("open");
  });

  document.getElementById("closeModalBtn").addEventListener("click", closeEditModal);
  document.getElementById("cancelModalBtn").addEventListener("click", closeEditModal);

  document.getElementById("taskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("editCardId").value;
    const name = document.getElementById("taskName").value;
    const start = document.getElementById("taskStartDate").value;
    const due = document.getElementById("taskDueDate").value;
    const rowId = document.getElementById("taskAssignee").value;
    const color = document.getElementById("taskColor").value;

    const existingIndex = activeTasks.findIndex(t => t.id === id);
    if (existingIndex !== -1) {
      activeTasks[existingIndex].name = name;
      activeTasks[existingIndex].startDate = start;
      activeTasks[existingIndex].dueDate = due;
      activeTasks[existingIndex].rowId = rowId;
      activeTasks[existingIndex].color = color;
    } else {
      activeTasks.push({
        id: id || `custom_${Date.now()}`,
        name: name,
        startDate: start,
        dueDate: due,
        rowId: rowId,
        color: color,
        track: 0
      });
      unscheduledTasks = unscheduledTasks.filter(u => u.id !== id);
    }

    // Sync directly to Trello API
    if (!id.startsWith("custom_")) {
      try {
        const putUrl = `https://api.trello.com/1/cards/${id}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&name=${encodeURIComponent(name)}&start=${start}&due=${due}`;
        await fetch(putUrl, { method: "PUT" });
      } catch (err) {
        console.error("Failed to sync card update to Trello:", err);
      }
    }

    computeTaskTracks();
    renderTimeline();
    renderUnscheduledDrawer();
    closeEditModal();
  });

  document.getElementById("deleteTaskBtn").addEventListener("click", () => {
    const id = document.getElementById("editCardId").value;
    activeTasks = activeTasks.filter(t => t.id !== id);
    renderTimeline();
    closeEditModal();
  });

  const addTaskBtn = document.getElementById("addTaskBtn");
  if (addTaskBtn) {
    addTaskBtn.addEventListener("click", () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 2);

      openEditModal({
        id: `custom_${Date.now()}`,
        name: "New Task",
        startDate: formatLocalDate(today),
        dueDate: formatLocalDate(tomorrow),
        rowId: activeRows[0] ? activeRows[0].id : "",
        color: "yellow",
        isNewScheduled: true
      });
    });
  }

  // Double-click on left sidebar row to jump to latest/previous scheduled tasks
  const sidebarRows = document.getElementById("sidebarRows");
  if (sidebarRows) {
    sidebarRows.addEventListener("dblclick", (e) => {
      const rowEl = e.target.closest(".sidebar-row-cell");
      if (rowEl && rowEl.dataset.rowId) {
        jumpToRowTask(rowEl.dataset.rowId);
      }
    });
  }

  document.getElementById("timelineScrollContainer").addEventListener("scroll", drawDependencyCurves);
  window.addEventListener("resize", drawDependencyCurves);
}

// ==========================================================================
// Double-Click Label Navigation Engine
// Moves the timeline date to show the latest scheduled task for the label,
// and subsequent double-clicks move to the next previous scheduled task.
// ==========================================================================
function jumpToRowTask(rowId) {
  const tasks = activeTasks.filter(t => t.rowId === rowId);
  if (!tasks || tasks.length === 0) {
    showNavToast("No scheduled tasks found under this label");
    return;
  }

  // Sort tasks strictly descending: latest/newest date first, down to oldest date
  tasks.sort((a, b) => {
    const dateA = new Date((a.dueDate || a.startDate) + "T00:00:00").getTime();
    const dateB = new Date((b.dueDate || b.startDate) + "T00:00:00").getTime();
    if (dateB !== dateA) return dateB - dateA;
    const startA = new Date((a.startDate || a.dueDate) + "T00:00:00").getTime();
    const startB = new Date((b.startDate || b.dueDate) + "T00:00:00").getTime();
    return startB - startA;
  });

  // Cycle through tasks: 1st double-click = 0 (latest), 2nd = 1 (next previous), etc.
  if (rowNavIndexes[rowId] === undefined) {
    rowNavIndexes[rowId] = 0;
  } else {
    rowNavIndexes[rowId] = (rowNavIndexes[rowId] + 1) % tasks.length;
  }

  const currentIndex = rowNavIndexes[rowId];
  const targetTask = tasks[currentIndex];
  const targetDateStr = targetTask.startDate || targetTask.dueDate;
  if (!targetDateStr) return;

  const targetDate = new Date(targetDateStr + "T00:00:00");

  // Center timeline on this task (-2 days offset so task appears comfortably in view)
  viewStartDate = getCenteredDate(targetDate, -2);
  renderTimeline();

  // Visual feedback on the double-clicked row cell
  const clickedRowEl = document.querySelector(`.sidebar-row-cell[data-row-id="${rowId}"]`);
  if (clickedRowEl) {
    clickedRowEl.classList.add("row-nav-flash");
    setTimeout(() => clickedRowEl.classList.remove("row-nav-flash"), 400);
  }

  // Visual feedback: focus & pulsing outline on the target task pill
  setTimeout(() => {
    const pillEl = document.getElementById(`task-pill-${targetTask.id}`);
    if (pillEl) {
      pillEl.classList.add("is-nav-focused");
      const scrollContainer = document.getElementById("timelineScrollContainer");
      if (scrollContainer) {
        const pillLeft = pillEl.offsetLeft;
        scrollContainer.scrollTo({ left: Math.max(0, pillLeft - 180), behavior: "smooth" });
      }
      setTimeout(() => {
        pillEl.classList.remove("is-nav-focused");
      }, 2500);
    }
  }, 80);

  // Friendly date and counter toast
  const formattedDate = targetDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const stepLabel = currentIndex === 0 ? "Latest task" : `Previous task (${currentIndex + 1}/${tasks.length})`;
  showNavToast(`📍 ${stepLabel}: "${targetTask.name}" • ${formattedDate}`);
}

let toastTimer = null;
function showNavToast(message) {
  let toast = document.getElementById("timelineNavToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "timelineNavToast";
    toast.className = "timeline-nav-toast";
    toast.innerHTML = `<span class="timeline-nav-toast-dot"></span><span id="timelineNavToastText"></span>`;
    document.body.appendChild(toast);
  }
  document.getElementById("timelineNavToastText").textContent = message;
  toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}
