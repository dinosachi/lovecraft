import {PlayCard} from '../actions/actions';
import {Card, Game, GameState, getPlayerOrDie, Player, PlayerId, SecretType} from '../models/models';

/**
 * Updates the store given a PlayCard action.
 */
export function onPlayCard(game: Game | undefined, action: PlayCard) {
  if (!game) {
    throw new Error(`No game ${action.gameId} exists.`);
  }
  if (game.state == GameState.WAITING_PRESCIENT) {
    throw new Error(`${game.id} is waiting for a prescient reveal.`);
  }
  if (game.state !== GameState.IN_PROGRESS) {
    throw new Error(`${game.id} is not in progress.`);
  }
  const targetPlayer = getPlayerOrDie(game, action.targetPlayer);
  if (action.cardNumber < 1) {
    throw new Error(`Card number must be >= 1.`);
  }
  if (action.cardNumber > targetPlayer.hand.length) {
    throw new Error(
        `${action.targetPlayer} only has ${targetPlayer.hand.length} cards`);
  }
  if (game.currentInvestigatorId !== action.sourcePlayer) {
    throw new Error(`${action.sourcePlayer} is not the current investigator.`);
  }
  if (action.sourcePlayer === action.targetPlayer) {
    throw new Error('You cannot investigate yourself.');
  }

  playCard(game, action.sourcePlayer, action.targetPlayer, action.cardNumber);

  // Add the play to the history.
  game.history.push(action);

  return game;
}

/**
 * Updates the store given a RevealCard action. (Prescient Vision)
 * Expects the investigator to change after the RevealCard action.
 * Source: https://boardgamegeek.com/thread/1706745/prescient-vision-flip-any-one-card-over
 */
export function onRevealCard(game: Game | undefined, action: RevealCard) {
  if (!game) {
    throw new Error(`No game ${action.gameId} exists.`);
  }
  if (game.state !== GameState.WAITING_PRESCIENT) {
    throw new Error(`${game.id} is not waiting for a prescient reveal.`);
  }
  const targetPlayer = getPlayerOrDie(game, action.targetPlayer);
  if (action.cardNumber < 1) {
    throw new Error(`Card number must be >= 1.`);
  }
  if (action.cardNumber > targetPlayer.hand.length) {
    throw new Error(
        `${action.targetPlayer} only has ${targetPlayer.hand.length} cards`);
  }
  if (game.currentInvestigatorId !== action.sourcePlayer) {
    throw new Error(`${action.sourcePlayer} is not the current investigator.`);
  }
  
  // Randomize the revealed card. Adjust for cardNumber being 1 based instead of 0.
  action.cardNumber = Math.floor(Math.random() * targetPlayer.hand.length) + 1;

  revealCard(game, action.sourcePlayer, action.targetPlayer, action.cardNumber);

  // Add the play to the history.
  game.history.push(action);

  return game;
}


/**
 * Plays a card from a target player's hand in the game provided, updating
 * game state appropriately.
 */
function playCard(
    game: Game, sourcePlayerId: PlayerId, targetPlayerId: PlayerId,
    cardNumber: number) {
  // Find the player or die.
  const player = getPlayerOrDie(game, targetPlayerId);
  const investigator = getPlayerOrDie(game, sourcePlayerId);

  // Randomize the picked card if it is not revealed by Prescient Vision. 
  // Adjust for cardNumber being 1 based instead of 0.
  if (investigator.secrets.findIndex((secret) => secret.type == SecretType.CARD) !== cardIndex) {
    cardNumber = Math.floor(Math.random() * targetPlayer.hand.length) + 1;
  }

  // Card indexes are 0 based, but the card number is 1 based.
  const cardIndex = cardNumber - 1; 
  // Ignore attempts to play bogus cards.
  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    return;
  }

  // Remove the card. Card number is 1 indexed, so subtract one.
  const newHand = [...player.hand];
  const [card] = newHand.splice(cardIndex, 1);
  player.hand = newHand;

  // Add to the end of the visible card list. This means handleMirage has to
  // move the last card because mirage replaces a card, but this keeps it clean
  // for the other card types.
  game.visibleCards.push(card);

  // Act on the card.
  switch (card) {
    case Card.CTHULHU:
      handleCthulu(game);
      break;
    case Card.ELDER_SIGN:
      handleElderSign(game);
      break;
    case Card.FUTILE_INVESTIGATION:
    case Card.INSANITYS_GRASP:
      handleNoOpCard(game, card);
      break;
    case Card.EVIL_PRESENCE:
      handleEvilPresence(game, player);
      break;
    case Card.MIRAGE:
      handleMirage(game);
      break;
    case Card.PARANOIA:
      handleParanoia(game, targetPlayerId);
      break;
    case Card.PRIVATE_EYE:
      const sourcePlayer = getPlayerOrDie(game, sourcePlayerId);
      handlePrivateEye(game, sourcePlayer, player);
      break;
    case Card.PRESCIENT_VISION:
      handlePrescientVision(game);
    default:
      throw new Error(`Invalid card type: ${card}`);
  }

  // Handle an end-of-round situation.
  const roundEnded = handlePotentialEndOfRound(game);

  // If there's a paranoid investigator, give them the flashlight back if we
  // didn't end the round.
  // Let the target player with the Prescient card keep investigator status
  // until they reveal a card.
  else if (game.paranoidPlayerId && !roundEnded && game.state !== GameState.WAITING_PRESCIENT) {
    game.currentInvestigatorId = game.paranoidPlayerId;
  } else {
    game.currentInvestigatorId = targetPlayerId;
  }
}

