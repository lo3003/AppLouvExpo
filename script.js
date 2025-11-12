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
  btn.addEventListener("click", () => {
    navButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const pageId = btn.getAttribute("data-page");
    pages.forEach(p => p.classList.remove("active"));
    document.getElementById(pageId).classList.add("active");

    pageTitle.textContent = btn.textContent;
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
      // Ce code ne s'exécute que pour les boutons avec data-group
      toggleButtons.forEach(btn => {
        if (btn.dataset.group === group) btn.classList.remove("active");
      });
      button.classList.add("active"); // ✅ CORRIGÉ (maintenant à l'intérieur du 'if')
    }
    // S'il n'y a pas de data-group (comme pour 'Mute'), ce listener ne fait plus rien.
  });
});

// =========================
// NOUVEAUX WebSockets de Contrôle
// =========================
const wsPower       = new WebSocket("ws://127.0.0.1:1880/controle-power");
const wsProjecteur  = new WebSocket("ws://127.0.0.1:1880/controle-projecteur");
const wsSource      = new WebSocket("ws://127.0.0.1:1880/controle-source");
const wsAudio       = new WebSocket("ws://127.0.0.1:1880/controle-audio");

// WebSocket de Feedback (inchangé)
const wsService = new WebSocket("ws://127.0.0.1:1880/service");

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
// WebSocket Audio (X32)
// =========================
function sendSliderValue(name, value) {
  let sliderId;

  // Mise à jour des noms et ajout de fader5
  if (name === "Micro 1")           sliderId = "fader1";
  if (name === "Micro 2")           sliderId = "fader2";
  if (name === "Enceinte face")     sliderId = "fader3";
  if (name === "Enceinte arrière")  sliderId = "fader4";
  if (name === "Subwoofer")         sliderId = "fader5";

  const convertedValue = parseFloat(value) / 100; // 0–100 -> 0–1

  // Ce code vérifie si un sliderId a été trouvé avant d'envoyer
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

document.querySelectorAll(".slider-row input[type=range]").forEach(slider => {
  const valueLabel = slider.nextElementSibling;
  valueLabel.textContent = slider.value;
  slider.addEventListener("input", () => {
    valueLabel.textContent = slider.value;
    const label = slider.parentElement.querySelector("label").textContent;
    sendSliderValue(label, slider.value);
  });
});

// =========================
// WebSocket /service (INCHANGÉ)
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
      if (el) el.textContent = `Source HDMI active : ${data.label}`;
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

// Allumer / Éteindre
document.querySelector('button[data-group="projecteur"][data-etat="on"]')
  .addEventListener("click", () => sendCommand(wsProjecteur, "on"));

document.querySelector('button[data-group="projecteur"][data-etat="off"]')
  .addEventListener("click", () => sendCommand(wsProjecteur, "off"));

// Bouton Service (heures lampes)
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
    const inputType = button.dataset.input; // "sdi" ou "hdbt"

    if (inputType === 'sdi') {
      // 1. Envoyer la commande au projecteur
      sendCommand(wsProjecteur, "sdi_input"); // Commande pour Node-RED
      
      // 2. Griser la section matrice
      matrixSourceSection.classList.add('disabled');
      showToast('Entrée Projecteur : SDI');

    } else if (inputType === 'hdbt') {
      // 1. Envoyer la commande au projecteur
      sendCommand(wsProjecteur, "hdbt_input"); // Commande pour Node-RED
      
      // 2. DÉ-griser la section matrice
      matrixSourceSection.classList.remove('disabled');
      showToast('Entrée Projecteur : HDMI');
    }
  });
});


// =========================
// Commandes Matrice (Source 1/2/3)
// =========================
document.querySelectorAll('.btn-matrix-source').forEach(btn => {
  btn.addEventListener('click', () => {
    
    // ⬇️ MODIFICATION ICI ⬇️
    // On lit l'attribut "data-source" au lieu du texte
    const cmd = btn.dataset.source; // Contiendra "hdmi1", "hdmi2", ou "hdmi3"
    // On garde le texte juste pour le message
    const sourceText = btn.textContent.trim(); 
    
    if (cmd) {
      // On envoie la commande (hdmi1, hdmi2, hdmi3) au WebSocket
      sendCommand(wsSource, cmd); 
      showToast(`Routage HDMI vers ${sourceText} demandé`);
    }
    // ⬆️ FIN DE LA MODIFICATION ⬆️ (plus besoin des 'if/else')
  });
});


// =========================
// Confirmation power général (sidebar)
// =========================
const powerButtons = document.querySelectorAll(".power-button");
const modal = document.getElementById("confirm-modal");
const modalMessage = document.getElementById("modal-message");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");

let pendingPowerAction = null;

powerButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const state = btn.dataset.power;
    if (state === systemState) {
      showToast(`Le système est déjà ${state === "on" ? "allumé" : "éteint"}`);
      return;
    }
    pendingPowerAction = state;
    modalMessage.textContent = `Êtes-vous sûr de vouloir ${state === "on" ? "allumer" : "éteindre"} le système ?`;
    modal.classList.remove("hidden");
  });
});

confirmYes.addEventListener("click", () => {
  modal.classList.add("hidden");
  systemState = pendingPowerAction; 

  const command = (pendingPowerAction === "on") ? "system_on" : "system_off";
  sendCommand(wsPower, command);
  
  showToast(`Ordre ${command} envoyé au système`);
  pendingPowerAction = null;
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
// Contrôle Prises (Page Alimentation)
// =========================
document.querySelectorAll('.btn-prise').forEach(button => {
  button.addEventListener('click', () => {
    const id = button.dataset.id;
    const action = button.dataset.action;
    const command = `prise_${id}_${action}`;
    
    sendCommand(wsPower, command);
    
    showToast(`Commande ${command} envoyée`);
  });
});



// =========================
// Contrôle Mute Audio (X32)
// =========================
document.querySelectorAll('.btn-mute').forEach(button => {
  button.addEventListener('click', () => {
    
    // 1. Change l'état visuel du bouton
    button.classList.toggle('active');

    // 2. Détermine l'état (Mute = 0, Unmute = 1)
    // La commande OSC /ch/xx/mix/on est un "On/Off", 
    // donc 0 = Mute (Off) et 1 = Unmute (On).
    const isMuted = button.classList.contains('active');
    const state = isMuted ? 0 : 1; // 0 pour Mute, 1 pour Unmute

    // 3. Récupère le canal depuis l'attribut data-channel (ex: "01")
    const channel = button.dataset.channel;

    // 4. Crée un payload JSON *différent* de celui des sliders
    const payload = JSON.stringify({
      mute: `ch${channel}`, // ex: "ch01"
      state: state           // ex: 0
    });

    // 5. Envoie au même WebSocket audio
    sendCommand(wsAudio, payload);

    // 6. Affiche un retour
    showToast(`Canal ${channel} ${isMuted ? 'MUTE' : 'UNMUTE'}`);
  });
});