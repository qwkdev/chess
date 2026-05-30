// ==UserScript==
// @name        Chess.com Launchpad
// @namespace   qwk
// @match       *://*.chess.com/play/*
// @match       *://*.chess.com/game/*
// @grant       none
// @version     1.0
// @author      qwk
// @description Control Chess.com from Launchpad X
// ==/UserScript==

let boardEl;

let state = {
    init: false,
    promote: null,
    board: null,
    color: null,
    opponent: false,
    myturn: null,
    turn: null,
    last: null,
    material: null,
    check: null,
};

const pieces = {
    p: 7,
    n: 15,
    b: 27,
    r: 39,
    q: 47,
    k: 55
};

function clickBoard(ele) {
    const rect = ele.getBoundingClientRect();
    boardEl.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0
    }));
}

const midiCodes = {
    logo: 99,
    top: Array.from({ length: 8 }, (_, i) => 91+i),
    side: Array.from({ length: 8 }, (_, i) => 89-(i*10)),
    grid: Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => 81-(10*i)+j))
};

function toPad(note) {
    if (note == 99) return { type: 'logo' }
    if (91 <= note && note <= 98) return { type: 'top', pos: note - 91 }
    if ((note - 9) % 10 == 0) return { type: 'side', pos: (89-note)/10 }
    return { type: 'grid', x: (note % 10) - 1, y: 8 - Math.floor(note/10) }
}

function setLEDs(lOut, spec) {
    if (spec.length == 1 && spec[0][1] !== 3) {
        lOut.send([144, spec[0][0], spec[0][2]]);
        return;
    }
    if (spec.length > 81) throw Error('Max 81 colourspecs at a time');

    let data = [];
    spec.forEach(info => {
        data.push(
            info[1],
            info[0],
            ...(info[1] === 3 ? ([info[2], info[3], info[4]].map(n => Math.floor(parseFloat(n)/2))) : [info[2]])
        );
    })
    lOut.send([240, 0, 32, 41, 2, 12, 3, ...data, 247]);
}
function setAllLEDs(lOut, spec) {
    setLEDs(lOut, Array.from({ length: 81 }, (_, i) => [
        Math.floor(i / 9) * 10 + 11 + (i % 9), ...spec
    ]));
}

function sendText(lOut, text, palatte=null, rgb=null, speed=12, loop=false) {
    let textData = [];
    Array.from(text).forEach(c => {
        const ascii = c.charCodeAt();
        if (ascii < 128) textData.push(ascii);
        else throw Error('Invalid non-ascii character.');
    });

    lOut.send([
        240, 0, 32, 41, 2, 12, 7,
        loop ? 1 : 0,
        speed,
        palatte !== null ? 0 : 1,
        ...(palatte !== null ? [palatte] : [rgb[0], rgb[1], rgb[2]]),
        ...textData,
        247
    ])
}
function stopText(lOut) {
    lOut.send([240, 0, 32, 41, 2, 12, 7, 247]);
}

let launchpadInput;
let launchpadOutput;
async function init(load=_ => {}, input=_ => {}) {
    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        for (let entry of midiAccess.inputs.values()) {
            if (entry.name.includes("Launchpad")) {
                launchpadInput = entry;
            }
        }
        for (let entry of midiAccess.outputs.values()) {
            if (entry.name.includes("Launchpad")) {
                launchpadOutput = entry;
            }
        }
        if (!launchpadInput || !launchpadOutput) {
            alert('Launchpad not found!')
            console.error('Launchpad not found!');
            return;
        }

        launchpadInput.onmidimessage = msg => {
            const [status, note, velocity] = msg.data;
            input(note, velocity);
        };

        load(launchpadInput, launchpadOutput);

    } catch (err) {
        console.error("Failed to get MIDI access:", err);
    }
}

let iconHue = 0;
function loopHue() {
    iconHue += 2;
    iconHue = iconHue % 360;
    setLEDs(launchpadOutput, [[99, 3, ...hueToRGB(iconHue)]]);
}

function handleInput(note, vel) {
    if (!init) return;
    const pad = toPad(note);

    if (pad.type === 'grid' && vel > 0 && state.turn) {
        const square = boardEl.querySelector(`.square-${pad.x+1}${8-pad.y}`);
        if (square) {
            clickBoard(square);
            sync();
        }
    }
}

function getSquare(classList) {
    for (const c of classList) {
        if (c.startsWith('square-')) {
            return [parseInt(c[7]), parseInt(c[8])];
        }
    }
}

