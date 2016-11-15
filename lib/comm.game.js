'use strict';

var
        EventEmitter = require('events').EventEmitter,
        comm_lib = require('./comm.js');

function CommGame(routerLinks, myProfile, gameId, gameName, table, isMyGame, host) {
    if (typeof isMyGame === 'undefined') {
        isMyGame = false;
    }

    this.mesh = new Object();
    this.chat = new Object();

    this.myProfile = myProfile;
    this.host = host;
    this.gameId = gameId;
    this.gameName = gameName;
    this.table = table;
    this.isMyGame = isMyGame;
    this.chatProfiles = new Object();
    this.playersLinks = new Object();
    this.routerLinks = routerLinks;

    var _comm = this;

    this.table.on('win', function (winner, won) {
        _comm.emit('win', winner, won);
    });
    this.table.on('gameStarted', function () {
        _comm.emit('game_started');
    });
    this.table.on('roundDeal', function () {
        _comm.emit('round_deal');
    });
    this.table.on('roundFlop', function () {
        _comm.emit('round_flop');
    });
    this.table.on('roundTurn', function () {
        _comm.emit('round_turn');
    });
    this.table.on('roundRiver', function () {
        _comm.emit('round_river');
    });
    this.table.on('roundShowDown', function () {
        _comm.emit('round_showdown');
    });
    this.table.on('gameOver', function () {
        _comm.emit('game_over', _comm.isMyGame);
    });
    this.table.on('deckReady', function (deck) {
        _comm.emit('deck_ready', deck);
    });
    this.table.on('turn', function (player) {
        if (player.playerId === _comm.mesh.hashname) {
            _comm.emit('my_turn');
        } else {
            _comm.emit('others_turn', player);
        }
    });

    comm_lib.get_public_ip(function (ip) {
        console.log("Initializing game mesh.");
        comm_lib.create_mesh(ip, init_mesh);
    });

    function init_mesh(err, mesh) {
        if (err) {
            throw err;
        }
        _comm.mesh = mesh;
        
        mesh.discover(false);
        mesh.accept = (function (_comm) {
            return function (from) {
                _comm.emit('new_link', from);
            };
        })(_comm);

        if (_comm.isMyGame === true) {
            // Host of the game.
            var profileName = '(host) ' + _comm.myProfile.name;
            mesh.chat(profileName, function (err, chat) {
                _comm.chat = chat;

                chat.inbox.on('data', function (msg) {
                    _comm.emit('new_game_data', msg);
                });

                _comm.emit('game_hosted');
            });
        } else {
            // Will join an already hosted game.
            mesh.invited(function (link, profile) {
                _comm.emit('ready_to_join', link, profile);
            });
        }

        if (isMyGame === true) {
            _comm.host = mesh.hashname;
        }

        _comm.me = mesh.hashname;

        for (var a in _comm.routerLinks) {
            console.log('Using router for the game:', _comm.routerLinks[a].hashname);
            _comm.mesh.router(_comm.routerLinks[a]);
        }
        _comm.emit('init_game', mesh);
    }

    // auto-accept for testing
    this.on('ready_to_join', function (link, profile) {
        var _comm = this;

        _comm.mesh.chat({leader: link, id: profile.json.id}, _comm.myProfile.name, function (err, chat) {
            _comm.chat = chat;

            chat.inbox.on('data', function (msg) {
                _comm.emit('new_game_data', msg);
            });
        });
    });

    this.on('new_link', function (from) {
        console.log('new_link', from.hashname);
        var
                _comm = this,
                link = _comm.mesh.link(from);

        _comm.playersLinks[link.hashname] = link;

        (function (_comm) {
            link.on('status', function () {
                _comm.emit('link_status_update', link);
            });
        })(_comm);
    });

    this.on('link_status_update', function (link) {
        console.log('link_status_update', link.up, link.down);
        var _comm = this;

        if (link.up) {
            _comm.chat.join(link);
        }
        if (link.down) {
            delete _comm.playersLinks[link.hashname];
            _comm.table.removePlayer(_comm.chatProfiles[link.hashname].name);
            _comm.emit('player_disconnected', _comm.chatProfiles[link.hashname]);
        }
    });

    this.on('new_game_data', function (msg) {
        console.log('new_game_data');
        switch (msg.json.type) {
            case 'join':
                if (typeof this.chatProfiles[msg.json.from] === 'undefined') {
                    this.chatProfiles[msg.json.from] = {
                        'hashname': msg.json.from,
                        'name': msg.json.join.text,
                    };

                    var isItMe = msg.json.from === this.mesh.hashname;

                    this.emit('player_joined', this.chatProfiles[msg.json.from], isItMe);
                }
                break;
            case 'chat':
                if (typeof msg.json.text !== 'undefined') {
                    this.emit('new_chat_message', this.chatProfiles[msg.json.from], msg.json.text);
                }
                break;
        }

        if (typeof msg.json.refs !== 'undefined' && typeof msg.json.refs.action !== 'undefined') {
            var profile = this.chatProfiles[msg.json.refs.from];

            switch (msg.json.refs.action) {
                case 'sitRequest':
                    if (this.isMyGame === true && this.table.started === false) {
                        this.emit('player_sit_request', profile, msg.json.refs.args.chips);
                    }
                    break;
                case 'startGame':
                    if (this.table.started === false) {
                        if (this.isMyGame === false) {
                            var
                                    deck = msg.json.refs.args.deck,
                                    players = msg.json.refs.args.players;

                            this.table.startGame(deck, players);
                        }
                    }
                    break;
                case 'nextRound':
                    if (this.table.started === true) {
                        if (this.isMyGame === false) {
                            var
                                    deck = msg.json.refs.args.deck,
                                    players = msg.json.refs.args.players;

                            this.table.initNewRound(deck, players);
                        }
                    }
                    break;
                case 'sitPlayer':
                    msg.json.refs.args.table = this.table;

                    var success = this.table.addPlayer(msg.json.refs.args);

                    if (success === true) {
                        this.emit('player_sit', profile, msg.json.refs.args.chips);
                    } else {
                        this.emit('sit_failed', profile, msg.json.refs.args);
                    }
                    break;
                case 'check':
                    var player = this.table.getCurrentPlayer();

                    if (player.playerId === msg.json.refs.from) {
                        var success = player.Check();

                        if (success === true) {
                            this.emit('player_check', profile);
                        } else {
                            this.emit('invalid_turn', profile, msg.json.refs);
                        }
                    }
                    break;
                case 'call':
                    var player = this.table.getCurrentPlayer();

                    if (player.playerId === msg.json.refs.from) {
                        var success = player.call();

                        if (success === true) {
                            this.emit('player_call', profile);
                        } else {
                            this.emit('invalid_turn', profile, msg.json.refs);
                        }
                    }
                    break;
                case 'fold':
                    var player = this.table.getCurrentPlayer();

                    if (player.playerId === msg.json.refs.from) {
                        var success = player.fold();

                        if (success === true) {
                            this.emit('player_fold', profile);
                        } else {
                            this.emit('invalid_turn', profile, msg.json.refs);
                        }
                    }
                    break;
                case 'bet':
                    var player = this.table.getCurrentPlayer();

                    if (player.playerId === msg.json.refs.from) {
                        var success = player.bet(msg.json.refs.args.bet);

                        if (success === true) {
                            this.emit('player_bet', profile, msg.json.refs.args.bet);
                        } else {
                            this.emit('invalid_turn', profile, msg.json.refs);
                        }
                    }
                    break;
                case 'allIn':
                    var player = this.table.getCurrentPlayer();

                    if (player.playerId === msg.json.refs.from) {
                        var success = player.allIn();

                        if (success === true) {
                            this.emit('player_all_in', profile);
                        } else {
                            this.emit('invalid_turn', profile, msg.json.refs);
                        }
                    }
                    break;
            }

            this.checkGameState();
        }
    });
}

