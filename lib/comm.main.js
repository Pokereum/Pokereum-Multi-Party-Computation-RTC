'use strict';

var
        EventEmitter = require('events').EventEmitter,
        async = require('async'),
        Web3Lib = require('web3'),
        networkConfig = require('../config/network.js'),
        utils = require('./utils.js'),
        poker = require("./logic.js"),
        CommGame = require('./comm.game.js').CommGame,
        comm_lib = require('./comm.js'),
        web3;

function CommMain(myProfile, clients) {
    var _commMain = this;

    this.myProfile = myProfile;
    this.clients = clients;

    // used for lobby - players discrovery
    this.mainMesh = new Object();

    this.games = new Object();
    this.myGames = new Object();
    this.routerLinks = new Object();

    console.log("Getting public IP address.");
    comm_lib.get_public_ip(function (ip) {
        console.log("Initializing main mesh.");
        comm_lib.create_mesh(ip, init_mesh);
    });

    process.on('exit', function () {
        var bye_msg = JSON.stringify({'type': 'bye'});

        for (var i in _commMain.clients.list) {
            _commMain.clients.list[i].link.stream().write(bye_msg);
            _commMain.clients.list[i].link.close();
        }
        for (var a in _commMain.routerLinks) {
            _commMain.routerLinks[a].stream().write(bye_msg);
            _commMain.routerLinks[a].close();
        }
    });

    function init_mesh(err, mesh) {
        if (err) {
            throw err;
        }
        _commMain.mainMesh = mesh;

        var onLink = function (link) {
            _commMain.emit('new_link', link);
        };
        mesh.accept = onLink;
        mesh.extending({
            link: onLink
        });

        console.log('Preparing routing...');
        init_routing(function () {
            _commMain.emit('init', mesh);
        });
    }

    function init_routing(callback) {
        // Try Telehash routing first.
        var
                routersCount = networkConfig.telehashRouters.length;

        if (routersCount !== 0) {
            async.map(networkConfig.telehashRouters, function (router, async_cb) {
                comm_lib.http_get(router, init_telehash_router, async_cb);
            }, function (err, links) {
                // If Telehash routers aren't available, try Whisper routing
                if (err) {
                    alternative_routing(callback);
                } else {
                    for (var a in links) {
                        var link = links[a];
                        _commMain.routerLinks[link.hashname] = link;
                    }
                }
                callback();
            });
        } else {
            alternative_routing();
            callback();
        }
    }

    function alternative_routing() {
        // If Whisper routing isn't available too, use Telehash local network discovery
        if (init_web3_shh_router(_commMain) === false) {
            _commMain.mainMesh.discover(true);
            console.log("No routing available. You'll be able to play only with people from your local network.");
        }
    }

    function init_telehash_router(mesh_data, async_cb) {
        try {
            var mesh_json = JSON.parse(mesh_data);

            var link = _commMain.mainMesh.link(mesh_json);
            _commMain.mainMesh.router(link);

            if (link.up === false) {
                throw new Error(link.down);
            } else {
                console.log('connected to router', mesh_json.hashname);

                link.stream().write(JSON.stringify({type: 'introduce_me'}));
                return async_cb(null, link);
            }
        } catch (e) {
            console.log('Error connecting to router ', mesh_json.hashname, e);
            return async_cb(e);
        }
    }

    function init_web3_shh_router() {
        try {
            web3 = new Web3Lib();
            web3.setProvider(new web3.providers.HttpProvider(networkConfig.ethereumRpc));
            if (web3.isConnected() === false) {
                throw "not connected";
            } else {
                console.log('Using Whisper for routing.');
            }
        } catch (e) {
            console.log("Ethereum node not available - can't use Whisper routing.");

            return false;
        }

        try {
            var
                    routerTopics = [web3.fromAscii('PokereumRoutingHack')],
                    broadcastWatch;
            broadcastWatch = web3.shh.filter({'topics': routerTopics});
            broadcastWatch.watch(web3_shh_router_watch);
            web3_shh_router_broadcast(web3, routerTopics);
        } catch (e) {
            console.log('Ethereum node available, but can\'t use Whisper:', e);

            return false;
        }

        return true;
    }

    function web3_shh_router_watch(error, result) {
        if (error) {
            console.log('Whisper error: ', error);
            return;
        }
        var message = JSON.parse(web3.toAscii(result.payload));
        if (_commMain.mainMesh.hashname != message.hashname) {
            console.log('Whisper router announces', message.hashname);
            var link = _commMain.mainMesh.link(message.linkJSON);
            if (link.up) {
                console.log('new_link');
                _commMain.emit('new_link', link);
            }
        }
    }

    function web3_shh_router_broadcast(web3, routerTopics) {
        var message = {
            'topics': routerTopics,
            'payload': web3.fromAscii(JSON.stringify({
                'hashname': _commMain.mainMesh.hashname,
                'linkJSON': _commMain.mainMesh.json()
            }))
        };
        web3.shh.post(message);
    }

    this.on('new_link', function (from) {
        if (typeof this.clients.list[from.hashname] !== 'undefined') {
            return;
        }
        var
                _comm = this,
                link = _comm.mainMesh.link(from);

        _comm.clients.add(link);

        (function (_comm) {
            link.on('status', function () {
                _comm.emit('link_status_update', link);
            });
        })(_comm);
    });

    this.on('link_status_update', function (link) {
        console.log('link_status_update', link.hashname, link.up, link.down);
        var _comm = this;

        if (link.up && typeof _comm.clients.list[link.hashname].setup === 'undefined') {
            _comm.mainMesh.stream(function (from, args, accept) {
                var chan = accept();

                (function (_comm, link) {
                    chan.on('data', function (d) {
                        _comm.emit('new_stream_data', _comm.clients.list[link.hashname], d);
                    });
                })(_comm, link);
            });

            _comm.clients.list[link.hashname].setup = true;
            _comm.clients.list[link.hashname].status = 'up';
            _comm.emit('client_up', _comm.clients.list[link.hashname]);
        }
        if (link.up === false || link.down) {
            _comm.clients.list[link.hashname].status = 'down';
            _comm.clients.list[link.hashname].link.close();
            _comm.emit('client_down', _comm.clients.list[link.hashname]);
        }
    });

    /**
     * When we get a connection with a new client, we send him all the games we know about.
     * There could be a filter here - public games, which are broadcasted to everyone and private games, which need manual invites.
     * @param {type} client
     * @returns {undefined}
     */
    this.on('client_up', function (client) {
        console.log('client_up', client.link.hashname);

        if (client.link.hashname !== this.mainMesh.hashname) {
            this.sendGames(client);
        }
    });

    this.on('new_stream_data', function (client, message) {
        console.log('new_stream_data');
        try {
            message = JSON.parse(message.toString());
        } catch (e) {
            console.log('failed parsing message: ' + e, message.toString());
            return;
        }

        if (typeof message.gameId !== 'undefined' && typeof this.games[message.gameId] === 'undefined') {
            console.log('game not found');
            return;
        }
        console.log(message.type);

        switch (message.type) {
            case 'bye':
                client.link.close();
                break;
            case 'router_broadcast':
                console.log('Telehash router announces', message.hashname);
                var link = this.mainMesh.link(message.linkJSON);
                break;
            case 'games_broadcast':
                this.receiveGames(client, message);
                break;
            case 'join_request':
                if (typeof this.games[message.gameId] === 'undefined' || this.games[message.gameId].game.isMyGame === false) {
                    console.log('invalid game or no permissions to accept join request.');
                    return;
                }
                client.linkJSON = message.linkJSON;
                this.emit('join_request', client, message.gameId);
                break;
        }
    });

    /**
     * Inform everyone about the hosted game.
     */
    this.on('new_game', function (gameId, gameName, isMyGame) {
        if (isMyGame === false) {
            return;
        }

        for (var a in this.clients.list) {
            var to = this.clients.list[a];

            this.sendGames(to);
        }
    });
}

