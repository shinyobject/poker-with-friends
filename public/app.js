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
  const [rank, suit] = parseCard(value);
  const color = suit === "D" || suit === "H" ? "#c21807" : "#111";
  const wrapper = document.createElement("span");
  wrapper.className = "card";
  wrapper.innerHTML = cardSvg(rank, suit, color);
  return wrapper;
}

function parseCard(value) {
  const raw = String(value || "");
  return [raw.slice(0, -1), raw.slice(-1)];
}

function cardSvg(rank, suit, color) {
  const suitSymbol = suitToSymbol(suit);
  const center = centerContent(rank, suitSymbol, color);
  const cornerRank = rank === "T" ? "10" : rank;

  return `
    <svg class="card-face" viewBox="0 0 100 140" role="img" aria-label="${cornerRank} of ${suitName(
      suit
    )}">
      <rect x="1" y="1" width="98" height="138" rx="10" ry="10" fill="#fff" stroke="#dadada" />
      <g fill="${color}" font-family="'Times New Roman', serif" font-weight="700">
        <text x="10" y="20" font-size="18">${cornerRank}</text>
        <text x="10" y="36" font-size="16">${suitSymbol}</text>
        <g transform="translate(100 140) rotate(180)">
          <text x="10" y="20" font-size="18">${cornerRank}</text>
          <text x="10" y="36" font-size="16">${suitSymbol}</text>
        </g>
      </g>
      ${center}
    </svg>
  `;
}

function centerContent(rank, suitSymbol, color) {
  const pipLayouts = {
    A: [[50, 70]],
    "2": [[50, 38], [50, 102]],
    "3": [[50, 30], [50, 70], [50, 110]],
    "4": [[30, 38], [70, 38], [30, 102], [70, 102]],
    "5": [[30, 38], [70, 38], [50, 70], [30, 102], [70, 102]],
    "6": [[30, 30], [70, 30], [30, 70], [70, 70], [30, 110], [70, 110]],
    "7": [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70], [30, 110], [70, 110]],
    "8": [[30, 30], [70, 30], [30, 56], [70, 56], [30, 84], [70, 84], [30, 110], [70, 110]],
    "9": [[30, 30], [70, 30], [30, 56], [70, 56], [50, 70], [30, 84], [70, 84], [30, 110], [70, 110]],
    T: [
      [30, 26],
      [70, 26],
      [30, 48],
      [70, 48],
      [30, 70],
      [70, 70],
      [30, 92],
      [70, 92],
      [30, 114],
      [70, 114]
    ]
  };

  if (rank === "J" || rank === "Q" || rank === "K") {
    return `<g fill="${color}" text-anchor="middle" font-family="'Times New Roman', serif" font-weight="700">
      <text x="50" y="72" font-size="38">${rank}</text>
      <text x="50" y="98" font-size="26">${suitSymbol}</text>
    </g>`;
  }

  const pips = pipLayouts[rank] || pipLayouts.A;
  const size = rank === "A" ? 28 : 22;
  return `<g fill="${color}" text-anchor="middle" font-size="${size}" font-family="'Times New Roman', serif">
    ${pips.map(([x, y]) => `<text x="${x}" y="${y}">${suitSymbol}</text>`).join("")}
  </g>`;
}

function suitToSymbol(suit) {
  return { C: "♣", D: "♦", H: "♥", S: "♠" }[suit] || "?";
}

function suitName(suit) {
  return { C: "clubs", D: "diamonds", H: "hearts", S: "spades" }[suit] || "unknown";
}

function titleCase(v) {
  return String(v || "")
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