/**
 * Reveals a card from a target player's hand in the game provided, updating
 * game state appropriately.
 * Note: the game rules say the card should be hidden again, but it's too
 * easy for players to miss, so the card stays revealed until the round ends.
 */
function revealCard(
    game: Game, sourcePlayerId: PlayerId, targetPlayerId: PlayerId,
    cardNumber: number) {
  // Find the player or die.
  const player = getPlayerOrDie(game, targetPlayerId);

  // Card indexes are 0 based, but the card number is 1 based.
  const cardIndex = cardNumber - 1;
  // Ignore attempts to play bogus cards.
  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    return;
  }

  secret = {
    type: SecretType.CARD,
    player: targetPlayerId,
    card: player.hand[cardIndex],
    cardNumber: cardNumber,
  };
  
  // Reveal the card by adding it to everyone's secrets.
  for (let player of game.playerList) {
    player.secrets.push(secret);
  }

  // Allow the game to recognize the prescient reveal is over.
  game.state = GameState.IN_PROGRESS;

  // Handle an end-of-round situation.
  const roundEnded = handlePotentialEndOfRound(game);

  // If there's a paranoid investigator, give them the flashlight back if we
  // didn't end the round.
  if (game.paranoidPlayerId && !roundEnded) {
    game.currentInvestigatorId = game.paranoidPlayerId;
  }
  // Otherwise, the player revealing with prescient stays the investigator.
}


/**
 * Handles someone playing a rock or some other no-op card.
 */
function handleNoOpCard(game: Game, card: Card) {
}

/**
 * Handles someone playing an elder sign.
 */
function handleElderSign(game: Game) {
  let signs = 0;
  for (let card of game.visibleCards) {
    if (card === Card.ELDER_SIGN) {
      signs++;
    }
  }

  if (signs >= game.playerList.length) {
    game.state = GameState.INVESTIGATORS_WON;
  }
}

/**
 * Handles someone playing Cthulhu.
 */
function handleCthulu(game: Game) {
   // If there's still a cthulhu out there, we need to keep going.
  if (game.discards.find((card) => card === Card.CTHULHU)) return;
  for (const player of game.playerList) {
    for (const card of player.hand) {
      if (card === Card.CTHULHU) {
        return;
      }
    }
  }

  // No more, He rises!
  game.state = GameState.CULTISTS_WON;
}

/**
 * Handles paranoid investigators.
 */
function handleParanoia(game: Game, paranoidPlayerId: PlayerId) {
  game.paranoidPlayerId = paranoidPlayerId;
}

/**
 * The player targeted loses all their cards to the discard pile. Too bad.
 */
function handleEvilPresence(game: Game, player: Player) {
  game.discards.push(...player.hand);
  player.hand = [];
}

/**
 * Causes the last found light to be replaced with mirage.
 */
function handleMirage(game: Game) {
  for (let i = game.visibleCards.length - 1; i >= 0; i--) {
    if (game.visibleCards[i] !== Card.ELDER_SIGN) {
      continue;
    }

    // We found an elder sign. Move it to the game's discards.
    game.discards.push(game.visibleCards[i]);

    // And put mirage in its place, removing it from the end of the visible
    // cards.
    game.visibleCards[i] = Card.MIRAGE;
    game.visibleCards.pop();
    break;
  }

  if (game.round === 4) {
    // You've made a grave mistake by trusting the wrong person!
    game.state = GameState.CULTISTS_WON;
  }
}

/**
 * The source now knows the target's role. OOOoooooOoh, mysterious.
 */
function handlePrivateEye(game: Game, source: Player, target: Player) {
  source.secrets.push({
    type: SecretType.ROLE,
    player: target.id,
    role: target.role,
  });
}

/**
 * The target player now reveals any card without playing it. 
 * End of round is delayed if it is the last card.
 */
function handlePrescientVision(game: Game) {
  game.state = GameState.WAITING_PRESCIENT;
}

/**
 * Handles any end-of-round activities if we've finished a round, returning true
 * if the round ended.
 */
function handlePotentialEndOfRound(game: Game): boolean {
  if (game.state !== GameState.IN_PROGRESS) {
    return false;
  }

  // We're at the end of a round if the number of cards is a equal to the number
  // of players times the number of rounds. Note that we can't check that the
  // number of cards is a multiple of the number of players because sometimes
  // Mirage will make that happen twice.
  if (game.visibleCards.length !== game.playerList.length * game.round) {
    return false;
  }

  // See if we were on the last round.
  if (game.round === 4) {
    game.state = GameState.CULTISTS_WON;
    return true;
  }

  // If not, move on to the paused state in between rounds.
  game.state = GameState.PAUSED;

  // Clear the paranoid player.
  game.paranoidPlayerId = undefined;
  return true;
}
