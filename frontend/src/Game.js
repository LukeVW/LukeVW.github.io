import './App.css';
import { useState } from 'react';
import useLocalStorageState from 'use-local-storage-state'

import { BsCheckCircle, BsXCircle } from 'react-icons/bs';
import { GiDiceTwentyFacesTwenty } from 'react-icons/gi';
import { ImCog } from 'react-icons/im';

function Game(props) {
  const [socketConnection, setSocketConnection] = useState(false);
  const [isOldClient, setIsOldClient] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [usersOnline, setUsersOnline] = useState([]);
  const [acceptName, setAcceptName] = useState("");
  const [denyName, setDenyName] = useState("");
  const [clientSynced, setClientSynced] = useState(false);
  const [messages, setMessages] = useState([]);
  const [value, setValue] = useState('');
  const [previousMsg, setPreviousMsg] = useState('');
  const [showModal, setShowModal] = useState(null);

  const handleChange = (event) => {
    setValue(event.target.value);
    setShowModal(null);
  };

  const sendMessage = (event) => {

    if (value) {
      if (value.charAt(0) === '/' && value.charAt(1).toLowerCase() === 'r') {
        setPreviousMsg(value)
      }
      if (value === '/clear') {
        setMessages([]);
      } else {
        props.ws.send(JSON.stringify({ "msgType": "SendMessage", "message": value, "storedUser": storedUser }))
      }

    }
    setValue('');
    event.preventDefault();
  };

  const [storedUser] = useLocalStorageState('storedUser', {
    ssr: true,
    defaultValue: { "lobbyPK": null, "name": null, "securityCode": null }
  });

  if (!socketConnection) {
    try {
      props.ws.send(JSON.stringify({ "msgType": "ping" }));
    } catch { }
  }
  else if (!clientSynced) {
    props.ws.send(JSON.stringify({ "msgType": "LoadLobby", "storedUser": storedUser }));
    setClientSynced(true);
  }

  props.ws.addEventListener("open", event => {
    setSocketConnection(true);
  });
  props.ws.addEventListener("close", event => {
    setSocketConnection(false);
  });

  props.ws.onmessage = function (message) {
    message = JSON.parse(message.data);
    if (message.msgType === "pong") {
      setSocketConnection(true);
    }
    if (message.msgType === "JoinRequests") {
      setJoinRequests(message.names);
    }
    if (message.msgType === "updatedUsers") {
      setUsersOnline(message.names);
    }
    if (message.msgType === "newClientOpen") {
      props.ws.send(JSON.stringify({ "msgType": "OldClient" }));
      setIsOldClient(true);
    }
    if (message.msgType === "NewMessage") {
      const clone = messages.slice();
      clone.unshift({ "is_roll": message.is_roll, "author": message.author, "content": message.content });
      setMessages(clone);
    }
    if (message.msgType === "MessageLog") {
      message.messages.unshift({ "author": 'Welcome to the lobby!', "content": 'To invite others, just give them the lobby code.\n----\nTo roll dice, type something like this:\n    /roll 1d20\n/roll 3d6', "admin": true });
      setMessages(message.messages);
    }
  }

  const Header = () => {
    return (
      <header>
        <h1 style={{ margin: '0px', padding: '0px' }}>One-shots</h1>
      </header>);
  }

  const AcceptUser = () => {
    props.ws.send(JSON.stringify({ "msgType": "AcceptUser", "name": acceptName, "storedUser": storedUser }))
    setAcceptName('');
  }
  const DenyUser = () => {
    props.ws.send(JSON.stringify({ "msgType": "DenyUser", "name": denyName, "storedUser": storedUser }))
    setDenyName('');
  }
  if (denyName !== '') {
    DenyUser();
  }
  else if (acceptName !== '') {
    AcceptUser();
  }

  const JoinRequest = (props) => {
    return (<div className='request'>

      <button onClick={() => { setDenyName(props.name) }} className="join-button">
        <BsXCircle />
      </button>

      <button onClick={() => { setAcceptName(props.name) }} className="join-button">
        <BsCheckCircle />
      </button>

      <b style={{ paddingLeft: "7px" }}>{props.name}</b>

    </div>);
  }

  const UserOnline = (props) => {
    return (
      <div style={{ display: "inline-block" }}>
        {props.name}
      </div>
    );
  }

  const Message = (props) => {
    const lines = props.content.split(/\r?\n/);
    let bgColor = 'rgb(30,30,30)';
    let author = props.author + ":"
    if (props.author === storedUser.name) { bgColor = 'rgb(40,40,35)' }
    if (props.admin === true) {
      bgColor = 'rgb(35,35,50)';
      author = props.author
    }

    if (props.is_roll === 'TRUE') {
      return (
        <div className='message' style={{ backgroundColor: bgColor }}>
          <div style={{ paddingLeft: '8px' }}><b>{props.author} rolled: </b>{lines[0]}</div>
          <div style={{ paddingLeft: '18px', whiteSpace: 'pre-wrap' }}><i>{lines[1]}</i></div>
          <div style={{ paddingLeft: '18px' }}>Total: <b>{lines[2]}</b></div>
        </div>
      )
    }

    return (
      <div className='message' style={{ backgroundColor: bgColor }}>
        <b style={{ paddingLeft: '8px' }}>{author}</b>
        {lines.map(function (data, index) { return (<div style={{ paddingLeft: '18px' }} key={index} >{data}</div>) })}
      </div>
    );
  }

  const textAreaLogic = (e) => {
    if (e.keyCode === 13 && e.shiftKey === false) {
      e.preventDefault();
      sendMessage();
    }
    if (e.keyCode === 38 && value === '') {
      e.preventDefault();
      setValue(previousMsg);
    }
  };

  const ModalBase = (props) => {
    return (
      <div className='modal-container'>
        <div className='modal'>
          {props.content}
        </div>
        <div className='modal-background' onClick={() => { setShowModal(null) }} />
      </div>
    );
  }
  const RollModal = () => {
    const [diceAmount, setDiceAmount] = useState('1');
    const [diceType, setDiceType] = useState('d20');
    const newDiceType = (event) => {
      setDiceType(event.target.value);
    }
    const newDiceAmount = (event) => {
      setDiceAmount(event.target.value);
    }
    const rollDice = (event) => {
      let rollCommand = '/r '+diceAmount+diceType;
      props.ws.send(JSON.stringify({ "msgType": "SendMessage", "message": rollCommand, "storedUser": storedUser }))
      if (event != null) {event.preventDefault();}
      setShowModal(false);
    }
    const submitOnEnter = (e) => {
      if (e.keyCode === 13) {
        e.preventDefault();
        rollDice();
      }
    }
    return (
      <div style={{ width: '302px', minHeight: '248px' }}>

        <div style={{ marginBottom: '43px', paddingTop: '5px', paddingBottom: '5px', backgroundColor: 'rgb(35,35,50)', border: 'solid', borderColor: 'rgb(120,120,120)', borderWidth: '1px' }} >
          <b>Roll dice</b>
        </div>

        <form onSubmit={rollDice}>
          <select name="numbers" onKeyDown={submitOnEnter} onChange={newDiceAmount} id="numbers" style={{ width: '110px', height: '50px', fontSize: '30px', textAlign: 'center' }} >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="7">7</option>
            <option value="8">8</option>
            <option value="9">9</option>
            <option value="10">10</option>
          </select>
          <select name="dice" onKeyDown={submitOnEnter} onChange={newDiceType} id="dice" style={{ width: '110px', height: '50px', fontSize: '30px' }} autoFocus>
            <option value="d20">d20</option>
            <option value="d12">d12</option>
            <option value="d10">d10</option>
            <option value="d8">d8</option>
            <option value="d6">d6</option>
            <option value="d4">d4</option>
            <option value="d100">d100</option>
            <option value="d1000">d1000</option>
          </select>

          <div style={{ marginTop: '20px' }}>
            <button className='modal-roll-button' style={{ fontSize: '25px', width: '69px', height: '43px', borderWidth: '2px' }} type="submit">
              Roll
            </button>
          </div>
        </form>
      </div>
    );
  }
  const SettingsModal = () => {
    const [feedbackValue, setFeedbackValue] = useState('');
    const updateValue = (event) => {
      setFeedbackValue(event.target.value);
    }
    const feedbackLogic = (e) => {
      if (e.keyCode === 13 && e.shiftKey === false) {
        e.preventDefault();
        if (feedbackValue !== '')  {
          props.ws.send(JSON.stringify({ "msgType": "LogFeedback", "message": feedbackValue }))
          let tempClone = messages.slice();
          tempClone.unshift({ "author": 'Thank you!', "content": 'Your feedback will be reviewed.', "admin": true });
          setMessages(tempClone);
        }
        setShowModal(false);
      }
    };
    return (
      <div style={{ width: '302px', minHeight: '248px' }}>
        <div style={{ marginBottom: '14px', paddingTop: '5px', paddingBottom: '5px', backgroundColor: 'rgb(35,35,50)', border: 'solid', borderColor: 'rgb(120,120,120)', borderWidth: '1px' }} >
          <b>Nothing here!</b>
        </div>
        Please, leave some feedback:
        <textarea className='feedback-area' style={{marginTop: '20px'}} autoFocus={true} value={feedbackValue} onChange={updateValue} onKeyDown={feedbackLogic} />
      </div>
    );
  }

  // RENDER LOGIC
  if (socketConnection) {
    if (isOldClient) {
      return (
        <div>
          <Header />
          <h2>OLD CLIENT</h2>
          <p>Please refresh!</p>
        </div>
      );
    }
    return (
      <div className='Game'>
        {showModal}

        <div className='interface'>

          {/* <h1 style={{textAlign: 'left', paddingLeft: '25px', fontSize: '25px'}}>One-shots</h1> */}

          <div className='join-requests'>
            {joinRequests.map(data => <JoinRequest name={data} key={data} />)}
          </div>
          <div className='user-block'>
            <div className='users-online'>
              {usersOnline.map(data => <UserOnline name={data} key={data} />)}
            </div>
            <b className='users-label'>Users online</b>
          </div>
        </div>

        <div className='chat'>
          <div className='messages-container'>
            {messages.map(function (data, index) { return (<Message is_roll={data.is_roll} author={data.author} admin={data.admin} content={data.content} key={index} />) })}
          </div>
          <form id="msgForm" onSubmit={sendMessage} style={{ display: "flex", marginTop: '2px' }}>
            {/* <input type="text" autoFocus={true} value={value} onChange={handleChange} style={{ width: '85%' }} /> */}
            <textarea className='static-area' autoFocus={true} value={value} onChange={handleChange} onKeyDown={textAreaLogic} />
            <button type="submit" onSubmit={sendMessage} className='send-button'>Send</button>
          </form>
          <div className='button-menu'>
            <button className='menu-button' onClick={() => { setShowModal(<ModalBase content={<RollModal />} />) }}><GiDiceTwentyFacesTwenty /></button>
            <button className='menu-button' style={{ color: 'white' }} onClick={() => { setShowModal(<ModalBase content={<SettingsModal />} />) }}><ImCog /></button>
          </div>
        </div>

      </div>
    );

  } else { // No connection
    return (
      <div>
        <Header />
        <h2>No connection...</h2>
        <p>Try refreshing the page</p>
      </div>
    );
  }
} export default Game;
