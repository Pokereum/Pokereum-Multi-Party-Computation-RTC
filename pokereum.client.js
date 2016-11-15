'use strict';

var
        EventEmitter = require('events').EventEmitter,
        myProfile = require('./config/my.profile.js'),
        Clients = require('./lib/clients.list.js').Clients,
        CommMain = require('./lib/comm.main.js').CommMain;

function PokereumClient(GameHandler) {
    if (typeof GameHandler !== 'function') {
        GameHandler = function () {};
    }
    var _pokereum = this;

    this.GameHandler = GameHandler;
    this.myProfile = myProfile;
    this.clientsList = new Clients();
    this.comm = new CommMain(this.myProfile, this.clientsList);

    this.comm.on('init', function () {
        _pokereum.emit('init');
    });
    this.comm.on('client_up', function (client) {
        _pokereum.emit('client_up', client);
    });
    this.comm.on('client_down', function (client) {
        _pokereum.emit('client_down', client);
    });
    this.comm.on('new_game', function (gameId, gameName, isMyGame) {
        _pokereum.emit('new_game', gameId, gameName, isMyGame);
    });
    this.comm.on('join_request', function (client, gameId) {
        _pokereum.emit('join_request', client, gameId);
    });
    this.comm.on('left_game', function (client, gameId) {
        _pokereum.emit('left_game', client, gameId);
    });    
}

PokereumClient.prototype.__proto__ = EventEmitter.prototype;

PokereumClient.prototype.hostGame = function (gameName, minBlind, maxBlind, minPlayers, maxPlayers) {
    try {
        var game = this.comm.hostGame(gameName, minBlind, maxBlind, minPlayers, maxPlayers);
        this.GameHandler(game);

        return game;
    } catch (e) {
        throw new Error("Invalid parameters.");
    }
};

PokereumClient.prototype.joinGame = function (gameId) {
    if (typeof gameId === 'undefined' || gameId.trim().length === 0) {
        throw new Error('Invalid gameId.');
    }
    var game = this.comm.sendJoinRequest(gameId);
    this.GameHandler(game);

    return game;
};

PokereumClient.prototype.leaveGame = function (gameId) {
    if (typeof gameId === 'undefined' || gameId.trim().length === 0) {
        throw new Error('Invalid gameId.');
    }
    this.comm.leaveGame(gameId);
};

PokereumClient.prototype.acceptJoinRequest = function (client, gameId) {
    if (typeof gameId === 'undefined' || gameId.trim().length === 0) {
        throw new Error('Invalid gameId.');
    }
    if (typeof client.linkJSON === 'undefined') {
        throw new Error("We don't have the game mesh info for the client and can't invite him to connect.");
    }
    var game = this.comm.games[gameId].game;

    if (game.isMyGame === true) {
        game.invite(client.linkJSON);

        return game;
    } else {
        throw new Error("We're not the host of this game. Can't accept a join request.");
    }
};

module.exports = PokereumClient;