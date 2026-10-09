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
let currentBoardId = urlParams.get("boardId") || urlParams.get("board") || DEFAULT_BOARD_ID;
let currentViewMode = "label"; // Default to 'label' as requested
let zoomMode = "days"; // 'days' | 'weeks'
let totalVisibleDays = 9;

// Today & Date Calculations
let viewStartDate = getCenteredDate(new Date(), -2); // Center on Today (2 days before today)
let activeTasks = [];
let activeRows = [];
let unscheduledTasks = [];
let dependencies = [];
let currentBoardLists = []; // Holds active board lists for list movement
let currentBoardLabels = []; // Holds all board labels for dropdown selection
let rowNavIndexes = {}; // Tracks focused task index per row for double-click cycling
let boardHolidays = []; // Holds public holidays & leave days { id, title, startDate, dueDate }
let currentModalTask = null; // Tracks currently active task in modal
let currentModalChecklists = []; // Holds active checklist objects for modal

// Compute checklist completed/total counts and prefix text for timeline bar
function getTaskChecklistCount(task) {
  let total = 0;
  let completed = 0;
  if (task && task.checklists && Array.isArray(task.checklists) && task.checklists.length > 0) {
    task.checklists.forEach(cl => {
      (cl.checkItems || []).forEach(item => {
        total++;
        if (item.state === "complete") completed++;
      });
    });
  }
  if (total > 0) {
    return { completed, total, text: `(${completed}/${total})` };
  } else {
    // If task has no checklist, display (0/1) or (1/1) if marked complete
    const done = (task && task.isCompleted) ? 1 : 0;
    return { completed: done, total: 1, text: `(${done}/1)` };
  }
}

function getCenteredDate(baseDate, offsetDays) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

// Format Date object to standard YYYY-MM-DD for native <input type="date"> and Trello API
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format any date / ISO string / Date object into DD-MM-YYYY format
function formatDateDDMMYYYY(d) {
  if (!d) return "";
  if (typeof d === "string") {
    const clean = d.split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD -> DD-MM-YYYY
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else if (parts[2].length === 4) {
        // Already DD-MM-YYYY
        return clean;
      }
    }
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      const day = String(parsed.getDate()).padStart(2, '0');
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const year = parsed.getFullYear();
      return `${day}-${month}-${year}`;
    }
    return d;
  } else if (d instanceof Date) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
  return String(d);
}

// Check if a given date string (YYYY-MM-DD) falls within any active holiday / leave
function getHolidayForDate(dayStr) {
  return boardHolidays.find(h => {
    const start = h.startDate;
    const due = h.dueDate || h.startDate;
    return dayStr >= start && dayStr <= due;
  });
}

// Map Trello label colors to friendly emojis for dropdown display
function getLabelEmoji(colorName) {
  if (!colorName) return "🏷️";
  const c = colorName.toLowerCase();
  if (c.includes("green") || c.includes("lime")) return "🟢";
  if (c.includes("yellow")) return "🟡";
  if (c.includes("orange")) return "🟠";
  if (c.includes("red")) return "🔴";
  if (c.includes("purple")) return "🟣";
  if (c.includes("sky") || c.includes("blue_light")) return "🩵";
  if (c.includes("blue")) return "🔵";
  if (c.includes("pink")) return "🌸";
  if (c.includes("black")) return "⚫";
  return "🏷️";
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
  setInterval(updateTodayMarkerPosition, 30000); // Update real-time red line position every 30s
});

// ==========================================================================
// Trello API Integration
// ==========================================================================
async function loadTrelloBoards() {
  const syncStatus = document.getElementById("syncStatus");
  if (syncStatus) syncStatus.style.display = "flex";

  const boardSelect = document.getElementById("boardSelect");
  if (!boardSelect) return;

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
  } catch (err) {
    console.warn("Could not load Trello boards list:", err);
  }
}

