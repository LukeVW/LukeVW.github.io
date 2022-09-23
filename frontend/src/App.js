import './App.css';
import { useState } from 'react';
import useLocalStorageState from 'use-local-storage-state'
import { useNavigate } from "react-router-dom";

function App(props) {
  const [socketConnection, setSocketConnection] = useState(false);
  const [showFormError, setShowFormError] = useState(false);
  const [RequestPending, setRequestPending] = useState(false);
  const [creatingLobby, setCreatingLobby] = useState(false);
  const [namingCreator, setNamingCreator] = useState(false);
  const [joiningLobby, setJoiningLobby] = useState(false);
  const [currentLobbyPK, setCurrentLobbyPK] = useState(null);
  const navigate = useNavigate();
  const [storedUser, setStoredUser] = useLocalStorageState('storedUser', {
    ssr: true,
    defaultValue: { "lobbyPK": null, "name": null, "securityCode": null }
  });
  if (!socketConnection) {
    try {
      props.ws.send(JSON.stringify({ "msgType": "ping" }));
    } catch { }
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
    if (message.msgType === "InvalidInput") {
      setShowFormError(true);
    }
    if (message.msgType === "JoiningLobby") {
      setCurrentLobbyPK(message.lobbyPK);
      setJoiningLobby(true);
    }
    if (message.msgType === "CreatedLobby") {
      setCurrentLobbyPK(message.lobbyPK);
      setCreatingLobby(false);
      setNamingCreator(true);
    }
    if (message.msgType === "JoinOK") {
      setStoredUser(message.storedUser);
      navigate('/game');
    }
    if (message.msgType === "RedirectToGame") {
      navigate('/game');
    }
    if (message.msgType === "RequestPending") {
      setRequestPending(true);
    }

    if (message.msgType === "RequestDenied") {
      setRequestPending(false);
    }
  };

  const Header = () => {
    return (
      <header>
        <h1 style={{ margin: '0px', padding: '0px' }}>One-shots</h1>
      </header>);
  }

  const QuotesError = () => {
    if (value.includes('"') || value.includes("'")) {
      return (<p>Sorry, you can't use quotes</p>);
    }
    else return (<div />);
  }

  // Logic for inputs
  const [value, setValue] = useState('');
  const handleChange = (event) => { setValue(event.target.value); setShowFormError(false); };
  const sendToServer = (event) => {
    let msgToSend = {}
    if (creatingLobby) { msgToSend = { "msgType": "CreateLobby", "entryCode": String(value) } }
    else if (namingCreator) { msgToSend = { "msgType": "AddCreatorToLobby", "name": String(value), "lobbyPK": currentLobbyPK } }
    else if (joiningLobby) { msgToSend = { "msgType": "SubmitName", "name": String(value), "lobbyPK": currentLobbyPK, "storedUser": storedUser } }
    else { msgToSend = { "msgType": "JoinLobby", "entryCode": String(value) } }

    if (value) {
      props.ws.send(JSON.stringify(msgToSend))
    }
    setValue('');
    event.preventDefault();
  }
  const FormContainer = (props) => {
    const MultipurposeForm = () => {
      return (
        <form onSubmit={sendToServer}>
          <input type="text" autoFocus={true} value={value} onChange={handleChange} style={{ width: '150px', marginRight: '5px' }} />
          <button type="submit" >Send</button>
          <QuotesError />
        </form>

      );
    }
    if (showFormError) {
      return (
        <div>
          <MultipurposeForm />
          <p>{props.errorMessage}</p>
        </div>
      );
    } else {
      return (
        <div>
          <MultipurposeForm />
        </div>
      );
    }
  }

  if (socketConnection) {
    if (RequestPending) {
      return (
        <div className='App'>

          <Header />

          <h2>Just a second...</h2>
          <p>Waiting on the lobby creator to let you in</p>
        </div>
      );
    }
    if (creatingLobby) {
      return (
        <div className='App'>

          <Header />

          <h2>Create a lobby code</h2>
          <FormContainer errorMessage="Sorry, that code is unavailable" />
        </div>
      );
    }
    else if (namingCreator) {
      return (
        <div className='App'>

          <Header />

          <h2>Give yourself a name</h2>
          <FormContainer errorMessage="Sorry, you can't use that name" />
        </div>
      );
    }
    else if (joiningLobby) {
      return (
        <div className='App'>

          <Header />

          <h2>Give yourself a name</h2>
          <FormContainer errorMessage="Sorry, that name is unavailable" />

        </div>
      );
    }
    else { // landing page
      return (
        <div className='App'>

          <Header />

          <h2>Enter a lobby code here!</h2>
          <FormContainer errorMessage="Sorry, that lobby doesn't exist" />

          <p style={{ paddingTop: '25px' }}>
            Or, <button onClick={() => { setCreatingLobby(true); setShowFormError(false) }} style={{ color: 'white', textDecoration: 'underline', backgroundColor: 'rgb(40,80,125)' }}>set up a game</button>
          </p>

        </div>
      );
    }
  } else {
    return (
      <div className='App'>

        <Header />

        <h2>No connection</h2>
        <p>Try refreshing</p>
      </div>
    );
  }
} export default App;
