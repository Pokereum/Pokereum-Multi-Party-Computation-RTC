'use strict';

var Player = require('./player.js').Player;
var Game = require('./game.js').Game;
var utils = require('./utils.js');
var EventEmitter = require('events').EventEmitter;

function Table(smallBlind, bigBlind, minPlayers, maxPlayers) {
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.minPlayers = minPlayers;
    this.maxPlayers = maxPlayers;
    this.players = [];
    this.currentPlayer = 0;
    this.started = false;
    this.dealer = 0; //Track the dealer position between games

    //Validate acceptable value ranges.
    var err;
    if (minPlayers < 2) { //require at least two players to start a game.
        err = new Error(101, 'Parameter [minPlayers] must be a postive integer of a minimum value of 2.');
    } else if (maxPlayers > 10) { //hard limit of 10 players at a table.
        err = new Error(102, 'Parameter [maxPlayers] must be a positive integer less than or equal to 10.');
    } else if (minPlayers > maxPlayers) { //Without this we can never start a game!
        err = new Error(103, 'Parameter [minPlayers] must be less than or equal to [maxPlayers].');
    }

    if (err) {
        throw err;
    }
}

// inherit from Event emitter
Table.prototype.__proto__ = EventEmitter.prototype;

Table.prototype.fillDeck = function () {
    var deck = ['AS', 'KS', 'QS', 'JS', 'TS', '9S', '8S', '7S', '6S', '5S', '4S', '3S', '2S', 'AH', 'KH', 'QH', 'JH',
        'TH', '9H', '8H', '7H', '6H', '5H', '4H', '3H', '2H', 'AD', 'KD', 'QD', 'JD', 'TD', '9D', '8D', '7D', '6D',
        '5D', '4D', '3D', '2D', 'AC', 'KC', 'QC', 'JC', 'TC', '9C', '8C', '7C', '6C', '5C', '4C', '3C', '2C'];

    return this.shuffle(deck);

};

Table.prototype.shuffle = function (deck) {
    //Shuffle the deck array with Fisher-Yates
    var i,
            j,
            tempi,
            tempj;

    for (i = 0; i < deck.length; i++) {
        j = Math.floor(Math.random() * i);
        tempi = deck[i];
        tempj = deck[j];
        deck[i] = tempj;
        deck[j] = tempi;
    }
    return deck;
};

Table.prototype.getMaxBet = function () {
    var bets = this.game.bets;
    var maxBet = 0;

    for (var i = 0; i < bets.length; i++) {
        if (bets[i] > maxBet) {
            maxBet = bets[i];
        }
    }
    return maxBet;
};

Table.prototype.allInGamePlayersAreAllIn = function () {
    var all = true;

    this.forEachPlayers(function (player) {
        if (!player.isAllIn && !player.folded) {
            all = false;
        }
    });

    return all;
};

Table.prototype.allPlayersTalked = function () {
    var endOfRound = true,
            i = 0;

    //For each player, check
    while (endOfRound && i < this.players.length) {

        if (!this.players[i].isEmptySeat && !this.players[i].talked) {

            endOfRound = false;

        } else {
            i++;
        }
    }

    return endOfRound;
};

Table.prototype.foldsCheck = function () {
    var notFolded = this.players.length,
            i = 0;

    for (var i = 0; i < this.players.length; i++) {
        if (!this.players[i].isEmptySeat && this.players[i].folded) {
            notFolded--;
        }
    }

    return notFolded === 1;
};

Table.prototype.getAllInWinners = function (winners) {
    var allInPlayer = [];

    for (var i = 0; i < winners.length; i++) {
        var winner = winners[i];

        if (this.players[winner].isAllIn) {
            allInPlayer.push(winner);
        }
    }
    return allInPlayer;
};

Table.prototype.GetWinnersIndexes = function () {
    var winners = [];

    var maxRank = 0.000;

    this.forEachPlayers(function (player, $index) {
        var playerRank = player.hand.rank;

        if (!player.folded) {
            if (playerRank === maxRank) {
                winners.push($index);
            }
            if (playerRank > maxRank) {
                maxRank = playerRank;
                winners = [$index];
            }
        }
    });

    return winners;
};

