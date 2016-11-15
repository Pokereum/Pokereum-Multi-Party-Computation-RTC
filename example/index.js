'use strict';

var
        PokereumClient = require('../pokereum.client.js'),
        GameHandler = require('./cli.output').CLIGameHandler,
        PokereumCLIInput = require('./cli.input');

var
        Pokereum = new PokereumClient(GameHandler),
        PokereumCLI = new PokereumCLIInput(Pokereum);

Pokereum.on('init', function () {
    console.log('Engine ready.');
    console.log('Host a game with: "host [small blind] [big blind] [min players] [max players]"');
    console.log('Change your name with: "name (name)".');
});

Pokereum.on('new_game', function (gameId, gameName, isMyGame) {
    console.log('new game: ' + gameName + ' (' + gameId + ') ' + isMyGame);
    if (isMyGame === false) {
        console.log('Join game with: "join (gameId)" or "join last" for last broadcast game.');
    }
});

Pokereum.on('join_request', function (client, gameId) {
    console.log('Auto-accepting join request from ' + client.link.hashname);
    this.acceptJoinRequest(client, gameId);
});