async function fetchBoardData(boardId) {
  const syncStatus = document.getElementById("syncStatus");
  syncStatus.innerHTML = `<span class="status-dot" style="background:#F59E0B"></span><span class="status-text">Syncing...</span>`;

  try {
    // Fetch Cards, Lists, Members, Board Labels, and Board Checklists
    const [cardsRes, listsRes, membersRes, labelsRes, checklistsRes] = await Promise.all([
      fetch(`https://api.trello.com/1/boards/${boardId}/cards?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&fields=name,desc,due,start,idMembers,idList,labels,id,dueComplete`),
      fetch(`https://api.trello.com/1/boards/${boardId}/lists?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}`),
      fetch(`https://api.trello.com/1/boards/${boardId}/members?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}`),
      fetch(`https://api.trello.com/1/boards/${boardId}/labels?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}`),
      fetch(`https://api.trello.com/1/boards/${boardId}/checklists?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}`)
    ]);

    const cards = await cardsRes.json();
    const lists = await listsRes.json();
    const members = await membersRes.json();
    const boardLabelsData = await labelsRes.json();
    const boardChecklistsData = checklistsRes.ok ? await checklistsRes.json() : [];
    currentBoardLists = lists; // Store lists globally for completed task routing

    // Index all board checklists by card ID
    const cardChecklistsMap = new Map();
    if (Array.isArray(boardChecklistsData)) {
      boardChecklistsData.forEach(cl => {
        if (!cardChecklistsMap.has(cl.idCard)) {
          cardChecklistsMap.set(cl.idCard, []);
        }
        cardChecklistsMap.get(cl.idCard).push(cl);
      });
    }

    // Process and cache all available board labels for dropdown selection
    const labelList = [];
    const labelIdSet = new Set();

    if (Array.isArray(boardLabelsData)) {
      boardLabelsData.forEach(l => {
        const lName = l.name && l.name.trim() !== ""
          ? l.name.trim()
          : (l.color ? l.color.charAt(0).toUpperCase() + l.color.slice(1) + " Label" : "Label");
        labelList.push({
          id: l.id,
          name: lName,
          color: l.color || "blue_light"
        });
        labelIdSet.add(l.id);
      });
    }

    // Also include any labels found directly on cards
    cards.forEach(card => {
      if (card.labels && card.labels.length > 0) {
        card.labels.forEach(cl => {
          if (!labelIdSet.has(cl.id)) {
            const clName = cl.name && cl.name.trim() !== ""
              ? cl.name.trim()
              : (cl.color ? cl.color.charAt(0).toUpperCase() + cl.color.slice(1) + " Label" : "Label");
            labelList.push({
              id: cl.id,
              name: clName,
              color: cl.color || "blue_light"
            });
            labelIdSet.add(cl.id);
          }
        });
      }
    });

    currentBoardLabels = labelList.sort((a, b) => a.name.localeCompare(b.name));

    // Separate Cards into Scheduled vs Unscheduled, and extract Holidays / Leave
    activeTasks = [];
    unscheduledTasks = [];
    dependencies = [];
    rowNavIndexes = {};
    const scheduledCards = [];

    // Initialize boardHolidays from localStorage cache
    boardHolidays = [];
    try {
      const localHols = JSON.parse(localStorage.getItem(`trello_holidays_${boardId}`) || "[]");
      if (Array.isArray(localHols)) boardHolidays = localHols;
    } catch (e) {
      console.warn("Could not read local holidays:", e);
    }

    cards.forEach((card, idx) => {
      const listObj = lists.find(l => l.id === card.idList);
      const listName = listObj ? listObj.name : "";
      const cardChecklists = cardChecklistsMap.get(card.id) || [];
      card.checklists = cardChecklists;

      // Check if this card is marked as a Holiday / Leave
      const isHol = card.name.startsWith("🌴") || card.name.startsWith("[Holiday]");
      if (isHol && (card.start || card.due)) {
        const cleanTitle = card.name.replace(/^(\[Holiday\]\s*|🌴\s*)/, '').trim();
        const s = card.start ? card.start.split("T")[0] : null;
        const d = card.due ? card.due.split("T")[0] : null;
        const holItem = {
          id: card.id,
          title: cleanTitle || "Public Holiday",
          desc: card.desc || "",
          startDate: s || d,
          dueDate: d || s
        };
        const existIdx = boardHolidays.findIndex(h => h.id === card.id || (h.title === holItem.title && h.startDate === holItem.startDate));
        if (existIdx !== -1) {
          boardHolidays[existIdx] = holItem;
        } else {
          boardHolidays.push(holItem);
        }
        return; // Exclude from regular timeline task bars!
      }

      // Exclude cards marked completed or inside completed archive lists from the active timeline view
      if (card.dueComplete === true || (listName && listName.toLowerCase().includes("completed") && !listName.toLowerCase().includes("this week"))) {
        return;
      }

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
          checklists: cardChecklists,
          idx
        });
      } else {
        unscheduledTasks.push({
          id: card.id,
          name: card.name,
          desc: card.desc || "",
          list: listName || "To Do",
          listId: card.idList,
          labels: card.labels || [],
          checklists: cardChecklists
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
          desc: card.desc || "",
          rowId: labelId,
          startDate: sDate,
          dueDate: dDate,
          color: mapTrelloColorToPillColor(labelColor),
          track: 0,
          listId: card.idList,
          listName: listName,
          labelId: labelId,
          labels: card.labels || [],
          checklists: card.checklists || [],
          isCompleted: Boolean(card.dueComplete)
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
          desc: card.desc || "",
          rowId: lId,
          startDate: sDate,
          dueDate: dDate,
          color: pickColor(listName, idx),
          track: 0,
          listId: card.idList,
          listName: listName,
          labels: card.labels || [],
          checklists: card.checklists || [],
          isCompleted: Boolean(card.dueComplete)
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
          desc: card.desc || "",
          rowId: memId,
          startDate: sDate,
          dueDate: dDate,
          color: pickColor(listName, idx),
          track: 0,
          listId: card.idList,
          listName: listName,
          labels: card.labels || [],
          checklists: card.checklists || [],
          isCompleted: Boolean(card.dueComplete)
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
  computeTaskTracks(); // Ensure tracks and row track counts are fresh

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
    const dayOfWeek = day.getDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const holiday = getHolidayForDate(dayStr);
    const isHoliday = Boolean(holiday);

    if (isToday) todayColIndex = index;

    const dayCol = document.createElement("div");
    dayCol.className = `timeline-day-header ${isToday ? "is-today" : ""} ${isWeekend ? "is-weekend" : ""} ${isHoliday ? "is-holiday" : ""}`;
    dayCol.dataset.date = dayStr;
    if (isHoliday) {
      dayCol.dataset.holidayId = holiday.id;
      dayCol.title = `🌴 ${holiday.title} (Holiday / Leave)\nDate: ${formatDateDDMMYYYY(day)}\n💡 Double-click to manage holiday`;
      dayCol.innerHTML = `<span>${dayName}</span><span class="day-badge-pill">${dayNum}</span><span class="holiday-icon-indicator" title="${holiday.title}">🌴</span>`;
    } else if (isWeekend) {
      dayCol.title = `${dayName} ${dayNum} (Weekend)\nDate: ${formatDateDDMMYYYY(day)}\n💡 Double-click to create new task on this date`;
      dayCol.innerHTML = `<span>${dayName}</span><span class="day-badge-pill">${dayNum}</span>`;
    } else {
      dayCol.title = `${dayName} ${dayNum}\nDate: ${formatDateDDMMYYYY(day)}\n💡 Double-click to create new task on this date`;
      dayCol.innerHTML = `<span>${dayName}</span><span class="day-badge-pill">${dayNum}</span>`;
    }
    headerRow.appendChild(dayCol);
  });

  // Position vertical red indicator line based on current time (9:00 AM - 6:00 PM)
  updateTodayMarkerPosition();

  const PILL_HEIGHT = 30;
  const TRACK_GAP = 7;
  const ROW_PADDING_Y = 10;
  const MIN_ROW_HEIGHT = 76;

  // 3. Render Left Sidebar Rows
  activeRows.forEach(row => {
    const trackCount = Math.max(1, row.trackCount || 1);
    const contentHeight = (ROW_PADDING_Y * 2) + (trackCount * PILL_HEIGHT) + ((trackCount - 1) * TRACK_GAP);
    const rowHeight = Math.max(MIN_ROW_HEIGHT, contentHeight);

    const rowEl = document.createElement("div");
    rowEl.className = `sidebar-row-cell ${row.isLabel ? "is-label-row" : ""} ${row.isMilestone ? "is-milestone-row" : ""}`;
    rowEl.dataset.rowId = row.id;
    rowEl.style.height = `${rowHeight}px`;
    rowEl.style.minHeight = `${rowHeight}px`;

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
    gridRow.style.height = `${rowHeight}px`;
    gridRow.style.minHeight = `${rowHeight}px`;

    days.forEach(day => {
      const dayStr = formatLocalDate(day);
      const isToday = dayStr === todayStr;
      const dayOfWeek = day.getDay(); // 0 is Sunday, 6 is Saturday
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      const holiday = getHolidayForDate(dayStr);
      const isHoliday = Boolean(holiday);

      const cell = document.createElement("div");
      cell.className = `grid-col-cell ${isToday ? "is-today-col" : ""} ${isWeekend ? "is-weekend-col" : ""} ${isHoliday ? "is-holiday-col" : ""}`;
      cell.dataset.date = dayStr;
      cell.dataset.rowId = row.id;

      if (isHoliday) {
        cell.dataset.holidayId = holiday.id;
        cell.title = `🌴 ${holiday.title} (Holiday / Leave) - ${formatDateDDMMYYYY(dayStr)}\n💡 Double-click to manage holiday`;
      } else if (isWeekend) {
        cell.title = `Weekend (${formatDateDDMMYYYY(dayStr)})\n💡 Double-click to create new task on this date`;
      } else {
        cell.title = `${formatDateDDMMYYYY(dayStr)}\n💡 Double-click to create new task on this date`;
      }
      gridRow.appendChild(cell);
    });

    // Append Task Pills for this row
    const rowTasks = activeTasks.filter(t => t.rowId === row.id);
    rowTasks.forEach(task => {
      const pill = createTaskPill(task, days, rowHeight, trackCount);
      if (pill) gridRow.appendChild(pill);
    });

    gridBody.appendChild(gridRow);
  });

  setTimeout(drawDependencyCurves, 50);
}

// ==========================================================================
// Real-Time Today Marker Engine (9:00 AM – 6:00 PM Working Hours Mapping)
// Positions the vertical red line within Today's column based on current local time:
// - Before 9:00 AM: Stays at the beginning (left) of today's column box
// - 9:00 AM – 6:00 PM: Progresses smoothly across today's box (9 working hours)
// - After 6:00 PM: Stays at the end (right) of today's column box
// ==========================================================================
function updateTodayMarkerPosition() {
  const todayMarker = document.getElementById("todayMarkerLine");
  if (!todayMarker) return;

  const now = new Date();
  const todayStr = formatLocalDate(now);

  // Check if Today is in the visible date range
  const curr = new Date(viewStartDate);
  let todayColIndex = -1;
  for (let i = 0; i < totalVisibleDays; i++) {
    if (formatLocalDate(curr) === todayStr) {
      todayColIndex = i;
      break;
    }
    curr.setDate(curr.getDate() + 1);
  }

  if (todayColIndex === -1) {
    todayMarker.style.display = "none";
    return;
  }

  const colWidth = zoomMode === "days" ? 140 : 100;
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const workStart = 9 * 60;  // 9:00 AM = 540 minutes
  const workEnd = 18 * 60;   // 6:00 PM = 1080 minutes
  const workDuration = workEnd - workStart; // 540 minutes

  let offsetInCol = 0;
  if (currentMinutes <= workStart) {
    // Before 9:00 AM: stays pinned at beginning of today's box
    offsetInCol = 3;
  } else if (currentMinutes >= workEnd) {
    // After 6:00 PM: stays pinned at end of today's box
    offsetInCol = colWidth - 3;
  } else {
    // Between 9:00 AM and 6:00 PM: proportional progression
    const fraction = (currentMinutes - workStart) / workDuration;
    offsetInCol = Math.max(3, Math.min(colWidth - 3, fraction * colWidth));
  }

  const xPos = todayColIndex * colWidth + offsetInCol;
  todayMarker.style.display = "block";
  todayMarker.style.left = `${xPos}px`;
  const gridBody = document.getElementById("timelineGridBody");
  if (gridBody) {
    todayMarker.style.height = `${gridBody.offsetHeight}px`;
  }

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  todayMarker.title = `Current Time: ${timeStr} • Date: ${formatDateDDMMYYYY(now)} (Today's Working Hours: 9:00 AM – 6:00 PM)`;
}

// Create a single Task Pill with Drag & Resize controllers
function createTaskPill(task, days, rowHeight = 76, trackCount = 1) {
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

  const PILL_HEIGHT = 30;
  const TRACK_GAP = 7;
  const ROW_PADDING_Y = 10;

  let topPx = 0;
  if (trackCount === 1) {
    topPx = Math.max(ROW_PADDING_Y, Math.round((rowHeight - PILL_HEIGHT) / 2));
  } else {
    topPx = ROW_PADDING_Y + (task.track || 0) * (PILL_HEIGHT + TRACK_GAP);
  }

  const pill = document.createElement("div");
  pill.id = `task-pill-${task.id}`;
  pill.className = `task-pill color-${task.color || 'yellow'} track-${task.track || 0} ${task.isCompleted ? 'is-completed' : ''}`;
  pill.style.left = `${leftPx}px`;
  pill.style.top = `${topPx}px`;
  pill.style.height = `${PILL_HEIGHT}px`;
  pill.style.width = `${Math.max(80, widthPx)}px`;
  pill.dataset.taskId = task.id;

  const clInfo = getTaskChecklistCount(task);
  const checkHtml = task.isCompleted ? `<span class="task-check-circle" title="Completed">✓</span>` : ``;

  pill.innerHTML = `
    <div class="task-resize-handle resize-left" title="Drag to adjust start date"></div>
    <div class="task-pill-inner">
      ${checkHtml}<span class="task-pill-checklist-badge">${clInfo.text}</span><span class="task-pill-title">${task.name}</span>
    </div>
    <div class="task-resize-handle resize-right" title="Drag to adjust due date (length)"></div>
  `;
  const descSnippet = task.desc ? `\n📝 ${task.desc.length > 80 ? task.desc.substring(0, 80) + '...' : task.desc}` : '';
  pill.title = `${clInfo.text} ${task.name}${task.isCompleted ? ' (Completed)' : ''}\n${formatDateDDMMYYYY(task.startDate)} to ${formatDateDDMMYYYY(task.dueDate)}${descSnippet}\n💡 Drag bar to shift dates, drag edges to resize length`;

  // Attach drag & resize interactivity
  setupTaskDragAndResize(pill, task);

  return pill;
}

// ==========================================================================
// Gantt Drag & Drop and Edge Resizing Controller
// Enables shifting task bar dates and resizing start/due dates with live feedback
// ==========================================================================
function setupTaskDragAndResize(pill, task) {
  let isDragging = false;
  let dragMode = "move"; // 'move' | 'resize-left' | 'resize-right'
  let startX = 0;
  let initialLeft = 0;
  let initialWidth = 0;
  let colWidth = zoomMode === "days" ? 140 : 100;

  const origStartDate = new Date(task.startDate + "T00:00:00");
  const origDueDate = new Date(task.dueDate + "T00:00:00");

  let currentStart = new Date(origStartDate);
  let currentDue = new Date(origDueDate);

  const tooltip = getOrCreateDragTooltip();

  function onMouseDown(e) {
    if (e.button !== 0) return; // Left mouse button only

    colWidth = zoomMode === "days" ? 140 : 100;
    startX = e.clientX;
    initialLeft = parseFloat(pill.style.left) || 0;
    initialWidth = parseFloat(pill.style.width) || 80;

    if (e.target.classList.contains("resize-left")) {
      dragMode = "resize-left";
    } else if (e.target.classList.contains("resize-right")) {
      dragMode = "resize-right";
    } else {
      dragMode = "move";
    }

    isDragging = false;

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e) {
    const deltaX = e.clientX - startX;

    if (!isDragging && Math.abs(deltaX) > 4) {
      isDragging = true;
      pill.classList.add("is-dragging");
      document.body.classList.add("is-dragging-task");
      tooltip.style.display = "block";
    }

    if (!isDragging) return;

    const deltaDays = Math.round(deltaX / colWidth);

    if (dragMode === "move") {
      currentStart = new Date(origStartDate);
      currentStart.setDate(currentStart.getDate() + deltaDays);
      currentDue = new Date(origDueDate);
      currentDue.setDate(currentDue.getDate() + deltaDays);

      pill.style.left = `${initialLeft + deltaX}px`;
      const diffSign = deltaDays > 0 ? `+${deltaDays}` : `${deltaDays}`;
      tooltip.innerHTML = `<strong>${task.name}</strong><br>📅 ${formatShortDate(currentStart)} – ${formatShortDate(currentDue)} (${deltaDays !== 0 ? diffSign + 'd' : 'No change'})`;
    } else if (dragMode === "resize-left") {
      currentStart = new Date(origStartDate);
      currentStart.setDate(currentStart.getDate() + deltaDays);
      if (currentStart > origDueDate) currentStart = new Date(origDueDate);

      const actualDeltaDays = Math.round((currentStart - origStartDate) / (1000 * 60 * 60 * 24));
      const newLeft = initialLeft + actualDeltaDays * colWidth;
      const newWidth = Math.max(colWidth - 16, initialWidth - actualDeltaDays * colWidth);

      pill.style.left = `${newLeft}px`;
      pill.style.width = `${newWidth}px`;

      const daysSpan = Math.round((origDueDate - currentStart) / (1000 * 60 * 60 * 24)) + 1;
      tooltip.innerHTML = `<strong>Adjust Start Date</strong><br>📅 Start: ${formatShortDate(currentStart)} | Length: ${daysSpan} day${daysSpan === 1 ? '' : 's'}`;
    } else if (dragMode === "resize-right") {
      currentDue = new Date(origDueDate);
      currentDue.setDate(currentDue.getDate() + deltaDays);
      if (currentDue < origStartDate) currentDue = new Date(origStartDate);

      const actualDeltaDays = Math.round((currentDue - origDueDate) / (1000 * 60 * 60 * 24));
      const newWidth = Math.max(colWidth - 16, initialWidth + actualDeltaDays * colWidth);

      pill.style.width = `${newWidth}px`;

      const daysSpan = Math.round((currentDue - origStartDate) / (1000 * 60 * 60 * 24)) + 1;
      tooltip.innerHTML = `<strong>Adjust Due Date</strong><br>📅 Due: ${formatShortDate(currentDue)} | Length: ${daysSpan} day${daysSpan === 1 ? '' : 's'}`;
    }

    // Position tooltip right above mouse cursor
    tooltip.style.left = `${e.clientX}px`;
    tooltip.style.top = `${e.clientY - 14}px`;
  }

  function onMouseUp(e) {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);

    pill.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging-task");
    tooltip.style.display = "none";

    if (!isDragging) {
      // Just a click: open task details modal
      openEditModal(task);
      return;
    }

    const newStartStr = formatLocalDate(currentStart);
    const newDueStr = formatLocalDate(currentDue);

    const changed = (newStartStr !== task.startDate) || (newDueStr !== task.dueDate);
    if (changed) {
      task.startDate = newStartStr;
      task.dueDate = newDueStr;

      // Update Trello card via REST API in background
      if (!task.id.startsWith("custom_")) {
        const putUrl = `https://api.trello.com/1/cards/${task.id}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&start=${newStartStr}&due=${newDueStr}`;
        fetch(putUrl, { method: "PUT" }).catch(err => console.error("Failed to update card dates on Trello:", err));
      }

      computeTaskTracks();
      renderTimeline();
      showNavToast(`📅 Updated "${task.name}": ${formatDateDDMMYYYY(newStartStr)} to ${formatDateDDMMYYYY(newDueStr)}`);
    } else {
      // Snap back if no day change
      renderTimeline();
    }
  }

  pill.addEventListener("mousedown", onMouseDown);
}

