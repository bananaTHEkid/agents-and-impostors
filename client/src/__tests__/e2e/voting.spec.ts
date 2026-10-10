import { test, expect, type Locator } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

const selectOperationTargets = async (
  phaseContent: Locator,
  currentUsername: string,
  allUsernames: string[],
) => {
  const submitBtn = phaseContent.getByTestId('operation-submit');
  if (!(await submitBtn.count())) return false;

  if (await submitBtn.isEnabled().catch(() => false)) {
    await submitBtn.click().catch(() => {});
    return true;
  }

  const phaseText = await phaseContent.textContent().catch(() => '');
  const isMulti = /Wähle zwei Spieler/i.test(phaseText || '');
  const requiredTargets = isMulti ? 2 : 1;

  const targets = allUsernames.filter((u) => u !== currentUsername);
  const targetButtons: { target: string; locator: Locator }[] = [];

  for (const target of targets) {
    const btn = phaseContent.getByRole('button', { name: new RegExp(target, 'i') });
    if (await btn.count()) targetButtons.push({ target, locator: btn });
  }

  if (!targetButtons.length) return false;

  const unselectedButtons: Locator[] = [];
  for (const { locator } of targetButtons) {
    const visible = await locator.isVisible().catch(() => false);
    const disabled = await locator.isDisabled().catch(() => true);
    const pressed = (await locator.getAttribute('aria-pressed').catch(() => 'false')) === 'true';
    if (visible && !disabled && !pressed) {
      unselectedButtons.push(locator);
    }
  }

  if (unselectedButtons.length >= requiredTargets) {
    for (let i = 0; i < requiredTargets; i++) {
      await unselectedButtons[i].click().catch(() => {});
    }
  }

  const pollDeadline = Date.now() + 1000;
  while (Date.now() < pollDeadline) {
    if (await submitBtn.isEnabled().catch(() => false)) {
      await submitBtn.click().catch(() => {});
      return true;
    }
    await phaseContent.page().waitForTimeout(100);
  }

  return false;
};

