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
let currentViewMode = "list"; // Default to 'list' (shows actual active Trello workflow lists)
let zoomMode = "days"; // 'days' | 'weeks'
let totalVisibleDays = 9;

// Today & Date Calculations
let viewStartDate = getCenteredDate(new Date(), -2); // Center on Today (2 days before today)
let activeTasks = [];
let activeRows = [];
let unscheduledTasks = [];
let dependencies = [];

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

    // Setup Rows
    const sidebarTitle = document.getElementById("sidebarHeaderTitle");
    if (currentViewMode === "list") {
      sidebarTitle.textContent = "Lists & Status";
      activeRows = [
        { id: "milestone", name: "Milestone", isMilestone: true },
        ...lists.map(l => ({ id: l.id, name: l.name, isList: true }))
      ];
    } else {
      sidebarTitle.textContent = "People & Assignees";
      activeRows = [
        { id: "milestone", name: "Milestone", isMilestone: true },
        ...members.map(m => ({
          id: m.id,
          name: m.fullName || m.username,
          avatar: m.avatarUrl ? `${m.avatarUrl}/170.png` : null
        }))
      ];
      if (members.length === 0) {
        activeRows.push({ id: "unassigned", name: "Unassigned", avatar: null });
      }
    }

    // Process Cards
    activeTasks = [];
    unscheduledTasks = [];
    dependencies = [];

    // Helper color chooser by list name or index
    function pickColor(listName, index) {
      if (!listName) return "yellow";
      const ln = listName.toLowerCase();
      if (ln.includes("incoming") || ln.includes("start") || ln.includes("todo") || ln.includes("to do")) return "yellow";
      if (ln.includes("progress") || ln.includes("work")) return "blue";
      if (ln.includes("approval") || ln.includes("review") || ln.includes("pending")) return "purple";
      if (ln.includes("completed") || ln.includes("live") || ln.includes("done")) return "green";
      const palette = ["yellow", "blue", "purple", "green"];
      return palette[index % palette.length];
    }

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

        const rowId = currentViewMode === "list"
          ? card.idList
          : (card.idMembers && card.idMembers[0] ? card.idMembers[0] : (activeRows[1] ? activeRows[1].id : "unassigned"));

        activeTasks.push({
          id: card.id,
          name: card.name,
          rowId: rowId,
          startDate: sDate,
          dueDate: dDate,
          color: pickColor(listName, idx),
          track: 0,
          listId: card.idList
        });
      } else {
        unscheduledTasks.push({
          id: card.id,
          name: card.name,
          list: listName || "To Do",
          listId: card.idList
        });
      }
    });

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
    rowEl.className = `sidebar-row-cell ${row.isMilestone ? "is-milestone-row" : ""}`;

    if (row.isMilestone) {
      rowEl.innerHTML = `
        <div class="milestone-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
        </div>
        <span class="sidebar-name">${row.name}</span>
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

      openEditModal({
        id: task.id,
        name: task.name,
        startDate: formatLocalDate(today),
        dueDate: formatLocalDate(tomorrow),
        rowId: currentViewMode === "list" ? task.listId : (activeRows[1] ? activeRows[1].id : "unassigned"),
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
    if (r.id === "milestone") return;
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

  document.getElementById("timelineScrollContainer").addEventListener("scroll", drawDependencyCurves);
  window.addEventListener("resize", drawDependencyCurves);
}