function formatShortDate(d) {
  return formatDateDDMMYYYY(d);
}

function getOrCreateDragTooltip() {
  let el = document.getElementById("taskDragTooltip");
  if (!el) {
    el = document.createElement("div");
    el.id = "taskDragTooltip";
    el.className = "task-drag-tooltip";
    document.body.appendChild(el);
  }
  return el;
}

// Compute tracks for overlapping tasks within the same row (Greedy Interval Scheduling)
function computeTaskTracks() {
  const rows = {};
  activeTasks.forEach(t => {
    if (!rows[t.rowId]) rows[t.rowId] = [];
    rows[t.rowId].push(t);
  });

  const rowTrackCountMap = {};

  Object.entries(rows).forEach(([rowId, taskList]) => {
    // Sort tasks primarily by startDate ascending; secondarily by dueDate ascending
    taskList.sort((a, b) => {
      const sA = new Date((a.startDate || a.dueDate) + "T00:00:00").getTime();
      const sB = new Date((b.startDate || b.dueDate) + "T00:00:00").getTime();
      if (sA !== sB) return sA - sB;
      const dA = new Date((a.dueDate || a.startDate) + "T00:00:00").getTime();
      const dB = new Date((b.dueDate || b.startDate) + "T00:00:00").getTime();
      return dA - dB;
    });

    const tracksEnd = []; // tracksEnd[trackIndex] = timestamp (ms) of the dueDate of the last task on that track

    taskList.forEach(task => {
      const startMs = new Date((task.startDate || task.dueDate) + "T00:00:00").getTime();
      const dueMs = new Date((task.dueDate || task.startDate) + "T00:00:00").getTime();

      let assignedTrack = -1;
      for (let i = 0; i < tracksEnd.length; i++) {
        // Task can share this track only if its start date is strictly after the previous task's due date
        if (startMs > tracksEnd[i]) {
          assignedTrack = i;
          tracksEnd[i] = dueMs;
          break;
        }
      }

      if (assignedTrack === -1) {
        assignedTrack = tracksEnd.length;
        tracksEnd.push(dueMs);
      }

      task.track = assignedTrack;
    });

    rowTrackCountMap[rowId] = Math.max(1, tracksEnd.length);
  });

  // Assign trackCount to activeRows
  activeRows.forEach(r => {
    r.trackCount = rowTrackCountMap[r.id] || 1;
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
    const clInfo = getTaskChecklistCount(task);
    const card = document.createElement("div");
    card.className = "unscheduled-card-item";
    card.innerHTML = `
      <div class="unscheduled-card-title"><span class="task-pill-checklist-badge">${clInfo.text}</span>${task.name}</div>
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
        desc: task.desc || "",
        startDate: formatLocalDate(today),
        dueDate: formatLocalDate(tomorrow),
        rowId: targetRowId,
        labelId: task.labels && task.labels.length > 0 ? task.labels[0].id : "no_label",
        listId: task.listId,
        listName: task.list,
        labels: task.labels || [],
        checklists: task.checklists || [],
        color: "yellow",
        isNewScheduled: true
      });
    });

    listEl.appendChild(card);
  });
}

// ==========================================================================
// Modal Checklist Management Engine
// ==========================================================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderModalChecklist() {
  const listEl = document.getElementById("checklistItemsList");
  const badgeEl = document.getElementById("checklistCounterBadge");
  const progressFill = document.getElementById("checklistProgressBarFill");
  if (!listEl) return;

  listEl.innerHTML = "";

  // Aggregate all checkItems across checklists
  let allItems = [];
  currentModalChecklists.forEach(cl => {
    (cl.checkItems || []).forEach(item => {
      allItems.push({ ...item, checklistId: cl.id });
    });
  });

  const total = allItems.length;
  const completed = allItems.filter(i => i.state === "complete").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (badgeEl) {
    badgeEl.textContent = total > 0 ? `${completed}/${total} (${pct}%)` : `0/0 (0%)`;
    if (pct === 100 && total > 0) {
      badgeEl.classList.add("is-all-done");
    } else {
      badgeEl.classList.remove("is-all-done");
    }
  }

  if (progressFill) {
    progressFill.style.width = `${pct}%`;
    if (pct === 100 && total > 0) {
      progressFill.classList.add("is-all-done");
    } else {
      progressFill.classList.remove("is-all-done");
    }
  }

  if (total === 0) {
    listEl.innerHTML = `<div class="checklist-empty-hint">No checklist items yet. Add one below!</div>`;
    return;
  }

  allItems.forEach(item => {
    const isComp = item.state === "complete";
    const row = document.createElement("div");
    row.className = `checklist-item ${isComp ? "is-checked" : ""}`;
    row.dataset.checklistId = item.checklistId;
    row.dataset.itemId = item.id;

    row.innerHTML = `
      <input type="checkbox" class="checklist-item-checkbox" ${isComp ? "checked" : ""} title="${isComp ? 'Mark incomplete' : 'Mark complete'}">
      <span class="checklist-item-text" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      <button type="button" class="checklist-item-delete" title="Delete checklist item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    listEl.appendChild(row);
  });
}

