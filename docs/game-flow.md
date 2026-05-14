# Mafia Game Flow

This document translates the flowchart into an implementation plan for the game loop.

## 1. Game Launch

The game begins when the host starts the room.

Setup tasks:
- Initialize room data.
- Initialize player data.
- Create a room for 8 total people.
- Initialize the role pool.
- Initialize AI players.
- Initialize the game state machine.

## 2. Role Pool

The current teacher-student binding camp logic is:
- Double killer.
- Double police.
- Double civilian.

Project mapping:
- Killer = Mafia.
- Police = Detective.
- Civilian = Villager.

Open question:
- The existing game uses 8 seats with 2 Mafia, 2 Detectives, and 4 Villagers. The diagram note says double civilian, which only accounts for 6 people. We should confirm whether this diagram means the 2 real players can be paired as Mafia, Detective, or Civilian while the remaining AI fill the full 8-player role pool.

## 3. AI Fill

After role binding:
- AI fills the remaining seats until there are 8 total people.
- AI players receive roles from the remaining role pool.

## 4. Seating

After all 8 slots are filled:
- Randomize seating arrangement.
- Store final seat order.
- Use this order for speaking phase rotation.

Implementation status:
- Done.
- `seatOrder` stores the randomized player ID order.
- Each player's displayed `seat` is updated at game start.
- Player IDs, roles, host identity, readiness, and human team binding are not changed by seating randomization.
- This preserves the teacher-student / two-human shared-fate relationship.

## 5. Identity Reveal

Each player sees only their own identity.

Current planned behavior:
- Screen dims.
- Role modal appears.
- Modal shows the player role.
- Modal closes after 3 seconds.
- Game enters the main loop.

## 6. Main Game Loop

The core loop is:

1. Night stage.
2. Dawn phase.
3. Speaking phase.
4. Voting phase.
5. Win/loss detection.
6. Repeat if no winner.

## 7. Night Stage

At night:
- Everyone enters a closed-eyes state.
- UI hides identity information.
- Killer/Mafia acts first.
- Police/Detective acts second.
- Night results are executed.

### 7.1 Closed-Eyes State

Requirements:
- All players are treated as asleep.
- The UI should hide other players' identities.
- Only the active role group should be able to act.

### 7.2 Killer/Mafia Action

The killers choose one target to kill.

Selection rules:
- Real players manually select a target.
- AI killers automatically select a target.
- If both killers agree, that target is killed.
- If killers disagree, one of their selected targets is chosen randomly.

Current project-specific rule:
- Mafia can only kill one Villager per round.

Open question:
- Should Mafia be allowed to target Police/Detectives, or only Civilians/Villagers? The latest project rule says only Villagers, but the flowchart says “target” generally.

### 7.3 Police/Detective Action

The police choose one target to inspect.

Selection rules:
- Real players manually select a target.
- AI police automatically select a target.
- If both police agree, that target is inspected.
- If police disagree, one of their selected targets is chosen randomly.
- The Game Master reveals whether the inspected target is a killer/Mafia.

### 7.4 Execute Night Results

After killer and police actions:
- Apply the kill result.
- The killed player dies.
- Update player status.
- Store night story/dialogue data for the dawn phase.

## 8. Dawn Phase

At dawn:
- Everyone wakes up.
- Game Master announces the player who died.
- A story/dialogue segment is shown.
- Educational guidance can be included in the dialogue.

Examples of dialogue goals:
- Teach players to ask better questions.
- Remind players suspicion is not proof.
- Encourage players to observe voting patterns.
- Explain social deduction concepts in a casual way.

## 9. Speaking Phase

The speaking order is determined by the deceased player.

Rule from diagram:
- The player behind the deceased speaks in order.

Implementation idea:
- Use the randomized seating order.
- Find the deceased player's seat index.
- Start speaking from the next player behind/after the deceased.
- Continue around the table until everyone has had a turn.

For each speaking turn:
- Check if the speaker is a real player.
- If real player:
  - Open microphone/dialogue input.
  - Start a 90-second countdown.
- If AI player:
  - Generate speech text.
  - Play speech using TTS.
- After the turn, check whether everyone has finished speaking.
- If not finished, switch to the next player.
- If finished, proceed to voting phase.

Open questions:
- “Behind the deceased” needs a concrete seating direction: clockwise or counter-clockwise.
- Should eliminated players speak during the speaking phase, or only living players?
- Should the deceased get last words before the normal speaking phase?

## 10. Voting Phase

During voting:
- Real players manually click a voting target.
- AI players automatically calculate targets.
- Count all votes.

Tie rule:
- If there is a tie, tied players speak again.
- Other players vote again after the tied-player speeches.
- If there are three consecutive ties, go directly to win/loss detection.

No-tie rule:
- Eliminate the player with the highest votes.
- The eliminated player gets last words.
- Proceed to win/loss detection.

Open questions:
- Are dead players allowed to vote?
- Can players abstain?
- How long are tied-player speeches?
- Do only tied players speak again, or does everyone discuss again?

## 11. Win/Loss Detection

After voting and elimination:
- Check whether the game is over.

Current project win conditions:
- Civilians and Detectives win if both Mafia are eliminated.
- Mafia wins if the number of Mafia is equal to or greater than the number of non-Mafia players.

Diagram note:
- If number of killers is 0, good players win.
- If police/civilian count is 0, killers win.
- Three consecutive draws: 1 assassin + 1 police officer + 1 civilian results in game draw.

Open question:
- Should the project support a draw ending, or should three consecutive ties only force win/loss detection using the current win rules?

## 12. Game Over

When a win/loss condition is met:
- Show winner.
- Reveal all roles.
- Stop the main loop.
- Allow return to menu or rematch.

## 13. State Machine Draft

Proposed phases:
- `setup`
- `role-reveal`
- `night-closed-eyes`
- `mafia`
- `detective`
- `night-results`
- `dawn`
- `speaking`
- `voting`
- `tie-speech`
- `last-words`
- `win-check`
- `ended`

Current phases already implemented:
- `setup`
- `role-reveal`
- `mafia`
- `detective`
- `day`
- `discussion`
- `voting`
- `ended`

Likely refactor:
- Rename `day` to `dawn`.
- Replace `discussion` with `speaking`.
- Add `night-closed-eyes`, `night-results`, `tie-speech`, `last-words`, and `win-check`.

## 14. Implementation Priorities

Suggested order:

1. Formalize phase names and state machine transitions.
2. Store seating order and speaking order.
3. Add night closed-eyes UI state.
4. Add dawn story phase.
5. Replace free discussion with ordered speaking turns.
6. Add real-player 90-second speaking timer.
7. Add AI speech generation placeholder.
8. Add voting with vote count.
9. Add tie handling and tied-player re-speech.
10. Add last words.
11. Finalize win/loss/draw logic.
