/*
  app.js version: 2025.12.17v001
  - 기존 방 기능 유지
  - 건물/층 기능 + 건물별 고시원 이름 추가
  - DB 구조: buildings = { id, buildingName, goshiwonName }
*/

console.log("✅ app.js loaded — version 2025.12.17v001");

// ==========================
// IndexedDB 설정
// ==========================
const DB_NAME = "GoshiwonDB";
const DB_VERSION = 8;

let db;

// DB 열기
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 방 정보
      if (!db.objectStoreNames.contains("rooms")) {
        const store = db.createObjectStore("rooms", { keyPath: "id" });
        store.createIndex("by_building_floor", ["buildingId", "floor"], { unique: false });
      } else {
        const store = req.transaction.objectStore("rooms");
        if (!store.indexNames.contains("by_building_floor")) {
          store.createIndex("by_building_floor", ["buildingId", "floor"], { unique: false });
        }
      }

      // 설정
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      // 건물
      if (!db.objectStoreNames.contains("buildings")) {
        db.createObjectStore("buildings", { keyPath: "id" });
      }

      // 층
      if (!db.objectStoreNames.contains("floors")) {
        const floorStore = db.createObjectStore("floors", { keyPath: "id" });
        floorStore.createIndex("by_building", "buildingId", { unique: false });
      }
    };

    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

