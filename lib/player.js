'use strict';
var Result = require('./result.js').Result;
var utils = require('./utils.js');
var EventEmitter = require('events').EventEmitter;

function Player(options) {
    this.playerId = options.playerId;
    this.playerName = options.playerName;
    this.chips = options.chips || 0;
    this.folded = false;
    this.isAllIn = false;
    this.talked = false;
    this.isSeated = false;
    this.isEmptySeat = options.playerName === 'Empty seat';
    this.table = options.table; //Circular reference to allow reference back to parent object.
    this.cards = [];
    this.prize = 0;
}

// inherit from Event emitter
Player.prototype.__proto__ = EventEmitter.prototype;


Player.prototype.getIndex = function() {
    var found = false,
        i = 0;

    while (i < this.table.players.length && !found) {
        if(this !== this.table.players[i]) {
            i++;
        } else {
            found = true;
        }
    }

    return i;
};

Player.prototype.hasRaised = function() {
    var hasRaised = true,
        currentBet = this.GetBet(),
        self = this;

    this.table.forEachPlayers(function(player) {
        if(player !== self && player.GetBet() >= currentBet) {
            hasRaised = false;
        }
    });

    if(hasRaised) {
        console.log(this.table.getCurrentPlayerLabel()  + ' has raised ',currentBet);
    }

    return hasRaised;
};

Player.prototype.checkTurn = function() {
    if (this.table.currentPlayer !== this.getIndex()) {
        console.log("WRONG TURN, should be",this.table.currentPlayer, " you are",this.getIndex() );
        this.emit("wrongTurn");
        var self = this;
        
        this.table.emit("wrongTurn",{
            shouldBe: this.table.currentPlayer,
            violator: self.getIndex()
        });

        return false;
    }
    return true;
}
// Bet, support all in state
Player.prototype.SimpleBet = function(bet) {
    if (!this.checkTurn()) {
        return false;
    }

    var index = this.getIndex();
    var protectedBet = bet <= this.table.players[index].chips ? bet : this.table.players[index].chips;

    this.table.game.bets = utils.protectArrayBet(this.table.game.bets, index, protectedBet);
    this.table.players[index].chips = this.table.players[index].chips - protectedBet;
    this.talked = true;

    if(this.table.players[index].chips <= 0) {
        this.isAllIn = true;
        console.log(this.table.getCurrentPlayerLabel() + ' is all in !');
    }

    if(this.hasRaised()) {
        this.table.resetTalkedStatusOnRaise(this);
    }


    return true;
};

Player.prototype.GetBet = function() {
    var index = this.getIndex();
    return this.table.game.bets[index] || 0;
};

Player.prototype.GetRoundBet = function() {
    var index = this.getIndex();
    return this.table.game.roundBets[index] || 0;
};


Player.prototype.Check = function() {
    if (!this.checkTurn()) {
        return false;
    }
    console.log(this.table.getCurrentPlayerLabel() + ' checked');
    this.talked = true;
    this.table.progress();
    
    return true;
};

Player.prototype.fold = function() {
    if (!this.checkTurn()) {
        return false;
    }
    
    console.log(this.table.getCurrentPlayerLabel() + ' folded');
    this.folded = true;
    this.talked = true;
    this.table.progress();
    
    return true;
};

Player.prototype.bet = function(bet) {
    if (!this.SimpleBet(bet)) {
        return false;
    };
    console.log(this.table.getCurrentPlayerLabel() + ' bets ' + bet);

    this.talked = true;
    this.table.progress();
    
    return true;
};


Player.prototype.call = function() {
    var maxBet = this.table.getMaxBet(),
        currentBet = this.GetBet();

    if (!this.SimpleBet(maxBet - currentBet)) {
        return false;
    }
    console.log(this.table.getCurrentPlayerLabel() + ' called');

    this.talked = true;
    this.table.progress();
    
    return true;
};

Player.prototype.allIn = function() {
    if (!this.SimpleBet(this.chips)) {
        return false;
    }
    console.log(this.table.getCurrentPlayerLabel() + ' All in');
    
    this.talked = true;
    this.table.progress();
    
    return true;
};

Player.prototype.GetHand = function() {
    var cards = this.cards.concat(this.table.game.board);

    // {cards, rank, message} dans .hand
    return Result.rankHand({
        cards: cards
    });
};

Player.prototype.SetHand = function() {
    this.hand = this.GetHand();
};


module.exports = {
    Player: Player
};