CommGame.prototype.__proto__ = EventEmitter.prototype;

CommGame.prototype.getMyCards = function () {
    var game = this;
    for (var i = 0; i < game.table.players.length; i++) {
        if (game.table.players[i] && !game.table.players[i].isEmptySeat) {
            if (game.table.players[i].playerId === game.mesh.hashname) {
                return game.table.players[i].cards;
            }
        }
    }
};

CommGame.prototype.getCardsOnBoard = function () {
    return this.table.game.board;
};

CommGame.prototype.sendSitRequest = function (chips) {
    chips = parseInt(chips);
    if (chips < 1) {
        throw new Error('Invalid chips amount.');
    }
    this.chat.outbox.write({'refs': {
            'from': this.me,
            'action': 'sitRequest',
            'args': {
                'chips': chips
            }
        }});
};

CommGame.prototype.sitPlayer = function (profile, chips) {
    if (typeof profile.hashname === 'undefined' || profile.hashname.length !== 52 || typeof profile.name === 'undefined') {
        throw new Error('Invalid profile data. Profile must have hashname and name.');
    }
    chips = parseInt(chips);
    if (chips < 1) {
        throw new Error('Invalid chips amount.');
    }
    if (this.isMyGame === true) {
        this.chat.outbox.write({'refs': {
                'from': this.host,
                'action': 'sitPlayer',
                'args': {
                    'playerId': profile.hashname,
                    'playerName': profile.name,
                    'chips': chips,
                }
            }});
    }
};

