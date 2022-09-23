import { ClientRequest, createServer } from 'http';
import staticHandler from 'serve-handler'; // Should be temporary
import ws, { WebSocketServer } from 'ws';
import { evaluate, string } from "mathjs";
import sqlite3 from 'sqlite3';
const SQLite3 = sqlite3.verbose();
const db = new SQLite3.Database('oneshots.db');

const server = createServer((req, res) => {
    return staticHandler(req, res, { public: 'public' })
});
const query = (command, method = 'all') => {
    return new Promise((resolve, reject) => {
        db[method](command, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
};
function sendToClient(client, msg) {
    if (client.readyState === ws.OPEN) {
        client.send(JSON.stringify(msg));
    }
}
function generateSecurityCode() {
    const charList = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    let result = "";
    for (let i = 0; i < 10; i++) {
        result += charList[Math.floor(Math.random() * (charList.length - 1))];
    }
    return result;
}

function parseRoll(rollToParse) {

    function calculateRoll(times, die) {
        if (times === '') {times = '1'}
        let result = { 'rolls': [], 'total': null }
        let total = 0;
        for (let i = 0; i < times; i++) {
            let roll = Math.floor((Math.random() * parseInt(die)) + 1);
            result.rolls.push(roll);
            total += roll;
        }
        result.total = total;
        return result
    }

    var rollString = rollToParse.replaceAll(' ', '').toLowerCase();
    rollToParse = rollString.split('');

    // Check if valid input...
    const charsAllowed = '1234567890d*-+/().'.split(''); let isValid = false;
    for (let i = 0; i < rollToParse.length; i++) {
        isValid = false;
        for (let ii = 0; ii < charsAllowed.length; ii++) {
            if (rollToParse[i] === charsAllowed[ii]) {
                isValid = true;
            }
        }
        if (isValid === false) {
            return false;
        }
    }

    if (rollString.includes('d') === false) {
        try {
            let answer = evaluate(rollString);
            return { 'total': answer, 'rolls': [], 'string': rollString }
        } catch {
            return false;
        }
    } else {  // Roll the dice...

        // Identify all rolls to be made...
        let splits = rollString.replaceAll('*', ' ').replaceAll('-', ' ').replaceAll('+', ' ').replaceAll('/', ' ').replaceAll('.', ' ').replaceAll('(', ' ').replaceAll(')', ' ').split(' ');
        let diceToRoll = [];
        for (let i = 0; i < splits.length; i++) {
            if (splits[i].includes('d')) {
                if (splits[i].split('d').length > 2) {
                    return false
                }
                else { // Roll identified...
                    diceToRoll.push(splits[i]);
                }
            }
        }

        // Finalize rolls...
        let result = rollString;
        let totalRolls = [];
        for (let i = 0; i < diceToRoll.length; i++) {

            if (result.includes(diceToRoll[i])) {

                // Roll & set results
                let rollVars = diceToRoll[i].split('d');
                let rolled = calculateRoll(rollVars[0], rollVars[1]);

                result = result.replace(diceToRoll[i], rolled.total);







                let toAdd = diceToRoll[i] + ': (';
                for (let ii = 0; ii < rolled.rolls.length; ii++) {
                    toAdd += rolled.rolls[ii]
                    if (ii !== rolled.rolls.length - 1) {
                        toAdd += ', '
                    } else {
                        toAdd += ')'
                    }
                }
                totalRolls.push(toAdd);









            } else {
                return false
            }
        }
        let total = 0;
        try {
            total = evaluate(result);
        } catch { return false }
        return { "total": total, 'rolls': totalRolls, 'string': rollString };
    }

}

// Setup DB, lobby tracking...
let lobbies = []; db.serialize(async () => {
    db.get("PRAGMA foreign_keys = ON")
    await query("CREATE TABLE IF NOT EXISTS lobby(lobby_id INTEGER PRIMARY KEY, entry_code TEXT NOT NULL, is_active TEXT NOT NULL, user_id INTEGER, FOREIGN KEY(user_id) REFERENCES user(user_id))", 'run');
    await query("CREATE TABLE IF NOT EXISTS user(user_id INTEGER PRIMARY KEY, name TEXT NOT NULL, security_code TEXT NOT NULL, lobby_id INTEGER NOT NULL, FOREIGN KEY(lobby_id) REFERENCES lobby(lobby_id))", 'run');
    //await query("CREATE TABLE IF NOT EXISTS message(message_id INTEGER PRIMARY KEY, content TEXT NOT NULL, user_id INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES user(user_id))", 'run');
    await query("CREATE TABLE IF NOT EXISTS message(message_id INTEGER PRIMARY KEY, is_roll TEXT NOT NULL, content TEXT NOT NULL, author TEXT NOT NULL, lobby_id INTEGER NOT NULL, FOREIGN KEY(lobby_id) REFERENCES lobby(lobby_id))", 'run');

    // Get lobbies from database...
    const lobbiesDB = await query('SELECT * FROM lobby');
    for (let i = 0; i < lobbiesDB.length; i++) {

        var messagesDB = await query('SELECT * FROM message WHERE lobby_id =' + lobbiesDB[i].lobby_id + '');

        lobbies.push({ "messages": messagesDB, "creatorRef": null, "userClients": [], "joinRequests": [], "data": lobbiesDB[i] });
    }
});

// Console logic...
let numberOfClients = 0;
let feedbackString = '';
const updateConsole = (numberOfClients, feedbackString) => {
    let consoleString = '\n\n'+'Clients connected: '+String(numberOfClients)+'\n\n\n'+'FEEDBACK\n'+feedbackString;
    console.clear();
    console.log(consoleString);
}
updateConsole(numberOfClients, feedbackString);

const wss = new WebSocketServer({ server })
wss.on('connection', (client) => {

    numberOfClients += 1;
    updateConsole(numberOfClients, feedbackString);


    client.creatingLobby = null
    client.joiningLobby = null
    client.inLobby = null

    // ==============================================================================================================================================================
    client.on('message', (msg) => {
        msg = JSON.parse(msg);

        if (msg.msgType === "ping") {
            sendToClient(client, { "msgType": "pong" });
        }

        // Creating lobby logic
        if (msg.msgType === "CreateLobby") {
            if (msg.entryCode.includes('"') !== true && msg.entryCode.includes("'") !== true) {
                db.serialize(async () => {

                    const lobbyExists = await query('SELECT * FROM lobby WHERE entry_code = "' + msg.entryCode + '" AND is_active = "TRUE"');

                    if (lobbyExists.length === 1) {
                        sendToClient(client, { "msgType": "InvalidInput" });
                    }
                    else if (lobbyExists.length === 0) {
                        await query("INSERT INTO lobby (entry_code, is_active) VALUES ('" + msg.entryCode + "', 'TRUE')", 'run');
                        const newLobby = await query('SELECT * FROM lobby WHERE entry_code = "' + msg.entryCode + '"');
                        const newLobbyPK = newLobby[0].lobby_id
                        lobbies.push({ "messages": [], "creatorRef": null, "userClients": [], "joinRequests": [], "data": newLobby[0] });
                        client.creatingLobby = newLobbyPK;
                        sendToClient(client, { "msgType": "CreatedLobby", "lobbyPK": newLobbyPK });
                    }
                })
            }
        }
        if (msg.msgType === "AddCreatorToLobby") {
            if (msg.name.includes('"') !== true && msg.name.includes("'") !== true) {
                db.serialize(async () => {

                    client.creatingLobby = null;
                    const newSecurityCode = generateSecurityCode();

                    await query("INSERT INTO user (name, security_code, lobby_id) VALUES ('" + msg.name + "', '" + newSecurityCode + "', " + msg.lobbyPK + ")", 'run');
                    const newCreator = await query('SELECT * FROM user WHERE name = "' + msg.name + '" AND security_code = "' + newSecurityCode + '" AND lobby_id = ' + msg.lobbyPK + '');
                    const newCreatorPK = newCreator[0].user_id;
                    await query("UPDATE lobby SET user_id = " + newCreatorPK + " WHERE lobby_id = " + msg.lobbyPK + "", 'run');
                    lobbies[msg.lobbyPK - 1].data.user_id = newCreatorPK
                    sendToClient(client, { "msgType": "JoinOK", "storedUser": { "lobbyPK": msg.lobbyPK, "name": msg.name, "securityCode": newSecurityCode } });
                })
            }
        }

        // Joining lobby logic
        if (msg.msgType === "JoinLobby") {
            if (msg.entryCode.includes('"') !== true && msg.entryCode.includes("'") !== true) {
                db.serialize(async () => {

                    const lobbyExists = await query('SELECT * FROM lobby WHERE entry_code = "' + msg.entryCode + '" AND is_active = "TRUE"');
                    if (lobbyExists.length === 0) {
                        sendToClient(client, { "msgType": "InvalidInput" });
                    }
                    else if (lobbyExists.length === 1) {
                        sendToClient(client, { "msgType": "JoiningLobby", "lobbyPK": lobbyExists[0].lobby_id });
                    }
                })
            }
        }
        if (msg.msgType === "SubmitName") {
            if (msg.name.includes('"') !== true && msg.name.includes("'") !== true) {
                db.serialize(async () => {

                    const nameUsed = await query('SELECT * FROM user WHERE name = "' + msg.name + '" AND lobby_id = ' + msg.lobbyPK + '');

                    // Check if name is already associated with a lobby in DB
                    if (nameUsed.length === 1) {
                        if (nameUsed[0].security_code === msg.storedUser.securityCode && nameUsed[0].name === msg.storedUser.name && nameUsed[0].lobby_id === msg.storedUser.lobbyPK) {
                            sendToClient(client, { "msgType": "RedirectToGame" });
                        }
                        else {
                            sendToClient(client, { "msgType": "InvalidInput" });
                        }
                    }
                    else if (nameUsed.length === 0) {

                        // Check if name is already in join requests
                        let inJoinRequests = false;
                        const activeJoinRequests = lobbies[msg.lobbyPK - 1].joinRequests;
                        for (let i = 0; i < activeJoinRequests.length; i++) {
                            if (activeJoinRequests[i].name === msg.name) {
                                inJoinRequests = true;
                            }
                        }
                        if (inJoinRequests) {
                            sendToClient(client, { "msgType": "InvalidInput" });
                        }
                        else {  // New join request logic
                            client.joiningLobby = { "lobbyPK": msg.lobbyPK, "name": msg.name };
                            lobbies[msg.lobbyPK - 1].joinRequests.push({ "client": client, "name": msg.name });
                            if (lobbies[msg.lobbyPK - 1].creatorRef != null) {
                                let requestNames = [];
                                const lobbyJoinRequests = lobbies[msg.lobbyPK - 1].joinRequests
                                for (let i = 0; i < lobbyJoinRequests.length; i++) {
                                    requestNames.unshift(lobbyJoinRequests[i].name);
                                }
                                let creatorClient = lobbies[msg.lobbyPK - 1].creatorRef.client;
                                sendToClient(creatorClient, { "msgType": "JoinRequests", "names": requestNames });
                            }
                            sendToClient(client, { "msgType": "RequestPending" });
                        }
                    }
                })
            }
        }

        // ----------------------------------------------------------------------------------------------------------------------------------------------------------

        if (msg.msgType === "LogFeedback") {
            feedbackString += '-----------\n'+msg.message+'\n';
            updateConsole(numberOfClients, feedbackString);
        }
        
        if (msg.msgType === "LoadLobby") {
            db.serialize(async () => {
                const userExists = await query('SELECT * FROM user WHERE name = "' + msg.storedUser.name + '" AND security_code = "' + msg.storedUser.securityCode + '" AND lobby_id = ' + msg.storedUser.lobbyPK + '');
                if (userExists.length === 1) {

                    // if previous client was already using this storedUser data, send a newClientOpen message
                    const currentUsers = lobbies[msg.storedUser.lobbyPK - 1].userClients;
                    let updatedClient = false;
                    for (let i = 0; i < currentUsers.length; i++) {
                        if (currentUsers[i].name === msg.storedUser.name) {
                            sendToClient(lobbies[msg.storedUser.lobbyPK - 1].userClients[i].client, { "msgType": "newClientOpen" });
                            lobbies[msg.storedUser.lobbyPK - 1].userClients[i].client = client;
                            updatedClient = true;
                        }
                    }

                    // if creator, set creatorRef & send current JoinRequests
                    const lobbyUserPK = lobbies[msg.storedUser.lobbyPK - 1].data.user_id
                    if (lobbyUserPK === userExists[0].user_id) {
                        lobbies[msg.storedUser.lobbyPK - 1].creatorRef = { "client": client, "name": msg.storedUser.name }

                        const currentJoinRequests = lobbies[msg.storedUser.lobbyPK - 1].joinRequests;
                        let currentRequestNames = []
                        for (let i = 0; i < currentJoinRequests.length; i++) {
                            currentRequestNames.unshift(currentJoinRequests[i].name);
                        }
                        sendToClient(client, { "msgType": "JoinRequests", "names": currentRequestNames });
                    }

                    if (!updatedClient) {
                        // add to userClients
                        lobbies[msg.storedUser.lobbyPK - 1].userClients.push({ "client": client, "name": msg.storedUser.name });
                        client.inLobby = { "name": msg.storedUser.name, "lobbyPK": msg.storedUser.lobbyPK };
                    }


                    const allMessages = lobbies[msg.storedUser.lobbyPK - 1].messages;
                    let msgLog = [];
                    for (let i = 0; i < allMessages.length; i++) {
                        msgLog.unshift({ 'is_roll': allMessages[i].is_roll, "author": allMessages[i].author, "content": allMessages[i].content });
                    }
                    sendToClient(client, { "msgType": "MessageLog", "messages": msgLog });

                    // send updated userClients to all in userClients
                    const allUsers = lobbies[msg.storedUser.lobbyPK - 1].userClients;
                    var updatedUsers = [];
                    for (let i = 0; i < allUsers.length; i++) {
                        updatedUsers.push(allUsers[i].name);
                    }
                    for (let i = 0; i < allUsers.length; i++) {
                        sendToClient(allUsers[i].client, { "msgType": "updatedUsers", "names": updatedUsers });

                    }


                }
            })
        }

        // Handling Join requests...
        if (msg.msgType === "AcceptUser") {
            db.serialize(async () => {

                let lobby = lobbies[msg.storedUser.lobbyPK - 1]

                const newSecurityCode = generateSecurityCode();
                await query("INSERT INTO user (name, security_code, lobby_id) VALUES ('" + msg.name + "', '" + newSecurityCode + "', " + msg.storedUser.lobbyPK + ")", 'run');

                let updatedRequests = []
                let updatedNames = []
                for (let i = 0; i < lobby.joinRequests.length; i++) {
                    if (lobby.joinRequests[i].name === msg.name) {
                        sendToClient(lobby.joinRequests[i].client, { "msgType": "JoinOK", "storedUser": { "name": msg.name, "securityCode": newSecurityCode, "lobbyPK": msg.storedUser.lobbyPK } });
                    } else {
                        updatedRequests.push(lobby.joinRequests[i]);
                        updatedNames.unshift(lobby.joinRequests[i].name);
                    }
                }

                lobbies[msg.storedUser.lobbyPK - 1].joinRequests = updatedRequests
                sendToClient(lobby.creatorRef.client, { "msgType": "JoinRequests", "names": updatedNames });

            })
        }
        if (msg.msgType === "DenyUser") {
            const lobby = lobbies[msg.storedUser.lobbyPK - 1]
            const updatedRequests = []
            const updatedNames = []
            for (let i = 0; i < lobby.joinRequests.length; i++) {
                if (lobby.joinRequests[i].name === msg.name) {
                    sendToClient(lobby.joinRequests[i].client, { "msgType": "RequestDenied" });
                } else {
                    updatedRequests.push(lobby.joinRequests[i]);
                    updatedNames.unshift(lobby.joinRequests[i].name);
                }
            }
            lobbies[msg.storedUser.lobbyPK - 1].joinRequests = updatedRequests
            sendToClient(lobby.creatorRef.client, { "msgType": "JoinRequests", "names": updatedNames });

        }

        if (msg.msgType === "SendMessage") {
            db.serialize(async () => {

                const userExists = await query('SELECT * FROM user WHERE name = "' + msg.storedUser.name + '" AND security_code = "' + msg.storedUser.securityCode + '" AND lobby_id = ' + msg.storedUser.lobbyPK + '');
                if (userExists.length === 1) {

                    // Check if roll command
                    let roll = null;
                    let isRoll = 'FALSE';
                    if (msg.message.charAt(0) === '/' && msg.message.charAt(1).toLowerCase() === "r") {
                        if (msg.message.substring(0, 6).toLowerCase() === '/roll ') {
                            roll = parseRoll(msg.message.substring(6, msg.message.length));
                        } else if (msg.message.charAt(2) === ' ') {
                            roll = parseRoll(msg.message.substring(3, msg.message.length));
                        }

                        if (roll !== false && roll !== null) {

                            // Configure message to be sent
                            msg.message = String(roll.string) + "\n"

                            // String(roll.rolls)+'\n'
                            for (let i = 0; i < roll.rolls.length; i++) {
                                msg.message += roll.rolls[i]
                                if (i !== roll.rolls.length-1) {
                                    msg.message += ',   '
                                }
                            }
                            msg.message += '\n';

                            msg.message += String(roll.total)

                            isRoll = 'TRUE';


                        } else {
                            // console.log("Invalid roll");
                        }

                    }

                    await query("INSERT INTO message (is_roll, content, author, lobby_id) VALUES ('" + isRoll + "', '" + msg.message.replaceAll("'", "''").replaceAll('"', '""') + "', '" + msg.storedUser.name + "', " + msg.storedUser.lobbyPK + ")", 'run');
                    lobbies[msg.storedUser.lobbyPK - 1].messages.push({ "is_roll": isRoll, "content": msg.message, "author": msg.storedUser.name, "lobby_id": msg.storedUser.lobbyPK });

                    for (let i = 0; i < lobbies[msg.storedUser.lobbyPK - 1].userClients.length; i++) {
                        sendToClient(lobbies[msg.storedUser.lobbyPK - 1].userClients[i].client, { "msgType": "NewMessage", "is_roll": isRoll, "author": msg.storedUser.name, "content": msg.message });
                    }
                }
            })
        }

        if (msg.msgType === "OldClient") {
            client.inLobby = null;
        }

    })  // ==========================================================================================================================================================
    // Handle client disconnections
    client.on('close', () => {
        
        numberOfClients -= 1;
        updateConsole(numberOfClients, feedbackString);

        // disconnect while client was creating a lobby
        if (client.creatingLobby != null) {
            lobbies[client.creatingLobby - 1].data.is_active = "FALSE";
            db.serialize(async () => { await query("UPDATE lobby SET is_active = 'FALSE' WHERE lobby_id = " + client.creatingLobby + "", 'run'); })
        }

        // Disconnect while client's join request was pending
        if (client.joiningLobby != null) {

            const oldRequests = lobbies[client.joiningLobby.lobbyPK - 1].joinRequests;

            const newRequests = []
            const newRequestNames = []

            for (let i = 0; i < oldRequests.length; i++) {
                if (oldRequests[i].name != client.joiningLobby.name) {
                    newRequests.push(oldRequests[i]);
                    newRequestNames.unshift(oldRequests[i].name);
                }
            }

            lobbies[client.joiningLobby.lobbyPK - 1].joinRequests = newRequests;

            let creatorClient = lobbies[client.joiningLobby.lobbyPK - 1].creatorRef;
            if (creatorClient != null) {
                sendToClient(creatorClient.client, { "msgType": "JoinRequests", "names": newRequestNames });
            }
        }

        // disconnect while in a lobby
        if (client.inLobby != null) {

            // set creatorActive to null on creator disconnect
            if (lobbies[client.inLobby.lobbyPK - 1].creatorRef != null) {
                if (client.inLobby.name === lobbies[client.inLobby.lobbyPK - 1].creatorRef.name) {
                    lobbies[client.inLobby.lobbyPK - 1].creatorRef = null
                }
            }

            const newUsersActive = [];
            const newNames = [];
            const oldUsersActive = lobbies[client.inLobby.lobbyPK - 1].userClients;
            for (let i = 0; i < oldUsersActive.length; i++) {
                if (oldUsersActive[i].name != client.inLobby.name) {
                    newUsersActive.push(oldUsersActive[i]);
                    newNames.push(oldUsersActive[i].name);
                }
            }
            lobbies[client.inLobby.lobbyPK - 1].userClients = newUsersActive;

            const lobby = lobbies[client.inLobby.lobbyPK - 1]

            for (let i = 0; i < lobby.userClients.length; i++) {
                sendToClient(lobby.userClients[i].client, { "msgType": "updatedUsers", "names": newNames });
            }
        }

    })
})
server.listen(process.argv[2] || 8080, () => {
})