// ============================================================
// DATA
// ============================================================

const CARDS = {
  sport: ['Moi', 'Parents', 'Coach', 'Coéquipiers', 'Amis', 'Frères/Sœurs', 'Supporters', 'Agent', 'Club'],
  entreprise: ['Moi', 'Manager', 'Collègues', 'Clients', 'Famille', 'Associés', 'Amis']
};

// ============================================================
// STATE
// ============================================================

let state = {
  mode: null,           // 'sport' or 'entreprise'
  guided: true,         // true = guided mode, false = session mode
  currentStep: 1,
  placedCards: [],       // names of cards placed on the board
  cardPositions: {},     // { cardName: { x, y } } relative % positions in drop zone
  sliderValues: {},      // { cardName: percentValue }
  groupedMoi: 50,        // % for "Moi" in grouped step
  verbNotes: {}          // { cardName: 'text' }
};

// ============================================================
// LOCAL STORAGE — save/restore progress
// ============================================================

const STORAGE_KEY = 'pourQuiJeJoue_state';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Silent fail if localStorage is full or unavailable
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with default state to handle missing keys
      state = { ...state, ...parsed };
      return true;
    }
  } catch (e) {
    // Silent fail
  }
  return false;
}

function clearSavedState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // Silent fail
  }
}

// ============================================================
// INIT — restore progress on page load
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const hasState = loadState();
  if (hasState && state.currentStep > 1 && state.mode) {
    // Restore guided mode class
    if (!state.guided) {
      document.body.classList.add('session-mode');
    }
    goToStep(state.currentStep);
  }
});

// ============================================================
// STEP 1: MODE SELECTION
// ============================================================

function selectMode(mode) {
  state.mode = mode;
  state.guided = document.querySelector('input[name="guidedMode"]:checked').value === 'guided';

  // Apply session mode class
  if (!state.guided) {
    document.body.classList.add('session-mode');
  }

  saveState();
  goToStep(2);
}

// ============================================================
// NAVIGATION
// ============================================================

