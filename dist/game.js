const SUITS = ["C", "D", "H", "S"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const STARTING_STACK = 1000;
export class GameManager {
    rooms = new Map();
    createRoom(roomId) {
        const room = {
            id: roomId,
            players: new Map(),
            seatOrder: [],
            dealerIndex: -1,
            deck: [],
            community: [],
            pot: 0,
            currentBet: 0,
            street: "waiting",
            currentTurn: null,
            playersToAct: new Set(),
            smallBlind: 10,
            bigBlind: 20,
            messages: []
        };
        this.rooms.set(roomId, room);
        return room;
    }
    getOrCreateRoom(roomId) {
        return this.rooms.get(roomId) ?? this.createRoom(roomId);
    }
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    addPlayer(roomId, id, name) {
        const room = this.getOrCreateRoom(roomId);
        const player = {
            id,
            name: name.trim().slice(0, 20) || `Player-${id.slice(0, 4)}`,
            chips: STARTING_STACK,
            hand: [],
            folded: false,
            allIn: false,
            betThisRound: 0,
            connected: true
        };
        room.players.set(id, player);
        if (!room.seatOrder.includes(id)) {
            room.seatOrder.push(id);
        }
        this.pushMessage(room, `${player.name} joined.`);
        return player;
    }
    markDisconnected(roomId, id) {
        const room = this.rooms.get(roomId);
        if (!room)
            return;
        const player = room.players.get(id);
        if (!player)
            return;
        player.connected = false;
        player.folded = true;
        this.pushMessage(room, `${player.name} disconnected.`);
        if (room.currentTurn === id) {
            this.consumeAction(room, id);
            this.moveToNextTurn(room, id);
        }
    }
    startHand(roomId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return { ok: false, error: "Room not found." };
        const participants = this.activeSeats(room);
        if (participants.length < 2) {
            return { ok: false, error: "Need at least 2 players with chips." };
        }
        room.street = "preflop";
        room.pot = 0;
        room.community = [];
        room.deck = shuffledDeck();
        room.currentBet = 0;
        room.playersToAct.clear();
        for (const player of room.players.values()) {
            player.hand = [];
            player.folded = player.chips <= 0;
            player.allIn = false;
            player.betThisRound = 0;
        }
        room.dealerIndex = this.nextDealerIndex(room, participants);
        for (let i = 0; i < 2; i += 1) {
            for (const playerId of participants) {
                const p = room.players.get(playerId);
                if (!p)
                    continue;
                p.hand.push(room.deck.pop());
            }
        }
        const sbIndex = (room.dealerIndex + 1) % participants.length;
        const bbIndex = (room.dealerIndex + 2) % participants.length;
        const sbPlayer = room.players.get(participants[sbIndex]);
        const bbPlayer = room.players.get(participants[bbIndex]);
        if (!sbPlayer || !bbPlayer) {
            return { ok: false, error: "Failed to assign blinds." };
        }
        this.postBlind(room, sbPlayer, room.smallBlind);
        this.postBlind(room, bbPlayer, room.bigBlind);
        room.currentBet = bbPlayer.betThisRound;
        room.playersToAct = this.defaultPlayersToAct(room);
        const firstToActIndex = (bbIndex + 1) % participants.length;
        room.currentTurn = this.findNextActingPlayer(room, participants[firstToActIndex]);
        this.pushMessage(room, `New hand. Dealer: ${room.players.get(participants[room.dealerIndex])?.name ?? "?"}.`);
        if (!room.currentTurn) {
            this.advanceStreet(room);
        }
        return { ok: true };
    }
    act(roomId, playerId, action, raiseAmount) {
        const room = this.rooms.get(roomId);
        if (!room)
            return { ok: false, error: "Room not found." };
        if (room.street === "waiting" || room.street === "showdown") {
            return { ok: false, error: "No active hand." };
        }
        const player = room.players.get(playerId);
        if (!player)
            return { ok: false, error: "Player not found." };
        if (room.currentTurn !== playerId)
            return { ok: false, error: "Not your turn." };
        if (player.folded || player.allIn)
            return { ok: false, error: "You cannot act." };
        const toCall = Math.max(0, room.currentBet - player.betThisRound);
        if (action === "fold") {
            player.folded = true;
            this.pushMessage(room, `${player.name} folds.`);
        }
        if (action === "check") {
            if (toCall > 0)
                return { ok: false, error: "Cannot check when facing a bet." };
            this.pushMessage(room, `${player.name} checks.`);
        }
        if (action === "call") {
            if (toCall === 0) {
                this.pushMessage(room, `${player.name} checks.`);
            }
            else {
                const paid = this.takeChips(player, toCall);
                player.betThisRound += paid;
                room.pot += paid;
                if (player.chips === 0)
                    player.allIn = true;
                this.pushMessage(room, `${player.name} calls ${paid}.`);
            }
        }
        if (action === "raise") {
            if (!raiseAmount || raiseAmount <= 0) {
                return { ok: false, error: "Raise must be positive." };
            }
            const minRaise = room.bigBlind;
            if (raiseAmount < minRaise) {
                return { ok: false, error: `Minimum raise is ${minRaise}.` };
            }
            const totalNeeded = toCall + raiseAmount;
            if (player.chips < totalNeeded) {
                return { ok: false, error: "Not enough chips for that raise." };
            }
            const paid = this.takeChips(player, totalNeeded);
            player.betThisRound += paid;
            room.pot += paid;
            room.currentBet = player.betThisRound;
            this.pushMessage(room, `${player.name} raises ${raiseAmount}.`);
            room.playersToAct = this.defaultPlayersToAct(room, player.id);
        }
        this.consumeAction(room, playerId);
        const livePlayers = this.livePlayers(room);
        if (livePlayers.length === 1) {
            const winner = livePlayers[0];
            winner.chips += room.pot;
            this.pushMessage(room, `${winner.name} wins ${room.pot} (everyone else folded).`);
            room.pot = 0;
            room.street = "showdown";
            room.currentTurn = null;
            room.playersToAct.clear();
            return { ok: true };
        }
        if (room.playersToAct.size === 0) {
            this.advanceStreet(room);
            return { ok: true };
        }
        this.moveToNextTurn(room, playerId);
        return { ok: true };
    }
    publicState(roomId, viewerId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return null;
        return {
            roomId,
            street: room.street,
            pot: room.pot,
            currentBet: room.currentBet,
            currentTurn: room.currentTurn,
            community: room.community,
            players: room.seatOrder
                .map((id) => room.players.get(id))
                .filter((p) => Boolean(p))
                .map((p) => ({
                id: p.id,
                name: p.name,
                chips: p.chips,
                folded: p.folded,
                allIn: p.allIn,
                betThisRound: p.betThisRound,
                connected: p.connected,
                hand: room.street === "showdown" || p.id === viewerId
                    ? p.hand
                    : p.hand.length
                        ? ["??", "??"]
                        : []
            })),
            messages: room.messages.slice(-12)
        };
    }
    advanceStreet(room) {
        const streets = ["preflop", "flop", "turn", "river", "showdown"];
        const index = streets.indexOf(room.street);
        const next = streets[index + 1] ?? "showdown";
        if (next === "flop") {
            room.deck.pop();
            room.community.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
            room.street = "flop";
            this.pushMessage(room, "Flop dealt.");
            this.beginBettingRound(room);
            return;
        }
        if (next === "turn") {
            room.deck.pop();
            room.community.push(room.deck.pop());
            room.street = "turn";
            this.pushMessage(room, "Turn dealt.");
            this.beginBettingRound(room);
            return;
        }
        if (next === "river") {
            room.deck.pop();
            room.community.push(room.deck.pop());
            room.street = "river";
            this.pushMessage(room, "River dealt.");
            this.beginBettingRound(room);
            return;
        }
        room.street = "showdown";
        room.currentTurn = null;
        room.playersToAct.clear();
        const result = this.resolveShowdown(room);
        if (result.winners.length === 0) {
            this.pushMessage(room, "No winner could be determined.");
            return;
        }
        const share = Math.floor(room.pot / result.winners.length);
        for (const winnerId of result.winners) {
            const winner = room.players.get(winnerId);
            if (winner) {
                winner.chips += share;
            }
        }
        const paid = share * result.winners.length;
        const remainder = room.pot - paid;
        if (remainder > 0) {
            const firstWinner = room.players.get(result.winners[0]);
            if (firstWinner)
                firstWinner.chips += remainder;
        }
        const winnerNames = result.winners
            .map((id) => room.players.get(id)?.name)
            .filter((n) => Boolean(n));
        this.pushMessage(room, `${winnerNames.join(", ")} win ${room.pot} with ${result.handName}.`);
        room.pot = 0;
    }
    beginBettingRound(room) {
        room.currentBet = 0;
        for (const p of room.players.values()) {
            p.betThisRound = 0;
        }
        room.playersToAct = this.defaultPlayersToAct(room);
        const participants = this.activeSeats(room);
        if (participants.length < 2) {
            room.currentTurn = null;
            return;
        }
        const firstToActId = participants[(room.dealerIndex + 1) % participants.length];
        room.currentTurn = this.findNextActingPlayer(room, firstToActId);
        if (!room.currentTurn) {
            this.advanceStreet(room);
        }
    }
    resolveShowdown(room) {
        const contenders = this.livePlayers(room);
        if (contenders.length === 0) {
            return { winners: [], handName: "N/A" };
        }
        let best = null;
        let winners = [];
        let handName = "high card";
        for (const player of contenders) {
            const ranked = evaluateSeven([...player.hand, ...room.community]);
            if (!best || compareRank(ranked.rank, best) > 0) {
                best = ranked.rank;
                winners = [player.id];
                handName = ranked.name;
            }
            else if (compareRank(ranked.rank, best) === 0) {
                winners.push(player.id);
            }
        }
        return { winners, handName };
    }
    defaultPlayersToAct(room, exceptId) {
        const set = new Set();
        for (const player of room.players.values()) {
            if (player.folded || player.allIn || !player.connected)
                continue;
            if (exceptId && player.id === exceptId)
                continue;
            set.add(player.id);
        }
        return set;
    }
    findNextActingPlayer(room, fromId) {
        if (room.playersToAct.size === 0)
            return null;
        const seats = this.activeSeats(room);
        if (seats.length === 0)
            return null;
        let startIndex = seats.indexOf(fromId);
        if (startIndex < 0)
            startIndex = 0;
        for (let offset = 0; offset < seats.length; offset += 1) {
            const id = seats[(startIndex + offset) % seats.length];
            if (room.playersToAct.has(id))
                return id;
        }
        return null;
    }
    moveToNextTurn(room, lastActorId) {
        room.currentTurn = this.findNextActingPlayer(room, lastActorId);
    }
    consumeAction(room, playerId) {
        room.playersToAct.delete(playerId);
    }
    postBlind(room, player, amount) {
        const paid = this.takeChips(player, amount);
        player.betThisRound += paid;
        room.pot += paid;
        if (player.chips === 0)
            player.allIn = true;
        this.pushMessage(room, `${player.name} posts blind ${paid}.`);
    }
    takeChips(player, amount) {
        const paid = Math.min(amount, player.chips);
        player.chips -= paid;
        return paid;
    }
    livePlayers(room) {
        return [...room.players.values()].filter((p) => !p.folded && p.connected && p.hand.length === 2);
    }
    activeSeats(room) {
        return room.seatOrder.filter((id) => {
            const p = room.players.get(id);
            return Boolean(p && p.connected && p.chips > 0);
        });
    }
    nextDealerIndex(room, participants) {
        if (room.dealerIndex < 0)
            return 0;
        const currentDealerId = participants[room.dealerIndex % participants.length];
        const i = participants.indexOf(currentDealerId);
        if (i < 0)
            return 0;
        return (i + 1) % participants.length;
    }
    pushMessage(room, message) {
        room.messages.push(message);
        if (room.messages.length > 30) {
            room.messages = room.messages.slice(-30);
        }
    }
}
function shuffledDeck() {
    const deck = [];
    for (const r of RANKS) {
        for (const s of SUITS) {
            deck.push(`${r}${s}`);
        }
    }
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
function rankValue(rank) {
    return RANKS.indexOf(rank) + 2;
}
function evaluateSeven(cards) {
    const combos = combinations(cards, 5);
    let bestRank = null;
    let bestName = "high card";
    for (const combo of combos) {
        const current = evaluateFive(combo);
        if (!bestRank || compareRank(current.rank, bestRank) > 0) {
            bestRank = current.rank;
            bestName = current.name;
        }
    }
    return { rank: bestRank ?? [0], name: bestName };
}
function evaluateFive(cards) {
    const ranks = cards.map((c) => c[0]).map(rankValue).sort((a, b) => b - a);
    const suits = cards.map((c) => c[1]);
    const flush = suits.every((s) => s === suits[0]);
    const counts = new Map();
    for (const r of ranks)
        counts.set(r, (counts.get(r) ?? 0) + 1);
    const groups = [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1])
            return b[1] - a[1];
        return b[0] - a[0];
    });
    const straightHigh = detectStraight(ranks);
    if (flush && straightHigh > 0) {
        return { rank: [8, straightHigh], name: "straight flush" };
    }
    if (groups[0][1] === 4) {
        return { rank: [7, groups[0][0], groups[1][0]], name: "four of a kind" };
    }
    if (groups[0][1] === 3 && groups[1][1] === 2) {
        return { rank: [6, groups[0][0], groups[1][0]], name: "full house" };
    }
    if (flush) {
        return { rank: [5, ...ranks], name: "flush" };
    }
    if (straightHigh > 0) {
        return { rank: [4, straightHigh], name: "straight" };
    }
    if (groups[0][1] === 3) {
        const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
        return { rank: [3, groups[0][0], ...kickers], name: "three of a kind" };
    }
    if (groups[0][1] === 2 && groups[1][1] === 2) {
        const highPair = Math.max(groups[0][0], groups[1][0]);
        const lowPair = Math.min(groups[0][0], groups[1][0]);
        const kicker = groups[2][0];
        return { rank: [2, highPair, lowPair, kicker], name: "two pair" };
    }
    if (groups[0][1] === 2) {
        const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
        return { rank: [1, groups[0][0], ...kickers], name: "one pair" };
    }
    return { rank: [0, ...ranks], name: "high card" };
}
function detectStraight(sortedDescRanks) {
    const unique = [...new Set(sortedDescRanks)].sort((a, b) => b - a);
    if (unique.includes(14))
        unique.push(1);
    let streak = 1;
    for (let i = 1; i < unique.length; i += 1) {
        if (unique[i - 1] - 1 === unique[i]) {
            streak += 1;
            if (streak >= 5) {
                return unique[i - 4];
            }
        }
        else {
            streak = 1;
        }
    }
    return 0;
}
function combinations(arr, k) {
    const result = [];
    const path = [];
    const dfs = (start) => {
        if (path.length === k) {
            result.push([...path]);
            return;
        }
        for (let i = start; i < arr.length; i += 1) {
            path.push(arr[i]);
            dfs(i + 1);
            path.pop();
        }
    };
    dfs(0);
    return result;
}
function compareRank(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
        const left = a[i] ?? 0;
        const right = b[i] ?? 0;
        if (left > right)
            return 1;
        if (left < right)
            return -1;
    }
    return 0;
}
