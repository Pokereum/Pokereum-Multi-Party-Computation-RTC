'use strict';

module.exports.CLIGameHandler = function (game) {
    game.on('player_joined', function (profile, isItMe) {
        console.log('Player ' + profile.name + ' (' + profile.hashname + ') joined the game lobby', isItMe);
        if (isItMe === true) {
            console.log('Sit with: "sit (chips count)".');
            console.log('Chat with: "msg (message)"');
        }
    });

    game.on('player_disconnected', function (profile) {
        console.log('Player ' + profile.name + ' (' + profile.hashname + ') has left the game.');
    });

    /**
     * The host sits the players
     */
    game.on('player_sit_request', function (profile, chips) {
        console.log('Auto-accepting sit request from ' + profile.name + ' (' + profile.hashname + ')');
        this.sitPlayer(profile, chips);
    });

    /**
     * This event is emit only, if you are the host
     */
    game.on('game_ready', function () {
        console.log('Your game is ready. Type "start" to start it.');
    });

    game.on('new_chat_message', function (from, message) {
        console.log(from.name + '(' + from.hashname + '): ' + message);
    });

    game.on('my_turn', function () {
        console.log('It\'s your turn. Use "check", "call", "bet (amount)", "allin", "fold"');
    });

    game.on('invalid_turn', function () {
        console.log('invalid turn!');
    });

    game.on('game_started', function () {
        console.log('Game started!');
    });
    game.on('win', function (winner, won) {
        console.log('Winner ', winner.playerName, ' won ' + won);
    });
    game.on('round_deal', function () {
        console.log('Round deal. You got: ', game.getMyCards());
    });
    game.on('round_flop', function () {
        console.log('Round flop ', game.table.game.board);
    });
    game.on('round_turn', function () {
        console.log('Round turn ', game.table.game.board);
    });
    game.on('round_river', function () {
        console.log('Round river ', game.table.game.board);
    });
    game.on('round_showdown', function () {
        console.log('Round showdown ', game.table.game.board);
        for (var i = 0; i < game.table.players.length; i++) {
            var player = game.table.players[i];
            if (player && !player.isEmptySeat) {
                console.log('Player ' + player.playerName + ': ', game.table.players[i].cards);
            }
        }
    });
    game.on('game_over', function (isMyGame) {
        console.log('Game over.');
        if (isMyGame === true) {
            console.log('You can start next round with: next');
        }
    });
};