// =========================
// Horloge
// =========================
function updateClock() {
  const clock = document.getElementById("clock");
  const now = new Date();
  clock.textContent = now.toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

let systemState = "off"; // État système par défaut

// =========================
// Navigation
// =========================
const navButtons = document.querySelectorAll(".nav-button");
const pages = document.querySelectorAll(".page");
const pageTitle = document.getElementById("page-title");

navButtons.forEach(btn => {
  // Ne pas attacher d'événement au bouton power mobile
  if (btn.classList.contains('mobile-power-btn')) {
    return;
  }
  
  btn.addEventListener("click", () => {
    navButtons.forEach(b => {
        if (!b.classList.contains('mobile-power-btn')) {
            b.classList.remove("active");
        }
    });
    btn.classList.add("active");

    const pageId = btn.getAttribute("data-page");
    pages.forEach(p => p.classList.remove("active"));
    document.getElementById(pageId).classList.add("active");

    pageTitle.textContent = btn.textContent.replace("📽️", "").replace("🔉", "").trim();
  });
});

// =========================
// Boutons exclusifs par groupe (style actif)
// =========================
const toggleButtons = document.querySelectorAll("button.toggle");
toggleButtons.forEach(button => {
  button.addEventListener("click", () => {
    const group = button.dataset.group;
    if (group) {
      toggleButtons.forEach(btn => {
        if (btn.dataset.group === group) btn.classList.remove("active");
      });
      button.classList.add("active");
    }
  });
});

// =========================
// NOUVEAUX WebSockets de Contrôle
// =========================
// !! PENSEZ À CHANGER 127.0.0.1 PAR L'IP DE VOTRE PC DE CONTRÔLE !!
const wsPower       = new WebSocket("ws://127.0.0.1:1880/controle-power");
const wsProjecteur  = new WebSocket("ws://127.0.0.1:1880/controle-projecteur");
const wsSource      = new WebSocket("ws://127.0.0.1:1880/controle-source");
const wsAudio       = new WebSocket("ws://127.0.0.1:1880/controle-audio");
const wsService     = new WebSocket("ws://127.0.0.1:1880/service"); // Feedback

// Fonction d'envoi générique et robuste
function sendCommand(ws, command) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(command);
  } else {
    ws.addEventListener('open', () => {
      ws.send(command);
    }, { once: true });
    if (ws.readyState !== WebSocket.CONNECTING) {
        console.warn(`Socket ${ws.url} n'est pas ouvert (État: ${ws.readyState}). Commande mise en file d'attente.`);
    }
  }
}

// =========================
// WebSocket Audio (X32) - 5 SLIDERS
// =========================
function sendSliderValue(name, value) {
  let sliderId;
  if (name === "Micro 1")           sliderId = "fader1";
  if (name === "Micro 2")           sliderId = "fader2";
  if (name === "Enceinte face")     sliderId = "fader3";
  if (name === "Enceinte arrière")  sliderId = "fader4";
  if (name === "Subwoofer")         sliderId = "fader5";

  const convertedValue = parseFloat(value) / 100; // 0–100 -> 0–1

  if (sliderId) {
    const payload = JSON.stringify({
      slider: sliderId,
      value: convertedValue
    });
    sendCommand(wsAudio, payload);
  } else {
    console.warn(`Aucun fader mappé pour le label: ${name}`);
  }
}

document.querySelectorAll("#audio .slider-row input[type=range]").forEach(slider => {
  const valueLabel = slider.parentElement.querySelector(".slider-value");
  valueLabel.textContent = slider.value;
  
  slider.addEventListener("input", () => {
    valueLabel.textContent = slider.value;
    const label = slider.closest(".audio-card").querySelector("label").textContent;
    sendSliderValue(label, slider.value);
  });
});

// =========================
// WebSocket /service (Feedback)
// =========================
let lastLampesData = [];
wsService.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === "heuresLampes" && Array.isArray(data.lampes)) {
      lastLampesData = data.lampes;
      updateLampesUI();
    }
    else if (data.type === "etatProjecteur") {
      const label = document.getElementById("etat-videoproj");
      if (label) label.textContent = data.etat;
    }
    else if (data.type === "activeSource") {
      const el = document.getElementById("active-source");
      if (el) el.textContent = `Source active : ${data.label}`;
    }
  } catch (e) {
    console.error("Erreur parsing /service:", e);
  }
};

function updateLampesUI() {
  const el = document.getElementById("lampes-info");
  if (el) {
    el.innerHTML = lastLampesData.length > 0
      ? lastLampesData.join("<br>")
      : "Chargement...";
  }
}

// =========================
// Commandes Générales Projecteur (Allumer/Eteindre/Service)
// =========================
document.querySelector('button[data-group="projecteur"][data-etat="on"]')
  .addEventListener("click", () => sendCommand(wsProjecteur, "on"));