async function handleToggleCheckItem(checklistId, itemId, isChecked) {
  const newState = isChecked ? "complete" : "incomplete";

  currentModalChecklists.forEach(cl => {
    (cl.checkItems || []).forEach(item => {
      if (item.id === itemId || String(item.id) === String(itemId)) {
        item.state = newState;
      }
    });
  });

  renderModalChecklist();

  if (currentModalTask) {
    currentModalTask.checklists = currentModalChecklists;
    const activeIdx = activeTasks.findIndex(t => t.id === currentModalTask.id);
    if (activeIdx !== -1) {
      activeTasks[activeIdx].checklists = currentModalChecklists;
    }
    const unschedIdx = unscheduledTasks.findIndex(u => u.id === currentModalTask.id);
    if (unschedIdx !== -1) {
      unscheduledTasks[unschedIdx].checklists = currentModalChecklists;
    }
    renderTimeline();
    renderUnscheduledDrawer();
  }

  const isRealCard = currentModalTask && currentModalTask.id && !currentModalTask.id.startsWith("custom_") && !currentModalTask.id.startsWith("new_") && !currentModalTask.id.startsWith("holiday_");
  const isRealItem = itemId && !String(itemId).startsWith("temp_");

  if (isRealCard && isRealItem) {
    try {
      const putUrl = `https://api.trello.com/1/cards/${currentModalTask.id}/checkItem/${itemId}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&state=${newState}`;
      await fetch(putUrl, { method: "PUT" });
    } catch (err) {
      console.error("Failed to update checkItem state on Trello:", err);
    }
  }
}

