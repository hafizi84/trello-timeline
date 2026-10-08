/**
 * Trello Timeline Application
 * Interactive Gantt / Timeline view connected to Trello REST API
 * Recreates the exact layout, colors, and dependencies from the reference design.
 */

// User's Trello Credentials
const TRELLO_CONFIG = {
  key: "dbbc85674e84318b89cb9355c2b7f4d7",
  token: "ATTA9fb2ac93bd4613434ec9ac642c4312aa108679da01dd61376eb277184388290d4F7EB0AC"
};

// Global State
let currentBoardId = "demo";
let currentViewMode = "member"; // 'member' | 'list'
let zoomMode = "days"; // 'days' | 'weeks'
let viewStartDate = new Date(2026, 9, 7); // Wednesday, Oct 7, 2026 (Demo week)
let totalVisibleDays = 9;
let activeTasks = [];
let activeRows = [];
let unscheduledTasks = [];
let dependencies = [];

// ==========================================================================
// Demo Dataset (Exact replication of user's screenshot)
// ==========================================================================
const DEMO_MEMBERS = [
  { id: "milestone", name: "Milestone", isMilestone: true },
  { id: "molly", name: "Molly", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150" },
  { id: "diana", name: "Diana", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150" },
  { id: "brandon", name: "Brandon", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" },
  { id: "mark", name: "Mark", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150" },
  { id: "ray", name: "Ray", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150" }
];

const DEMO_TASKS = [
  // Milestones Row
  {
    id: "m1",
    name: "Product Demo",
    rowId: "milestone",
    startDate: "2026-10-13",
    dueDate: "2026-10-13",
    color: "milestone",
    track: 0,
    isMilestone: true
  },
  // Molly
  {
    id: "t1",
    name: "Website design",
    rowId: "molly",
    startDate: "2026-10-09",
    dueDate: "2026-10-13",
    color: "yellow",
    track: 0
  },
  {
    id: "t2",
    name: "Mobile app prototype",
    rowId: "molly",
    startDate: "2026-10-09",
    dueDate: "2026-10-10",
    color: "yellow",
    hasCheckmark: true,
    track: 1
  },
  // Diana
  {
    id: "t3",
    name: "Finalize workshop description",
    rowId: "diana",
    startDate: "2026-10-09",
    dueDate: "2026-10-12",
    color: "blue",
    track: 0
  },
  // Brandon
  {
    id: "t4",
    name: "Feature prioritization",
    rowId: "brandon",
    startDate: "2026-10-09",
    dueDate: "2026-10-10",
    color: "purple",
    track: 0
  },
  {
    id: "t5",
    name: "Login activity tracking",
    rowId: "brandon",
    startDate: "2026-10-12",
    dueDate: "2026-10-14",
    color: "purple",
    track: 1
  },
  // Mark
  {
    id: "t6",
    name: "Feature page update",
    rowId: "mark",
    startDate: "2026-10-09",
    dueDate: "2026-10-11",
    color: "green",
    track: 0
  },
  {
    id: "t7",
    name: "Optimize UI Design",
    rowId: "mark",
    startDate: "2026-10-12",
    dueDate: "2026-10-14",
    color: "yellow",
    track: 0
  },
  {
    id: "t8",
    name: "User interviews",
    rowId: "mark",
    startDate: "2026-10-13",
    dueDate: "2026-10-14",
    color: "blue",
    track: 1
  },
  // Ray
  {
    id: "t9",
    name: "Review user stories",
    rowId: "ray",
    startDate: "2026-10-09",
    dueDate: "2026-10-13",
    color: "blue",
    track: 0
  },
  {
    id: "t10",
    name: "New user flow",
    rowId: "ray",
    startDate: "2026-10-09",
    dueDate: "2026-10-10",
    color: "yellow",
    track: 1
  },
  {
    id: "t11",
    name: "Implement exp...",
    rowId: "ray",
    startDate: "2026-10-14",
    dueDate: "2026-10-14",
    color: "green",
    track: 0
  }
];

// Dependency link (Mobile app prototype -> Login activity tracking)
const DEMO_DEPENDENCIES = [
  { from: "t2", to: "t5" }
];

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initTimeline();
  loadTrelloBoards();
  bindUIEvents();
});

function initTimeline() {
  if (currentBoardId === "demo") {
    loadDemoData();
  } else {
    fetchBoardData(currentBoardId);
  }
}

function loadDemoData() {
  activeRows = DEMO_MEMBERS;
  activeTasks = [...DEMO_TASKS];
  dependencies = [...DEMO_DEPENDENCIES];
  unscheduledTasks = [
    { id: "u1", name: "Update design tokens", list: "Backlog" },
    { id: "u2", name: "Security vulnerability audit", list: "To Do" },
    { id: "u3", name: "Client feedback review", list: "Incoming" }
  ];

  renderTimeline();
  renderUnscheduledDrawer();
}

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

    // Populate board dropdown
    boardSelect.innerHTML = `<option value="demo">✨ Screenshot Demo (Molly, Diana, Brandon...)</option>`;
    boards.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `📋 ${b.name}`;
      boardSelect.appendChild(opt);
    });

    document.getElementById("syncStatus").style.display = "flex";
  } catch (err) {
    console.warn("Could not load Trello boards (offline or network error):", err);
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

    // Setup rows based on grouping mode
    if (currentViewMode === "member") {
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
    } else {
      activeRows = [
        { id: "milestone", name: "Milestone", isMilestone: true },
        ...lists.map(l => ({ id: l.id, name: l.name, isList: true }))
      ];
    }

    // Process cards into scheduled vs unscheduled
    activeTasks = [];
    unscheduledTasks = [];
    dependencies = [];

    // Colors pool for cards
    const colorPalette = ["yellow", "blue", "purple", "green"];

    cards.forEach((card, idx) => {
      const start = card.start ? card.start.split("T")[0] : null;
      const due = card.due ? card.due.split("T")[0] : null;

      if (start || due) {
        const sDate = start || due;
        const dDate = due || start;
        const rowId = currentViewMode === "member" 
          ? (card.idMembers && card.idMembers[0] ? card.idMembers[0] : activeRows[1].id)
          : card.idList;

        activeTasks.push({
          id: card.id,
          name: card.name,
          rowId: rowId,
          startDate: sDate,
          dueDate: dDate,
          color: colorPalette[idx % colorPalette.length],
          track: 0,
          listId: card.idList
        });
      } else {
        const listObj = lists.find(l => l.id === card.idList);
        unscheduledTasks.push({
          id: card.id,
          name: card.name,
          list: listObj ? listObj.name : "To Do",
          listId: card.idList
        });
      }
    });

    // Compute track layering (prevent collisions)
    computeTaskTracks();

    // Center view around active cards
    if (activeTasks.length > 0) {
      const firstDate = new Date(activeTasks[0].startDate);
      firstDate.setDate(firstDate.getDate() - 2);
      viewStartDate = firstDate;
    }

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

  // 2. Render Header Row (Day 9, Day 10, Day 11...)
  const todayStr = new Date().toISOString().split("T")[0];
  // Target active/today demo day is Oct 11 or today
  const targetHighlightDate = currentBoardId === "demo" ? "2026-10-11" : todayStr;
  let todayColIndex = -1;

  days.forEach((day, index) => {
    const dayStr = day.toISOString().split("T")[0];
    const dayName = day.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum = day.getDate();
    const isToday = dayStr === targetHighlightDate;

    if (isToday) todayColIndex = index;

    const dayCol = document.createElement("div");
    dayCol.className = `timeline-day-header ${isToday ? "is-today" : ""}`;
    dayCol.innerHTML = `<span>${dayName}</span><span class="day-badge-pill">${dayNum}</span>`;
    headerRow.appendChild(dayCol);
  });

  // Position vertical red indicator line
  if (todayColIndex !== -1) {
    const colWidth = 140;
    const xPos = todayColIndex * colWidth + (colWidth / 2);
    todayMarker.style.display = "block";
    todayMarker.style.left = `${xPos}px`;
  } else {
    todayMarker.style.display = "none";
  }

  // 3. Render Left Sidebar Rows (Milestone, Members/Lists)
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
      const initials = row.name.substring(0, 2).toUpperCase();
      const colors = ["#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B"];
      const charCode = row.name.charCodeAt(0) || 0;
      const bg = colors[charCode % colors.length];

      rowEl.innerHTML = `
        <div class="sidebar-avatar-placeholder" style="background-color: ${bg}">
          ${initials}
        </div>
        <span class="sidebar-name">${row.name}</span>
      `;
    }

    sidebarRows.appendChild(rowEl);

    // 4. Render Grid Body Row
    const gridRow = document.createElement("div");
    gridRow.className = "timeline-grid-row";
    gridRow.dataset.rowId = row.id;

    // Render Background Cells for each day in this row
    days.forEach(day => {
      const dayStr = day.toISOString().split("T")[0];
      const isToday = dayStr === targetHighlightDate;
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

  // 5. Draw SVG Dependency Curves
  setTimeout(drawDependencyCurves, 50);
}

// Create a single Task Pill
function createTaskPill(task, days) {
  const colWidth = 140;
  const startDate = new Date(task.startDate);
  const dueDate = new Date(task.dueDate);

  // Find day indices
  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  // Offset in days from first visible column
  const startOffset = Math.floor((startDate - firstDay) / (1000 * 60 * 60 * 24));
  const spanDays = Math.max(1, Math.floor((dueDate - startDate) / (1000 * 60 * 60 * 24)) + 1);

  // If outside visible range, don't render or clamp
  if (startOffset + spanDays < 0 || startOffset >= days.length) return null;

  const leftPx = startOffset * colWidth + 8;
  const widthPx = spanDays * colWidth - 16;

  const pill = document.createElement("div");
  pill.id = `task-pill-${task.id}`;
  pill.className = `task-pill color-${task.color || 'yellow'} track-${task.track || 0}`;
  pill.style.left = `${leftPx}px`;
  pill.style.width = `${Math.max(100, widthPx)}px`;

  // Inner icon (checkmark or milestone)
  let iconHtml = "";
  if (task.hasCheckmark) {
    iconHtml = `<span class="task-pill-icon"><span class="task-check-circle">✓</span></span>`;
  }

  pill.innerHTML = `${iconHtml}<span>${task.name}</span>`;

  // Click to open edit modal
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

      task.track = Math.min(1, assignedTrack); // Max 2 tracks per row like screenshot
    });
  });
}