document.querySelector('button[data-group="projecteur"][data-etat="off"]')
  .addEventListener("click", () => sendCommand(wsProjecteur, "off"));

document.getElementById("service-btn").addEventListener("click", () => {
  sendCommand(wsProjecteur, "getlamps");
  document.getElementById("service-modal").classList.remove("hidden");
  updateLampesUI(); 
});

document.getElementById("service-close").addEventListener("click", () => {
  document.getElementById("service-modal").classList.add("hidden");
});


// =========================
// Commandes Entrée Projecteur (SDI/HDBT)
// =========================
const matrixSourceSection = document.getElementById('matrix-source-section');
document.querySelectorAll('.btn-proj-input').forEach(button => {
  button.addEventListener('click', () => {
    const inputType = button.dataset.input;
    const buttonText = button.textContent.trim();
    if (inputType === 'sdi') {
      sendCommand(wsProjecteur, "sdi_input");
      matrixSourceSection.classList.add('disabled');
      showToast(`Entrée Projecteur : ${buttonText}`);
    } else if (inputType === 'hdbt') {
      sendCommand(wsProjecteur, "hdbt_input");
      matrixSourceSection.classList.remove('disabled');
      showToast(`Entrée Projecteur : ${buttonText}`);
    }
  });
});

// =========================
// Commandes Matrice (Source 1/2/3)
// =========================
document.querySelectorAll('.btn-matrix-source').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.source;
    const sourceText = btn.textContent.trim(); 
    if (cmd) {
      sendCommand(wsSource, cmd); 
      showToast(`Routage HDMI vers ${sourceText} demandé`);
    }
  });
});

// =========================
// Confirmation power général (Logique partagée)
// =========================
const powerButtons = document.querySelectorAll(".power-button");
const modal = document.getElementById("confirm-modal");
const modalMessage = document.getElementById("modal-message");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");

let pendingPowerAction = null;

// Logique pour ouvrir la modale de confirmation
function openConfirmModal(action) {
  if (action === systemState) {
    showToast(`Le système est déjà ${action === "on" ? "allumé" : "éteint"}`);
    return;
  }
  pendingPowerAction = action;
  modalMessage.textContent = `Êtes-vous sûr de vouloir ${action === "on" ? "allumer" : "éteindre"} le système ?`;
  modal.classList.remove("hidden");
}

// Écouteurs pour les boutons Power (Desktop + Mobile)
powerButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.power; // "on" ou "off"
    openConfirmModal(action);
  });
});

// Logique de confirmation (commune)
confirmYes.addEventListener("click", () => {
  modal.classList.add("hidden");
  if (pendingPowerAction) {
    systemState = pendingPowerAction; 
    const command = (pendingPowerAction === "on") ? "system_on" : "system_off";
    sendCommand(wsPower, command);
    showToast(`Ordre ${command} envoyé au système`);
    pendingPowerAction = null;
  }
});

confirmNo.addEventListener("click", () => {
  modal.classList.add("hidden");
  pendingPowerAction = null;
});

// =========================
// Toast centrée
// =========================
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 400);
  }, 2500);
}

// =========================
// Contrôle Mute Audio (X32)
// =========================
document.querySelectorAll('.btn-mute').forEach(button => {
  button.addEventListener('click', () => {
    button.classList.toggle('active');
    const isMuted = button.classList.contains('active');
    const state = isMuted ? 0 : 1; // 0 = Mute, 1 = Unmute
    const channel = button.dataset.channel;
    const payload = JSON.stringify({
      mute: `ch${channel}`,
      state: state
    });
    sendCommand(wsAudio, payload);
    const label = button.closest(".audio-card").querySelector("label").textContent;
    showToast(`${label} ${isMuted ? 'MUTE' : 'UNMUTE'}`);
  });
});

// =========================
// GESTION MODALE POWER MOBILE (NOUVEAU)
// =========================
const mobilePowerBtn = document.getElementById('mobile-power-btn');
const mobilePowerModal = document.getElementById('mobile-power-choice-modal');
const mobilePowerOn = document.getElementById('mobile-power-on');
const mobilePowerOff = document.getElementById('mobile-power-off');
const mobilePowerCancel = document.getElementById('mobile-power-cancel');

// Ouvre la petite modale de choix
mobilePowerBtn.addEventListener('click', () => {
  mobilePowerModal.classList.remove('hidden');
});

// Ferme la petite modale
mobilePowerCancel.addEventListener('click', () => {
  mobilePowerModal.classList.add('hidden');
});

// Bouton "Allumer" de la petite modale
mobilePowerOn.addEventListener('click', () => {
  mobilePowerModal.classList.add('hidden');
  openConfirmModal('on'); // Réutilise la logique de confirmation
});

// Bouton "Éteindre" de la petite modale
mobilePowerOff.addEventListener('click', () => {
  mobilePowerModal.classList.add('hidden');
  openConfirmModal('off'); // Réutilise la logique de confirmation
});