async function handleDeleteCheckItem(checklistId, itemId) {
  currentModalChecklists.forEach(cl => {
    if (cl.checkItems) {
      cl.checkItems = cl.checkItems.filter(item => item.id !== itemId && String(item.id) !== String(itemId));
    }
  });

  renderModalChecklist();

  if (currentModalTask) {
    currentModalTask.checklists = currentModalChecklists;
    const activeIdx = activeTasks.findIndex(t => t.id === currentModalTask.id);
    if (activeIdx !== -1) {
      activeTasks[activeIdx].checklists = currentModalChecklists;
    }
    const unschedIdx = unscheduledTasks.findIndex(u => u.id === currentModalTask.id);
    if (unschedIdx !== -1) {
      unscheduledTasks[unschedIdx].checklists = currentModalChecklists;
    }
    renderTimeline();
    renderUnscheduledDrawer();
  }

  const isRealCard = currentModalTask && currentModalTask.id && !currentModalTask.id.startsWith("custom_") && !currentModalTask.id.startsWith("new_") && !currentModalTask.id.startsWith("holiday_");
  const isRealItem = itemId && !String(itemId).startsWith("temp_");

  if (isRealCard && isRealItem && checklistId && !String(checklistId).startsWith("temp_")) {
    try {
      const delUrl = `https://api.trello.com/1/checklists/${checklistId}/checkItems/${itemId}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}`;
      await fetch(delUrl, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete checkItem on Trello:", err);
    }
  }
}

async function handleAddCheckItem() {
  const input = document.getElementById("newCheckItemInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  const isRealCard = currentModalTask && currentModalTask.id && !currentModalTask.id.startsWith("custom_") && !currentModalTask.id.startsWith("new_") && !currentModalTask.id.startsWith("holiday_");

  if (currentModalChecklists.length === 0) {
    if (isRealCard) {
      try {
        const createClUrl = `https://api.trello.com/1/cards/${currentModalTask.id}/checklists?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&name=Checklist`;
        const resCl = await fetch(createClUrl, { method: "POST" });
        if (resCl.ok) {
          const newCl = await resCl.json();
          newCl.checkItems = [];
          currentModalChecklists.push(newCl);

          const addItemUrl = `https://api.trello.com/1/checklists/${newCl.id}/checkItems?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&name=${encodeURIComponent(text)}`;
          const resItem = await fetch(addItemUrl, { method: "POST" });
          if (resItem.ok) {
            const newItem = await resItem.json();
            newCl.checkItems.push(newItem);
          }
        }
      } catch (err) {
        console.error("Failed to create checklist and item on Trello:", err);
      }
    } else {
      const tempCl = {
        id: "temp_cl_" + Date.now(),
        name: "Checklist",
        checkItems: [
          { id: "temp_item_" + Date.now(), name: text, state: "incomplete" }
        ]
      };
      currentModalChecklists.push(tempCl);
    }
  } else {
    const targetCl = currentModalChecklists[0];
    if (isRealCard && targetCl.id && !String(targetCl.id).startsWith("temp_")) {
      try {
        const addItemUrl = `https://api.trello.com/1/checklists/${targetCl.id}/checkItems?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&name=${encodeURIComponent(text)}`;
        const resItem = await fetch(addItemUrl, { method: "POST" });
        if (resItem.ok) {
          const newItem = await resItem.json();
          if (!targetCl.checkItems) targetCl.checkItems = [];
          targetCl.checkItems.push(newItem);
        }
      } catch (err) {
        console.error("Failed to add checkItem to Trello:", err);
      }
    } else {
      if (!targetCl.checkItems) targetCl.checkItems = [];
      targetCl.checkItems.push({
        id: "temp_item_" + Date.now(),
        name: text,
        state: "incomplete"
      });
    }
  }

  renderModalChecklist();

  if (currentModalTask) {
    currentModalTask.checklists = currentModalChecklists;
    const activeIdx = activeTasks.findIndex(t => t.id === currentModalTask.id);
    if (activeIdx !== -1) {
      activeTasks[activeIdx].checklists = currentModalChecklists;
    }
    const unschedIdx = unscheduledTasks.findIndex(u => u.id === currentModalTask.id);
    if (unschedIdx !== -1) {
      unscheduledTasks[unschedIdx].checklists = currentModalChecklists;
    }
    renderTimeline();
    renderUnscheduledDrawer();
  }

  input.focus();
}

function openEditModal(task) {
  const modal = document.getElementById("taskModalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const titleInput = document.getElementById("taskName");
  const startInput = document.getElementById("taskStartDate");
  const dueInput = document.getElementById("taskDueDate");
  const rowLabel = document.getElementById("taskRowLabel");
  const assigneeSelect = document.getElementById("taskAssignee");
  const statusSelect = document.getElementById("taskStatus");
  const colorSelect = document.getElementById("taskColor");
  const idInput = document.getElementById("editCardId");
  const completeBtn = document.getElementById("completeTaskBtn");
  const unscheduleBtn = document.getElementById("unscheduleTaskBtn");
  const archiveBtn = document.getElementById("archiveTaskBtn");
  const saveBtn = document.getElementById("saveTaskBtn");

  const isNew = Boolean(task.isNewScheduled || (task.id && task.id.startsWith("custom_")) || (task.id && task.id.startsWith("new_")));

  currentModalTask = task;
  currentModalChecklists = (task.checklists && Array.isArray(task.checklists))
    ? JSON.parse(JSON.stringify(task.checklists))
    : [];

  const newCheckInput = document.getElementById("newCheckItemInput");
  if (newCheckInput) newCheckInput.value = "";

  const descInput = document.getElementById("taskDesc");
  const descLabel = document.getElementById("taskDescLabel");

  idInput.value = task.id;
  titleInput.value = task.name || "";
  titleInput.placeholder = isNew ? "Enter task name..." : "e.g. Website design";
  if (descInput) {
    descInput.value = task.desc || "";
  }
  startInput.value = task.startDate || "";
  dueInput.value = task.dueDate || "";
  colorSelect.value = task.color || "yellow";

  // Dynamic Modal Title & Save Button Text
  if (modalTitle) {
    modalTitle.textContent = isNew ? "New Task" : "Edit Task Details";
  }
  if (saveBtn) {
    saveBtn.textContent = isNew ? "Create & Sync to Trello" : "Save & Sync to Trello";
  }

  // Row / Target field label: explicitly set to "Label"
  if (rowLabel) {
    rowLabel.textContent = "Label";
  }

  // Setup Entry Type Selector (Task vs Holiday / Leave)
  const typeTaskRadio = document.getElementById("entryTypeTask");
  const typeHolidayRadio = document.getElementById("entryTypeHoliday");
  const tabTypeTask = document.getElementById("tabTypeTask");
  const tabTypeHoliday = document.getElementById("tabTypeHoliday");
  const taskNameLabel = document.getElementById("taskNameLabel");
  const taskClassificationRow = document.getElementById("taskClassificationRow");
  const deleteHolidayBtn = document.getElementById("deleteHolidayBtn");

  function setEntryModeUI(isHoliday) {
    const modalChecklistSection = document.getElementById("modalChecklistSection");
    const modalBodyLayout = document.querySelector(".modal-body-layout");
    if (isHoliday) {
      if (modalChecklistSection) modalChecklistSection.style.display = "none";
      if (modalBodyLayout) modalBodyLayout.classList.add("holiday-mode");
      if (typeHolidayRadio) typeHolidayRadio.checked = true;
      tabTypeHoliday?.classList.add("active");
      tabTypeTask?.classList.remove("active");
      if (taskNameLabel) taskNameLabel.textContent = "Holiday / Leave Title";
      titleInput.placeholder = "e.g. Deepavali, Malaysia Day, Annual Leave";
      if (descLabel) descLabel.textContent = "Holiday Description / Notes";
      if (descInput) descInput.placeholder = "e.g. Approved leave, replacement holiday, notes...";
      if (taskClassificationRow) taskClassificationRow.style.display = "none";
      if (modalTitle) modalTitle.textContent = isNew ? "Set Public Holiday / Leave" : "Edit Holiday / Leave";
      if (saveBtn) saveBtn.textContent = isNew ? "Save Holiday" : "Update Holiday";
      if (completeBtn) completeBtn.style.display = "none";
      if (unscheduleBtn) unscheduleBtn.style.display = "none";
      if (archiveBtn) archiveBtn.style.display = "none";
      if (deleteHolidayBtn) deleteHolidayBtn.style.display = isNew ? "none" : "inline-flex";
    } else {
      if (modalChecklistSection) modalChecklistSection.style.display = "flex";
      if (modalBodyLayout) modalBodyLayout.classList.remove("holiday-mode");
      if (typeTaskRadio) typeTaskRadio.checked = true;
      tabTypeTask?.classList.add("active");
      tabTypeHoliday?.classList.remove("active");
      if (taskNameLabel) taskNameLabel.textContent = "Task Name";
      titleInput.placeholder = isNew ? "Enter task name..." : "e.g. Website design";
      if (descLabel) descLabel.textContent = "Task Description";
      if (descInput) descInput.placeholder = "Add detailed notes, links, or description...";
      if (taskClassificationRow) taskClassificationRow.style.display = "grid";
      if (modalTitle) modalTitle.textContent = isNew ? "New Task" : "Edit Task Details";
      if (saveBtn) saveBtn.textContent = isNew ? "Create & Sync to Trello" : "Save & Sync to Trello";
      if (deleteHolidayBtn) deleteHolidayBtn.style.display = "none";
      if (completeBtn) completeBtn.style.display = isNew ? "none" : "inline-flex";
      if (unscheduleBtn) unscheduleBtn.style.display = isNew ? "none" : "inline-flex";
      if (archiveBtn) archiveBtn.style.display = isNew ? "none" : "inline-flex";
    }
  }

  setEntryModeUI(Boolean(task.isHoliday));
  if (typeTaskRadio) typeTaskRadio.onchange = () => setEntryModeUI(false);
  if (typeHolidayRadio) typeHolidayRadio.onchange = () => setEntryModeUI(true);

  renderModalChecklist();

  // Reflect completion status or hide actions completely for new tasks
  if (completeBtn) {
    completeBtn.style.display = (isNew || task.isHoliday) ? "none" : "inline-flex";
    if (task.isCompleted) {
      completeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Completed</span>`;
      completeBtn.style.opacity = "0.85";
    } else {
      completeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Task Completed</span>`;
      completeBtn.style.opacity = "1";
    }
  }

  if (unscheduleBtn) {
    unscheduleBtn.style.display = (isNew || task.isHoliday) ? "none" : "inline-flex";
  }
  if (archiveBtn) {
    archiveBtn.style.display = (isNew || task.isHoliday) ? "none" : "inline-flex";
  }

  // Populate Status Dropdown with workflow lists
  if (statusSelect) {
    statusSelect.innerHTML = "";

    const targetStatuses = [
      { name: "Incoming Tasks / To Start 🔜", match: l => l.includes("incoming") || l.includes("start"), defaultId: "665ffb5e7d82bdb1a114ef8a" },
      { name: "⌛ Work In Progress This Week", match: l => l.includes("progress") || l.includes("work in progress"), defaultId: "665ffbba6039e78fd89da9a2" },
      { name: "🧐Pending Approval / Review", match: l => l.includes("approval") || l.includes("review") || l.includes("pending"), defaultId: "66600def7d82bdb1a13bf88e" },
      { name: "✅ Live / Completed This Week", match: l => (l.includes("live") && l.includes("completed")) || l.includes("completed this week"), defaultId: "6371c60008a0a904a2bca457" }
    ];

    const currentCardListId = task.listId || (currentViewMode === "list" ? task.rowId : "");
    let matchedSelected = false;

    targetStatuses.forEach(statusDef => {
      const liveList = currentBoardLists.find(l => statusDef.match((l.name || "").toLowerCase()));
      const listId = liveList ? liveList.id : statusDef.defaultId;
      const listDisplayName = liveList ? liveList.name : statusDef.name;

      const opt = document.createElement("option");
      opt.value = listId;
      opt.textContent = listDisplayName;

      if (currentCardListId && (currentCardListId === listId || (task.listName && statusDef.match(task.listName.toLowerCase())))) {
        opt.selected = true;
        matchedSelected = true;
      }
      statusSelect.appendChild(opt);
    });

    // If card currently belongs to another list (e.g. Note, etc.), include it too
    if (currentCardListId && !matchedSelected) {
      const otherList = currentBoardLists.find(l => l.id === currentCardListId);
      if (otherList) {
        const opt = document.createElement("option");
        opt.value = otherList.id;
        opt.textContent = `📋 ${otherList.name}`;
        opt.selected = true;
        statusSelect.appendChild(opt);
        matchedSelected = true;
      }
    }

    if (!matchedSelected && statusSelect.options.length > 0) {
      statusSelect.selectedIndex = 0;
    }
  }

  // Populate Label dropdown (ALL board labels)
  if (assigneeSelect) {
    assigneeSelect.innerHTML = "";

    currentBoardLabels.forEach(lbl => {
      const opt = document.createElement("option");
      opt.value = lbl.id;
      const emoji = getLabelEmoji(lbl.color);
      opt.textContent = `${emoji} ${lbl.name}`;
      if (task.labelId === lbl.id || task.rowId === lbl.id || (task.labels && task.labels.some(l => l.id === lbl.id))) {
        opt.selected = true;
      }
      assigneeSelect.appendChild(opt);
    });

    // Also include "(No Label)" option at the end
    const noOpt = document.createElement("option");
    noOpt.value = "no_label";
    noOpt.textContent = "🏷️ (No Label)";
    if (task.labelId === "no_label" || (!task.labelId && (!task.labels || task.labels.length === 0))) {
      noOpt.selected = true;
    }
    assigneeSelect.appendChild(noOpt);
  }

  // Auto-sync color theme if new task and chosen label has a defined color
  if (isNew && assigneeSelect && assigneeSelect.value) {
    const chosenLbl = currentBoardLabels.find(l => l.id === assigneeSelect.value);
    if (chosenLbl && chosenLbl.color) {
      colorSelect.value = mapTrelloColorToPillColor(chosenLbl.color);
    }
  }

  modal.classList.add("open");
  if (isNew) {
    setTimeout(() => titleInput.focus(), 50);
  }
}

function closeEditModal() {
  document.getElementById("taskModalOverlay").classList.remove("open");
}

// ==========================================================================
// UI Event Handlers
// ==========================================================================
function bindUIEvents() {
  const boardSelect = document.getElementById("boardSelect");
  if (boardSelect) {
    boardSelect.addEventListener("change", (e) => {
      currentBoardId = e.target.value;
      fetchBoardData(currentBoardId);
    });
  }

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

  // Dynamic color matching when changing label in modal
  const assigneeSelect = document.getElementById("taskAssignee");
  if (assigneeSelect) {
    assigneeSelect.addEventListener("change", (e) => {
      if (currentViewMode === "label") {
        const selectedLabel = currentBoardLabels.find(l => l.id === e.target.value);
        if (selectedLabel && selectedLabel.color) {
          const colorSelect = document.getElementById("taskColor");
          if (colorSelect) colorSelect.value = mapTrelloColorToPillColor(selectedLabel.color);
        }
      }
    });
  }

  document.getElementById("taskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("editCardId").value;
    const name = document.getElementById("taskName").value.trim() || "New Task";
    const desc = document.getElementById("taskDesc") ? document.getElementById("taskDesc").value.trim() : "";
    let start = document.getElementById("taskStartDate").value;
    let due = document.getElementById("taskDueDate").value;
    const selectedLabelId = document.getElementById("taskAssignee") ? document.getElementById("taskAssignee").value : "no_label";
    const statusSelect = document.getElementById("taskStatus");
    const selectedStatusId = statusSelect ? statusSelect.value : "";
    const selectedListObj = currentBoardLists.find(l => l.id === selectedStatusId);
    const selectedListName = selectedListObj ? selectedListObj.name : "";
    const color = document.getElementById("taskColor").value;
    const isHolidayMode = document.getElementById("entryTypeHoliday")?.checked;
    const isNew = id.startsWith("custom_") || id.startsWith("new_") || id.startsWith("holiday_");

    if (isHolidayMode) {
      const holidayTitle = name.replace(/^(\[Holiday\]\s*|🌴\s*)/, '').trim() || "Public Holiday";
      const trelloCardTitle = `🌴 ${holidayTitle}`;
      const syncStatus = document.getElementById("syncStatus");
      if (syncStatus) {
        syncStatus.innerHTML = `<span class="status-dot" style="background:#F59E0B"></span><span class="status-text">${isNew ? "Creating Holiday..." : "Saving Holiday..."}</span>`;
      }

      // If both dates are empty, alert
      if (!start && !due) {
        alert("Please select at least a Start Date for the holiday / leave.");
        return;
      }
      if (!start && due) start = due;
      if (start && !due) due = start;

      // Find note/holiday list on Trello or fallback to first list
      const noteList = currentBoardLists.find(l => {
        const ln = (l.name || "").toLowerCase();
        return ln.includes("note") || ln.includes("memo") || ln.includes("holiday");
      }) || currentBoardLists.find(l => l.id === "628595a5a6a64558821ec0de") || currentBoardLists[0];
      const listId = noteList ? noteList.id : (currentBoardLists[0] ? currentBoardLists[0].id : "");

      let realHolidayId = id;
      if (isNew) {
        realHolidayId = `holiday_${Date.now()}`;
        try {
          const postUrl = `https://api.trello.com/1/cards?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&idList=${listId}&name=${encodeURIComponent(trelloCardTitle)}&desc=${encodeURIComponent(desc)}&start=${start}&due=${due}`;
          const createRes = await fetch(postUrl, { method: "POST" });
          if (createRes.ok) {
            const createdCard = await createRes.json();
            realHolidayId = createdCard.id;
          }
        } catch (err) {
          console.error("Failed to create holiday card on Trello:", err);
        }
      } else {
        try {
          const putUrl = `https://api.trello.com/1/cards/${id}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&name=${encodeURIComponent(trelloCardTitle)}&desc=${encodeURIComponent(desc)}&start=${start}&due=${due}`;
          await fetch(putUrl, { method: "PUT" });
        } catch (err) {
          console.error("Failed to update holiday card on Trello:", err);
        }
      }

      const holidayItem = {
        id: realHolidayId,
        title: holidayTitle,
        desc: desc,
        startDate: start,
        dueDate: due
      };

      const existingIndex = boardHolidays.findIndex(h => h.id === id || h.id === realHolidayId);
      if (existingIndex !== -1) {
        boardHolidays[existingIndex] = holidayItem;
      } else {
        boardHolidays.push(holidayItem);
      }

      try {
        localStorage.setItem(`trello_holidays_${currentBoardId}`, JSON.stringify(boardHolidays));
      } catch (err) {
        console.warn("Failed to store holidays in localStorage:", err);
      }

      // Remove from active tasks & unscheduled if it was previously a normal task
      activeTasks = activeTasks.filter(t => t.id !== id && t.id !== realHolidayId);
      unscheduledTasks = unscheduledTasks.filter(u => u.id !== id && u.id !== realHolidayId);

      computeTaskTracks();
      renderTimeline();
      renderUnscheduledDrawer();
      closeEditModal();

      if (syncStatus) {
        syncStatus.innerHTML = `<span class="status-dot"></span><span class="status-text">Connected</span>`;
      }

      showNavToast(`🌴 Holiday set: "${holidayTitle}" (${formatDateDDMMYYYY(start)}${start !== due ? ' to ' + formatDateDDMMYYYY(due) : ''})`);
      return;
    }

    // Normal Task mode: if this card was previously in boardHolidays, clean it up
    if (boardHolidays.some(h => h.id === id)) {
      boardHolidays = boardHolidays.filter(h => h.id !== id);
      try {
        localStorage.setItem(`trello_holidays_${currentBoardId}`, JSON.stringify(boardHolidays));
      } catch (e) {}
    }

    // If both dates are empty/cleared on an existing task -> unschedule the task!
    if (!start && !due) {
      if (!isNew) {
        await handleUnscheduleTask();
      }
      return;
    }

    // If only one date is set, construct a valid 2-day span
    if (!start && due) {
      const d = new Date(due);
      d.setDate(d.getDate() - 1);
      start = formatLocalDate(d);
    } else if (start && !due) {
      due = start;
    }

    const syncStatus = document.getElementById("syncStatus");
    if (syncStatus) {
      syncStatus.innerHTML = `<span class="status-dot" style="background:#F59E0B"></span><span class="status-text">${isNew ? "Creating..." : "Saving..."}</span>`;
    }

    if (isNew) {
      const targetListId = selectedStatusId || (currentBoardLists[0] ? currentBoardLists[0].id : "");
      let realCardId = id;
      let cardLabels = [];

      try {
        let postUrl = `https://api.trello.com/1/cards?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&idList=${targetListId}&name=${encodeURIComponent(name)}&desc=${encodeURIComponent(desc)}&start=${start}&due=${due}`;
        if (selectedLabelId && selectedLabelId !== "no_label") {
          postUrl += `&idLabels=${selectedLabelId}`;
        }
        const createRes = await fetch(postUrl, { method: "POST" });
        if (createRes.ok) {
          const createdCard = await createRes.json();
          realCardId = createdCard.id;
          cardLabels = createdCard.labels || [];
        }
      } catch (err) {
        console.error("Failed to create card on Trello:", err);
      }

      // If staged checklist items exist, create checklist and items on Trello
      let finalChecklists = [];
      if (currentModalChecklists.length > 0 && currentModalChecklists.some(cl => (cl.checkItems || []).length > 0)) {
        try {
          const createClUrl = `https://api.trello.com/1/cards/${realCardId}/checklists?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&name=Checklist`;
          const resCl = await fetch(createClUrl, { method: "POST" });
          if (resCl.ok) {
            const newCl = await resCl.json();
            newCl.checkItems = [];
            for (const cl of currentModalChecklists) {
              for (const item of (cl.checkItems || [])) {
                const addItemUrl = `https://api.trello.com/1/checklists/${newCl.id}/checkItems?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&name=${encodeURIComponent(item.name)}&checked=${item.state === 'complete'}`;
                const resItem = await fetch(addItemUrl, { method: "POST" });
                if (resItem.ok) {
                  const createdItem = await resItem.json();
                  newCl.checkItems.push(createdItem);
                }
              }
            }
            finalChecklists = [newCl];
          }
        } catch (err) {
          console.error("Failed to sync new card checklists to Trello:", err);
        }
      }

      const assignedRowId = currentViewMode === "label" ? selectedLabelId : targetListId;

      activeTasks.push({
        id: realCardId,
        name: name,
        desc: desc,
        startDate: start,
        dueDate: due,
        rowId: assignedRowId,
        color: color,
        track: 0,
        listId: targetListId,
        listName: selectedListName,
        labelId: selectedLabelId,
        labels: cardLabels,
        checklists: finalChecklists,
        isCompleted: false
      });
      unscheduledTasks = unscheduledTasks.filter(u => u.id !== id);
    } else {
      const targetRowId = currentViewMode === "label" ? selectedLabelId : (selectedStatusId || "");
      const existingIndex = activeTasks.findIndex(t => t.id === id);
      if (existingIndex !== -1) {
        activeTasks[existingIndex].name = name;
        activeTasks[existingIndex].desc = desc;
        activeTasks[existingIndex].startDate = start;
        activeTasks[existingIndex].dueDate = due;
        activeTasks[existingIndex].color = color;
        activeTasks[existingIndex].labelId = selectedLabelId;
        activeTasks[existingIndex].checklists = currentModalChecklists;
        if (selectedStatusId) {
          activeTasks[existingIndex].listId = selectedStatusId;
          activeTasks[existingIndex].listName = selectedListName;
        }
        if (targetRowId) {
          activeTasks[existingIndex].rowId = targetRowId;
        }
      } else {
        activeTasks.push({
          id: id,
          name: name,
          desc: desc,
          startDate: start,
          dueDate: due,
          rowId: targetRowId || selectedLabelId,
          color: color,
          track: 0,
          listId: selectedStatusId,
          listName: selectedListName,
          labelId: selectedLabelId,
          checklists: currentModalChecklists,
          isCompleted: false
        });
        unscheduledTasks = unscheduledTasks.filter(u => u.id !== id);
      }

      // Sync directly to Trello API
      try {
        let putUrl = `https://api.trello.com/1/cards/${id}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&name=${encodeURIComponent(name)}&desc=${encodeURIComponent(desc)}&start=${start}&due=${due}`;
        if (selectedStatusId) {
          putUrl += `&idList=${selectedStatusId}`;
        }
        if (selectedLabelId !== undefined) {
          putUrl += `&idLabels=${selectedLabelId !== "no_label" ? selectedLabelId : ""}`;
        }
        await fetch(putUrl, { method: "PUT" });
      } catch (err) {
        console.error("Failed to sync card update to Trello:", err);
      }
    }

    // Ensure row exists in activeRows if in label mode
    if (currentViewMode === "label") {
      if (!activeRows.some(r => r.id === selectedLabelId)) {
        const matchedLabel = currentBoardLabels.find(l => l.id === selectedLabelId);
        if (matchedLabel) {
          activeRows.push({
            id: matchedLabel.id,
            name: matchedLabel.name,
            color: matchedLabel.color || "blue_light",
            isLabel: true,
            taskCount: 1
          });
        } else if (selectedLabelId === "no_label") {
          activeRows.push({
            id: "no_label",
            name: "General / No Label",
            color: "blue_light",
            isLabel: true,
            taskCount: 1
          });
        }
      }

      // Recalculate taskCount per row & filter rows with > 0 tasks
      activeRows.forEach(r => {
        r.taskCount = activeTasks.filter(t => t.rowId === r.id || t.labelId === r.id).length;
      });
      activeRows = activeRows.filter(r => r.taskCount > 0);
      if (activeRows.length === 0) {
        activeRows = [
          { id: "empty_info", name: "No Scheduled Tasks", isLabel: true, color: "blue_light" }
        ];
      } else {
        activeRows.sort((a, b) => {
          if (a.id === "no_label") return 1;
          if (b.id === "no_label") return -1;
          return a.name.localeCompare(b.name);
        });
      }
    } else if (currentViewMode === "list") {
      if (selectedStatusId && !activeRows.some(r => r.id === selectedStatusId)) {
        activeRows.push({
          id: selectedStatusId,
          name: selectedListName || "List",
          isList: true,
          taskCount: 1
        });
      }
      activeRows.forEach(r => {
        r.taskCount = activeTasks.filter(t => t.rowId === r.id || t.listId === r.id).length;
      });
      activeRows = activeRows.filter(r => r.taskCount > 0);
    }

    computeTaskTracks();
    renderTimeline();
    renderUnscheduledDrawer();
    closeEditModal();

    if (syncStatus) {
      syncStatus.innerHTML = `<span class="status-dot"></span><span class="status-text">Connected</span>`;
    }

    showNavToast(isNew ? `✨ Created task: "${name}"` : `💾 Saved "${name}"${selectedListName ? ' • Moved to: ' + selectedListName : ''}`);
  });

  // Action Buttons
  document.getElementById("completeTaskBtn")?.addEventListener("click", handleCompleteTask);
  document.getElementById("unscheduleTaskBtn")?.addEventListener("click", handleUnscheduleTask);
  document.getElementById("archiveTaskBtn")?.addEventListener("click", handleArchiveTask);
  document.getElementById("deleteHolidayBtn")?.addEventListener("click", handleDeleteHoliday);
  document.getElementById("refreshBtn")?.addEventListener("click", handleRefreshTimeline);
  document.getElementById("clearStartDateBtn")?.addEventListener("click", () => {
    document.getElementById("taskStartDate").value = "";
  });
  document.getElementById("clearDueDateBtn")?.addEventListener("click", () => {
    document.getElementById("taskDueDate").value = "";
  });

  const addTaskBtn = document.getElementById("addTaskBtn");
  if (addTaskBtn) {
    addTaskBtn.addEventListener("click", () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 2);

      let defaultRowId = "";
      if (currentViewMode === "label") {
        defaultRowId = (activeRows[0] && activeRows[0].id !== "empty_info")
          ? activeRows[0].id
          : (currentBoardLabels[0]?.id || "no_label");
      } else {
        defaultRowId = activeRows[0] ? activeRows[0].id : "";
      }

      openEditModal({
        id: `custom_${Date.now()}`,
        name: "",
        desc: "",
        startDate: formatLocalDate(today),
        dueDate: formatLocalDate(tomorrow),
        rowId: defaultRowId,
        color: "yellow",
        checklists: [],
        isNewScheduled: true
      });
    });
  }

  // Checklist Action Events
  const addCheckBtn = document.getElementById("addCheckItemBtn");
  const newCheckInput = document.getElementById("newCheckItemInput");
  if (addCheckBtn) {
    addCheckBtn.addEventListener("click", handleAddCheckItem);
  }
  if (newCheckInput) {
    newCheckInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddCheckItem();
      }
    });
  }

  // Delegated events on checklist container (checkbox toggle & delete)
  const checklistListEl = document.getElementById("checklistItemsList");
  if (checklistListEl) {
    checklistListEl.addEventListener("change", (e) => {
      if (e.target.classList.contains("checklist-item-checkbox")) {
        const row = e.target.closest(".checklist-item");
        if (row) {
          handleToggleCheckItem(row.dataset.checklistId, row.dataset.itemId, e.target.checked);
        }
      }
    });

    checklistListEl.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest(".checklist-item-delete");
      if (deleteBtn) {
        const row = deleteBtn.closest(".checklist-item");
        if (row) {
          handleDeleteCheckItem(row.dataset.checklistId, row.dataset.itemId);
        }
      }
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

  // Double-click on any top header date box to create new task on that date
  const headerRow = document.getElementById("timelineHeaderRow");
  if (headerRow) {
    headerRow.addEventListener("dblclick", (e) => {
      const dayCol = e.target.closest(".timeline-day-header");
      if (dayCol && dayCol.dataset.date) {
        handleQuickNewTaskOnDate(dayCol.dataset.date);
      }
    });
  }

  // Double-click on any grid date box in the timeline to create new task on that date
  const gridBody = document.getElementById("timelineGridBody");
  if (gridBody) {
    gridBody.addEventListener("dblclick", (e) => {
      // Ignore if user double-clicked on a task pill itself
      if (e.target.closest(".task-pill")) return;

      const cell = e.target.closest(".grid-col-cell");
      if (cell && cell.dataset.date) {
        const targetRowId = cell.dataset.rowId || "";
        handleQuickNewTaskOnDate(cell.dataset.date, targetRowId);
      }
    });
  }

  document.getElementById("timelineScrollContainer").addEventListener("scroll", drawDependencyCurves);
  window.addEventListener("resize", drawDependencyCurves);
}

