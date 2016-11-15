'use strict';

function PokereumCLIInput(Pokereum) {
    var _cli = this;

    this.Pokereum = Pokereum;
    this.stdin = process.openStdin();

    this.currentGame = undefined;
    this.lastGameId = undefined;

    this.stdin.addListener("data", function (d) {
        _cli.handleCommand(d.toString().trim());
    });

    this.Pokereum.on('new_game', function (gameId, gameName, isMyGame) {
        _cli.lastGameId = gameId;
    });
}

PokereumCLIInput.prototype.handleCommand = function (cmd) {
    cmd = cmd.split(' ');

    switch (cmd[0]) {
        case 'exit':
            process.exit(0);
            break;
        case 'name':
            if (typeof cmd[1] === 'undefined' || cmd[1].trim().length === 0) {
                console.log('name command needs name as parameter.');
                break;
            }
            this.Pokereum.myProfile.name = cmd[1].trim();
            break;
        case 'host':
            var
                    name = typeof (cmd[1]) !== 'undefined' ? cmd[1] : '',
                    smallBlind = typeof (cmd[2]) !== 'undefined' ? parseInt(cmd[2]) : 10,
                    bigBlind = typeof (cmd[3]) !== 'undefined' ? parseInt(cmd[3]) : 30,
                    minPlayers = typeof (cmd[4]) !== 'undefined' ? parseInt(cmd[4]) : 2,
                    maxPlayers = typeof (cmd[5]) !== 'undefined' ? parseInt(cmd[5]) : 6,
                    gameName = name + ' players: ' + minPlayers + ' - ' + maxPlayers + '; blinds: ' + bigBlind + ', ' + smallBlind;

            this.currentGame = this.Pokereum.hostGame(gameName, smallBlind, bigBlind, minPlayers, maxPlayers);
            break;
        case 'join':
            if (typeof cmd[1] === 'undefined' || cmd[1].trim().length === 0) {
                console.log('join command needs game ID as parameter.');
                break;
            }
            if (cmd[1] === 'last') {
                if (typeof this.lastGameId === 'undefined') {
                    console.log("We haven't heard about any games yet.");
                    break;
                } else {
                    cmd[1] = this.lastGameId;
                }
            }
            this.currentGame = this.Pokereum.joinGame(cmd[1]);
            break;
        case 'quit':
            this.Pokereum.leaveGame(this.currentGame.gameId);
            break;
        case 'sit':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            if (typeof cmd[1] === 'undefined') {
                console.log('join command needs chips amount as parameter.');
                break;
            }
            this.currentGame.sendSitRequest(cmd[1]);
            break;
        case 'start':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            if (this.currentGame.isMyGame === false) {
                console.log("We're not the host of the game.");
                break;
            }
            this.currentGame.startGame();
            break;
        case 'next':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            if (this.currentGame.isMyGame === false) {
                console.log("We're not the host of the game.");
                break;
            }
            this.currentGame.nextRound();
            break;
        case 'check':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            this.currentGame.check();
            break;
        case 'call':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            this.currentGame.call();
            break;
        case 'bet':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            if (typeof cmd[1] === 'undefined') {
                console.log('bet command needs amount as parameter.');
                break;
            }
            this.currentGame.bet(cmd[1]);
            break;
        case 'allin':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            this.currentGame.allIn();
            break;
        case 'fold':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            this.currentGame.fold();
            break;
        case 'msg':
            if (typeof this.currentGame === 'undefined') {
                console.log("We're not in a game.");
                break;
            }
            cmd.shift();
            var message = cmd.join(' ');
            if (message.trim().length === 0) {
                console.log('msg command needs a message.');
                break;
            }
            this.currentGame.message(message.trim());
            break;
    }
};

module.exports = PokereumCLIInput;