Table.prototype.getMinBets = function (allInPlayer, winners) {
    var minBets = this.game.roundBets[winners[0]];

    for (var j = 1; j < allInPlayer.length; j++) {
        var roundBet = this.game.roundBets[winners[j]];
        if (roundBet !== 0 && roundBet < minBets) {
            minBets = roundBet;
        }
    }

    return minBets;
};

Table.prototype.makePrize = function (part) {
    var roundBet = null;
    var prize = 0;

    for (var l = 0; l < this.game.roundBets.length; l++) {
        roundBet = this.game.roundBets[l];
        if (roundBet > part) {
            prize = prize + part;
            this.game.roundBets[l] = this.game.roundBets[l] - part;
        } else {
            prize = prize + roundBet;
            this.game.roundBets[l] = 0;
        }
    }
    return prize;
};

Table.prototype.GivePrize = function (winners, prize) {
    var won = prize / winners.length;

    for (var i = 0; i < winners.length; i++) {
        var winner = this.players[winners[i]];

        winner.prize = winner.prize + won;
        winner.chips = winner.chips + won;
        console.log('adding ' + won + ' chips to ' + winner.playerName);
        if (this.game.roundBets[winners[i]] === 0) {
            winner.folded = true;
        }
        console.log('player ' + winner.playerName + ' wins with ' + winner.hand.message + '(cards: ' + winner.hand.cards + ', value ' + winner.hand.rank + ')');
        this.emit("win", winner, won);
    }
};

Table.prototype.roundEnd = function () {
    var roundEnd = true;
    var i = 0;

    while (roundEnd && i < this.game.roundBets.length) {
        if (this.game.roundBets[i] !== 0) {
            roundEnd = false;
        }
        i++;
    }

    return roundEnd;
};

Table.prototype.checkForWinner = function () {

    while (!this.roundEnd()) {
        var part = 0;

        //Identify winner(s)
        var winners = this.GetWinnersIndexes();

        var allInPlayer = this.getAllInWinners(winners);

        if (allInPlayer.length > 0) {

            part = parseInt(this.getMinBets(allInPlayer, winners), 10);

        } else {
            part = parseInt(this.game.roundBets[winners[0]], 10);
        }

        var prize = this.makePrize(part);

        this.GivePrize(winners, prize);
    }
};

Table.prototype.checkForBankrupt = function () {
    for (var i = this.players.length - 1; i >= 0; i--) {

        if (this.players[i].chips <= 0) {
            console.log('player ' + this.players[i].playerName + ' is going bankrupt');
            this.players[i].chips = 0;
            //this.players.splice(i, 1);
        }
    }
};

Table.prototype.forEachPlayers = function (fn) {
    for (var i = 0; i < this.players.length; i++) {
        if (this.players[i] && !this.players[i].isEmptySeat) {
            fn(this.players[i], i);
        }
    }
};

Table.prototype.moveBetsToPot = function () {
    for (var i = 0; i < this.game.bets.length; i++) {
        var bet = parseInt(this.game.bets[i], 10);
        this.game.pot = this.game.pot + bet;
        this.game.roundBets = utils.protectArrayBet(this.game.roundBets, i, bet);
        this.game.bets[i] = 0;
    }
};

Table.prototype.dealCards = function (total) {
    this.game.deck.pop(); //Burn a card
    for (var i = 0; i < total; i++) {
        this.game.board.push(this.game.deck.pop()); //Turn a card
    }
};

Table.prototype.resetTalkedState = function () {
    this.forEachPlayers(function (player) {
        player.talked = false;
    });
};

Table.prototype.setCurrentPlayerToSmallBlind = function () {
    this.currentPlayer = this.dealer;
    this.NextPlayer();
};


