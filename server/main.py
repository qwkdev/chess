from flask import Flask, request
from pathlib import Path
import os
from flask_cors import CORS

import random
RNG = random.SystemRandom()

cwd = Path(__file__).parent.resolve()
app = Flask('qChess')
app.secret_key = 'key'  # os.getenv('app')

CORS(app)

games = {
	'test': {
		'turn': 0,
		'players': {
			'1': ['Player 1', 0],
			'2': ['Player 2', 1]
		},
		'start': True,
		'moves': []
	}
}

def genCode() -> str:
	return ''.join([RNG.choice(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
        # 'abcdefghijklmnopqrstuvwxyz' +
        '0123456789'
    ) for _ in range()])

@app.route('/')
def home():
	return '.'

@app.route('/move', methods=['POST'])
def make_move():
	data = request.get_json()
	if not (game := data.get('game')): return {'success': False, 'error': 'Missing Game'}
	if not (move := data.get('move')): return {'success': False, 'error': 'Missing Move'}
	if not (client := data.get('client')): return {'success': False, 'error': 'Missing Client'}

	if game not in games:
		return {'success': False, 'error': 'Invalid Game'}
	
	if not games[game]['start']:
		return {'success': False, 'error': 'Waiting for Players'}
	
	if client not in games[game]['players']:
		return {'success': False, 'error': 'Invalid Client'}

	if games[game]['players'][client][1] != games[game]['turn']:
		return {'success': False, 'error': 'Wait for your turn'}

	games[game]['moves'].append(move)
	games[game]['turn'] = 1 if games[game]['moves'] == 0 else 0

	return {'success': True}

@app.route('/sync', methods=['POST'])
def sync():
	data = request.get_json()
	if not (game := data.get('game')): return {'success': False, 'error': 'Missing Game'}
	last = data.get('last', 0)

	if game not in games:
		return {'success': False, 'error': 'Invalid Game'}

	return {
		'success': True,
		'turn': 0,
		'moves': games[game]['moves'][last:],
		'last': len(games[game]['moves'])
	}

@app.route('/lobby', methods=['POST'])
def sync_lobby():
	data = request.get_json()
	if not (game := data.get('game')): return {'success': False, 'error': 'Missing Game'}

	if game not in games:
		return {'success': False, 'error': 'Invalid Game'}

	return {
		'success': True,
		'start': games[game]['start'],
		'players': games[game]['players'].values()
	}

@app.route('/join', methods=['POST'])
def join_game():
	data = request.get_json()
	game = data.get('game')
	if not (client := data.get('client')): return {'success': False, 'error': 'Missing Client'}
	user = data.get('user', 'Player')

	if not game:
		newcode = genCode()
		while newcode in games:
			newcode = genCode()

		games[newcode] = {
			'moves': [],
			'start': False,
			'players': {client: [user, random.choice([0, 1])]},
			'turn': 0
		}

		return {'success': True, 'game': newcode}

	if game not in games or games[game]['start']:
		return {'success': False, 'error': 'Invalid Game'}

	players = [p[1] for p in games[game]['players'].values()]
	games[game]['players'][client] = [user, [p for p in [0, 1] if p not in players][0]]

	if len(games[game]['players']) >= 2:
		games[game]['start'] = True

#####

app.run()