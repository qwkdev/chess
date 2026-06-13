const defaults = {
	end: true,
	onmove: null,
	color: null,
	ready: true
};
function cfg() {
	return { ...defaults, ...(window.chess || {})};
}

async function wait(ms) {
	return new Promise(r => setTimeout(r, ms));
}

// TODO: Click on algebraic
// TODO: Save game state
// TODO: Fix inbetween desktop/mobile
// TODO: Unify as one qChess API (for analysis, online, fairy, etc)

const boardEl = document.getElementById('board');
let state = {
	end: null,
	turn: 'w',
	halfmoves: 0,
	fmr: 0,
	selected: null,
	castling: {
		w: {
			k: true,
			q: true
		},
		b: {
			k: true,
			q: true
		}
	},
	enpassant: null,
	history: {
		square: [],
		piece: [],
		state: []
	}
};
let defaultStateJSON = JSON.stringify(state);
let gameBoard = [
	['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
	['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
	['',  '',  '',  '',  '',  '',  '',  ''],
	['',  '',  '',  '',  '',  '',  '',  ''],
	['',  '',  '',  '',  '',  '',  '',  ''],
	['',  '',  '',  '',  '',  '',  '',  ''],
	['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
	['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];
let tempStatePos = null;

function clearPieces() {
	document.querySelectorAll('.piece').forEach(p => p.remove());
}
function clearSquares() {
	document.querySelectorAll('#squares div').forEach(s => s.classList = '');
	// document.querySelectorAll('.piece').forEach(s => s.classList = 'piece');
}

function loadBoard(board=gameBoard) {
	clearPieces();
	clearSquares();
	board.forEach((rank, r) => {
		rank.forEach((cell, f) => {
			if (cell === '') return;

			const piece = document.createElement('div');
			piece.classList.add('piece');
			piece.style.setProperty('--f', f + 1);
			piece.style.setProperty('--r', 8 - r);

			const wrapper = document.createElement('div')
			wrapper.classList.add('piece2');

			const img = document.createElement('img');
			img.src = `/img/150/${cell === cell.toLowerCase() ? 'b' : 'w'}${cell.toLowerCase()}.png`;
			wrapper.appendChild(img);

			piece.appendChild(wrapper);
			boardEl.appendChild(piece);
		});
	});
}

function loadFEN(fen, includeState=true) {
	gameBoard = Array.from({ length: 8 }, () => Array(8).fill(''));

	const pieces = fen.split(' ');
	pieces[0].split('/').forEach((l, n) => {
		let row = [];
		Array.from(l).forEach(c => {
			if ('pnbrqkPNBRQK'.includes(c)) row.push(c)
			else row.push(...Array(Number(c)).fill(''));
		});
		gameBoard[n] = row.slice(0, 8);
	});

	if (includeState) {
		state.end = null;
		state.turn = pieces[1];
		state.halfmoves = Number(pieces[5])*2 - (state.turn === 'w' ? 2 : 1);
		state.fmr = Number(pieces[4]);
		state.selected = null;

		state.castling.w.k = pieces[2].includes('K');
		state.castling.w.q = pieces[2].includes('Q');
		state.castling.b.k = pieces[2].includes('k');
		state.castling.b.q = pieces[2].includes('q');
		state.enpassant = pieces[3] === '-' ? null : {
			color: state.turn,
			...getNameSquare(pieces[3])
		};
		
		state.history = {
			square: [],
			piece: [],
			state: []
		};

		moveLists.forEach(ele => {
			ele.innerHTML = '';
		})
	}
}
function getFEN(includeState=true, board=gameBoard) {
	let fen = [[]];
	board.forEach(r => {
		let temp = [];
		r.forEach(p => {
			if (p === '') {
				if (typeof temp.at(-1) !== 'number') temp.push(1)
				else temp[temp.length - 1]++;
			} else temp.push(p);
		});
		fen[0].push(temp.map(String).join(''));
	});
	fen[0] = fen[0].join('/');

	if (includeState) {
		fen.push(state.turn);

		let castling = '';
		if (state.castling.w.k) castling += 'K';
		if (state.castling.w.q) castling += 'Q';
		if (state.castling.b.k) castling += 'k';
		if (state.castling.b.q) castling += 'q';
		fen.push(castling || '-');

		fen.push(state.enpassant === null ? '-' : getSquareName(state.enpassant.f, state.enpassant.r));
		fen.push(String(state.fmr));

		fen.push(String(Math.floor(
			(state.halfmoves + (state.turn === 'w' ? 2 : 1)) / 2
		)));
	}

	return fen.join(' ');
}
function encodeRepitionInfo(s=state) {
	let fen = [];
	fen.push(s.turn);

	let castling = '';
	if (s.castling.w.k) castling += 'K';
	if (s.castling.w.q) castling += 'Q';
	if (s.castling.b.k) castling += 'k';
	if (s.castling.b.q) castling += 'q';
	fen.push(castling || '-');

	fen.push(s.enpassant === null ? '-' : getSquareName(s.enpassant.f, s.enpassant.r));
	return fen.join(' ');
}

const moveHistoryButtons = [
	document.getElementById('mh-start'),
	document.getElementById('mh-prev'),
	document.getElementById('mh-next'),
	document.getElementById('mh-end'),
	document.getElementById('dh-start'),
	document.getElementById('dh-prev'),
	document.getElementById('dh-next'),
	document.getElementById('dh-end')
];
function syncTempState(buttonsOnly=false, sound=false) {
	if (tempStatePos >= state.history.state.length - 1) tempStatePos = null;
	if (tempStatePos < -1) {
		tempStatePos = -1;
		sound = false;
	}

	if (state.history.state.length === 0) {
		moveHistoryButtons.forEach(b => b?.classList.add('dim'));
		return;
	}

	moveHistoryButtons.forEach(b => b?.classList.remove('dim'));
	if (tempStatePos === null) {
		[2, 3, 6, 7].forEach(n => moveHistoryButtons[n]?.classList.add('dim'));
	} else if (tempStatePos === -1) {
		[0, 1, 4, 5].forEach(n => moveHistoryButtons[n]?.classList.add('dim'));
	}

	if (sound) {
		if (tempStatePos === -1) playSound('move');
		else playMoveSound(state.history.piece.at(tempStatePos ?? -1));
	}

	moveLists.forEach(ele => {
		const oldActive = ele.querySelector('p[data-active]');
		if (tempStatePos === -1) {
			oldActive?.removeAttribute('data-active');
			return;
		}
		const newActive = Array.from(ele.querySelectorAll('p')).filter((e, i) => i%3 !== 0).at(tempStatePos ?? -1);
		if (newActive !== oldActive) {
			oldActive?.removeAttribute('data-active');
			newActive.dataset.active = '';
		}
	});
	moveLists[1].scrollTo({
		top: moveLists[1].scrollHeight,
		behavior: 'smooth'
	});

	if (buttonsOnly) return;

	let tempState;
	if (tempStatePos === -1) {
		tempState = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', JSON.parse(defaultStateJSON)];
	} else {
		tempState = state.history.state.at(tempStatePos ?? -1);
	}

	loadFEN(tempState[0], false);
	state = {...tempState[1], history: state.history};

	loadBoard();
}

function moveHistory(delta) {
	let sound = true;

	if (delta === 'next' || delta === 'end') {
		if (tempStatePos === null) return;
		if (delta === 'next') tempStatePos++;
		if (delta === 'end') tempStatePos = null;
	}
	if (delta === 'prev') tempStatePos = tempStatePos === null ? state.history.state.length - 2 : tempStatePos - 1;
	if (delta === 'start') {
		if (tempStatePos === -1) sound = false;
		tempStatePos = -1;
	}
	syncTempState(false, sound);
}

function getSquareColor(f, r) {
	return (r - (f % 2)) % 2 == 0;
}
function getSquareName(f, r) {
	return 'abcdefgh'[f-1] + String(r);
}
function getNameSquare(s) {
	return { f: 'abcdefgh'.indexOf(s[0])+1, r: Number(s[1])};
}

function getColor(piece) {
	if (!piece) return null;
	return piece !== piece.toLowerCase() ? 'w' : 'b';
}

function getBoard(f, r, board=gameBoard) {
	if (f < 1 || f > 8 || r < 1 || r > 8) return null;
	return board[8 - r][f - 1];
}
function getRank(r, board=gameBoard) {
	if (r < 1 || r > 8) return null;
	return board[8 - r];
}

function getAllIndexes(arr, val) {
	var indexes = [], i;
	for(i = 0; i < arr.length; i++)
		if (arr[i] === val)
			indexes.push(i);
	return indexes;
}

function searchBoard(board, piece, one=false) {
	let indexes = [];
	for (let r = 0; r < 8; r++) {
		const rank = board[r];
		for (let f = 0; f < 8; f++) {
			if (rank[f] === piece) {
				if (one) return [f+1, 8-r];
				indexes.push([f+1, 8-r]);
			}
		}
	}
	return null;
}

function getPos(ele) {
	if (ele.id.startsWith('square-')) {
		const [f, r] = ele.id.slice(7).split('').map(Number);
		return { f, r };
	}

	const f = parseInt(getComputedStyle(ele).getPropertyValue('--f'));
	const r = parseInt(getComputedStyle(ele).getPropertyValue('--r'));
	
	return { f, r };
}
function getSquare(f, r) {
	return document.getElementById(`square-${f}${r}`);
}
function getPiece(f, r) {
	return document.querySelector(`.piece[style*="--f: ${f}"][style*="--r: ${r}"]`);
}

let audioContext;
document.addEventListener('click', async () => {
	audioContext = new AudioContext();
	await audioContext.resume();
	await loadAudios();
}, { once: true });

const audioArray = ['capture', 'castle', 'check', 'end', 'illegal', 'move', 'move2', 'promote', 'start'];
let audios = {};

async function loadAudios() {
	for (const name of audioArray) {
		const resp = await fetch(`audio/${name}.webm`);
		audios[name] = await audioContext.decodeAudioData(await resp.arrayBuffer());
	}
}
async function playSound(name) {
	if (!audios[name] || !audioContext) return;

	const src = audioContext.createBufferSource();
	src.buffer = audios[name];

	src.connect(audioContext.destination);
	src.start(0);
}
function playMoveSound(algebraic) {
	let sound;
	if (algebraic[5]) sound = 'check';
	else if (algebraic[0] === 'O-O' || algebraic[0] === 'O-O-O') sound = 'castle';
	else if (algebraic[4]) sound = 'promote';
	else if (algebraic[2]) sound = 'capture';
	else sound = state.turn === 'w' ? 'move' : 'move2';

	if (sound) playSound(sound);
}

const winConditions = [
	['w', 'Checkmate'],
	['b', 'Checkmate'],
	['w', 'Resignation'],
	['b', 'Resignation'],
	['w', 'Timeout'],
	['b', 'Timeout'],
	[null, 'Stalemate'],
	[null, 'Insufficient Material'],
	[null, '50 Move Rule'],
	[null, 'Repetition'],
	[null, 'Agreement']
]

const resultCondition = document.getElementById('condition');
const results = {
	wrapper: document.getElementById('result-wrapper'),
	winner: resultCondition.querySelector('h1'),
	reason: resultCondition.querySelector('h2')
}

function endGame(code) {
	if (state.end !== null) return;
	state.end = code;
}
async function checkGameEnded() {
	if (state.end === null || !cfg().end) return;
	const [winner, reason] = winConditions[state.end];
	results.winner.innerText = winner ? (winner === 'w' ? 'White' : 'Black') + ' Wins' : 'Draw';
	results.reason.innerText = 'By ' + reason;
	results.wrapper.hidden = false;

	await wait(200);
	playSound('end');
}

const moveDeltas = {
	n: [
		[2, 1], [2, -1],
		[-2, 1], [-2, -1],
		[1, 2], [1, -2],
		[-1, 2], [-1, -2]
	],
	b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
	r: [[0, 1], [0, -1], [1, 0], [-1, 0]],
	q: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
	k: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]
}

function checkCheck(board, color) {
	const st = performance.now();
	const kingPos = searchBoard(board, color === 'w' ? 'K' : 'k', true);
	for (const pType of ['b', 'r']) {
		for (const [df, dr] of moveDeltas[pType]) {
			for (let i = 1; i < 8; i++) {
				const potential = getBoard(kingPos[0] + df * i, kingPos[1] + dr * i, board);
				if (potential === null) break;
				if (potential !== '') {
					if (
						color !== getColor(potential) &&
						(potential.toLowerCase() === pType ||
						potential.toLowerCase() === 'q')
					) return true;
					break;
				}
			}
		}
	}
	for (const pType of ['n', 'k']) {
		for (const [df, dr] of moveDeltas[pType]) {
			const potential = getBoard(kingPos[0] + df, kingPos[1] + dr, board);
			if (
				potential &&
				potential !== '' &&
				potential.toLowerCase() === pType &&
				color !== getColor(potential)
			) return true;
		}
	}
	for (const [df, dr] of [
		[1, color === 'w' ? 1 : -1],
		[-1, color === 'w' ? 1 : -1]
	]) {
		const potential = getBoard(kingPos[0] + df, kingPos[1] + dr, board);
		if (
			potential &&
			potential !== '' &&
			potential.toLowerCase() === 'p' &&
			color !== getColor(potential)
		) return true;
	}

	return false;
}

async function checkLegal(color, board=gameBoard) {
	for (let r = 0; r < 8; r++) {
		const rank = board[r];
		for (let f = 0; f < 8; f++) {
			const piece = board[r][f];
			if (getColor(piece) !== color) continue;

			const legal = await getLegalMoves({ f: f+1, r: 8-r }, false, true);

			if (legal) return true;
		}
	}

	return false;
}

function checkInsufficient(end=true, board=gameBoard) {
	let found = {
		w: [],
		b: []
	};
	for (let r = 0; r < 8; r++) {
		const rank = board[r];
		for (let f = 0; f < 8; f++) {
			const piece = board[r][f];
			if (!piece) continue;

			const pType = piece.toLowerCase();
			const color = getColor(piece);

			if (['p', 'r', 'q'].includes(pType)) {
				return true;
			}

			found[color].push(pType === 'b' ? (getSquareColor(8-f, r+1) ? 'B' : 'b') : pType);

			if (found.w.length + found.b.length >= 4) {
				const combined = [...found.w, ...found.b].filter(e => e !== 'k');
				if (combined.length >= 0) {
					const first = combined[0];
					if (
						!combined.every(e => e === first) ||
						(first === 'n' && (found.w.length > 1 && found.b.length > 1))
					) return true;
				}
			}
		}
	}

	if (end) endGame(7);
	return false;
}

const moveLists = [
	document.getElementById('mobile-moves'),
	document.getElementById('desktop-moves')
];
function logMove(from, to, algebraic=null, promoteTo=null) {
	let buttonsOnly = true;
	if (tempStatePos !== null) {
		for (const t in state.history) {
			state.history[t] = state.history[t].slice(0, tempStatePos+1)
		}
		moveLists.forEach(ele => {
			ele.innerHTML = state.history.piece.flatMap(
				(m, i) => i % 2 === 0 ? [`${Math.floor(i/2) + 1}.`, m.join('')] : [m.join('')]
			).map(e => `<p>${e}</p>`).join('');
		});
		moveLists[1].scrollTo({
			top: moveLists[1].scrollHeight,
			behavior: 'smooth'
		});
		tempStatePos = null;
		buttonsOnly = false;
	}

	state.history.square.push([[from.f, from.r], [to.f, to.r]]);
	state.history.piece.push(algebraic);

	const current = getFEN(false);
	state.history.state.push([current, null]);

	const checktfr = current + encodeRepitionInfo();
	let count = 0;
	for (let i=3; i < state.fmr; i+=2) {
		const pos = state.history.state.at(-i);
		if (pos[0] + encodeRepitionInfo(pos[1]) === checktfr) count++;
		if (count >= 2) {
			endGame(9);
			break;
		}
	}

	state.halfmoves++;
	state.turn = state.turn === 'w' ? 'b' : 'w';

	const { history, ...s } = state;
	state.history.state[state.history.state.length - 1][1] = JSON.parse(JSON.stringify(s));

	if (algebraic) {
		moveLists.forEach(ele => {
			if (state.turn === 'b') {
				const moveNumEle = document.createElement('p');
				moveNumEle.innerText = `${Math.floor(state.halfmoves / 2) + 1}.`;
				ele.appendChild(moveNumEle);
			}
			const moveEle = document.createElement('p');
			moveEle.innerText = algebraic.join('');
			ele.appendChild(moveEle);
		});
		moveLists[1].scrollTo({
			top: moveLists[1].scrollHeight,
			behavior: 'smooth'
		});
	}

	syncTempState(buttonsOnly);
	if (cfg().onmove !== null) cfg().onmove(from, to, promoteTo);
}

function simpleMove(from, to) {
	const piece = getBoard(from.f, from.r);
	gameBoard[8 - to.r][to.f - 1] = piece;
	gameBoard[8 - from.r][from.f - 1] = '';

	return getPiece(from.f, from.r);
}

async function animate(ele, num) {
	ele.classList.add(`anim${num}`);
	await wait(1000);
	ele.classList.remove(`anim${num}`);
}

async function showSimpleMove(piece, to) {
	piece.style.setProperty('--f', to.f);
	piece.style.setProperty('--r', to.r);
	if (state.end !== null) await animate(piece, 1);
}
async function showSimpleRemove(piece) {
	if (state.end !== null) await wait(600);
	piece.remove();
}

// 0piece|castle 1disambiguate? 2capture? 3to_square 4promote? 5check(mate)?
async function makeMove(from, to, sim=false, skip=false, autoPromote=null) {
	let moves = [];
	let queue = [];

	let algebraic = ['', '', '', '', '', ''];
	let algebraicDone = false;

	const piece = getBoard(from.f, from.r);
	let capture = getBoard(to.f, to.r);

	const pType = piece.toLowerCase();
	const color = getColor(piece);

	let defaultMove = true;
	let defaultCapture = true;

	const castlingRank = color === 'w' ? 1 : 8;
	if (
		pType === 'k' &&
		from.f === 5 &&
		from.r === castlingRank &&
		to.r === castlingRank &&
		(to.f === 3 || to.f === 7)
	) {
		if (!sim) queue.push([simpleMove(from, to), to]);
		moves.push([from, to]);

		const rookMoves = {
			7: [{ f: 8, r: castlingRank }, { f: 6, r: castlingRank }],
			3: [{ f: 1, r: castlingRank }, { f: 4, r: castlingRank }]
		};

		const [rookFrom, rookTo] = rookMoves[to.f];
		if (!sim) queue.push([simpleMove(rookFrom, rookTo), rookTo]);
		moves.push([rookFrom, rookTo]);
		defaultMove = false;

		algebraic[0] = to.f === 7 ? 'O-O' : 'O-O-O';
		algebraicDone = true;
	}

	let promoteTo = null;
	if (!sim && pType === 'p' && to.r === (color === 'w' ? 8 : 1)) {
		const resp = await promote(color, from, to, autoPromote);
		if (!resp[1]) return [false, null];

		defaultMove = false;
		defaultCapture = false;
		capture = resp[3];

		promoteTo = resp[2].toLowerCase();

		if (!algebraicDone) algebraic[4] = '='+resp[2].toUpperCase();

		queue.push(...resp[0]);
	}

	if (!sim && defaultCapture && capture) {
		queue.push([getPiece(to.f, to.r), null]);
	}

	if (
		!sim &&
		state.enpassant &&
		pType === 'p' &&
		color === state.enpassant.color &&
		to.f === state.enpassant.f &&
		to.r === state.enpassant.r
	) {
		capture = getBoard(to.f, to.r + (color === 'w' ? -1 : 1));
		queue.push([getPiece(to.f, to.r + (color === 'w' ? -1 : 1)), null]);
		gameBoard[8 - (to.r + (color === 'w' ? -1 : 1))][to.f - 1] = '';
	}

	if (defaultMove) {
		if (!sim) queue.push([simpleMove(from, to), to]);
		moves.push([from, to]);
	}

	if (sim) {
		let simBoard = gameBoard.map(r => [...r]);
		moves.forEach(m => {
			simBoard[8 - m[1].r][m[1].f - 1] = simBoard[8 - m[0].r][m[0].f - 1];
			simBoard[8 - m[0].r][m[0].f - 1] = '';
		});
		return simBoard;
	}

	if (pType === 'k') {
		state.castling[color] = { k: false, q: false };
	} else if (pType === 'r' && from.r === castlingRank) {
		if (from.f === 1) state.castling[color].q = false;
		else if (from.f === 8) state.castling[color].k = false;
	}

	const opponentColor = color === 'w' ? 'b' : 'w';
	if (capture.toLowerCase() === 'r' && to.r === (color === 'b' ? 1 : 8)) {
		if (to.f === 1) state.castling[opponentColor].q = false;
		else if (to.f === 8) state.castling[opponentColor].k = false;
	}

	if (pType === 'p' && from.r === (color === 'w' ? 2 : 7) && to.r === (color === 'w' ? 4 : 5)) {
		state.enpassant = { color: opponentColor, f: to.f, r: to.r + (color === 'w' ? -1 : 1) };
	} else state.enpassant = null;

	const inCheck = checkCheck(gameBoard, opponentColor);
	if (inCheck) algebraic[5] = '+';

	const legal = await checkLegal(opponentColor);
	if (!legal) {
		if (inCheck) {
			endGame(color === 'w' ? 0 : 1);
			algebraic[5] = '#';
		} else endGame(6);
	}

	if (pType === 'p' || capture) state.fmr = 0;
	else state.fmr++;

	if (state.fmr >= 100) endGame(8);
	checkInsufficient();

	if (!algebraicDone) {
		if (pType !== 'p') algebraic[0] = piece.toUpperCase();
		if (capture) algebraic[2] = 'x';

		algebraic[3] = getSquareName(to.f, to.r);

		if (pType === 'p' && capture) algebraic[1] = getSquareName(from.f, from.r)[0];
		if (['n', 'b', 'r', 'q'].includes(pType)) {
			let deambiguate = { f: false, r: false };
			for (const [df, dr] of moveDeltas[pType]) {
				for (let i = 1; i < (pType === 'n' ? 2 : 8); i++) {
					const [potentialF, potentialR] = [to.f + df * i, to.r + dr * i]
					const potential = getBoard(potentialF, potentialR);
					if (potential === null) break;
					if (potential !== '') {
						if (
							color === getColor(potential) &&
							potential.toLowerCase() === pType
						) {
							if (potentialF === from.f) deambiguate.r = true;
							if (potentialR === from.r) deambiguate.f = true;
						}
						break;
					}
				}
			}

			const fromName = getSquareName(from.f, from.r);
			algebraic[1] = (deambiguate.f ? fromName[0] : '') + (deambiguate.r ? fromName[1] : '');
		}
	}

	logMove(from, to, algebraic, promoteTo);

	if (!skip) {
		for (const [e, to] of queue) {
			if (to === null) showSimpleRemove(e);
			else await showSimpleMove(e, to);
		}

		playMoveSound(algebraic);
		await checkGameEnded();
	}

	return [true, capture ? capture : null];
}

async function canCastleThrough(color, f, r, checkEmpty=true) {
	if (checkEmpty && getBoard(f, r) !== '') return false;

	const king = color === 'w' ? 'K' : 'k';
	const simBoard = gameBoard.map(r => r.map(p => p === king ? '' : p));
	simBoard[8 - r][f - 1] = king;

	return !(await checkCheck(simBoard, color));
}

async function validMove(pos, move, color) {
	const simBoard = await makeMove(pos, move, true);
	const inCheck = checkCheck(simBoard, color);
	return !inCheck;
}

async function getLegalMoves(pos, forceTurn=true, exists=false) {
	const piece = getBoard(pos.f, pos.r);
	if (piece === '') return [];
	const pType = piece.toLowerCase();
	const color = getColor(piece);

	if (
		forceTurn && (
		!cfg().ready ||
		color !== (cfg().color ?? state.turn)
	)) return exists ? false : [];

	let moves = [];
	if (pType === 'p') {
		const dir = color === 'w' ? 1 : -1;
		if (getBoard(pos.f, pos.r + dir) === '') {
			moves.push([pos.f, pos.r + dir]);

			if ((pos.r === 2 && dir === 1) || (pos.r === 7 && dir === -1)) {
				if (getBoard(pos.f, pos.r + 2 * dir) === '') {
					moves.push([pos.f, pos.r + 2 * dir]);
				}
			}
		}
		
		const potentialCaptures = [
			[pos.f + 1, pos.r + dir],
			[pos.f - 1, pos.r + dir]
		];
		for (const [f, r] of potentialCaptures) {
			const target = getBoard(f, r);
			if (target && target !== '' && getColor(target) !== color) {
				moves.push([f, r]);
			}
		}
	} else {
		for (const [df, dr] of moveDeltas[pType]) {
			for (let i = 1; i < (pType === 'n' || pType === 'k' ? 2 : 8); i++) {
				const potential = getBoard(pos.f + df * i, pos.r + dr * i);
				if (potential === null || potential !== '') {
					if (color !== getColor(potential)) moves.push([pos.f + df * i, pos.r + dr * i]);
					break;
				}
				moves.push([pos.f + df * i, pos.r + dr * i]);
			}
		}
	}

	const castlingRank = color === 'w' ? 1 : 8;
	if (
		pType === 'k' &&
		pos.f === 5 &&
		pos.r === castlingRank &&
		!(await checkCheck(gameBoard, color))
	) {
		if (
			state.castling[color].k &&
			(await canCastleThrough(color, 6, castlingRank)) &&
			(await canCastleThrough(color, 7, castlingRank))
		) moves.push([7, castlingRank]);
		if (
			state.castling[color].q &&
			(await canCastleThrough(color, 2, castlingRank)) &&
			(await canCastleThrough(color, 3, castlingRank)) &&
			(await canCastleThrough(color, 4, castlingRank))
		) moves.push([3, castlingRank]);
	}

	if (
		state.enpassant &&
		pType === 'p' &&
		color === state.enpassant.color &&
		pos.r === state.enpassant.r + (color === 'w' ? -1 : 1) &&
		(pos.f === state.enpassant.f + 1 || pos.f === state.enpassant.f -1)
	) {
		moves.push([state.enpassant.f, state.enpassant.r]);
	}

	moves = moves.filter(m => m[0] >= 1 && m[0] <= 8 && m[1] >= 1 && m[1] <= 8);

	if (exists) {
		for (const m of moves) {
			if (await validMove(pos, { f: m[0], r: m[1] }, color)) {
				return true;
			}
		}
		return false;
	}

	const valid = await Promise.all(moves.map(
		async m => validMove(pos, { f: m[0], r: m[1] }, color)
	));
	moves = moves.filter((_, i) => valid[i]);

	return moves;
}

async function legalMove(from, to) {
	const piece = getBoard(from.f, from.r);
	if (piece === '') return false;

	const legalMoves = await getLegalMoves(from);
	if (!legalMoves.some(m => m[0] === to.f && m[1] === to.r)) {
		return false;
	}

	return true;
}

async function makeSelection(pos) {
	state.selected = pos;

	document.querySelectorAll('.selected').forEach(e => e.classList.remove('selected'));
	getSquare(pos.f, pos.r).classList.add('selected');

	const t = await getLegalMoves(pos);
	t.forEach(p => {
		const np = getBoard(...p);
		getSquare(...p).classList.add(np ? 'capture' : 'move')
	});
}

async function handleClick(e) {
	const square = e.currentTarget;
	const pos = getPos(square);
	const boardPiece = getBoard(pos.f, pos.r);
	const piece = getPiece(pos.f, pos.r);
	if (piece) piece.dataset.drag = '2';

	clearSquares();

	if (state.selected === null || !(await legalMove(state.selected, pos))) {
		if (piece) {
			await makeSelection(pos);
			if (piece.dataset.drag === '2') {
				piece.dataset.drag = '1';
			}
		}
		else state.selected = null;
	} else if (state.selected) {
		if (await legalMove(state.selected, pos)) {
			const resp = await makeMove(state.selected, pos);
		}
		state.selected = null;
	}

	if (piece && piece.dataset.drag !== '1') {
		piece.dataset.drag = '0';
	}
}
async function handleMouseUp(e) {
	if (!state.selected) return;

	const square = e.target;
	const pos = getPos(square);
	const piece = getPiece(pos.f, pos.r);
	
	getPiece(state.selected.f, state.selected.r).dataset.drag = '0';

	if (state.selected.f !== pos.f || state.selected.r !== pos.r) {
		if (await legalMove(state.selected, pos)) {
			clearSquares();
			const resp = await makeMove(state.selected, pos);
			if (resp[0]) state.selected = null;
			else await makeSelection(state.selected);
		} else {
			// playSound('illegal');
		}
	}
}
async function handleMouseOff() {
	if (state.selected) {
		getPiece(state.selected.f, state.selected.r).dataset.drag = '0';
	}
	state.selected = null;
	clearSquares();
}

const promotion = {
	w: document.getElementById('white-promotion'),
	b: document.getElementById('black-promotion')
}

async function promote(color, from, to, auto=null) {
	const pRankNum = color === 'w' ? 8 : 1;

	let pTo;
	if (!auto) {
		const pawn = getPiece(from.f, from.r);
		pawn.hidden = true;

		promotion.w.hidden = true;
		promotion.b.hidden = true;
		
		const pDialog = promotion[color === 'w' ? 'w' : 'b'];
		pDialog.style.setProperty('--f', to.f);
		pDialog.hidden = false;
	
		pTo = await new Promise(res => {
			setTimeout(() => {
				document.addEventListener('click', e => {
					if (e.target.classList.contains('promote-option')) {
						res(e.target.dataset.value);
					} else res(null);
				}, { once: true });
			}, 0);
		});

		if (!pTo) {
			pawn.hidden = false;
			promotion.w.hidden = true;
			promotion.b.hidden = true;
			return [[], false, null, null];
		}
	} else {
		pTo = color + auto;
	}
	
	const piece = pTo[0] === 'w' ? pTo[1].toUpperCase() : pTo[1];
	let queue = [];
	let capture = getBoard(to.f, to.r);
	if (capture) queue.push([getPiece(to.f, to.r), null]);

	gameBoard[8 - to.r][to.f - 1] = piece;
	gameBoard[8 - from.r][from.f - 1] = '';
	
	if (!auto) {
		pawn.style.setProperty('--f', to.f);
		pawn.style.setProperty('--r', to.r);
		pawn.querySelector('img').src = `/img/150/${pTo}.png`;
		
		pawn.hidden = false;
		promotion.w.hidden = true;
		promotion.b.hidden = true;
	}

	return [queue, true, pTo[1], capture];
}

//

function newGame() {
	loadFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
	loadBoard();
	results.wrapper.hidden = true;
	playSound('start');
}

var tcnKey = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=';
function decodeTCNMove(move) {
	var c, a, g = move.length, f = [];
	for (c = 0; c < g; c += 2) {
		var d = {}, b = tcnKey.indexOf(move[c]);
		63 < (a = tcnKey.indexOf(move[c + 1])) && (d.promotion = 'qnrbkp'[Math.floor((a - 64) / 3)], a = b + (16 > b ? -8 : 8) + (a - 1) % 3 - 1);
		75 < b ? d.drop = 'qnrbkp'[b - 79] : d.from = tcnKey[b % 8] + (Math.floor(b / 8) + 1);
		d.to = tcnKey[a % 8] + (Math.floor(a / 8) + 1);
		f.push(d);
	}
	return f[0];
}
function parseTCN(tcn) {
	let resp = [];
	for (let i=0; i < tcn.length; i += 2) {
		resp.push(decodeTCNMove(tcn[i]+tcn[i+1]));
	}
	return resp;
}
async function loadTCN(tcn) {
	const moves = parseTCN(tcn);
	
	loadFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
	
	for (const move of moves) {
		await makeMove(getNameSquare(move.from), getNameSquare(move.to), false, true, move.promotion ?? null);
	}

	loadBoard();
	results.wrapper.hidden = true;
	playSound('start');
}

//

document.querySelectorAll('#squares div').forEach(s => s.onmousedown = handleClick);
document.addEventListener('keydown', e => {
	if (e.key === 'Escape') {
		handleMouseOff();
	}
});
document.addEventListener('click', e => {
	if (e.target?.parentElement !== boardEl && e.target?.parentElement?.parentElement !== boardEl) {
		handleMouseOff();
	}
});
document.addEventListener('mouseup', e => {
	if (e.target?.parentElement !== boardEl && e.target?.parentElement?.parentElement !== boardEl) {
		handleMouseOff();
	} else handleMouseUp(e);
});

document.addEventListener('mousemove', e => {
	const bp = boardEl.getBoundingClientRect();
	const pos = {
		x: Math.min(Math.max(e.x - bp.x, 0), bp.width),
		y: Math.min(Math.max(e.y - bp.y, 0), bp.height)
	};

	boardEl.style.setProperty('--x', `${pos.x}px`);
	boardEl.style.setProperty('--y', `${pos.y}px`);
});

//

// const debug = document.getElementById('debug');
// const debug2 = document.getElementById('debug2');
// const debug3 = document.getElementById('debug3');
// setInterval(() => {
// 	debug.innerHTML = gameBoard.map(r=>r.map(p=>p?p:'.').join('')).join('<br>');
// 	const { history, ...s } = state;
// 	debug2.innerHTML = `<pre>${JSON.stringify(s, null, 2)}\nTSP:${tempStatePos}</pre>`;
// 	debug3.innerHTML = history.piece.slice(-10).map(e => `<p>${e.join('')}</p>`).join('');
// });

//