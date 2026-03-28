const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 30000,
  pingTimeout: 120000,
  connectTimeout: 60000
});

app.use(express.static(path.join(__dirname, 'public')));

// Game rooms storage
const rooms = {};

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms[code]);
  return code;
}

const INITIAL_BOARD = [
  {w:2,b:0},{w:0,b:0},{w:0,b:0},{w:0,b:0},{w:0,b:0},{w:0,b:5},
  {w:0,b:0},{w:0,b:3},{w:0,b:0},{w:0,b:0},{w:0,b:0},{w:5,b:0},
  {w:0,b:5},{w:0,b:0},{w:0,b:0},{w:0,b:0},{w:3,b:0},{w:0,b:0},
  {w:5,b:0},{w:0,b:0},{w:0,b:0},{w:0,b:0},{w:0,b:0},{w:0,b:2}
];

function createGameState() {
  return {
    board: INITIAL_BOARD.map(p => ({w: p.w, b: p.b})),
    turn: 'w',
    dice: [],
    usedDice: [],
    barWhite: 0,
    barBlack: 0,
    offW: 0,
    offB: 0,
    gameOver: false,
    winner: null
  };
}

// ---- GAME LOGIC ON SERVER ----

function canBearOff(state, color) {
  const bar = color === 'w' ? state.barWhite : state.barBlack;
  if (bar > 0) return false;
  for (let i = 0; i < 24; i++) {
    if (color === 'w' && i < 18 && state.board[i].w > 0) return false;
    if (color === 'b' && i > 5 && state.board[i].b > 0) return false;
  }
  return true;
}

function isHighestInHome(state, idx, color) {
  if (color === 'w') {
    for (let i = 18; i < idx; i++) { if (state.board[i].w > 0) return false; }
    return true;
  } else {
    for (let i = 5; i > idx; i--) { if (state.board[i].b > 0) return false; }
    return true;
  }
}

function getAvailableDice(state) {
  const all = state.dice.slice();
  state.usedDice.forEach(u => {
    const i = all.indexOf(u);
    if (i >= 0) all.splice(i, 1);
  });
  return all;
}

function getValidMoves(state, pointIdx, color) {
  const moves = [];
  const available = getAvailableDice(state);
  const unique = [...new Set(available)];
  const opp = color === 'w' ? 'b' : 'w';
  const dir = color === 'w' ? 1 : -1;
  const bar = color === 'w' ? state.barWhite : state.barBlack;

  if (bar > 0 && pointIdx !== -1) return [];
  if (pointIdx === -1 && bar === 0) return [];

  for (const d of unique) {
    let to;
    if (pointIdx === -1) {
      to = color === 'w' ? d - 1 : 24 - d;
    } else {
      to = pointIdx + d * dir;
    }

    if (to >= 0 && to < 24) {
      if (state.board[to][opp] <= 1) {
        moves.push({ from: pointIdx, to, die: d, hit: state.board[to][opp] === 1 });
      }
    } else if (canBearOff(state, color)) {
      if (color === 'w' && to >= 24) {
        const hp = pointIdx - 18;
        if (d === hp + 1 || (d > hp + 1 && isHighestInHome(state, pointIdx, color))) {
          moves.push({ from: pointIdx, to: 24, die: d, bearoff: true });
        }
      } else if (color === 'b' && to < 0) {
        const hp = 5 - pointIdx;
        if (d === hp + 1 || (d > hp + 1 && isHighestInHome(state, pointIdx, color))) {
          moves.push({ from: pointIdx, to: -1, die: d, bearoff: true });
        }
      }
    }
  }
  return moves;
}

function hasAnyMove(state, color) {
  const bar = color === 'w' ? state.barWhite : state.barBlack;
  if (bar > 0) return getValidMoves(state, -1, color).length > 0;
  for (let i = 0; i < 24; i++) {
    if (state.board[i][color] > 0 && getValidMoves(state, i, color).length > 0) return true;
  }
  return false;
}

