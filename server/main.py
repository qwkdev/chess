from flask import Flask, request
from pathlib import Path
import os
# from flask_cors import CORS

import random
RNG = random.SystemRandom()

cwd = Path(__file__).parent.resolve()
app = Flask('qChess')
app.secret_key = 'key'  # os.getenv('app')

games = {}

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

	if game not in games:
		return {'success': False, 'error': 'Invalid Game'}
	
	if not games[game]['start']:
		return {'success': False, 'error': 'Waiting for Players'}
	
	games[game]['moves'].append(move)

	return {'success': True}

@app.route('/sync', methods=['POST'])
def sync():
	data = request.get_json()
	if not (game := data.get('game')): return {'success': False, 'error': 'Missing Game'}
	last = data.get('last', 0)

	if game not in games:
		return {'success': False, 'error': 'Invalid Game'}

	return {'success': True, 'moves': games[game]['moves'][last:]}

@app.route('/join')
def join_game():
	game = request.args.get('game')

	if not game:
		newcode = genCode()
		while newcode in games:
			newcode = genCode()

		games[newcode] = {
			'moves': [],
			'start': False,
			'players': []
		}

		return {'success': True, 'game': newcode}

	if game not in games:
		return {'success': False, 'error': 'Invalid Game'}
	

	

#####

app.run()