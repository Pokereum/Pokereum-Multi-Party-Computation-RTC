module.exports = (function () {
    var
            http = require('http'),
            Telehash = require('telehash'),
            networkConfig = require('../config/network.js');

    delete Telehash.extensions.udp4;
    delete Telehash.extensions.tcp4;

    function http_get(options, callback, async_cb) {
        http.get(options, function (res) {
            if (res.statusCode !== 200) {
                res.resume();
                callback(false, async_cb);
                return;
            }
            var response_data = '';

            res.on('data', function (data) {
                response_data += data;
            });

            res.on('end', function () {
                callback(response_data, async_cb);
            });
        }).on('error', function (err) {
            callback(false, async_cb);
        });
    }

    function get_public_ip(callback) {
        if (typeof callback !== 'function') {
            throw new Error('You must provide a callback function.');
        }

        http_get(networkConfig.publicIp, callback);
    }

    function create_mesh(ip, callback) {
        Telehash.generate(function (err, endpoint) {
            if (err) {
                throw err;
            }
            var
                    args = {'id': endpoint};

            if (ip !== false) {
                args.ipv4 = ip;
                console.log('Loading mesh on IP: ', ip);
            }

            load_mesh(args, callback);
        });
    }

    function load_mesh(args, callback) {
        Telehash.load(args, callback);
    }

    return {
        http_get: http_get,
        get_public_ip: get_public_ip,
        create_mesh: create_mesh,
    };
})();