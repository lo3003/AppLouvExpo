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
  // Utilise .trim() pour nettoyer le nom du label avant de comparer
  const cleanName = name.trim(); 
  
  if (cleanName === "Micro 1")           sliderId = "fader1";
  if (cleanName === "Micro 2")           sliderId = "fader2";
  if (cleanName === "Enceinte face")     sliderId = "fader3";
  if (cleanName === "Enceinte arrière")  sliderId = "fader4";
  if (cleanName === "Subwoofer")         sliderId = "fader5";

  const convertedValue = parseFloat(value) / 100; // 0–100 -> 0–1

  if (sliderId) {
    const payload = JSON.stringify({
      slider: sliderId,
      value: convertedValue
    });
    sendCommand(wsAudio, payload);
  } else {
    console.warn(`Aucun fader mappé pour le label: ${cleanName}`);
  }
}

document.querySelectorAll("#audio .slider-row input[type=range]").forEach(slider => {
  const valueLabel = slider.parentElement.querySelector(".slider-value");
  valueLabel.textContent = slider.value;
  
  slider.addEventListener("input", () => {
    // MODIFIÉ : Nous ne mettons plus à jour le label ici.
    // Nous envoyons seulement la commande. Le retour WebSocket fera la mise à jour.
    const label = slider.closest(".audio-card").querySelector("label").textContent;
    sendSliderValue(label, slider.value);
  });
});

// =========================
// WebSocket /service (Feedback) - (MODIFIÉ)
// =========================
let lastLampesData = [];
wsService.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    // Heures des lampes (inchangé)
    if (data.type === "heuresLampes" && Array.isArray(data.lampes)) {
      lastLampesData = data.lampes;
      updateLampesUI();
    }
    // État du projecteur (modifié pour appeler la nouvelle fonction UI)
    else if (data.type === "etatProjecteur") {
      updateProjectorStateUI(data.etat);
    }
    // Source active (modifié pour appeler la nouvelle fonction UI)
    else if (data.type === "activeSource") {
      updateMatrixSourceUI(data.input, data.label);
    }
    // NOUVEAU : Gère l'état d'entrée du projecteur (SDI/HDMI)
    else if (data.type === "projectorInputState") {
      updateProjectorInputUI(data.input);
    }
    // NOUVEAU : Gère l'état des Mutes
    else if (data.type === "muteState") {
      updateMuteButtonUI(data.channel, data.isMuted);
    }
    // NOUVEAU : Gère l'état des Sliders
    else if (data.type === "faderState") {
      updateSliderUI(data.fader, data.value);
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
// NOUVEAU : Fonctions de mise à jour de l'UI
// Ces fonctions sont appelées par wsService.onmessage pour garantir
// que l'interface reflète l'état *réel* du système.
// =========================

function updateProjectorStateUI(etatLabel) {
  const label = document.getElementById("etat-videoproj");
  if (label) label.textContent = etatLabel;
  
  const btnOn = document.querySelector('button[data-group="projecteur"][data-etat="on"]');
  const btnOff = document.querySelector('button[data-group="projecteur"][data-etat="off"]');
  
  if (btnOn && btnOff) {
      btnOn.classList.remove('active');
      btnOff.classList.remove('active');
      
      if (etatLabel === "Allumé" || etatLabel === "Chauffe...") {
        btnOn.classList.add('active');
      } else if (etatLabel === "Éteint" || etatLabel === "Refroidissement...") {
        btnOff.classList.add('active');
      }
  }
}

function updateProjectorInputUI(activeInput) { // activeInput = "sdi" ou "hdbt"
  const btnSdi = document.querySelector('button[data-group="proj-input"][data-input="sdi"]');
  const btnHdbt = document.querySelector('button[data-group="proj-input"][data-input="hdbt"]');
  const matrixSection = document.getElementById('matrix-source-section');
  
  if (btnSdi && btnHdbt) {
    btnSdi.classList.remove('active');
    btnHdbt.classList.remove('active');
    
    if (activeInput === 'sdi') {
      btnSdi.classList.add('active');
      matrixSection.classList.add('disabled');
    } else if (activeInput === 'hdbt') {
      btnHdbt.classList.add('active');
      matrixSection.classList.remove('disabled');
    }
  }
}

function updateMatrixSourceUI(inputId, inputLabel) { // inputId = "hdmi1" ou "01", inputLabel = "Ecran"
  const label = document.getElementById("active-source");
  
  // Mapping pour gérer les retours "hdmi1" (écho) ou "01" (feedback matériel)
  const sourceMap = { "01": "hdmi1", "02": "hdmi2", "03": "hdmi3" };
  const activeSource = sourceMap[inputId] || inputId; // "hdmi1"

  const buttons = document.querySelectorAll('.btn-matrix-source');
  let foundLabel = "—";
  
  buttons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.source === activeSource) {
      btn.classList.add('active');
      foundLabel = btn.textContent.trim();
    }
  });

  if (label) {
    // Priorise le label du matériel s'il existe, sinon prend le label du bouton
    label.textContent = `Source active : ${inputLabel || foundLabel}`;
  }
}

