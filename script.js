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
      toggleButtons.forEach(btn => {
        if (btn.dataset.group === group) btn.classList.remove("active");
      });
    }
    button.classList.add("active");
    // ⛔️ On ne modifie plus le texte d’état ici :
    // l’état vient désormais de Node-RED via /service
  });
});

// =========================
// WebSocket sliders (X32)
// =========================
const ws = new WebSocket("ws://127.0.0.1:1880/sliders");
ws.onopen  = () => console.log("WebSocket sliders connecté");
ws.onerror = err => console.error("Erreur WebSocket sliders", err);

function sendSliderValue(name, value) {
  let sliderId;
  if (name === "Volume Micro")   sliderId = "fader1";
  if (name === "Enceinte Gauche") sliderId = "fader2";
  if (name === "Enceinte Droite") sliderId = "fader3";
  if (name === "Subwoofer")       sliderId = "fader4";

  const convertedValue = parseFloat(value) / 100; // 0–100 -> 0–1

  ws.send(JSON.stringify({
    slider: sliderId,
    value: convertedValue
  }));
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
// WebSocket /service : heures lampes + état projecteur
// =========================
let lastLampesData = [];
const wsService = new WebSocket("ws://127.0.0.1:1880/service");

wsService.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    // Heures lampes
    if (data.type === "heuresLampes" && Array.isArray(data.lampes)) {
      lastLampesData = data.lampes;
      updateLampesUI();
    }
    // État projecteur
    else if (data.type === "etatProjecteur") {
      const label = document.getElementById("etat-videoproj");
      if (label) label.textContent = data.etat;
    }
    // ➜ Source active (retour RS232)
    else if (data.type === "activeSource") {
      const el = document.getElementById("active-source");
      if (el) el.textContent = `Entrée active : ${data.label}`;
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
/* WebSocket commandes projecteur + RS232 (sources HDMI)
   On réutilise le même WS `/projecteur-control`.
   Node-RED fera le switch entre:
   - "on" / "off"  (PJLink power)
   - "getlamps"    (PJLink lamp hours -> /service)
   - "hdmi1|hdmi2|hdmi3" (RS232 vers switch d’entrées)
*/
// =========================
const wsProjecteur = new WebSocket("ws://127.0.0.1:1880/projecteur-control");

function sendProjectorCommand(cmd) {
  if (wsProjecteur.readyState === WebSocket.OPEN) {
    wsProjecteur.send(cmd);
  } else {
    // En cas de clic très tôt, on attend l'ouverture
    wsProjecteur.addEventListener('open', () => {
      wsProjecteur.send(cmd);
    }, { once: true });
  }
}

// Allumer / Éteindre
document.querySelector('button[data-group="projecteur"][data-etat="on"]')
  .addEventListener("click", () => sendProjectorCommand("on"));

document.querySelector('button[data-group="projecteur"][data-etat="off"]')
  .addEventListener("click", () => sendProjectorCommand("off"));

// ⬇️ ENVOI RS232 POUR LES SOURCES HDMI
document.querySelectorAll('button[data-group="source"]').forEach(btn => {
  btn.addEventListener('click', () => {
    // Convertit "HDMI 1" -> "hdmi1"
    const cmd = btn.textContent.replace(/\s+/g, '').toLowerCase(); // hdmi1/hdmi2/hdmi3
    if (/^hdmi[123]$/.test(cmd)) {
      sendProjectorCommand(cmd);
      showToast(`Source ${cmd.toUpperCase()} envoyée`);
    }
  });
});

// Bouton Service (heures lampes)
document.getElementById("service-btn").addEventListener("click", () => {
  sendProjectorCommand("getlamps");
  document.getElementById("service-modal").classList.remove("hidden");
  updateLampesUI(); // si déjà reçues, on affiche tout de suite
});

document.getElementById("service-close").addEventListener("click", () => {
  document.getElementById("service-modal").classList.add("hidden");
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
  showToast(`Système ${pendingPowerAction === "on" ? "allumé" : "éteint"}`);
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