// ==========================================================================
// Quick New Task On Date Creator
// Triggered by double-clicking on any date box (header or grid cell)
// ==========================================================================
function handleQuickNewTaskOnDate(targetDateStr, targetRowId) {
  // If date already has a holiday, open directly to edit or manage that holiday!
  const existingHoliday = getHolidayForDate(targetDateStr);
  if (existingHoliday) {
    openEditModal({
      id: existingHoliday.id,
      name: existingHoliday.title,
      desc: existingHoliday.desc || "",
      startDate: existingHoliday.startDate,
      dueDate: existingHoliday.dueDate || existingHoliday.startDate,
      rowId: "",
      color: "yellow",
      isHoliday: true,
      checklists: [],
      isNewScheduled: false
    });
    return;
  }

  const startDate = new Date(targetDateStr + "T00:00:00");
  const dueDate = new Date(startDate);
  dueDate.setDate(dueDate.getDate() + 2); // 2-day span by default

  let rowId = targetRowId;
  if (!rowId || rowId === "empty_info") {
    if (currentViewMode === "label") {
      rowId = (activeRows[0] && activeRows[0].id !== "empty_info")
        ? activeRows[0].id
        : (currentBoardLabels[0]?.id || "no_label");
    } else {
      rowId = activeRows[0] ? activeRows[0].id : "";
    }
  }

  // Auto-match task color if the label has a default color
  let taskColor = "yellow";
  if (currentViewMode === "label" && rowId) {
    const chosenLbl = currentBoardLabels.find(l => l.id === rowId);
    if (chosenLbl && chosenLbl.color) {
      taskColor = mapTrelloColorToPillColor(chosenLbl.color);
    }
  }

  openEditModal({
    id: `custom_${Date.now()}`,
    name: "",
    desc: "",
    startDate: formatLocalDate(startDate),
    dueDate: formatLocalDate(dueDate),
    rowId: rowId,
    color: taskColor,
    checklists: [],
    isNewScheduled: true
  });
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
  const formattedDate = formatDateDDMMYYYY(targetDate);
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

// ==========================================================================
// Task Completion & Unscheduling Engine
// ==========================================================================
function resolveCompletedList(lists, compYear = new Date().getFullYear()) {
  if (!lists || lists.length === 0) return null;
  const yearStr = String(compYear);

  // 1. If completed year is 2026 or 2027 (user explicit requirement):
  if (compYear >= 2026 && compYear <= 2027) {
    const match26 = lists.find(l => l.name.includes("2026-2027"));
    if (match26) return match26;
  }

  // 2. Direct match with year in list name: e.g. "Task Completed (2026-2027)" or "Task Completed (2025-2026)"
  let match = lists.find(l => {
    const n = l.name.toLowerCase();
    return n.includes("completed") && n.includes(yearStr);
  });
  if (match) return match;

  // 3. Fallback bracket matching:
  if (compYear >= 2026) {
    match = lists.find(l => l.name.includes("2026-2027"));
    if (match) return match;
  } else if (compYear === 2025) {
    match = lists.find(l => l.name.includes("2025-2026"));
    if (match) return match;
  } else if (compYear <= 2024) {
    match = lists.find(l => l.name.includes("2024-2025") || l.name.includes("2022-2024"));
    if (match) return match;
  }

  // 4. Any list containing "Completed"
  match = lists.find(l => l.name.toLowerCase().includes("completed"));
  return match || lists[lists.length - 1];
}

async function handleCompleteTask() {
  const id = document.getElementById("editCardId").value;
  if (!id) return;

  const dueDateVal = document.getElementById("taskDueDate").value;
  const startDateVal = document.getElementById("taskStartDate").value;
  const compDate = dueDateVal ? new Date(dueDateVal + "T00:00:00") : (startDateVal ? new Date(startDateVal + "T00:00:00") : new Date());
  const compYear = compDate.getFullYear();

  const targetList = resolveCompletedList(currentBoardLists, compYear);
  const targetListId = targetList ? targetList.id : "";
  const targetListName = targetList ? targetList.name : "Task Completed (2026-2027)";

  // Remove from activeTasks so it immediately disappears from the timeline
  const taskIndex = activeTasks.findIndex(t => t.id === id);
  let task = null;
  if (taskIndex !== -1) {
    task = activeTasks.splice(taskIndex, 1)[0];
  } else {
    const uIndex = unscheduledTasks.findIndex(u => u.id === id);
    if (uIndex !== -1) {
      task = unscheduledTasks.splice(uIndex, 1)[0];
    }
  }

  // Sync to Trello API: set dueComplete=true and move to target completed list
  if (!id.startsWith("custom_")) {
    try {
      const putUrl = `https://api.trello.com/1/cards/${id}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&dueComplete=true${targetListId ? `&idList=${targetListId}` : ""}`;
      await fetch(putUrl, { method: "PUT" });
    } catch (err) {
      console.error("Failed to mark task completed on Trello:", err);
    }
  }

  computeTaskTracks();
  renderTimeline();
  renderUnscheduledDrawer();
  closeEditModal();
  showNavToast(`✅ Marked "${task ? task.name : 'Task'}" completed & moved to "${targetListName}" (removed from timeline)`);
}

async function handleUnscheduleTask() {
  const id = document.getElementById("editCardId").value;
  if (!id) return;

  const existingIndex = activeTasks.findIndex(t => t.id === id);
  let taskObj = null;

  if (existingIndex !== -1) {
    taskObj = activeTasks.splice(existingIndex, 1)[0];
    
    // Add to unscheduledTasks list if not already there
    if (!unscheduledTasks.some(u => u.id === id)) {
      unscheduledTasks.push({
        id: taskObj.id,
        name: taskObj.name,
        list: taskObj.listName || "To Do",
        listId: taskObj.listId,
        labels: taskObj.labels || []
      });
    }
  }

  // Clear dates on Trello API (start=null & due=null)
  if (!id.startsWith("custom_")) {
    try {
      const putUrl = `https://api.trello.com/1/cards/${id}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&due=null&start=null`;
      await fetch(putUrl, { method: "PUT" });
    } catch (err) {
      console.error("Failed to unschedule card on Trello:", err);
    }
  }

  computeTaskTracks();
  renderTimeline();
  renderUnscheduledDrawer();
  closeEditModal();
  showNavToast(`🗓️ "${taskObj ? taskObj.name : 'Task'}" unscheduled & moved to Unscheduled drawer`);
}

// ==========================================================================
// Archive Task (Trello API closed=true)
// ==========================================================================
async function handleArchiveTask() {
  const id = document.getElementById("editCardId").value;
  if (!id) return;

  const existingIndex = activeTasks.findIndex(t => t.id === id);
  let taskObj = null;
  if (existingIndex !== -1) {
    taskObj = activeTasks.splice(existingIndex, 1)[0];
  } else {
    const uIndex = unscheduledTasks.findIndex(u => u.id === id);
    if (uIndex !== -1) {
      taskObj = unscheduledTasks.splice(uIndex, 1)[0];
    }
  }

  // Trello API: Archive card (PUT /1/cards/{id}?closed=true)
  if (!id.startsWith("custom_")) {
    try {
      const putUrl = `https://api.trello.com/1/cards/${id}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&closed=true`;
      await fetch(putUrl, { method: "PUT" });
    } catch (err) {
      console.error("Failed to archive card on Trello:", err);
    }
  }

  computeTaskTracks();
  renderTimeline();
  renderUnscheduledDrawer();
  closeEditModal();
  showNavToast(`📦 "${taskObj ? taskObj.name : 'Task'}" archived on Trello and removed from timeline`);
}

// ==========================================================================
// Delete / Remove Public Holiday
// ==========================================================================
async function handleDeleteHoliday() {
  const id = document.getElementById("editCardId").value;
  if (!id) return;

  const holiday = boardHolidays.find(h => h.id === id);
  const title = holiday ? holiday.title : "Holiday";

  boardHolidays = boardHolidays.filter(h => h.id !== id);
  try {
    localStorage.setItem(`trello_holidays_${currentBoardId}`, JSON.stringify(boardHolidays));
  } catch (e) {}

  if (!id.startsWith("holiday_") && !id.startsWith("custom_")) {
    try {
      await fetch(`https://api.trello.com/1/cards/${id}?key=${TRELLO_CONFIG.key}&token=${TRELLO_CONFIG.token}&closed=true`, { method: "PUT" });
    } catch (err) {
      console.error("Failed to close holiday card on Trello:", err);
    }
  }

  renderTimeline();
  closeEditModal();
  showNavToast(`🗑️ Removed holiday: "${title}"`);
}

// ==========================================================================
// Refresh Timeline Page (Cache-Busting Reload)
// ==========================================================================
function handleRefreshTimeline() {
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.classList.add("spinning");
    const span = refreshBtn.querySelector("span");
    if (span) span.textContent = "Refreshing...";
  }
  showNavToast("🔄 Reloading timeline with latest updates...");

  setTimeout(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_v", Date.now().toString());
      window.location.replace(url.toString());
    } catch (e) {
      window.location.reload();
    }
  }, 350);
}