function goToStep(step) {
  // Validate before moving forward
  if (step === 3 && state.placedCards.length === 0) return;
  if (step === 4 && !isTotalValid()) return;

  state.currentStep = step;
  saveState();

  // Hide all steps
  document.querySelectorAll('.step').forEach(s => s.classList.add('hidden'));

  // Show target step
  const target = document.getElementById(`step-${step}`);
  target.classList.remove('hidden');

  // Show/hide progress bar
  const progressBar = document.getElementById('progress-bar');
  if (step > 1) {
    progressBar.classList.remove('hidden');
    document.body.classList.add('has-progress');
    document.getElementById('progress-label').textContent = `Étape ${step}/6`;
    document.getElementById('progress-fill').style.width = `${(step / 6) * 100}%`;
  } else {
    progressBar.classList.add('hidden');
    document.body.classList.remove('has-progress');
  }

  // Build step content
  if (step === 2) buildCardPlacement();
  if (step === 3) buildSliders();
  if (step === 4) buildGrouped();
  if (step === 5) buildVerbalization();
  if (step === 6) buildRecap();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// STEP 2: CARD PLACEMENT (DRAG & DROP + CLICK)
// ============================================================

function buildCardPlacement() {
  const pool = document.getElementById('pool-cards');
  const dropZone = document.getElementById('drop-zone');
  const centralText = document.getElementById('central-card-text');
  const title = document.getElementById('step2-title');

  // Set title based on mode
  if (state.mode === 'entreprise') {
    centralText.innerHTML = 'Pour qui<br>je travaille ?';
    title.textContent = 'Pour qui je travaille ?';
  } else {
    centralText.innerHTML = 'Pour qui<br>je joue ?';
    title.textContent = 'Pour qui je joue ?';
  }

  // Clear pool (keep central card)
  pool.innerHTML = '';

  // Remove previously placed cards from drop zone (keep central card)
  dropZone.querySelectorAll('.card.placed').forEach(c => c.remove());

  const cards = CARDS[state.mode];

  cards.forEach(name => {
    const isPlaced = state.placedCards.includes(name);

    const card = createCardElement(name);

    if (isPlaced && state.cardPositions[name]) {
      // Re-place it in the drop zone
      card.classList.add('placed');
      card.style.left = state.cardPositions[name].x + '%';
      card.style.top = state.cardPositions[name].y + '%';
      dropZone.appendChild(card);
    } else {
      pool.appendChild(card);
    }
  });

  // Drop zone events
  setupDropZone(dropZone, pool);

  updateNextButton();
}

function createCardElement(name) {
  const card = document.createElement('div');
  card.className = 'card';
  card.textContent = name;
  card.setAttribute('data-card', name);
  card.draggable = true;

  // Desktop drag events
  card.addEventListener('dragstart', onDragStart);
  card.addEventListener('dragend', onDragEnd);

  // Click to toggle card placement (fix: no duplication)
  card.addEventListener('click', (e) => {
    // Ignore if this was a drag
    if (card.classList.contains('was-dragged')) {
      card.classList.remove('was-dragged');
      return;
    }
    const dropZone = document.getElementById('drop-zone');
    const pool = document.getElementById('pool-cards');

    if (card.classList.contains('placed')) {
      // Click on a placed card → remove it
      removeCard(name, dropZone, pool);
    } else {
      // Click on a pool card → place it at a random safe position
      const rect = dropZone.getBoundingClientRect();
      const pos = getRandomSafePosition();
      placeCard(name, rect.left + (pos.x / 100) * rect.width, rect.top + (pos.y / 100) * rect.height, dropZone, pool);
    }
  });

  // Touch events for mobile
  card.addEventListener('touchstart', onTouchStart, { passive: false });
  card.addEventListener('touchmove', onTouchMove, { passive: false });
  card.addEventListener('touchend', onTouchEnd, { passive: false });

  return card;
}

// Get a random position that avoids the central card zone
function getRandomSafePosition() {
  let x, y;
  do {
    x = 10 + Math.random() * 75;
    y = 10 + Math.random() * 75;
  } while (isInCentralZone(x, y));
  return { x, y };
}

// Check if a position (in %) overlaps with the central card
function isInCentralZone(xPercent, yPercent) {
  // Central card is at 50%, 50% — exclude a zone around it
  return xPercent > 30 && xPercent < 70 && yPercent > 30 && yPercent < 70;
}

// --- Desktop Drag & Drop ---

let draggedCard = null;
let dragMoved = false;

function onDragStart(e) {
  draggedCard = e.target;
  dragMoved = false;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.target.getAttribute('data-card'));
}

function onDragEnd(e) {
  e.target.classList.remove('dragging');
  if (dragMoved) {
    e.target.classList.add('was-dragged');
  }
  draggedCard = null;
}

function setupDropZone(dropZone, pool) {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragMoved = true;
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const name = e.dataTransfer.getData('text/plain');
    if (!name) return;
    placeCard(name, e.clientX, e.clientY, dropZone, pool);
  });

  // Allow dropping back to pool
  pool.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragMoved = true;
  });
  pool.addEventListener('drop', (e) => {
    e.preventDefault();
    const name = e.dataTransfer.getData('text/plain');
    if (!name) return;
    removeCard(name, dropZone, pool);
  });
}

function placeCard(name, clientX, clientY, dropZone, pool) {
  const rect = dropZone.getBoundingClientRect();
  let x = ((clientX - rect.left) / rect.width) * 100;
  let y = ((clientY - rect.top) / rect.height) * 100;

  // Clamp to stay within bounds
  let clampedX = Math.max(5, Math.min(85, x));
  let clampedY = Math.max(5, Math.min(85, y));

  // Push away from central zone if overlapping
  if (isInCentralZone(clampedX, clampedY)) {
    // Move to nearest edge of the exclusion zone
    const distToLeft = Math.abs(clampedX - 30);
    const distToRight = Math.abs(clampedX - 70);
    const distToTop = Math.abs(clampedY - 30);
    const distToBottom = Math.abs(clampedY - 70);
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

    if (minDist === distToLeft) clampedX = 25;
    else if (minDist === distToRight) clampedX = 75;
    else if (minDist === distToTop) clampedY = 25;
    else clampedY = 75;
  }

  // Add to placed list (prevent duplicates)
  if (!state.placedCards.includes(name)) {
    state.placedCards.push(name);
  }
  state.cardPositions[name] = { x: clampedX, y: clampedY };

  // Remove from pool
  const poolCard = pool.querySelector(`[data-card="${name}"]`);
  if (poolCard) poolCard.remove();

  // Remove existing placed card if re-dropping
  const existing = dropZone.querySelector(`.card.placed[data-card="${name}"]`);
  if (existing) existing.remove();

  // Create placed card in drop zone
  const card = createCardElement(name);
  card.classList.add('placed');
  card.style.left = clampedX + '%';
  card.style.top = clampedY + '%';
  dropZone.appendChild(card);

  saveState();
  updateNextButton();
}

