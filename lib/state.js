'use strict';

var utils = require('./utils.js');

function State(importData) {
    this.tables = new Object();
    this.clients = new Object();

    // importData
}

State.prototype.AddClient = function(client) {
    this.clients[client.link.hashname] = client;
    console.log('new client');
};

State.prototype.AddTable = function(host, table, status) {
    var tableId = utils.getUID();

    this.tables[tableId] = {
        'tableId': tableId,
        'host': host,
        'obj': table,
        'status': status,
    };
};

State.prototype.ExportTable = function(tableId) {
    if (typeof this.tables[tableId] === 'undefined') {
        return {};
    }

    var table = {
        'tableId': tableId,
        'host': this.tables[tableId].host,
        'obj': this.tables[tableId].obj.toJSON(),
        'status': this.tables[tableId].status,
    };

    return table;
};

State.prototype.ExportAllTables = function() {
    var tablesExport = new Array();

    for (var tableId in this.tables) {
        tablesExport.push(this.ExportTable(tableId));
    }

    return tablesExport;
};

module.exports.State = State;