function updateMuteButtonUI(channel, isMuted) { // channel = "01", isMuted = true
  const btn = document.querySelector(`.btn-mute[data-channel="${channel}"]`);
  if (btn) {
    if (isMuted) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }
}

function updateSliderUI(faderId, value) { // faderId = "fader1", value = 0.0 à 1.0
  const faderMap = {
    "fader1": "Micro 1",
    "fader2": "Micro 2",
    "fader3": "Enceinte face",
    "fader4": "Enceinte arrière",
    "fader5": "Subwoofer"
  };
  
  const labelText = faderMap[faderId];
  if (!labelText) return;
  
  const cards = document.querySelectorAll('.audio-card');
  cards.forEach(card => {
    const label = card.querySelector('label');
    // Utilise .trim() pour fiabiliser la comparaison
    if (label && label.textContent.trim() === labelText) { 
      const slider = card.querySelector('input[type=range]');
      const valueLabel = card.querySelector('.slider-value');
      const roundedValue = Math.round(value * 100);
      
      if (slider) slider.value = roundedValue;
      if (valueLabel) valueLabel.textContent = roundedValue;
    }
  });
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
document.querySelectorAll('.btn-proj-input').forEach(button => {
  button.addEventListener('click', () => {
    const inputType = button.dataset.input;
    const buttonText = button.textContent.trim();
    if (inputType === 'sdi') {
      sendCommand(wsProjecteur, "sdi_input");
      showToast(`Entrée Projecteur : ${buttonText}`);
    } else if (inputType === 'hdbt') {
      sendCommand(wsProjecteur, "hdbt_input");
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
// Contrôle Mute Audio (X32) - (MODIFIÉ)
// =========================
document.querySelectorAll('.btn-mute').forEach(button => {
  button.addEventListener('click', () => {
    // MODIFIÉ : On ne change plus l'état localement
    // button.classList.toggle('active');
    
    // On détermine l'état souhaité en fonction de l'état actuel
    const isCurrentlyMuted = button.classList.contains('active');
    const newMuteState = !isCurrentlyMuted; // true = veut muter, false = veut un-muter
    
    // 0 = Mute (état 'active'), 1 = Unmute (état inactif)
    const stateValue = newMuteState ? 0 : 1; 
    
    const channel = button.dataset.channel;
    const payload = JSON.stringify({
      mute: `ch${channel}`,
      state: stateValue
    });
    sendCommand(wsAudio, payload);
    
    // MODIFIÉ : Le Toast est supprimé, la mise à jour sera visuelle
    // const label = button.closest(".audio-card").querySelector("label").textContent;
    // showToast(`${label} ${newMuteState ? 'MUTE' : 'UNMUTE'}`);
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