import * as axios from 'axios';
import * as core from '@actions/core';
import * as github from '@actions/github';

const { context = {} } = github;
const { pull_request, head_commit } = context.payload;

const regexPullRequest = /Merge pull request \#\d+ from/g;
const trelloApiKey = core.getInput('trello-api-key', { required: true });
const trelloAuthToken = core.getInput('trello-auth-token', { required: true });
const trelloBoardId = core.getInput('trello-board-id', { required: true });
const trelloCardAction = core.getInput('trello-card-action', { required: true });
const trelloListNameCommit = core.getInput('trello-list-name-commit', { required: true });
const trelloListNamePullRequestOpen = core.getInput('trello-list-name-pr-open', { required: false });
const trelloListNamePullRequestClosed = core.getInput('trello-list-name-pr-closed', { required: false });

function getCardNumber(message) {
  console.log(`getCardNumber(${message})`);
  let ids = message && message.length > 0 ? message.replace(regexPullRequest, "").match(/\#\d+/g) : [];
  return ids && ids.length > 0 ? ids[ids.length-1].replace('#', '') : null;
}

function getCardNumbersArray(message) {
  console.log(`getCardNumbersArray(${message})`);
  let ids = message && message.length > 0 ? message.replace(regexPullRequest, "").match(/\#\d+/g) : [];
  return ids && ids.length > 0 ? [...new Set(ids.map((x) => {return x.replace('#', '');}))] : null;
}

async function getCardOnBoard(board, message) {
  console.log(`getCardOnBoard(${board}, ${message})`);
  let card = getCardNumber(message);
  if (card && card.length > 0) {
    let url = `https://trello.com/1/boards/${board}/cards/${card}`
    return await axios.get(url, { 
      params: { 
        key: trelloApiKey, 
        token: trelloAuthToken 
      }
    }).then(response => {
      return response.data.id;
    }).catch(error => {
      console.log(url, `Error ${error.response.status} ${error.response.statusText}`);
      return null;
    });
  }
  return null;
}

async function getCardOnBoardByNumber(board, cardNumber) {
  console.log(`getCardOnBoardByNumber(${board}, ${cardNumber})`);
  let card = cardNumber;
  if (card && card.length > 0) {
    let url = `https://trello.com/1/boards/${board}/cards/${card}`
    return await axios.get(url, { 
      params: { 
        key: trelloApiKey, 
        token: trelloAuthToken 
      }
    }).then(response => {
      return response.data.id;
    }).catch(error => {
      console.log(url, `Error ${error.response.status} ${error.response.statusText}`);
      return null;
    });
  }
  return null;
}

async function getListOnBoard(board, list) {
  console.log(`getListOnBoard(${board}, ${list})`);
  let url = `https://trello.com/1/boards/${board}/lists`
  return await axios.get(url, { 
    params: { 
      key: trelloApiKey, 
      token: trelloAuthToken 
    }
  }).then(response => {
    let result = response.data.find(l => l.closed == false && l.name == list);
    return result ? result.id : null;
  }).catch(error => {
    console.log(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}

async function addAttachmentToCard(card, link) {
  console.log(`addAttachmentToCard(${card}, ${link})`);
  let url = `https://api.trello.com/1/cards/${card}/attachments`;
  return await axios.post(url, {
    key: trelloApiKey,
    token: trelloAuthToken, 
    url: link
  }).then(response => {
    return response.status == 200;
  }).catch(error => {
    console.log(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}

async function addCommentToCard(card, user, message, link) {
  console.log(`addCommentToCard(${card}, ${user}, ${message}, ${link})`);
  let url = `https://api.trello.com/1/cards/${card}/actions/comments`;
  return await axios.post(url, {
    key: trelloApiKey,
    token: trelloAuthToken, 
    text: `${user}: ${message} ${link}`
  }).then(response => {
    return response.status == 200;
  }).catch(error => {
    console.log(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}

async function moveCardToList(board, card, list) {
  console.log(`moveCardToList(${board}, ${card}, ${list})`);
  let listId = await getListOnBoard(board, list);
  if (listId && listId.length > 0) {
    let url = `https://api.trello.com/1/cards/${card}`;
    return await axios.put(url, {
      key: trelloApiKey,
      token: trelloAuthToken, 
      idList: listId
    }).then(response => {
      if(response && response.status == 200) {
        return response;
      } else {
        throw new Error(`Response not 200, message: ${response}`)
      }
    }).catch(error => {
      console.log(url, `Error ${error.response.status} ${error.response.statusText}`);
      return error;
    });
  }       
  return null;
}

async function handleHeadCommit(data) {
  console.log("handleHeadCommit", data);
  let url = data.url;
  let message = data.message;
  let user = data.author.name;
  let cardsNumbers = getCardNumbersArray(message);
  console.log(`Card number(s): ${cardsNumbers}`);
  if (cardsNumbers && cardsNumbers.length > 0) {
    for (const cardNumber of cardsNumbers) {
      let card = await getCardOnBoardByNumber(trelloBoardId, cardNumber);
      if (card && card.length > 0) {
        if (trelloCardAction && trelloCardAction.toLowerCase() == 'attachment') {
          await addAttachmentToCard(card, url);
        }
        else if (trelloCardAction && trelloCardAction.toLowerCase() == 'comment') {
          await addCommentToCard(card, user, message, url);
        }
        if (message.match(regexPullRequest) && trelloListNamePullRequestClosed && trelloListNamePullRequestClosed.length > 0) {
          const moveResponsePr = await moveCardToList(trelloBoardId, card, trelloListNamePullRequestClosed);
          console.log(`handleHeadCommit PR moveResponse: ${moveResponsePr}`);
        }
        else if (trelloListNameCommit && trelloListNameCommit.length > 0) {
          const moveResponseCm = await moveCardToList(trelloBoardId, card, trelloListNameCommit);
          console.log(`handleHeadCommit moveResponse: ${moveResponseCm}`);
        }
      }
    }
  }
}

async function handlePullRequest(data) {
  console.log("handlePullRequest", data);
  let url = data.html_url || data.url;
  let message = data.title;
  let user = data.user.name;
  let cardsNumbers = getCardNumbersArray(message);
  console.log(`Card number(s): ${cardsNumbers}`);
  if (cardsNumbers && cardsNumbers.length > 0) {
    for (const cardNumber of cardsNumbers) {
      let card = await getCardOnBoardByNumber(trelloBoardId, cardNumber);
      if (card && card.length > 0) {
        if (trelloCardAction && trelloCardAction.toLowerCase() == 'attachment') {
          await addAttachmentToCard(card, url);
        }
        else if (trelloCardAction && trelloCardAction.toLowerCase() == 'comment') {
          let msgPrefix = '';
          if (data.state == "open") { msgPrefix = 'Opened PR: ' }
          if (data.state == "closed") { msgPrefix = 'Closed PR: ' }

          await addCommentToCard(card, user, `${msgPrefix} ${message}`, url);
        }
        if (data.state == "open" && trelloListNamePullRequestOpen && trelloListNamePullRequestOpen.length > 0) {
          const moveResponseOpen = await moveCardToList(trelloBoardId, card, trelloListNamePullRequestOpen);
          console.log(`handlePullRequest moveResponseOpen: ${moveResponseOpen}`);
        }
        else if (data.state == "closed" && trelloListNamePullRequestClosed && trelloListNamePullRequestClosed.length > 0) {
          const moveResponseClosed = await moveCardToList(trelloBoardId, card, trelloListNamePullRequestClosed);
          console.log(`handlePullRequest moveResponseClosed: ${moveResponseClosed}`);
        }
      }
    }
  }
}

async function run() {
  if (head_commit && head_commit.message) {
    handleHeadCommit(head_commit)
  }
  else if (pull_request && pull_request.title) {
    handlePullRequest(pull_request)
  }
};

run()