Table.prototype.setStep = function (step) {


    switch (step) {

        case 'deal':
            this.emit("roundDeal");
            console.log('Round: deal');
            this.game.roundName = 'Deal';
            break;

        case 'flop':
            this.emit("roundFlop");
            console.log('Round: flop');
            this.game.roundName = 'Flop';

            this.resetTalkedState();
            this.dealCards(3);
            this.setCurrentPlayerToSmallBlind();
            break;

        case 'turn':
            this.emit("roundTurn");
            console.log('Round: turn');
            this.game.roundName = 'Turn';

            this.resetTalkedState();
            this.dealCards(1);
            this.setCurrentPlayerToSmallBlind();
            break;

        case 'river':
            this.emit("roundRiver");
            console.log('Round: river');

            this.game.roundName = 'River';

            this.resetTalkedState();
            this.dealCards(1);
            this.setCurrentPlayerToSmallBlind();
            break;

        case 'showdown':
            this.emit("roundShowDown");
            console.log('Round: showdown');
            var missingCards = 5 - this.game.board.length;
            for (var i = 0; i < missingCards; i++) {
                this.dealCards(1);
            }

            this.game.roundName = 'Showdown';
            this.game.bets = [];

            //Evaluate each hand
            this.forEachPlayers(function (player) {
                player.SetHand();
            });

            this.checkForWinner();
            this.checkForBankrupt();

            var self = this;

            setImmediate(function () {
                self.emit('gameOver');
            });
            break;
    }
};

Table.prototype.progress = function () {
    console.log("progress", this.allPlayersTalked());

    if (this.foldsCheck()) {
        console.log("next step");
        //Move all bets to the pot
        this.moveBetsToPot();
        this.setStep('showdown');
    } else if (this.allPlayersTalked()) {
        console.log("next step");
        //Move all bets to the pot
        this.moveBetsToPot();

        if (this.allInGamePlayersAreAllIn() || this.game.roundName === 'River') {
            this.setStep('showdown');

        } else if (this.game.roundName === 'Turn') {
            this.setStep('river');

        } else if (this.game.roundName === 'Flop') {
            this.setStep('turn');

        } else if (this.game.roundName === 'Deal') {
            this.setStep('flop');
        }
    } else {
        this.NextPlayer();
    }

};

Table.prototype.getNextPlayerIndex = function (currentIndex, findTalker) {
    var found = false;

    while (!found) {
        currentIndex++;
        currentIndex = currentIndex < this.players.length ? currentIndex : 0;

        if (!this.players[currentIndex].isEmptySeat && !findTalker ||
                !this.players[currentIndex].isEmptySeat && findTalker && !this.players[currentIndex].talked) {
            found = true;
        }
    }

    return currentIndex;
};

Table.prototype.initNewRound = function (deck, players) {
    console.log('Starting new round...');

    // TODO move bid blind instead of dealer
    this.dealer = this.getNextPlayerIndex(this.dealer);

    this.game.pot = 0;

    this.game.betName = 'bet'; //bet,raise,re-raise,cap
    this.game.bets = [];
    this.game.board = [];

    for (var i = 0; i < this.players.length; i++) {
        var player = this.players[i];
        player.folded = false;
        player.talked = false;
        player.isAllIn = false;
        player.cards = [];
        player.prize = 0;
    }

    this.NewRound(deck, players);

    this.setStep("deal");
};


Table.prototype.DealCardsResetBets = function () {
    var nbPlayers = this.players.length;

    //Deal 2 cards to each player
    for (var i = 0; i < nbPlayers; i += 1) {

        // only deal cards to real player
        if (!this.players[i].isEmptySeat) {
            this.players[i].cards.push(this.game.deck.pop());
            this.players[i].cards.push(this.game.deck.pop());
        }

        this.game.bets[i] = 0;
        this.game.roundBets[i] = 0;
    }
};