function getBoard(selected=false) {
    let board = Array.from({ length: 8 }, () => Array(8).fill(''));

    Array.from(boardEl.querySelectorAll('.piece')).forEach(e => {
        const s = getSquare(e.classList);
        const pClass = Array.from(e.classList).filter(c => c.length === 2 && (c[0] === 'w' || c[0] === 'b') && Object.keys(pieces).includes(c[1]))?.[0];
        if (!pClass) return;
        board[8 - s[1]][s[0] - 1] = pClass[0] === 'w' ? pClass[1].toUpperCase() : pClass[1].toLowerCase();
    });

    if (selected) {
        const hoverSquare = getSquare(boardEl.querySelector('.hover-square').classList);
        board[8 - hoverSquare[1]][hoverSquare[0] - 1] += '?s';

        Array.from(boardEl.querySelectorAll('.hint')).forEach(e => {
            const s = getSquare(e.classList);
            board[8 - s[1]][s[0] - 1] += '?m';
        });
        Array.from(boardEl.querySelectorAll('.capture-hint')).forEach(e => {
            const s = getSquare(e.classList);
            board[8 - s[1]][s[0] - 1] += '?c';
        });
    }

    return board;
}

function sync() {
    state.promote = boardEl.game.getState() === 'PomotionAreaShowing';
    state.board = getBoard(boardEl.game.getState() === 'PieceSelected');

    state.color = boardEl.game.getPlayingAs() === 1 ? 'w' : 'b';
    state.myturn = boardEl.game.getPlayingAs() === boardEl.game.getTurn();
    state.turn = boardEl.game.getTurn() === 1 ? 'w' : 'b';

    const lastMove = boardEl.game.getLastMove();
    state.last = [lastMove.from, lastMove.to];

    state.material = boardEl.game.getMaterial().imbalance;
    state.check = boardEl.game.isCheck();

    updatePads();

    const debug = document.getElementById('debug');
    const debug2 = document.getElementById('debug2');
     debug.innerHTML = state.board.map(r=>r.map(p=>p.split('?')?.[0]?p[0]:'.').join('')).join('<br>');
    const { board, ...s } = state;
    debug2.innerHTML = `<pre>${JSON.stringify(s, null, 2)}</pre>`;
}

function getColour(p, side) {
    const [piece, flags] = p.split('?');
    let cur = 0;
    if ((side === 0) === (piece.toUpperCase() === piece)) {
        cur = pieces[piece.toLowerCase()];
    }
    if (flags.includes('s') || flags.includes('s') || flags.includes('c')) {
        cur = cur < 3 ? cur + 1 : cur - 2;
    }

    return cur;
}

function updatePads() {
    for (let m = 0; m < 8; m++) {
        for (let n = 0; n < 8; n++) {
            specs.push((8-m)*10 + n + 1, 0, [getColour(state.board[m][n], state.opponent ? (state.turn === 0 ? 1 : 0) : state.turn)]]);
        }
    }
    setLEDs(launchpadOutput, specs);
}

function waitUntil(condition, interval=100) {
    return new Promise(res => {
        const timer = setInterval(() => {
            if (condition()) {
                clearInterval(timer);
                res();
            }
        }, interval);
    });
}

async function start() {
    init(_ => {}, handleInput);

    await waitUntil(() => {
        boardEl = document.querySelector('wc-chess-board.board');
        return boardEl;
    });
    await waitUntil(() => {
        return boardEl.game?.getPlayingAs() !== undefined
    });

    //

    const debug = document.createElement('p');
    debug.id = 'debug';
    debug.style.cssText = `
        position: absolute;
        top: 45%;
        left: 10%;
        font-family: monospace;
        color: #fff;
        font-size: 20px;
    `;
    document.body.appendChild(debug);

    const debug2 = document.createElement('p');
    debug2.id = 'debug2';
    debug2.style.cssText = `
        position: absolute;
        top: 45%;
        left: 30%;
        font-family: monospace;
        color: #fff;
        font-size: 15px;
    `;
    document.body.appendChild(debug2);

    const debugInput = document.createElement('div');
    debugInput.id = 'debug-input';
    debugInput.style.cssText = `
        position: absolute;
        top: 65%;
        left: 25%;
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 2px;
    `;

    for (let m = 8; m > 0; m--) {
        for (let n = 1; n < 9; n++) {
            debugInput.innerHTML += `<button data-value="${m}${n}">${m}${n}</button>`;
        }
    }

    document.body.appendChild(debugInput);

    const style = document.createElement('style');
    style.textContent = `
        #debug-input button {
            background: #ddd;
            width: 30px;
            height: 30px;
            border: 1px solid #000;
            box-sizing: border-box;
            color: #000;
            font-size: 15px;

            &:hover {
                background: #fff;
            }
        }
    `;
    document.head.appendChild(style);

    Array.from(debugInput.children).forEach(btn => {
        btn.onmousedown = e => {
            e.preventDefault();
            e.stopPropagation();
            handleInput(btn.dataset.value, 127);
        };
        btn.onmouseup = e => {
            e.preventDefault();
            e.stopPropagation();
            handleInput(btn.dataset.value, 0);
        };
    })

    //

    state.init = true;
    setInterval(loopHue, 100);

    setInterval(() => {
        try { sync(); }
        catch (e) { console.error(e); }
    }, 500);
}

window.addEventListener('load', start);