CommMain.prototype.__proto__ = EventEmitter.prototype;

CommMain.prototype.sendMessage = function (client, message) {
    if (client.status === 'up') {
        message = JSON.pruned(message);

        //console.log('sending', message);
        client.link.stream().write(message);

        return true;
    }

    return false;
};

CommMain.prototype.sendGames = function (client) {
    var message = {
        'type': 'games_broadcast',
        'profile': this.myProfile,
        'games': this.myGames,
    };

    this.sendMessage(client, message);
};

CommMain.prototype.receiveGames = function (client, message) {
    if (message.games.length !== 0) {
        for (var a in message.games) {
            var game = message.games[a];

            if (typeof this.games[game.gameId] === 'undefined') {
                game.table = poker.import(game.tableJSON);
                game.table.game = false;
                game.hostMainMesh = client.link.hashname;
                game.joined = false;
                delete game.tableJSON;

                this.games[game.gameId] = game;

                this.emit('new_game', game.gameId, game.gameName, false);
            } else {
                // We should do some sync here - in case if the host was dropped or something.
            }
        }
    }
};

CommMain.prototype.hostGame = function (gameName, minBlind, maxBlind, minPlayers, maxPlayers) {
    var
            table = poker.newTable({
                minBlind: minBlind,
                maxBlind: maxBlind,
                maxPlayers: maxPlayers,
                minPlayers: minPlayers,
            }, []),
            _comm = this,
            game = this.createCommGame('new', gameName, table, true);

    game.on('init_game', function () {
        _comm.emit('new_game', game.gameId, gameName, true);
    });

    return game;
};