function removeCard(name, dropZone, pool) {
  // Remove from state
  state.placedCards = state.placedCards.filter(n => n !== name);
  delete state.cardPositions[name];

  // Remove from drop zone
  const placed = dropZone.querySelector(`.card.placed[data-card="${name}"]`);
  if (placed) placed.remove();

  // Add back to pool (only if not already there)
  if (!pool.querySelector(`[data-card="${name}"]`)) {
    const card = createCardElement(name);
    pool.appendChild(card);
  }

  saveState();
  updateNextButton();
}

// --- Touch Drag & Drop ---

let touchCard = null;
let touchClone = null;
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

function onTouchStart(e) {
  e.preventDefault();
  touchCard = e.target.closest('.card');
  if (!touchCard) return;

  touchMoved = false;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;

  // Create floating clone
  touchClone = touchCard.cloneNode(true);
  touchClone.style.position = 'fixed';
  touchClone.style.zIndex = '1000';
  touchClone.style.pointerEvents = 'none';
  touchClone.style.opacity = '0.85';
  touchClone.style.transform = 'scale(1.05)';
  touchClone.style.left = (touch.clientX - 40) + 'px';
  touchClone.style.top = (touch.clientY - 20) + 'px';
  document.body.appendChild(touchClone);

  touchCard.classList.add('dragging');
}

function onTouchMove(e) {
  e.preventDefault();
  if (!touchClone) return;
  touchMoved = true;
  const touch = e.touches[0];
  touchClone.style.left = (touch.clientX - 40) + 'px';
  touchClone.style.top = (touch.clientY - 20) + 'px';
}

function onTouchEnd(e) {
  e.preventDefault();
  if (!touchCard || !touchClone) return;

  const touch = e.changedTouches[0];
  const dropZone = document.getElementById('drop-zone');
  const pool = document.getElementById('pool-cards');
  const name = touchCard.getAttribute('data-card');

  // Remove clone
  touchClone.remove();
  touchClone = null;
  touchCard.classList.remove('dragging');

  // If finger barely moved, treat as a tap (click)
  const dx = Math.abs(touch.clientX - touchStartX);
  const dy = Math.abs(touch.clientY - touchStartY);
  if (!touchMoved || (dx < 10 && dy < 10)) {
    // Tap behavior
    if (touchCard.classList.contains('placed')) {
      removeCard(name, dropZone, pool);
    } else {
      const rect = dropZone.getBoundingClientRect();
      const pos = getRandomSafePosition();
      placeCard(name, rect.left + (pos.x / 100) * rect.width, rect.top + (pos.y / 100) * rect.height, dropZone, pool);
    }
    touchCard = null;
    return;
  }

  // Check where it was dropped
  const dzRect = dropZone.getBoundingClientRect();
  const poolRect = pool.getBoundingClientRect();

  if (isInside(touch.clientX, touch.clientY, dzRect)) {
    placeCard(name, touch.clientX, touch.clientY, dropZone, pool);
  } else if (isInside(touch.clientX, touch.clientY, poolRect)) {
    removeCard(name, dropZone, pool);
  }
  // If dropped elsewhere, card stays where it was

  touchCard = null;
}

