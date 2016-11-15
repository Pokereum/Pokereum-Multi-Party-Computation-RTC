'use strict';

function Clients() {
    this.list = new Object();
}

Clients.prototype.add = function (link) {
    this.list[link.hashname] = {
        'link': link,
        'status': 'discovered',
    };
};

Clients.prototype.isConnected = function (hashname) {
    return typeof this.list[hashname] !== 'undefined' && this.list[hashname].link.up;
};

module.exports.Clients = Clients;