CommMain.prototype.leaveGame = function (gameId) {
    if (typeof this.games[gameId] === 'undefined') {
        throw new Error('Invalid game.');
    }
    var game = this.games[gameId].game;

    for (var hashname in game.playersLinks) {
        game.playersLinks[hashname].close();
    }

    this.emit('left_game', gameId, this.games[gameId].gameName);
    delete this.games[gameId].game;
    delete this.games[gameId];
};

/**
 * When we want to join a game, we create a new mesh and send its hashname to the host.
 * This way only the host knows the "public" mesh hashname of the players.
 * The players know only the host's public mesh hashname - they know only
 * the hashnames of the other players, created for this specific game and not their public ones.
 * 
 * @param {type} client
 * @param {type} gameId
 * @param {type} gameName
 * @returns {undefined}
 */
CommMain.prototype.sendJoinRequest = function (gameId) {
    var
            _comm = this,
            gameInfo = this.games[gameId],
            game = this.createCommGame(gameId, gameInfo.gameName, gameInfo.table, false, gameInfo.hostMainMesh);

    game.on('init_game', function (mesh) {
        var
                message = {
                    'type': 'join_request',
                    'gameId': gameId,
                    'linkJSON': mesh.json(),
                },
                client = _comm.clients.list[gameInfo.hostMainMesh];

        _comm.sendMessage(client, message);
    });

    return game;
};

CommMain.prototype.createCommGame = function (gameId, gameName, table, isMyGame, host) {
    if (gameId === 'new') {
        gameId = utils.getUID();
    }

    var
            _comm = this,
            game = new CommGame(this.routerLinks, this.myProfile, gameId, gameName, table, isMyGame);

    game.on('start_game', function () {
        delete _comm.myGames[gameId];
    });

    this.games[gameId] = {
        'gameId': gameId,
        'game': game,
        'gameName': gameName,
        'hostMainMesh': host,
        'joined': true,
    };

    if (isMyGame === true) {
        this.myGames[gameId] = {
            'gameId': gameId,
            'gameName': gameName,
            'hostMainMesh': host,
            'tableJSON': table.toJSON(),
        };
    }

    return game;
};

module.exports.CommMain = CommMain;