Table.prototype.NewRound = function (deck, players) {
    var smallBlind,
            bigBlind;

    //Identify Small and Big Blind player indexes
    if (this.getIngamePlayersLength() > 2) {
        console.log("dealer", this.dealer);
        smallBlind = this.getNextPlayerIndex(this.dealer);
    } else {
        smallBlind = this.dealer;
    }
    bigBlind = this.getNextPlayerIndex(smallBlind);

    this.currentPlayer = smallBlind;

    //Force Blind Bets
    this.players[smallBlind].SimpleBet(this.smallBlind);
    this.currentPlayer = bigBlind;
    this.players[bigBlind].SimpleBet(this.bigBlind);

    if (!this.players[bigBlind].isAllIn) {
        this.players[bigBlind].talked = false;
    }

    if (typeof deck === 'undefined') {
        this.game.deck = this.fillDeck();
    } else {
        this.game.deck = deck;
    }
    this.emit("deckReady", this.game.deck);

    if (typeof players === 'undefined') {
        this.DealCardsResetBets();
    } else {
        for (var i = 0; i < players.length; i++) {
            if (this.players[i] && !this.players[i].isEmptySeat) {
                this.players[i].cards = players[i].cards;
            }
        }
    }

    this.NextPlayer();
};

Table.prototype.GetPlayersIndexes = function () {
    var table = [];
    this.forEachPlayers(function (player, $index) {
        table.push($index);
    });
    return table;
};

Table.prototype.GetFirstDealer = function () {
    return 0
};

Table.prototype.startGame = function (deck, players) {
    if (this.started) {
        console.log('already started ...');
    } else if (!this.game && this.getIngamePlayersLength() >= this.minPlayers) {
        console.log('starting game ...');
        //If there is no current game and we have enough players, start a new game.

        for (var i = 0; i < this.players.length; i++) {
            var player = this.players[i];
            if (!player) {
                player = this.getNonSeatedPlayer();
                this.players[i] = player;
            }
        }
        this.game = new Game(this.smallBlind, this.bigBlind);

        this.dealer = this.GetFirstDealer();
        this.started = true;
        this.initNewRound(deck, players);

        this.emit('gameStarted');

        return true;
    } else {
        console.log('game already running or not enough players: ', !this.game, this.getIngamePlayersLength() >= this.minPlayers);
    }

    return false;
};

Table.prototype.getCurrentPlayerLabel = function () {
    var player = this.getCurrentPlayer();
    return '[' + this.currentPlayer + ' - ' + player.playerName + '] ';
};

Table.prototype.getCurrentPlayer = function () {
    return this.players[this.currentPlayer];
};

Table.prototype.getNonSeatedPlayer = function () {
    return new Player({
        playerName: 'Empty seat',
        table: this
    });
};

// TODO: check maxPlayers, also return bool success
Table.prototype.addPlayer = function (options) {
    if (!options.playerName) {
        console.log('playerName is not defined', options);
        return;
    }


    var position;

    if (options.position === undefined) {
        i = 0;
        while (this.players[i] !== undefined) {
            i++;
        }
        position = i;
        options.position = i
    }

    position = options.position


    console.log('adding player ' + options.playerName + ' at position ' + options.position);
    options.table = this;

    // remove previous position if player already seated on table
    for (var i = 0; i < this.players.length; i++) {
        var player = this.players[i];
        if (player && player.playerName === options.playerName) {
            this.players[i] = this.getNonSeatedPlayer();
            break;
        }
    }

    var playerSeated = new Player(options);
    playerSeated.isSeated = true;
    this.players[position] = playerSeated;

    return true;
};

Table.prototype.removePlayer = function (playerName) {
    var player = this.getPlayerByName(playerName);
    var playerIndex = player.getIndex();
    this.players[playerIndex] = this.getNonSeatedPlayer();
};

Table.prototype.getIngamePlayersLength = function () {
    var tot = 0;
    this.forEachPlayers(function () {
        tot++;
    });
    return tot;
};

Table.prototype.resetTalkedStatusOnRaise = function () {
    var self = this;
    this.forEachPlayers(function (player) {
        if (!player.folded && !player.isAllIn && player.GetBet() < self.getMaxBet()) {
            player.talked = false;
        }
    });
};

Table.prototype.NextPlayer = function () {
    this.currentPlayer = this.getNextPlayerIndex(this.currentPlayer, true);
    var a = this.currentPlayer;
    console.log('current player is ' + a);

    var self = this;
    var cp = self.players[self.currentPlayer]
    console.log("cp", self.currentPlayer)
    self.emit("turn", cp);
};

module.exports = {
    Table: Table
};