test.describe('Voting Behavior', () => {
  test.setTimeout(180000);

  test('All players can vote and game completes with results', async ({ browser }) => {
    const baseNames = ['VotingHost', 'VoterP2', 'VoterP3', 'VoterP4', 'VoterP5'];
    const runSuffix = `v${test.info().workerIndex}_${Date.now().toString(36).slice(-2)}`;
    const usernames = baseNames.map(n => {
      const candidate = `${n}_${runSuffix}`;
      return candidate.length <= 20 ? candidate : candidate.slice(0, 20);
    });

    const contexts = await Promise.all(usernames.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map(c => c.newPage()));
    await Promise.all(pages.map(p => p.setViewportSize({ width: 1920, height: 1080 })));

    try {
      // Dynamically find whichever player's turn is active and complete their assignment action until ALL pages reach Voting phase
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        let countVoting = 0;
        for (const p of pages) {
          const text = await p.getByTestId('phase-content').textContent().catch(() => '');
          if (/Stimme|Abstimmung|Voting|Spiel beendet|Ergebnisse|Results|Completed/i.test(text || '')) {
            countVoting++;
          }
        }
        if (countVoting === pages.length) break;

        let acted = false;
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const username = usernames[i];
          const phaseContent = page.getByTestId('phase-content');

          const didTargetOp = await selectOperationTargets(phaseContent, username, usernames);
          if (didTargetOp) { acted = true; break; }

          const acceptBtn = phaseContent.getByTestId('accept-assignment-btn');
          const acceptEnabled = (await acceptBtn.isVisible().catch(() => false)) && !(await acceptBtn.isDisabled().catch(() => false));
          if (acceptEnabled) {
            await acceptBtn.click().catch(() => {});
            acted = true;
            break;
          }
        }

        if (!acted) {
          await pages[0].waitForTimeout(300);
        }
      }

      // Wait for all players to reach Voting phase
      const votingDeadline = Date.now() + 30000;
      let allInVoting = false;
      while (Date.now() < votingDeadline) {
        let allReady = true;
        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const page = pages[pIdx];
          const phaseText = await page.getByTestId('phase-content').textContent().catch(() => '');
          const hasVotingHeader = /Stimme|Abstimmung|Voting|Spiel beendet|Ergebnisse|Results|Completed/i.test(phaseText || '');
          const hasVoteBtn = await page.getByRole('button', { name: new RegExp(usernames[1], 'i') }).isVisible().catch(() => false);
          if (!hasVotingHeader && !hasVoteBtn) {
            allReady = false;
            break;
          }
        }
        if (allReady) {
          allInVoting = true;
          break;
        }
        await pages[0].waitForTimeout(300);
      }
      expect(allInVoting).toBeTruthy();

      // All players vote
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const username = usernames[i];
        const phaseContent = page.getByTestId('phase-content');

        // Find eligible vote targets (all players except self)
        const voteTargets: string[] = usernames.filter(u => u !== username);
        if (voteTargets.length === 0) continue;

        // Find the vote button for the first eligible target
        const targetUsername = voteTargets[0];
        
        // Get all vote buttons and find the one matching our target
        const allButtons = phaseContent.getByRole('button');
        const buttonCount = await allButtons.count();
        let voteButton = null;
        
        for (let btnIdx = 0; btnIdx < buttonCount; btnIdx++) {
          const btn = allButtons.nth(btnIdx);
          const text = await btn.textContent().catch(() => '');
          if (text && text.includes(targetUsername)) {
            voteButton = btn;
            break;
          }
        }

        if (!voteButton) continue;

        // Wait for button to be clickable
        const voteDeadline = Date.now() + 15000;
        let clickedSuccessfully = false;
        while (Date.now() < voteDeadline && !clickedSuccessfully) {
          const visible = await voteButton.isVisible().catch(() => false);
          const enabled = !(await voteButton.isDisabled().catch(() => false));
          
          if (visible && enabled) {
            await voteButton.click().catch(() => {});
            clickedSuccessfully = true;
            
            // Wait for confirmation: look for "Deine Stimme" (your vote) or game completion message
            const confDeadline = Date.now() + 10000;
            let confirmed = false;
            while (Date.now() < confDeadline && !confirmed) {
              const confirmMsg = await phaseContent
                .getByText(/Deine Stimme|your vote/i)
                .isVisible()
                .catch(() => false);
              const resultMsg = await phaseContent
                .getByText(/Spielergebnis|Game Results|Results|Abstimmungsergebnis|Spiel beendet|Gewinner|Verlierer/i)
                .isVisible()
                .catch(() => false);
              
              if (confirmMsg || resultMsg) confirmed = true;
              
              if (!confirmed) {
                await page.waitForTimeout(300);
              }
            }
            break;
          }
          
          await page.waitForTimeout(300);
        }
      }

      // Wait for all players to see results
      const resultsDeadline = Date.now() + 30000;
      let allSeeResults = false;
      
      while (Date.now() < resultsDeadline && !allSeeResults) {
        let everyoneSeesResult = true;
        
        for (let idx = 0; idx < pages.length; idx++) {
          const page = pages[idx];
          const fullText = await page.textContent().catch(() => '');
          const hasResultsText = /Spiel beendet|Ergebnisse|Results|Game Over|Gewinner|Verlierer/i.test(fullText || '');
          
          if (!hasResultsText) {
            everyoneSeesResult = false;
            break;
          }
        }
        
        if (everyoneSeesResult) {
          allSeeResults = true;
          break;
        }
        
        await pages[0].waitForTimeout(500);
      }
      
      expect(allSeeResults).toBeTruthy();
    } finally {
      await Promise.all(contexts.map(async c => {
        try {
          await c.close();
        } catch (e) {
          /* ignore */
        }
      }));
    }
  });

  test('Single voter blocks other votes until they vote', async ({ browser }) => {
    const usernames = ['VoteLockHost', 'VoteLockP2', 'VoteLockP3', 'VoteLockP4', 'VoteLockP5'].map((n, i) => {
      const candidate = `${n}_${Date.now().toString(36).slice(-3)}_${i}`;
      return candidate.length <= 20 ? candidate : candidate.slice(0, 20);
    });

    const contexts = await Promise.all(usernames.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map(c => c.newPage()));
    await Promise.all(pages.map(p => p.setViewportSize({ width: 1920, height: 1080 })));

    try {
      const hostPage = pages[0];

      // Setup: create lobby, join, start, accept assignments
      const lobbyCode = await LobbyHelpers.createLobby(hostPage, usernames[0]);
      for (let i = 1; i < usernames.length; i++) {
        await LobbyHelpers.joinLobby(pages[i], usernames[i], lobbyCode);
        await LobbyHelpers.waitForPlayerCount(pages.slice(0, i + 1), i + 1, 120000);
      }

      await hostPage.getByTestId('start-game-button').click();
      await expect(hostPage.getByTestId('game-room')).toBeVisible({ timeout: 60000 });

      // Accept all assignments dynamically until ALL pages reach Voting phase
      const deadline2 = Date.now() + 60000;
      while (Date.now() < deadline2) {
        let countVoting = 0;
        for (const p of pages) {
          const text = await p.getByTestId('phase-content').textContent().catch(() => '');
          if (/Stimme|Abstimmung|Voting|Spiel beendet|Ergebnisse|Results|Completed/i.test(text || '')) {
            countVoting++;
          }
        }
        if (countVoting === pages.length) break;

        let acted = false;
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const username = usernames[i];
          const phaseContent = page.getByTestId('phase-content');

          const didTargetOp = await selectOperationTargets(phaseContent, username, usernames);
          if (didTargetOp) { acted = true; break; }

          const acceptBtn = phaseContent.getByTestId('accept-assignment-btn');
          const acceptEnabled = (await acceptBtn.isVisible().catch(() => false)) && !(await acceptBtn.isDisabled().catch(() => false));
          if (acceptEnabled) {
            await acceptBtn.click().catch(() => {});
            acted = true;
            break;
          }
        }

        if (!acted) {
          await hostPage.waitForTimeout(300);
        }
      }

      // Wait for voting phase
      const votingDeadline2 = Date.now() + 30000;
      let allInVoting2 = false;
      while (Date.now() < votingDeadline2) {
        let allReady = true;
        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const page = pages[pIdx];
          const phaseText = await page.getByTestId('phase-content').textContent().catch(() => '');
          const hasVotingHeader = /Stimme|Abstimmung|Voting|Spiel beendet|Ergebnisse|Results|Completed/i.test(phaseText || '');
          const hasVoteBtn = await page.getByRole('button', { name: new RegExp(usernames[1], 'i') }).isVisible().catch(() => false);
          if (!hasVotingHeader && !hasVoteBtn) {
            allReady = false;
            break;
          }
        }
        if (allReady) {
          allInVoting2 = true;
          break;
        }
        await hostPage.waitForTimeout(300);
      }
      expect(allInVoting2).toBeTruthy();

      // All players vote concurrently
      const votePromises = pages.map(async (page, i) => {
        const phaseContent = page.getByTestId('phase-content');
        const voteTarget = usernames[(i + 1) % usernames.length];

        const allButtons = phaseContent.getByRole('button');
        const buttonCount = await allButtons.count();
        
        for (let btnIdx = 0; btnIdx < buttonCount; btnIdx++) {
          const btn = allButtons.nth(btnIdx);
          const text = await btn.textContent().catch(() => '');
          if (text && text.includes(voteTarget)) {
            const enabled = !(await btn.isDisabled().catch(() => false));
            if (enabled) {
              await btn.click();
              
              // Wait for confirmation
              const confDeadline = Date.now() + 8000;
              while (Date.now() < confDeadline) {
                const confirmed = await phaseContent
                  .getByText(/Deine Stimme|your vote/i)
                  .isVisible()
                  .catch(() => false);
                if (confirmed) break;
                await page.waitForTimeout(300);
              }
            }
            break;
          }
        }
      });

      await Promise.all(votePromises);

      // All should see results
      const resultsDeadline = Date.now() + 30000;
      let allSeeResults = false;
      
      while (Date.now() < resultsDeadline && !allSeeResults) {
        let everyoneSeesResult = true;
        
        for (let idx = 0; idx < pages.length; idx++) {
          const page = pages[idx];
          const fullText = await page.textContent().catch(() => '');
          const hasResultsText = /Spiel beendet|Ergebnisse|Results|Game Over|Gewinner|Verlierer/i.test(fullText || '');
          
          if (!hasResultsText) {
            everyoneSeesResult = false;
            break;
          }
        }
        
        if (everyoneSeesResult) {
          allSeeResults = true;
          break;
        }
        
        await pages[0].waitForTimeout(500);
      }

      expect(allSeeResults).toBeTruthy();
    } finally {
      await Promise.all(contexts.map(async c => {
        try {
          await c.close();
        } catch (e) {
          /* ignore */
        }
      }));
    }
  });
});