// 트랜잭션 유틸
function tx(storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

// ==========================
// DOM 요소 연결
// ==========================

// 헤더 및 설정
const goshiwonNameEl = document.getElementById("goshiwonName");
const settingsBtn = document.getElementById("settingsBtn");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const settingsClose = document.getElementById("settingsClose");
const goshiwonNameInput = document.getElementById("goshiwonNameInput");
const saveGoshiwonNameBtn = document.getElementById("saveGoshiwonNameBtn");

// 건물/층 관리
const buildingNameInput = document.getElementById("buildingNameInput");
const goshiwonNameForBuildingInput = document.getElementById("goshiwonNameForBuildingInput");
const addBuildingBtn = document.getElementById("addBuildingBtn");
const buildingList = document.getElementById("buildingList");

const buildingSelectForFloor = document.getElementById("buildingSelectForFloor");
const floorNumberInput = document.getElementById("floorNumberInput");
const addFloorBtn = document.getElementById("addFloorBtn");
const floorList = document.getElementById("floorList");

// 메인 필터/요약
const buildingFilter = document.getElementById("buildingFilter");
const floorFilter = document.getElementById("floorFilter");
const roomGrid = document.getElementById("roomGrid");
const unpaidSummary = document.getElementById("unpaidSummary");
const totalRentBox = document.getElementById("totalRentBox");

// 방 모달
const roomModalBackdrop = document.getElementById("roomModalBackdrop");
const roomModalClose = document.getElementById("roomModalClose");
const roomModalCancel = document.getElementById("roomModalCancel");
const roomModalSave = document.getElementById("roomModalSave");

const roomNumberInput = document.getElementById("roomNumberInput");
const nameInput = document.getElementById("nameInput");
const phone1Input = document.getElementById("phone1Input");
const phone2Input = document.getElementById("phone2Input");
const rentInput = document.getElementById("rentInput");
const feeInput = document.getElementById("feeInput");
const startDateInput = document.getElementById("startDateInput");
const memoInput = document.getElementById("memoInput");

const roomBuildingSelect = document.getElementById("roomBuildingSelect");
const roomFloorSelect = document.getElementById("roomFloorSelect");

// 미납/전체 현황 모달
const unpaidModalBackdrop = document.getElementById("unpaidModalBackdrop");
const unpaidModalClose = document.getElementById("unpaidModalClose");

const totalModalBackdrop = document.getElementById("totalModalBackdrop");
const totalModalClose = document.getElementById("totalModalClose");

// 백업/복원
const backupBtn = document.getElementById("backupBtn");
const restoreBtn = document.getElementById("restoreBtn");
const restoreFileInput = document.getElementById("restoreFileInput");

// 설정에서 방 추가 버튼
const addRoomFromSettingsBtn = document.getElementById("addRoomFromSettingsBtn");

// ==========================
// 유틸 함수
// ==========================

// 만원 → 원 단위 변환
function toWon(value) {
  const n = Number(value || 0);
  return (n * 10000).toLocaleString("ko-KR") + "원";
}

// 미납 개월 계산
function getUnpaidMonths(room) {
  if (!room.name) return 0;

  const lastPaid = room.lastPaidDate ? new Date(room.lastPaidDate) : null;
  const baseDate = lastPaid ? lastPaid : (room.startDate ? new Date(room.startDate) : null);
  if (!baseDate) return 0;

  const now = new Date();
  const diffDays = Math.floor((now - baseDate) / (1000 * 60 * 60 * 24));

  return Math.floor(diffDays / 30);
}

// 미납 여부
function isUnpaid(room) {
  return getUnpaidMonths(room) > 0;
}

// ==========================
// SETTINGS 저장/로드
// ==========================
function getSetting(key) {
  return new Promise((resolve, reject) => {
    const store = tx("settings", "readonly");
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    const store = tx("settings", "readwrite");
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ==========================
// 건물 CRUD (건물 + 고시원 이름)
// ==========================
function getAllBuildings() {
  return new Promise((resolve, reject) => {
    const store = tx("buildings", "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// buildingName, goshiwonName 둘 다 받도록 수정
async function addBuilding(buildingName, goshiwonName) {
  const buildings = await getAllBuildings();
  const ids = buildings.map(b => b.id);

  let idx = 1;
  let id;
  while (true) {
    id = "B" + idx;
    if (!ids.includes(id)) break;
    idx++;
  }

  return new Promise((resolve, reject) => {
    const store = tx("buildings", "readwrite");
    const req = store.put({
      id,
      buildingName,
      goshiwonName
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteBuilding(id) {
  return new Promise((resolve, reject) => {
    const store = tx("buildings", "readwrite");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
// ==========================
// 층 CRUD
// ==========================
function getAllFloors() {
  return new Promise((resolve, reject) => {
    const store = tx("floors", "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function addFloor(buildingId, floorNumber) {
  const floors = await getAllFloors();
  const ids = floors.map(f => f.id);

  let idx = 1;
  let id;
  while (true) {
    id = "F" + idx;
    if (!ids.includes(id)) break;
    idx++;
  }

  return new Promise((resolve, reject) => {
    const store = tx("floors", "readwrite");
    const req = store.put({
      id,
      buildingId,
      floorNumber: Number(floorNumber)
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteFloor(id) {
  return new Promise((resolve, reject) => {
    const store = tx("floors", "readwrite");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ==========================
// 방 CRUD
// ==========================
function getAllRooms() {
  return new Promise((resolve, reject) => {
    const store = tx("rooms", "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function saveRoom(room) {
  return new Promise((resolve, reject) => {
    const store = tx("rooms", "readwrite");
    const req = store.put(room);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteRoom(roomId) {
  return new Promise((resolve, reject) => {
    const store = tx("rooms", "readwrite");
    const req = store.delete(roomId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ==========================
// UI 렌더링
// ==========================

// 고시원 이름 로드 (상단 제목)
async function loadGoshiwonName() {
  const name = await getSetting("goshiwonName");
  if (name) {
    goshiwonNameEl.textContent = name;
    goshiwonNameInput.value = name;
  }
}

// 건물/층 UI 렌더링
async function renderBuildingUI() {
  const buildings = await getAllBuildings();
  const floors = await getAllFloors();

  // 건물 표시용 라벨: "서울빌딩 (A고시원)"
  const getBuildingLabel = (b) => {
    if (!b) return "-";
    if (b.goshiwonName && b.goshiwonName.trim()) {
      return `${b.buildingName} (${b.goshiwonName})`;
    }
    // 예전 데이터(name만 있는 경우)도 고려
    if (b.buildingName) return b.buildingName;
    if (b.name) return b.name;
    return "-";
  };

  // 설정 패널 - 건물 리스트
  buildingList.innerHTML = "";
  buildings.forEach(b => {
    const div = document.createElement("div");
    div.className = "tag";
    div.innerHTML = `${getBuildingLabel(b)} <span data-id="${b.id}">×</span>`;
    buildingList.appendChild(div);
  });

  // 설정 패널 - 층 추가용 건물 선택
  buildingSelectForFloor.innerHTML = `<option value="">건물 선택</option>`;
  buildings.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = getBuildingLabel(b);
    buildingSelectForFloor.appendChild(opt);
  });

  // 설정 패널 - 층 리스트
  floorList.innerHTML = "";
  floors
    .sort((a, b) => a.floorNumber - b.floorNumber)
    .forEach(f => {
      const building = buildings.find(b => b.id === f.buildingId);
      const div = document.createElement("div");
      div.className = "tag";
      div.innerHTML = `${getBuildingLabel(building)} ${f.floorNumber}층 <span data-id="${f.id}">×</span>`;
      floorList.appendChild(div);
    });

  // 메인 화면 - 건물 필터
  const currentBuildingFilter = buildingFilter.value || "";
  buildingFilter.innerHTML = `<option value="">건물 선택</option>`;
  buildings.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = getBuildingLabel(b);
    buildingFilter.appendChild(opt);
  });
  if (currentBuildingFilter) {
    buildingFilter.value = currentBuildingFilter;
  }

  // 메인 화면 - 층 필터
  renderFloorFilter(floors, buildingFilter.value || "");

  // 방 모달 - 건물 선택
  const currentRoomBuilding = roomBuildingSelect.value || "";
  roomBuildingSelect.innerHTML = `<option value="">건물 선택</option>`;
  buildings.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = getBuildingLabel(b);
    roomBuildingSelect.appendChild(opt);
  });
  if (currentRoomBuilding) {
    roomBuildingSelect.value = currentRoomBuilding;
  }

  // 방 모달 - 층 선택
  renderRoomFloorOptions(floors, roomBuildingSelect.value);
}

// 층 필터 렌더링
function renderFloorFilter(allFloors, buildingId) {
  floorFilter.innerHTML = `<option value="">층 선택</option>`;

  allFloors
    .filter(f => !buildingId || f.buildingId === buildingId)
    .sort((a, b) => a.floorNumber - b.floorNumber)
    .forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.floorNumber;
      opt.textContent = `${f.floorNumber}층`;
      floorFilter.appendChild(opt);
    });
}

// 방 모달 층 선택 렌더링
function renderRoomFloorOptions(allFloors, buildingId) {
  roomFloorSelect.innerHTML = `<option value="">층 선택</option>`;

  if (!buildingId) return;

  allFloors
    .filter(f => f.buildingId === buildingId)
    .sort((a, b) => a.floorNumber - b.floorNumber)
    .forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.floorNumber;
      opt.textContent = `${f.floorNumber}층`;
      roomFloorSelect.appendChild(opt);
    });
}
// ==========================
// 방 목록 렌더링 (3열 UI)
// ==========================
async function renderRoomsFromDB() {
  const rooms = await getAllRooms();
  const buildings = await getAllBuildings();
  const floors = await getAllFloors();

  const buildingFilterVal = buildingFilter.value || "";
  const floorFilterVal = floorFilter.value || "";

  const filtered = rooms.filter(r => {
    let ok = true;
    if (buildingFilterVal && r.buildingId !== buildingFilterVal) ok = false;
    if (floorFilterVal && String(r.floor) !== floorFilterVal) ok = false;
    return ok;
  });

  await updateSummary(filtered);

  roomGrid.innerHTML = "";

  if (filtered.length === 0) {
    roomGrid.innerHTML = `<div style="font-size:13px;">해당 조건에 맞는 방이 없습니다.</div>`;
    return;
  }

  filtered
    .sort((a, b) => a.room.localeCompare(b.room, "ko-KR", { numeric: true }))
    .forEach(room => {
      const isEmpty = !room.name;

      // getUnpaidMonths 보호 처리
      let unpaidMonths = 0;
      if (typeof getUnpaidMonths === "function") {
        unpaidMonths = getUnpaidMonths(room);
      } else if (typeof isUnpaid === "function" && isUnpaid(room)) {
        unpaidMonths = 1;
      }
      const unpaid = unpaidMonths > 0;

      // 상태 텍스트
      let statusText = "";
      if (isEmpty) statusText = "빈방";
      else statusText = unpaid ? "사용(미납)" : "사용";

      // 카드
      const card = document.createElement("div");
     
      if (isEmpty) {
        card.className = "room-card-simple empty";
      } else if (unpaid) {
        card.className = "room-card-simple unpaid";
      } else {
        card.className = "room-card-simple used";
      }

      // 요약 (3줄)
      const summary = document.createElement("div");
      summary.className = "room-summary";
      summary.innerHTML = `
        <div class="room-title">${room.room}호</div>
        <div class="room-name">${room.name || "-"}</div>
        <div class="room-status">${statusText}</div>
      `;

      // 상세
      const details = document.createElement("div");
      details.className = "room-details";
      details.style.display = "none";

      const building = buildings.find(b => b.id === room.buildingId);
      let buildingName = "-";
      if (building) {
        if (building.goshiwonName && building.goshiwonName.trim()) {
          buildingName = `${building.buildingName} (${building.goshiwonName})`;
        } else if (building.buildingName) {
          buildingName = building.buildingName;
        } else if (building.name) {
          buildingName = building.name;
        }
      }

      const floorObj = floors.find(f => f.buildingId === room.buildingId && f.floorNumber === room.floor);
      const floorText = floorObj ? `${floorObj.floorNumber}층` : `${room.floor}층`;

      details.innerHTML = `
        <div>건물: ${buildingName}</div>
        <div>층: ${floorText}</div>
        <div>입실료: ${toWon(room.rent)}</div>
        <div>관리비: ${toWon(room.fee)}</div>
        <div>전화1: ${room.phone1 || ""}</div>
        <div>전화2: ${room.phone2 || ""}</div>
        <div>입실일: ${room.startDate || ""}</div>
        <div>비고: ${room.memo || ""}</div>
        <div>미납: ${unpaid ? `${unpaidMonths}개월` : "완납"}</div>

        <div class="room-buttons">
          <button class="btn btn-secondary btn-checkin">입실</button>
          <button class="btn btn-secondary btn-checkout">퇴실</button>
          <button class="btn btn-primary btn-edit">수정</button>
          <button class="btn btn-danger btn-delete">삭제</button>
        </div>
      `;
      // 버튼 이벤트 바인딩
      const btnCheckIn = details.querySelector(".btn-checkin");
      const btnCheckOut = details.querySelector(".btn-checkout");
      const btnEdit = details.querySelector(".btn-edit");
      const btnDelete = details.querySelector(".btn-delete");

      btnCheckIn.onclick = (e) => {
        e.stopPropagation();
        handleCheckIn(room);
      };

      btnCheckOut.onclick = (e) => {
        e.stopPropagation();
        handleCheckOut(room);
      };

      btnEdit.onclick = (e) => {
        e.stopPropagation();
        openRoomEditModal(room);
      };

      btnDelete.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`${room.room}호를 삭제하시겠습니까?`)) {
          await deleteRoom(room.id);
          await renderRoomsFromDB();
        }
      };

      // 클릭 시 상세 토글
      card.onclick = () => {
        details.style.display = details.style.display === "none" ? "flex" : "none";
      };

      card.appendChild(summary);
      card.appendChild(details);
      roomGrid.appendChild(card);
    });
}

// ==========================
// 방 요약 정보 업데이트
// ==========================
async function updateSummary(rooms) {
  const totalRentBoxEl = totalRentBox;
  const unpaidSummaryEl = unpaidSummary;

  const totalRent = rooms.reduce((sum, r) => sum + (Number(r.rent) || 0) * 10000, 0);
  const unpaidCount = rooms.filter(r => isUnpaid(r) && r.name).length;

  // 총 월세 금액 업데이트
  const span = document.getElementById("totalRentText");
  if (span) span.textContent = totalRent.toLocaleString("ko-KR") + "원";

  // 미납자 수 업데이트
  unpaidSummaryEl.textContent = `미납자: ${unpaidCount}명`;
}

// ==========================
// 입실 / 퇴실
// ==========================
async function handleCheckIn(room) {
  const nowStr = new Date().toISOString().slice(0, 10);

  const updated = {
    ...room,
    startDate: room.startDate || nowStr,
    lastPaidDate: nowStr
  };

  await saveRoom(updated);
  await renderRoomsFromDB();
}

async function handleCheckOut(room) {
  if (!confirm(`${room.room}호를 퇴실 처리하시겠습니까?`)) return;

  const cleared = {
    ...room,
    name: "",
    phone1: "",
    phone2: "",
    memo: "",
    startDate: "",
    lastPaidDate: ""
  };

  await saveRoom(cleared);
  await renderRoomsFromDB();
}

// ==========================
// 방 모달 (추가/수정)
// ==========================
let editingRoomId = null;

async function openRoomAddModal() {
  editingRoomId = null;
  document.getElementById("roomModalTitle").textContent = "방 등록";

  roomNumberInput.value = "";
  nameInput.value = "";
  phone1Input.value = "";
  phone2Input.value = "";
  rentInput.value = "";
  feeInput.value = "";
  startDateInput.valueAsDate = new Date();
  memoInput.value = "";

  const floors = await getAllFloors();

  // 건물/층 자동 선택 (현재 필터 기준)
  roomBuildingSelect.value = buildingFilter.value || "";
  renderRoomFloorOptions(floors, roomBuildingSelect.value);

  if (floorFilter.value) {
    roomFloorSelect.value = floorFilter.value;
  }

  roomModalBackdrop.style.display = "flex";
}

async function openRoomEditModal(room) {
  editingRoomId = room.id;
  document.getElementById("roomModalTitle").textContent = `${room.room}호 수정`;

  const floors = await getAllFloors();

  roomBuildingSelect.value = room.buildingId || "";
  renderRoomFloorOptions(floors, roomBuildingSelect.value);
  roomFloorSelect.value = room.floor ? String(room.floor) : "";

  roomNumberInput.value = room.room;
  nameInput.value = room.name || "";
  phone1Input.value = room.phone1 || "";
  phone2Input.value = room.phone2 || "";
  rentInput.value = room.rent || "";
  feeInput.value = room.fee || "";
  startDateInput.value = room.startDate || "";
  memoInput.value = room.memo || "";

  roomModalBackdrop.style.display = "flex";
}
async function saveRoomFromModal() {
  const buildingId = roomBuildingSelect.value;
  const floorVal = roomFloorSelect.value;
  const roomNo = roomNumberInput.value.trim();

  if (!buildingId) return alert("건물을 선택하세요.");
  if (!floorVal) return alert("층을 선택하세요.");
  if (!roomNo) return alert("호실을 입력하세요.");

  const isEdit = !!editingRoomId;

  const data = {
    id: editingRoomId || crypto.randomUUID(),
    buildingId,
    floor: Number(floorVal),
    room: roomNo,
    name: nameInput.value.trim(),
    phone1: phone1Input.value.trim(),
    phone2: phone2Input.value.trim(),
    rent: Number(rentInput.value || 0),
    fee: Number(feeInput.value || 0),
    startDate: startDateInput.value || "",
    lastPaidDate: isEdit ? undefined : (startDateInput.value || ""),
    memo: memoInput.value.trim()
  };

  await saveRoom(data);
  await renderRoomsFromDB();

  if (isEdit) {
    // 수정일 때는 닫기
    roomModalBackdrop.style.display = "none";
  } else {
    // 신규 등록일 때는 입력값 초기화
    roomNumberInput.value = "";
    nameInput.value = "";
    phone1Input.value = "";
    phone2Input.value = "";
    rentInput.value = "";
    feeInput.value = "";
    startDateInput.valueAsDate = new Date();
    memoInput.value = "";

    // 모달은 유지
    roomModalBackdrop.style.display = "flex";
  }
}

// 모달 닫기
roomModalClose.onclick = () => {
  roomModalBackdrop.style.display = "none";
};
roomModalCancel.onclick = () => {
  roomModalBackdrop.style.display = "none";
};
const roomModalCloseBtn = document.getElementById("roomModalCloseBtn");
roomModalCloseBtn.onclick = () => {
  roomModalBackdrop.style.display = "none";
};

// 건물 선택 시 층 목록 갱신
roomBuildingSelect.onchange = async () => {
  const floors = await getAllFloors();
  renderRoomFloorOptions(floors, roomBuildingSelect.value);
  roomFloorSelect.value = "";
};

// ==========================
// 미납자 팝업
// ==========================
async function openUnpaidModal() {
  const rooms = await getAllRooms();
  const buildings = await getAllBuildings();
  const floors = await getAllFloors();

  const buildingFilterVal = buildingFilter.value || "";
  const floorFilterVal = floorFilter.value || "";

  const filtered = rooms.filter(r => {
    let ok = true;
    if (buildingFilterVal && r.buildingId !== buildingFilterVal) ok = false;
    if (floorFilterVal && String(r.floor) !== floorFilterVal) ok = false;
    return ok;
  });

  const unpaidRooms = filtered.filter(r => isUnpaid(r) && r.name);

  const body = document.getElementById("unpaidModalBody");

  const getBuildingLabel = (b) => {
    if (!b) return "-";
    if (b.goshiwonName && b.goshiwonName.trim()) {
      return `${b.buildingName} (${b.goshiwonName})`;
    }
    if (b.buildingName) return b.buildingName;
    if (b.name) return b.name;
    return "-";
  };

  if (unpaidRooms.length === 0) {
    body.textContent = "미납자가 없습니다.";
  } else {
    body.innerHTML = "";
    unpaidRooms.forEach(r => {
      const div = document.createElement("div");
      div.style.borderBottom = "1px solid #eee";
      div.style.padding = "4px 0";

      const building = buildings.find(b => b.id === r.buildingId);
      const buildingName = getBuildingLabel(building);
      const floorObj = floors.find(f => f.buildingId === r.buildingId && f.floorNumber === r.floor);
      const floorText = floorObj ? `${floorObj.floorNumber}층` : `${r.floor}층`;

      const months = getUnpaidMonths(r);
      const rentWon = (Number(r.rent) || 0) * 10000;
      const unpaidWon = rentWon * months;

      div.innerHTML = `
        <div><b>${buildingName} ${floorText} ${r.room}호</b> - ${r.name}</div>
        <div>미납: <span style="color:red;">${months}개월 (${unpaidWon.toLocaleString("ko-KR")}원)</span></div>
        <button class="btn btn-primary btn-sm" style="margin-top:3px;">납부 처리</button>
      `;

      const btn = div.querySelector("button");
      btn.onclick = async () => {
        const nowStr = new Date().toISOString().slice(0, 10);
        await saveRoom({ ...r, lastPaidDate: nowStr });
        await renderRoomsFromDB();
        await openUnpaidModal();
      };

      body.appendChild(div);
    });
  }

  unpaidModalBackdrop.style.display = "flex";
}

unpaidModalClose.onclick = () => {
  unpaidModalBackdrop.style.display = "none";
};

// ==========================
// 전체 방 현황 팝업
// ==========================
async function openTotalModal() {
  const rooms = await getAllRooms();
  const buildings = await getAllBuildings();
  const floors = await getAllFloors();

  const buildingFilterVal = buildingFilter.value || "";
  const floorFilterVal = floorFilter.value || "";

  const filtered = rooms.filter(r => {
    let ok = true;
    if (buildingFilterVal && r.buildingId !== buildingFilterVal) ok = false;
    if (floorFilterVal && String(r.floor) !== floorFilterVal) ok = false;
    return ok;
  });

  const body = document.getElementById("totalModalBody");

  if (filtered.length === 0) {
    body.textContent = "해당 조건에 맞는 방이 없습니다.";
    totalModalBackdrop.style.display = "flex";
    return;
  }

  let totalRentSum = 0;
  let totalFeeSum = 0;
  let totalUnpaidSum = 0;

  filtered.forEach(r => {
    const rentWon = (Number(r.rent) || 0) * 10000;
    const feeWon = (Number(r.fee) || 0) * 10000;
    totalRentSum += rentWon;
    totalFeeSum += feeWon;

    const months = getUnpaidMonths(r);
    totalUnpaidSum += rentWon * months;
  });

  const getBuildingLabel = (b) => {
    if (!b) return "-";
    if (b.goshiwonName && b.goshiwonName.trim()) {
      return `${b.buildingName} (${b.goshiwonName})`;
    }
    if (b.buildingName) return b.buildingName;
    if (b.name) return b.name;
    return "-";
  };

  const rows = filtered
    .sort((a, b) => a.room.localeCompare(b.room, "ko-KR", { numeric: true }))
    .map(r => {
      const building = buildings.find(b => b.id === r.buildingId);
      const buildingName = getBuildingLabel(building);
      const floorObj = floors.find(f => f.buildingId === r.buildingId && f.floorNumber === r.floor);
      const floorText = floorObj ? `${floorObj.floorNumber}층` : `${r.floor}층`;
      const unpaidMonths = getUnpaidMonths(r);

      return `
        <tr>
          <td style="border:1px solid #ccc; padding:4px;">${buildingName}</td>
          <td style="border:1px solid #ccc; padding:4px;">${floorText}</td>
          <td style="border:1px solid #ccc; padding:4px;">${r.room}</td>
          <td style="border:1px solid #ccc; padding:4px;">${r.name || ""}</td>
          <td style="border:1px solid #ccc; padding:4px;">${r.startDate || ""}</td>
          <td style="border:1px solid #ccc; padding:4px; text-align:right;">${toWon(r.rent)}</td>
          <td style="border:1px solid #ccc; padding:4px; text-align:right;">${toWon(r.fee)}</td>
          <td style="border:1px solid #ccc; padding:4px; text-align:center;">
            ${
              unpaidMonths > 0
                ? `<span style="color:red;">${unpaidMonths}개월</span>`
                : "완납"
            }
          </td>
        </tr>
      `;
    })
    .join("");


  body.innerHTML = `
    <div class="total-table-wrapper">
      <table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #ccc;">
        <thead>
          <tr style="background:#f0f0f0; border-bottom:1px solid #ccc;">
            <th style="border:1px solid #ccc; padding:4px;">건물</th>
            <th style="border:1px solid #ccc; padding:4px;">층</th>
            <th style="border:1px solid #ccc; padding:4px;">호실</th>
            <th style="border:1px solid #ccc; padding:4px;">이름</th>
            <th style="border:1px solid #ccc; padding:4px;">입실일</th>
            <th style="border:1px solid #ccc; padding:4px;">월세</th>
            <th style="border:1px solid #ccc; padding:4px;">관리비</th>
            <th style="border:1px solid #ccc; padding:4px;">미납</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr style="background:#fafafa; font-weight:bold;">
            <td colspan="5" style="text-align:center; border:1px solid #ccc; padding:4px;">합계</td>
            <td style="text-align:right; border:1px solid #ccc; padding:4px;">${totalRentSum.toLocaleString("ko-KR")}원</td>
            <td style="text-align:right; border:1px solid #ccc; padding:4px;">${totalFeeSum.toLocaleString("ko-KR")}원</td>
            <td style="text-align:right; border:1px solid #ccc; padding:4px;">${totalUnpaidSum.toLocaleString("ko-KR")}원</td>
          </tr>
        </tfoot>
      </table>
     </div>
   `;

  totalModalBackdrop.style.display = "flex";
}

totalModalClose.onclick = () => {
  totalModalBackdrop.style.display = "none";
};

// ==========================
// 백업 / 복원
// ==========================
async function backupData() {
  const rooms = await getAllRooms();
  const buildings = await getAllBuildings();
  const floors = await getAllFloors();
  const settings = await new Promise((resolve, reject) => {
    const store = tx("settings", "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const data = { rooms, buildings, floors, settings };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  // 날짜·시간 자동 생성
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  const filename = `goshiwon_backup_${yyyy}.${mm}.${dd}_${hh}-${min}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;   // ← 자동 생성된 파일명 적용
  a.click();

  URL.revokeObjectURL(url);
}


async function restoreData(file) {
  const text = await file.text();
  const json = JSON.parse(text);

  const rooms = json.rooms || [];
  const buildings = json.buildings || [];
  const floors = json.floors || [];
  const settingsArr = json.settings || [];

  // 기존 데이터 전체 삭제
  await new Promise((resolve, reject) => {
    const t = db.transaction(["rooms", "buildings", "floors", "settings"], "readwrite");
    t.objectStore("rooms").clear();
    t.objectStore("buildings").clear();
    t.objectStore("floors").clear();
    t.objectStore("settings").clear();

    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });

  // 새 데이터 삽입
  await new Promise((resolve, reject) => {
    const t = db.transaction(["rooms", "buildings", "floors", "settings"], "readwrite");
    const rStore = t.objectStore("rooms");
    const bStore = t.objectStore("buildings");
    const fStore = t.objectStore("floors");
    const sStore = t.objectStore("settings");

    rooms.forEach(r => rStore.put(r));
    buildings.forEach(b => bStore.put(b));
    floors.forEach(f => fStore.put(f));
    settingsArr.forEach(s => sStore.put(s));

    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });

  await loadGoshiwonName();
  await renderBuildingUI();
  await renderRoomsFromDB();
}

// ==========================
// 초기 실행
// ==========================
document.addEventListener("DOMContentLoaded", async () => {
  await openDB();
  await loadGoshiwonName();
  await renderBuildingUI();
  await renderRoomsFromDB();
});

// ==========================
// 이벤트 바인딩
// ==========================

// 설정 열기/닫기
settingsBtn.onclick = () => {
  settingsBackdrop.style.display = "flex";
};
settingsClose.onclick = () => {
  settingsBackdrop.style.display = "none";
};

// 고시원 이름(전체 시스템 이름) 저장
saveGoshiwonNameBtn.onclick = async () => {
  const name = goshiwonNameInput.value.trim() || "고시원";
  await setSetting("goshiwonName", name);
  goshiwonNameEl.textContent = name;
  alert("이름을 저장했습니다.");
};

// 건물 추가 (건물명 + 고시원 이름)
addBuildingBtn.onclick = async () => {
  const buildingName = buildingNameInput.value.trim();
  const goshiName = goshiwonNameForBuildingInput.value.trim();

  if (!buildingName) return alert("건물명을 입력하세요.");
  if (!goshiName) return alert("고시원 이름을 입력하세요.");

  await addBuilding(buildingName, goshiName);
  buildingNameInput.value = "";
  goshiwonNameForBuildingInput.value = "";
  await renderBuildingUI();
  await renderRoomsFromDB();
};

// 건물 삭제
buildingList.onclick = async (e) => {
  const span = e.target;
  if (span.tagName === "SPAN" && span.dataset.id) {
    const id = span.dataset.id;
    if (!confirm("해당 건물을 삭제하시겠습니까? (방 데이터는 유지됩니다)")) return;

    await deleteBuilding(id);
    await renderBuildingUI();
    await renderRoomsFromDB();
  }
};

// 층 추가
addFloorBtn.onclick = async () => {
  const buildingId = buildingSelectForFloor.value;
  const floorNo = floorNumberInput.value.trim();

  if (!buildingId) return alert("건물을 먼저 선택하세요.");
  if (!floorNo) return alert("층 번호를 입력하세요.");

  await addFloor(buildingId, floorNo);
  floorNumberInput.value = "";

  await renderBuildingUI();
  await renderRoomsFromDB();
};

// 층 삭제
floorList.onclick = async (e) => {
  const span = e.target;
  if (span.tagName === "SPAN" && span.dataset.id) {
    const id = span.dataset.id;
    if (!confirm("해당 층 정보를 삭제하시겠습니까?")) return;

    await deleteFloor(id);
    await renderBuildingUI();
    await renderRoomsFromDB();
  }
};

// 방 모달 버튼 이벤트
roomModalSave.onclick = saveRoomFromModal;

// 설정 페이지 → 방 추가
addRoomFromSettingsBtn.onclick = () => {
  openRoomAddModal();
};

// 건물/층 필터 변경
buildingFilter.onchange = async () => {
  const floors = await getAllFloors();
  renderFloorFilter(floors, buildingFilter.value || "");
  floorFilter.value = "";
  await renderRoomsFromDB();
};

floorFilter.onchange = renderRoomsFromDB;

// 미납자 팝업
unpaidSummary.onclick = openUnpaidModal;

// 전체 방 현황 팝업
totalRentBox.onclick = openTotalModal;

// 백업/복원
backupBtn.onclick = backupData;
restoreBtn.onclick = () => restoreFileInput.click();
restoreFileInput.onchange = async (e) => {
  if (e.target.files && e.target.files[0]) {
    await restoreData(e.target.files[0]);
    alert("복원이 완료되었습니다.");
  }
};