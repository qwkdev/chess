const sf = new Worker('stockfish-worker.js');

sf.onmessage = (e) => {
	console.log(e.data);
	console.log(parseEval(e.data));
};

function evaluateFen(fen, depth = 12) {
	sf.postMessage(`position fen ${fen}`);
	sf.postMessage(`go depth ${depth}`);
}

function parseEvaluation(line) {
	const cpMatch = line.match(/score cp (-?\d+)/);
	if (cpMatch) {
		return {
			type: 'cp',
			value: Number(cpMatch[1]),
		};
	}

	const mateMatch = line.match(/score mate (-?\d+)/);
	if (mateMatch) {
		return {
			type: 'mate',
			value: Number(mateMatch[1]),
		};
	}

	return null;
}

sf.postMessage('uci');
sf.postMessage('isready');