function isInside(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function updateNextButton() {
  const btn = document.getElementById('btn-step3');
  btn.disabled = state.placedCards.length === 0;
}

// ============================================================
// STEP 3: INDIVIDUAL SLIDERS
// ============================================================

function buildSliders() {
  const container = document.getElementById('sliders-container');
  container.innerHTML = '';

  // Initialize slider values for newly placed cards
  state.placedCards.forEach(name => {
    if (state.sliderValues[name] === undefined) {
      state.sliderValues[name] = 0;
    }
  });

  // Remove sliders for removed cards
  Object.keys(state.sliderValues).forEach(name => {
    if (!state.placedCards.includes(name)) {
      delete state.sliderValues[name];
    }
  });

  // Build slider for each placed card
  state.placedCards.forEach(name => {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const label = document.createElement('span');
    label.className = 'slider-label';
    label.textContent = name;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '10';
    slider.value = state.sliderValues[name];
    slider.setAttribute('data-slider', name);

    const value = document.createElement('span');
    value.className = 'slider-value';
    value.textContent = state.sliderValues[name] + '%';
    value.id = `val-${name}`;

    slider.addEventListener('input', () => {
      const snapped = Math.round(parseInt(slider.value) / 10) * 10;
      slider.value = snapped;
      state.sliderValues[name] = snapped;
      value.textContent = snapped + '%';
      updateTotal();
      saveState();
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(value);
    container.appendChild(row);
  });

  updateTotal();
}

function updateTotal() {
  const total = Object.values(state.sliderValues).reduce((sum, v) => sum + v, 0);
  document.getElementById('total-percent').textContent = total + '%';
  document.getElementById('total-bar').style.width = Math.min(total, 100) + '%';

  const warning = document.getElementById('total-warning');
  const btn = document.getElementById('btn-step4');

  if (total === 100) {
    warning.classList.add('hidden');
    document.getElementById('total-bar').style.background = '#172554';
    btn.disabled = false;
  } else {
    if (total > 100) {
      warning.textContent = `Le total est à ${total}% — il doit faire exactement 100%`;
      warning.classList.remove('hidden');
      document.getElementById('total-bar').style.background = '#ef4444';
    } else if (total > 0) {
      warning.textContent = `Il reste ${100 - total}% à répartir`;
      warning.classList.remove('hidden');
      document.getElementById('total-bar').style.background = '#172554';
    } else {
      warning.classList.add('hidden');
    }
    btn.disabled = true;
  }
}

function isTotalValid() {
  const total = Object.values(state.sliderValues).reduce((sum, v) => sum + v, 0);
  return total === 100;
}

// ============================================================
// STEP 4: GROUPED MOI VS OTHERS
// ============================================================

function buildGrouped() {
  const slider = document.getElementById('grouped-slider');
  slider.value = state.groupedMoi;

  updateGroupedDisplay();

  // Calculate detail: Moi vs sum of all others from step 3
  const detailMoi = state.sliderValues['Moi'] || 0;
  const detailOthers = Object.entries(state.sliderValues)
    .filter(([name]) => name !== 'Moi')
    .reduce((sum, [, v]) => sum + v, 0);
  document.getElementById('compare-detail-moi').textContent = detailMoi;
  document.getElementById('compare-detail-others').textContent = detailOthers;

  // Remove old listener by replacing element
  const newSlider = slider.cloneNode(true);
  slider.parentNode.replaceChild(newSlider, slider);
  newSlider.addEventListener('input', () => {
    // Snap to 10% increments
    const snapped = Math.round(parseInt(newSlider.value) / 10) * 10;
    newSlider.value = snapped;
    state.groupedMoi = snapped;
    updateGroupedDisplay();
    saveState();
  });
}

function updateGroupedDisplay() {
  const moi = state.groupedMoi;
  document.getElementById('grouped-moi-val').textContent = moi + '%';
  document.getElementById('grouped-others-val').textContent = (100 - moi) + '%';
  document.getElementById('compare-global-moi').textContent = moi;
  document.getElementById('compare-global-others').textContent = 100 - moi;
}

// ============================================================
// STEP 5: VERBALIZATION
// ============================================================

function buildVerbalization() {
  const container = document.getElementById('verbalization-container');
  container.innerHTML = '';

  state.placedCards.forEach(name => {
    const div = document.createElement('div');
    div.className = 'verb-card';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-2';

    const label = document.createElement('span');
    label.className = 'font-medium text-blue-950';
    label.textContent = name;

    const pct = document.createElement('span');
    pct.className = 'text-sm text-gray-400';
    pct.textContent = (state.sliderValues[name] || 0) + '%';

    header.appendChild(label);
    header.appendChild(pct);

    const textarea = document.createElement('textarea');
    textarea.placeholder = state.mode === 'entreprise'
      ? `Pourquoi travaillez-vous pour ${name === 'Moi' ? 'vous-même' : name} ?`
      : `Pourquoi jouez-vous pour ${name === 'Moi' ? 'vous-même' : name} ?`;
    textarea.value = state.verbNotes[name] || '';
    textarea.addEventListener('input', () => {
      state.verbNotes[name] = textarea.value;
      saveState();
    });

    div.appendChild(header);
    div.appendChild(textarea);
    container.appendChild(div);
  });
}

// ============================================================
// STEP 6: RECAP
// ============================================================

function buildRecap() {
  // Mode label
  document.getElementById('recap-mode-label').textContent =
    state.mode === 'sport' ? 'Mode Sport' : 'Mode Entreprise';

  // Cards chosen
  const cardsContainer = document.getElementById('recap-cards');
  cardsContainer.innerHTML = '';
  state.placedCards.forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'inline-block px-3 py-1.5 rounded-full text-sm font-medium ' +
      'bg-blue-50 text-blue-950 border border-blue-100';
    chip.textContent = name;
    cardsContainer.appendChild(chip);
  });

  // Individual distribution bars
  const indivContainer = document.getElementById('recap-individual');
  indivContainer.innerHTML = '';
  state.placedCards.forEach(name => {
    const pct = state.sliderValues[name] || 0;
    const row = document.createElement('div');
    row.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-medium text-blue-950">${name}</span>
        <span class="text-sm font-semibold text-blue-950">${pct}%</span>
      </div>
      <div class="recap-bar">
        <div class="recap-bar-fill" style="width: ${pct}%"></div>
      </div>
    `;
    indivContainer.appendChild(row);
  });

  // Grouped comparison
  const detailMoi = state.sliderValues['Moi'] || 0;
  const detailOthers = Object.entries(state.sliderValues)
    .filter(([name]) => name !== 'Moi')
    .reduce((sum, [, v]) => sum + v, 0);
  document.getElementById('recap-detail-moi').textContent = detailMoi;
  document.getElementById('recap-detail-others').textContent = detailOthers;
  document.getElementById('recap-global-moi').textContent = state.groupedMoi;
  document.getElementById('recap-global-others').textContent = 100 - state.groupedMoi;

  const gap = Math.abs(detailMoi - state.groupedMoi);
  const gapEl = document.getElementById('recap-gap');
  if (gap > 0) {
    gapEl.classList.remove('hidden');
    document.getElementById('recap-gap-value').textContent = gap;
  } else {
    gapEl.classList.add('hidden');
  }

  // Verbalization notes
  const notesSection = document.getElementById('recap-notes-section');
  const notesContainer = document.getElementById('recap-notes');
  notesContainer.innerHTML = '';

  const hasNotes = state.placedCards.some(name => state.verbNotes[name]?.trim());
  if (hasNotes) {
    notesSection.classList.remove('hidden');
    state.placedCards.forEach(name => {
      const note = state.verbNotes[name]?.trim();
      if (note) {
        const div = document.createElement('div');
        div.className = 'text-sm';
        div.innerHTML = `
          <span class="font-medium text-blue-950">${name} :</span>
          <span class="text-gray-600">${escapeHtml(note)}</span>
        `;
        notesContainer.appendChild(div);
      }
    });
  } else {
    notesSection.classList.add('hidden');
  }
}

// ============================================================
// EXPORT PDF
// ============================================================

function exportPDF() {
  const recap = document.getElementById('recap-content');

  html2canvas(recap, {
    backgroundColor: '#f9fafb',
    scale: 1.5,
    useCORS: true,
    scrollY: -window.scrollY,
    windowHeight: recap.scrollHeight
  }).then(canvas => {
    const { jsPDF } = window.jspdf;
    // Use JPEG with compression instead of PNG
    const imgData = canvas.toDataURL('image/jpeg', 0.8);

    // A4 dimensions
    const pdfWidth = 210;
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
    pdf.save('pour-qui-je-joue.pdf');
  });
}

// ============================================================
// RESTART
// ============================================================

function restart() {
  state = {
    mode: null,
    guided: true,
    currentStep: 1,
    placedCards: [],
    cardPositions: {},
    sliderValues: {},
    groupedMoi: 50,
    verbNotes: {}
  };

  clearSavedState();
  document.body.classList.remove('session-mode', 'has-progress');
  goToStep(1);
}

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