// Draw smooth SVG Bezier curves connecting dependent tasks
function drawDependencyCurves() {
  const svg = document.getElementById("dependencySvgLayer");
  svg.innerHTML = "";

  dependencies.forEach(dep => {
    const fromEl = document.getElementById(`task-pill-${dep.from}`);
    const toEl = document.getElementById(`task-pill-${dep.to}`);

    if (!fromEl || !toEl) return;

    // Relative coordinates
    const scrollContainer = document.getElementById("timelineScrollContainer");
    const containerRect = scrollContainer.getBoundingClientRect();

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const x1 = fromRect.right - containerRect.left + scrollContainer.scrollLeft;
    const y1 = fromRect.top + fromRect.height / 2 - containerRect.top + scrollContainer.scrollTop - 48;

    const x2 = toRect.left - containerRect.left + scrollContainer.scrollLeft;
    const y2 = toRect.top + toRect.height / 2 - containerRect.top + scrollContainer.scrollTop - 48;

    // Cubic bezier smooth curve
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
      // Open modal with today's date pre-filled
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0];

      openEditModal({
        id: task.id,
        name: task.name,
        startDate: today,
        dueDate: tomorrow,
        rowId: activeRows[1].id,
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

  // Populate Assignee Select
  assigneeSelect.innerHTML = "";
  activeRows.forEach(r => {
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
  // Board Selector
  document.getElementById("boardSelect").addEventListener("change", (e) => {
    currentBoardId = e.target.value;
    initTimeline();
  });

  // Group By Pills
  const pills = document.querySelectorAll("#groupByPills .pill-btn");
  pills.forEach(btn => {
    btn.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      currentViewMode = btn.dataset.group;
      initTimeline();
    });
  });

  // Prev / Next Navigation
  document.getElementById("prevBtn").addEventListener("click", () => {
    viewStartDate.setDate(viewStartDate.getDate() - 7);
    renderTimeline();
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    viewStartDate.setDate(viewStartDate.getDate() + 7);
    renderTimeline();
  });

  document.getElementById("todayBtn").addEventListener("click", () => {
    if (currentBoardId === "demo") {
      viewStartDate = new Date(2026, 9, 7);
    } else {
      const now = new Date();
      now.setDate(now.getDate() - 2);
      viewStartDate = now;
    }
    renderTimeline();
  });

  // Zoom Mode
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

  // Drawer Toggles
  const drawer = document.getElementById("unscheduledDrawer");
  document.getElementById("openUnscheduledBtn").addEventListener("click", () => {
    drawer.classList.toggle("open");
  });
  document.getElementById("closeDrawerBtn").addEventListener("click", () => {
    drawer.classList.remove("open");
  });

  // Modal Close
  document.getElementById("closeModalBtn").addEventListener("click", closeEditModal);
  document.getElementById("cancelModalBtn").addEventListener("click", closeEditModal);

  // Modal Submit
  document.getElementById("taskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("editCardId").value;
    const name = document.getElementById("taskName").value;
    const start = document.getElementById("taskStartDate").value;
    const due = document.getElementById("taskDueDate").value;
    const rowId = document.getElementById("taskAssignee").value;
    const color = document.getElementById("taskColor").value;

    // Check if task is existing
    const existingIndex = activeTasks.findIndex(t => t.id === id);
    if (existingIndex !== -1) {
      activeTasks[existingIndex].name = name;
      activeTasks[existingIndex].startDate = start;
      activeTasks[existingIndex].dueDate = due;
      activeTasks[existingIndex].rowId = rowId;
      activeTasks[existingIndex].color = color;
    } else {
      // New or from unscheduled
      activeTasks.push({
        id: id || `custom_${Date.now()}`,
        name: name,
        startDate: start,
        dueDate: due,
        rowId: rowId,
        color: color,
        track: 0
      });
      // Remove from unscheduled if present
      unscheduledTasks = unscheduledTasks.filter(u => u.id !== id);
    }

    // Sync to Trello API if it's a real card
    if (currentBoardId !== "demo" && !id.startsWith("custom_")) {
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

  // Delete Task
  document.getElementById("deleteTaskBtn").addEventListener("click", () => {
    const id = document.getElementById("editCardId").value;
    activeTasks = activeTasks.filter(t => t.id !== id);
    renderTimeline();
    closeEditModal();
  });

  // Redraw SVG curves on scroll
  document.getElementById("timelineScrollContainer").addEventListener("scroll", drawDependencyCurves);
  window.addEventListener("resize", drawDependencyCurves);
}
