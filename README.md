# Install
`npm install`

or

`npm install --ignore-scripts`

# Example
Pokereum-RTC comes with an example usage from the CLI. Run the client with:

`node example/index.js`

You must host or join a game before you can chat. After hosting or joining a game, you must sit, if you want to play.

## CLI Commands
* name (name) - change your name
* host [small blind] [big blind] [min players] [max players] - host game
* join (game ID) - join game with ID. You can use "last" instead of game ID to join the last broadcast game.
* start - start the game, if you're host
* msg (message) - send chat message
* sit (amount) - sits you on the table with the chips amount
* call
* check
* fold
* bet (amount)
* allin
* next - next game round (only if you're host)
* exit

# Code usage

## PokereumClient

Main component of Pokereum-RTC is PokereumClient. As an argument it takes GameHandler function - this function is called for every game you join with CommGame object as parameter. You can bind your event handlers to the game object to create your implementation.

### Data structures
* MyProfile (config/my.profile.js) Data for the player running the Pokereum client.
    * string name
    * string eth_address

* Client (lib/clients.list.js) List used by the main layer to store links. Map hashname to:
    * Link link - [Telehash link](https://github.com/telehash/telehash-js/blob/master/lib/link.class.js)
        * hashname
    * string status
    * object linkJSON - Used for game connections.

* PokereumClient (pokereum.client.js)
    * MyProfile myProfile
    * map(string hashname => Client client) clientsList
    * CommMain comm 

### Interface
* PokereumClient(function GameHandler)
    * hostGame(string gameName, int minBlind = 10, int maxBlind = 30, minPlayers = 2, maxPlayers = 6): CommGame
    * joinGame(string gameId): CommGame
    * leaveGame(string gameId): void
    * acceptJoinRequest(Client client, string gameId): CommGame

### Events
* init
* client_up(Client client)
* client_down(Client client)
* new_game(string gameId, string gameName, bool isMyGame)
* join_request(Client client, string gameId)
* left_game(Client client, string gameId)

## CommGame

(lib/comm.game.js)

### Data structures
* Profile
    * string hashname
    * string name
* Player (lib/player.js)
    * string playerId - link hashname
    * string playerName
    * object hand
        * string message
        * array(string card) cards
        * float rank

### Interface
* message(string message)
* sendSitRequest(int chips)
* sitPlayer(Profile profile, int chips) - Only if you are host.
* startGame - Only if you are host.
* getMyCards: array(string card)
* getCardsOnBoard: array(string card)
* isMyTurn: bool
* check
* call
* fold
* bet(int amount)
* allIn
* next: Only if you are host. Start next round.

### Events
* new_chat_message (Profile profile, string message) - new chat message.
* player_joined (Profile profile) - player joined the lobby of the game.
* player_disconnected (Profile profile) - player link disconnected.
* player_sit_request (Profile profile, int chips) - players wants to sit. This event is fired only, if you are host of the game.
* player_sit (Profile profile, int chips) - players sits.
* game_ready - means the game is ready to start (min players joined). This event is fired only, if you are host of the game.
* player_check (Profile profile)
* player_call (Profile profile)
* player_fold (Profile profile)
* player_bet (Profile profile, int bet)
* player_all_in (Profile profile)
* invalid_turn (Profile profile, object args)
* win(Player winner, int won) 
* game_started
* round_deal
* round_flop
* round_turn
* round_river
* round_showdown
* game_over
* deck_ready(array(string card) deck)
* my_turn
* others_turn(Player player)

# In depth

There are two layers of communication - main lobby and games. Both are built with [Telehash-js](https://github.com/telehash/telehash-js/) library. The main lobby connection joins all clients and is used for games broadcasting. When a new game is hosted / joined, a new connection is created for it.

* Main lobby
    * Uses stream channel for communication
    * Uses three types of peer discovery:
        * Telehash routing - There is an implementation of a router build with Telehash.
        * Ethereum Whisper routing - If Telehash routers aren't available and a node with Whisper RPC enabled is available, Whisper will be used for routing.
        * Telehash discover mode - If Telehash routers aren't available and Whisper routing is not available as well, Telehash discover mode will be set to true to enable at least local network connectivity.
    * When a connection with a client is established, we broadcast all pending games to him. 
    * We can send requests to join games, which we know about and accept requests for our games. If our join request is accepted, we will receive details how to connect to the Telehash mesh of the host for this game.
* Game
    * Each game has a mesh in order to isolate the players.
    * Uses chat channel for communication.

## Routing

### Telehash router
You can find a basic router implementation here: https://github.com/Pokereum/Pokereum-Telehash-Router

The Telehash routers are defined in config/network.js (telehashRouters array). The router is serving its Telehash mesh JSON on HTTP GET request.

### Whisper router
To use Whisper routing, you need to be running Ethereum node - RPC available with SHH module. The RPC address is specified in config/network.js (ethereumRpc).

## Data Structures

* Game
    * string gameId
    * string gameName
    * Mesh hostMainMesh - [Telehash mesh](https://github.com/telehash/telehash-js/blob/master/lib/mesh.class.js)
    * bool joined
    * CommGame game
    * tableJSON - Used for game connections.

* CommMain (lib/comm.main.js)
    * MyProfile myProfile
    * map(string hashname => Client) clients
    * object mainMesh - [Telehash mesh](https://github.com/telehash/telehash-js/blob/master/lib/mesh.class.js)
    * map(string gameId => Game) games
    * map(string gameId => Game) myGames

* CommGame (lib/comm.game.js)
    * Mesh mesh - [Telehash mesh](https://github.com/telehash/telehash-js/blob/master/lib/mesh.class.js)
    * object chat
    * MyProfile myProfile
    * string host - hashname of host
    * string me - our hashname
    * string gameId
    * string gameName
    * Table table - (lib/table.js)
    * bool isMyGame
    * Profile chatProfiles
        * string hashname
        * string name

## Internal events

### CommMain
* init_main (mesh) - mesh is ready.
* new_link (link) - discovered someone on the network.
* link_status_update (link) - status update on the connection of the link.
* client_up (client) - new client ready.
* client_down (client) - client connection is down.
* new_stream_data (client, message) - new data.

### CommGame
* init_game (mesh) - mesh is ready.
* new_link (link) - discovered someone on the network.
* link_status_update (link) - status update on the connection of the link.
* game_hosted - chat channel is ready.
* ready_to_join (link, profile)- an invite has been received and you can join.
* new_game_data (msg) - For internal use - new chat channel message