CommGame.prototype.startGame = function () {
    var started = false;

    if (this.isMyGame === true) {
        started = this.table.startGame();

        if (started === true) {
            this.chat.outbox.write({'refs': {
                    'from': this.host,
                    'action': 'startGame',
                    'args': {
                        'deck': this.table.game.deck,
                        'players': this.table.players,
                    }
                }});
        }
    }

    return started;
};

CommGame.prototype.nextRound = function () {
    if (this.isMyGame === true) {
        this.table.initNewRound();

        this.chat.outbox.write({'refs': {
                'from': this.host,
                'action': 'nextRound',
                'args': {
                    'deck': this.table.game.deck,
                    'players': this.table.players,
                }
            }});
    }
};

CommGame.prototype.sitPlayer = function (profile, chips) {
    if (typeof profile.hashname === 'undefined' || profile.hashname.length !== 52 || typeof profile.name === 'undefined') {
        throw new Error('Invalid profile data. Profile must have hashname and name.');
    }
    chips = parseInt(chips);
    if (chips < 1) {
        throw new Error('Invalid chips amount.');
    }
    if (this.isMyGame === true) {
        this.chat.outbox.write({'refs': {
                'from': this.host,
                'action': 'sitPlayer',
                'args': {
                    'playerId': profile.hashname,
                    'playerName': profile.name,
                    'chips': chips,
                }
            }});
    }
};

CommGame.prototype.check = function () {
    this.chat.outbox.write({'refs': {
            'from': this.me,
            'action': 'check',
        }});
};

CommGame.prototype.call = function () {
    this.chat.outbox.write({'refs': {
            'from': this.me,
            'action': 'call',
        }});
};

CommGame.prototype.fold = function () {
    this.chat.outbox.write({'refs': {
            'from': this.me,
            'action': 'fold',
        }});
};

CommGame.prototype.bet = function (bet) {
    bet = parseInt(bet);
    if (bet < 1) {
        throw new Error('Invalid bet amount.');
    }
    this.chat.outbox.write({'refs': {
            'from': this.me,
            'action': 'bet',
            'args': {
                'bet': bet
            },
        }});
};

CommGame.prototype.allIn = function () {
    this.chat.outbox.write({'refs': {
            'from': this.me,
            'action': 'allIn',
        }});
};

CommGame.prototype.message = function (message) {
    if (message.trim().length === 0) {
        return;
    }
    this.chat.outbox.write({
        'from': this.me,
        'text': message,
    });
};

CommGame.prototype.isMyTurn = function () {
    if (this.table.started === true) {
        var player = this.table.getCurrentPlayer();

        return player.playerId == this.mesh.hashname;
    }
    return false;
};

CommGame.prototype.checkGameState = function () {
    if (this.table.started === false && this.isMyGame === true && this.table.players.length >= this.table.minPlayers) {
        this.emit('game_ready');
    }
};

CommGame.prototype.invite = function (linkJSON) {
    var link = this.mesh.link(linkJSON);

    this.chat.join(link);
};

module.exports.CommGame = CommGame;
