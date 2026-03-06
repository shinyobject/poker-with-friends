const socket = io();

let myId = null;
let roomId = null;
let latestState = null;

const joinPanel = document.getElementById("joinPanel");
const gamePanel = document.getElementById("gamePanel");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const joinButton = document.getElementById("joinButton");
const roomLabel = document.getElementById("roomLabel");
const streetLabel = document.getElementById("streetLabel");
const communityCards = document.getElementById("communityCards");
const potLabel = document.getElementById("potLabel");
const playersList = document.getElementById("playersList");
const myCards = document.getElementById("myCards");
const messages = document.getElementById("messages");
const startHandButton = document.getElementById("startHandButton");
const raiseInput = document.getElementById("raiseInput");

joinButton.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const code = roomInput.value.trim().toUpperCase();

  socket.emit("join-room", { roomId: code, name }, (res) => {
    if (!res?.ok) {
      alert(res?.error || "Failed to join room.");
      return;
    }

    myId = res.playerId;
    roomId = res.roomId;
    roomLabel.textContent = `Room ${roomId}`;
    joinPanel.classList.add("hidden");
    gamePanel.classList.remove("hidden");
    socket.emit("request-state");
  });
});

startHandButton.addEventListener("click", () => {
  socket.emit("start-hand", {}, (res) => {
    if (!res?.ok) alert(res?.error || "Could not start hand.");
  });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.getAttribute("data-action");
    const payload = { action };

    if (action === "raise") {
      payload.raiseAmount = Number(raiseInput.value || "0");
    }

    socket.emit("action", payload, (res) => {
      if (!res?.ok) {
        alert(res?.error || "Action rejected.");
      }
    });
  });
});

socket.on("state", (state) => {
  latestState = state;
  render();
});

function render() {
  if (!latestState) return;

  streetLabel.textContent = `${titleCase(latestState.street)}${
    latestState.currentTurn === myId ? " - Your turn" : ""
  }`;
  potLabel.textContent = String(latestState.pot);

  communityCards.innerHTML = "";
  latestState.community.forEach((card) => {
    communityCards.appendChild(cardEl(card));
  });

  playersList.innerHTML = "";
  latestState.players.forEach((p) => {
    const div = document.createElement("div");
    div.className = "player";
    if (p.id === myId) div.classList.add("you");
    if (p.id === latestState.currentTurn) div.classList.add("turn");
    if (p.folded) div.classList.add("folded");

    const name = p.id === myId ? `${p.name} (You)` : p.name;
    div.innerHTML = `
      <div><strong>${name}</strong> ${p.connected ? "" : "(offline)"}</div>
      <div>Chips: ${p.chips} | Bet: ${p.betThisRound}</div>
      <div>${p.folded ? "Folded" : p.allIn ? "All-in" : "Active"}</div>
    `;

    playersList.appendChild(div);
  });

  const me = latestState.players.find((p) => p.id === myId);
  myCards.innerHTML = "";
  if (me?.hand) {
    me.hand.forEach((card) => myCards.appendChild(cardEl(card)));
  }

  messages.innerHTML = "";
  latestState.messages.forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m;
    messages.appendChild(li);
  });
}

function cardEl(value) {
  const span = document.createElement("span");
  span.className = "card";
  span.textContent = value;
  return span;
}

function titleCase(v) {
  return String(v || "")
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