function applyMove(state, move, color) {
  const opp = color === 'w' ? 'b' : 'w';

  if (move.from === -1) {
    if (color === 'w') state.barWhite--; else state.barBlack--;
  } else {
    state.board[move.from][color]--;
  }

  if (move.bearoff) {
    if (color === 'w') state.offW++; else state.offB++;
  } else {
    if (move.hit) {
      state.board[move.to][opp]--;
      if (opp === 'w') state.barWhite++; else state.barBlack++;
    }
    state.board[move.to][color]++;
  }

  state.usedDice.push(move.die);

  if (state.offW >= 15) { state.gameOver = true; state.winner = 'w'; }
  if (state.offB >= 15) { state.gameOver = true; state.winner = 'b'; }
}

function isValidMove(state, move, color) {
  const bar = color === 'w' ? state.barWhite : state.barBlack;

  if (bar > 0 && move.from !== -1) return false;

  const validMoves = getValidMoves(state, move.from, color);
  return validMoves.some(m =>
    m.from === move.from && m.to === move.to && m.die === move.die
  );
}

// ---- SOCKET HANDLING ----

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('createRoom', (data) => {
    const code = generateRoomCode();
    rooms[code] = {
      players: [{ id: socket.id, name: data.name, color: 'w' }],
      state: createGameState(),
      moveHistory: []
    };
    socket.join(code);
    socket.roomCode = code;
    socket.playerColor = 'w';
    socket.playerName = data.name;
    socket.emit('roomCreated', { code, color: 'w' });
    console.log(`Room ${code} created by ${data.name}`);
  });

  socket.on('joinRoom', (data) => {
    const room = rooms[data.code];
    if (!room) {
      socket.emit('error', { message: 'Oda bulunamadi!' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Oda dolu!' });
      return;
    }

    room.players.push({ id: socket.id, name: data.name, color: 'b' });
    socket.join(data.code);
    socket.roomCode = data.code;
    socket.playerColor = 'b';
    socket.playerName = data.name;

    const p1 = room.players[0];
    const p2 = room.players[1];

    socket.emit('roomJoined', {
      code: data.code,
      color: 'b',
      opponentName: p1.name
    });

    io.to(p1.id).emit('opponentJoined', { opponentName: p2.name });

    io.to(data.code).emit('gameStart', {
      state: room.state,
      whiteName: p1.name,
      blackName: p2.name
    });

    console.log(`${data.name} joined room ${data.code}`);
  });

  socket.on('rollDice', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.state.gameOver) return;
    if (room.state.turn !== socket.playerColor) return;
    if (room.state.dice.length > 0 && getAvailableDice(room.state).length > 0) return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    room.state.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    room.state.usedDice = [];
    room.moveHistory = [];

    io.to(socket.roomCode).emit('diceRolled', {
      d1, d2,
      roller: socket.playerColor,
      state: room.state
    });

    // Check if player has any moves
    if (!hasAnyMove(room.state, socket.playerColor)) {
      setTimeout(() => {
        io.to(socket.roomCode).emit('noMoves', { player: socket.playerColor });
      }, 500);
    }
  });

  socket.on('makeMove', (data) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state.gameOver) return;
    if (room.state.turn !== socket.playerColor) return;

    const move = data.move;
    if (!isValidMove(room.state, move, socket.playerColor)) {
      socket.emit('invalidMove');
      return;
    }

    // Save state for undo
    room.moveHistory.push({
      boardSnap: room.state.board.map(p => ({w: p.w, b: p.b})),
      barWhite: room.state.barWhite,
      barBlack: room.state.barBlack,
      offW: room.state.offW,
      offB: room.state.offB,
      usedDice: room.state.usedDice.slice()
    });

    applyMove(room.state, move, socket.playerColor);

    io.to(socket.roomCode).emit('moveMade', {
      move,
      player: socket.playerColor,
      state: room.state
    });

    if (room.state.gameOver) {
      io.to(socket.roomCode).emit('gameOver', { winner: room.state.winner });
    }
  });

  socket.on('undoMove', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.state.gameOver) return;
    if (room.state.turn !== socket.playerColor) return;
    if (room.moveHistory.length === 0) return;

    const last = room.moveHistory.pop();
    room.state.board = last.boardSnap;
    room.state.barWhite = last.barWhite;
    room.state.barBlack = last.barBlack;
    room.state.offW = last.offW;
    room.state.offB = last.offB;
    room.state.usedDice = last.usedDice;

    io.to(socket.roomCode).emit('moveUndone', { state: room.state });
  });

  socket.on('endTurn', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.state.gameOver) return;
    if (room.state.turn !== socket.playerColor) return;

    room.state.turn = room.state.turn === 'w' ? 'b' : 'w';
    room.state.dice = [];
    room.state.usedDice = [];
    room.moveHistory = [];

    io.to(socket.roomCode).emit('turnChanged', { state: room.state });
  });

  socket.on('rematch', () => {
    const room = rooms[socket.roomCode];
    if (!room) return;

    room.state = createGameState();
    room.moveHistory = [];

    // Swap colors
    room.players.forEach(p => {
      p.color = p.color === 'w' ? 'b' : 'w';
      const s = io.sockets.sockets.get(p.id);
      if (s) s.playerColor = p.color;
    });

    const wPlayer = room.players.find(p => p.color === 'w');
    const bPlayer = room.players.find(p => p.color === 'b');

    io.to(socket.roomCode).emit('rematchStarted', {
      state: room.state,
      whiteName: wPlayer ? wPlayer.name : '?',
      blackName: bPlayer ? bPlayer.name : '?'
    });

    room.players.forEach(p => {
      const s = io.sockets.sockets.get(p.id);
      if (s) s.emit('colorAssigned', { color: p.color });
    });
  });

  socket.on('rejoinRoom', (data) => {
    const room = rooms[data.code];
    if (!room) {
      socket.emit('error', { message: 'Oda bulunamadi!' });
      return;
    }

    // Find the player slot by name and color
    const playerSlot = room.players.find(p => p.name === data.name && p.color === data.color);
    if (playerSlot) {
      // Clear any pending disconnect timer
      if (playerSlot.disconnectTimer) {
        clearTimeout(playerSlot.disconnectTimer);
        playerSlot.disconnectTimer = null;
      }
      playerSlot.id = socket.id;
      playerSlot.disconnected = false;
      socket.join(data.code);
      socket.roomCode = data.code;
      socket.playerColor = data.color;
      socket.playerName = data.name;

      const wPlayer = room.players.find(p => p.color === 'w');
      const bPlayer = room.players.find(p => p.color === 'b');

      socket.emit('rejoinSuccess', {
        state: room.state,
        color: data.color,
        whiteName: wPlayer ? wPlayer.name : '?',
        blackName: bPlayer ? bPlayer.name : '?'
      });

      // Notify opponent that player is back
      socket.to(data.code).emit('opponentReconnected');
      console.log(`${data.name} rejoined room ${data.code}`);
    } else {
      socket.emit('error', { message: 'Odada yerin bulunamadi!' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    if (socket.roomCode && rooms[socket.roomCode]) {
      const room = rooms[socket.roomCode];
      const player = room.players.find(p => p.id === socket.id);
      
      if (player) {
        player.disconnected = true;
        
        // Notify opponent about temporary disconnect
        socket.to(socket.roomCode).emit('opponentTemporaryDisconnect');

        // Give 2 minutes grace period before removing player
        player.disconnectTimer = setTimeout(() => {
          if (player.disconnected) {
            io.to(socket.roomCode).emit('opponentLeft');
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
              delete rooms[socket.roomCode];
              console.log(`Room ${socket.roomCode} deleted`);
            }
          }
        }, 120000); // 2 minutes
      }
    }
  });
});

// Cleanup old empty rooms every 10 min
setInterval(() => {
  const now = Date.now();
  for (const code in rooms) {
    if (rooms[code].players.length === 0) {
      delete rooms[code];
    }
  }
}, 600000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Tavla server running on port ${PORT}`);
});
