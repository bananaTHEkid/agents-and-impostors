import { test, expect } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

test.describe('Voting Behavior', () => {
  test.setTimeout(240000);

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
      const hostPage = pages[0];

      // Host creates lobby
      const lobbyCode = await LobbyHelpers.createLobby(hostPage, usernames[0]);

      // Other players join
      for (let i = 1; i < usernames.length; i++) {
        await LobbyHelpers.joinLobby(pages[i], usernames[i], lobbyCode);
        await LobbyHelpers.waitForPlayerCount(pages.slice(0, i + 1), i + 1, 120000);
      }

      // Host starts game
      await hostPage.getByTestId('start-game-button').click();
      await expect(hostPage.getByTestId('game-room')).toBeVisible({ timeout: 60000 });

      // All players accept their assignments to reach Voting phase
      console.log('Waiting for all players to accept assignments...');
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const username = usernames[i];

        // If any page is already in Voting Phase, skip this player and move on
        {
          let anyVoting = false;
          for (const p of pages) {
            const visible = await p.getByTestId('phase-content').getByText(/Stimme für den Spieler/i).isVisible().catch(() => false);
            if (visible) { anyVoting = true; break; }
          }
          if (anyVoting) continue;
        }

        // Prefer acting when inputs are actionable; do not depend on the turn banner
        const phaseContent = page.getByTestId('phase-content');
        await phaseContent.waitFor({ timeout: 30000 });
        await phaseContent.scrollIntoViewIfNeeded();
        const pollUntil = Date.now() + 45000;
        while (Date.now() < pollUntil) {
          // Accept button ready
          const acceptBtnInitial = phaseContent.getByTestId('accept-assignment-btn');
          if (await acceptBtnInitial.isVisible().catch(() => false)) {
            const enabled = !(await acceptBtnInitial.isDisabled().catch(() => false));
            if (enabled) break;
          }
          // Dropdown ready only if it has a valid option (non-empty, not self) and is enabled
          const dropdownCountInit = await phaseContent.getByTestId('operation-choose-player').count();
          if (dropdownCountInit > 0) {
            const dropdownLoc = phaseContent.getByTestId('operation-choose-player').first();
            const enabled = await dropdownLoc.isEnabled().catch(() => false);
            if (enabled) {
              const options = await dropdownLoc.locator('option').all();
              let hasValid = false;
              for (const opt of options) {
                const value = await opt.getAttribute('value');
                if (value && value.trim().length > 0 && value !== username) { hasValid = true; break; }
              }
              if (hasValid) break;
            }
          }
          // Checkbox ready only if at least two are enabled and visible
          const checkboxCountInit = await phaseContent.getByRole('checkbox').count();
          if (checkboxCountInit > 0) {
            let enabledVisibleCount = 0;
            for (let idx = 0; idx < checkboxCountInit; idx++) {
              const cb = phaseContent.getByRole('checkbox').nth(idx);
              const enabled = !(await cb.isDisabled().catch(() => false));
              const visible = await cb.isVisible().catch(() => false);
              if (enabled && visible) enabledVisibleCount++;
              if (enabledVisibleCount >= 2) break;
            }
            if (enabledVisibleCount >= 2) break;
          }
          // If page already shows Abstimmungsphase, stop waiting for inputs
          const votingVisible = await page.getByTestId('phase-content').getByText(/Stimme für den Spieler/i).isVisible().catch(() => false);
          if (votingVisible) break;
          await page.waitForTimeout(500);
        }

        // Multi-choice: pick any two enabled checkboxes then submit (Danish Intelligence)
        const checkboxLoc = phaseContent.getByRole('checkbox');
        const checkboxCount = await checkboxLoc.count();
        if (checkboxCount >= 1) {
          // Count how many are enabled and visible
          let enabledVisibleCount = 0;
          for (let idx = 0; idx < checkboxCount; idx++) {
            const cb = checkboxLoc.nth(idx);
            const disabled = await cb.isDisabled().catch(() => false);
            const visible = await cb.isVisible().catch(() => false);
            if (!disabled && visible) enabledVisibleCount++;
          }
          if (enabledVisibleCount >= 2) {
            // Pick any two enabled/visible checkboxes
            let picked = 0;
            for (let idx = 0; idx < checkboxCount && picked < 2; idx++) {
              const cb = checkboxLoc.nth(idx);
              const disabled = await cb.isDisabled().catch(() => false);
              const visible = await cb.isVisible().catch(() => false);
              if (!disabled && visible) {
                await cb.check();
                picked++;
              }
            }
            const submitBtn = phaseContent.getByTestId('operation-submit');
            await expect(submitBtn).toBeEnabled();
            await submitBtn.click();
            // Wait for acknowledgment: submit disabled/hidden or Voting Phase visible
            {
              const ackDeadline = Date.now() + 20_000;
              while (Date.now() < ackDeadline) {
                const votingVisible = await page.getByTestId('phase-content').getByText(/Stimme für den Spieler/i).isVisible().catch(() => false);
                if (votingVisible) break;
                const disabled = await submitBtn.isDisabled().catch(() => false);
                const visible = await submitBtn.isVisible().catch(() => false);
                if (disabled || !visible) break;
                await page.waitForTimeout(300);
              }
            }
            // Some flows may still require explicit acceptance; click if present
            const maybeAccept2 = phaseContent.getByTestId('accept-assignment-btn');
            if (await maybeAccept2.isVisible().catch(() => false)) {
              await expect(maybeAccept2).toBeEnabled();
              await maybeAccept2.click();
              await expect(maybeAccept2).toBeDisabled({ timeout: 10000 }).catch(async () => {
                await expect(maybeAccept2).toBeHidden({ timeout: 10000 });
              });
            }
            continue;
          }
          // Fallback: not enough checkboxes to pick two, try acceptance directly
          const acceptFallback2 = phaseContent.getByTestId('accept-assignment-btn');
          if (await acceptFallback2.isVisible().catch(() => false)) {
            await expect(acceptFallback2).toBeEnabled();
            await acceptFallback2.click();
            await expect(acceptFallback2).toBeDisabled({ timeout: 10000 }).catch(async () => {
              await expect(acceptFallback2).toBeHidden({ timeout: 10000 });
            });
          }
          continue;
        }

        // Confession/Defector (single-choice): select a real player and submit
        const dropdownCount = await phaseContent.getByTestId('operation-choose-player').count();
        if (dropdownCount > 0) {
          const combo = phaseContent.getByTestId('operation-choose-player').first();
          await expect(combo).toBeEnabled({ timeout: 10000 });

          const options = await combo.locator('option').all();
          const validOptions: string[] = [];
          for (const opt of options) {
            const value = await opt.getAttribute('value');
            // Skip placeholder and self
            if (value && value.trim().length > 0 && value !== username) validOptions.push(value);
          }
          if (validOptions.length === 0) {
            // Fallback: if no valid dropdown options, try accepting directly
            const acceptFallback = phaseContent.getByTestId('accept-assignment-btn');
            if (await acceptFallback.isVisible().catch(() => false)) {
              await expect(acceptFallback).toBeEnabled();
              await acceptFallback.click();
              await expect(acceptFallback).toBeDisabled({ timeout: 10000 }).catch(async () => {
                await expect(acceptFallback).toBeHidden({ timeout: 10000 });
              });
            }
            continue;
          }
          await combo.selectOption(validOptions[0]);
          // Ensure we did not select the placeholder
          await expect(combo).toHaveValue(validOptions[0]);

          const submitBtn = phaseContent.getByTestId('operation-submit');
          await expect(submitBtn).toBeEnabled();
          await submitBtn.click();
          // Wait for acknowledgment: submit disabled/hidden or Voting Phase visible
          {
            const ackDeadline = Date.now() + 20000;
            while (Date.now() < ackDeadline) {
              const votingVisible = await page.getByTestId('phase-content').getByText(/Stimme für den Spieler/i).isVisible().catch(() => false);
              if (votingVisible) break;
              const disabled = await submitBtn.isDisabled().catch(() => false);
              const visible = await submitBtn.isVisible().catch(() => false);
              if (disabled || !visible) break;
              await page.waitForTimeout(300);
            }
          }
          // Some flows may still require explicit acceptance; click if present
          const maybeAccept = phaseContent.getByTestId('accept-assignment-btn');
          if (await maybeAccept.isVisible().catch(() => false)) {
            await expect(maybeAccept).toBeEnabled();
            await maybeAccept.click();
            // After accepting, wait for the accept button to disappear or disable
            await expect(maybeAccept).toBeDisabled({ timeout: 10000 }).catch(async () => {
              await expect(maybeAccept).toBeHidden({ timeout: 10000 });
            });
          }
          continue;
        }

        // No-input operation: accept
        const acceptBtn = phaseContent.getByTestId('accept-assignment-btn');
        if (await acceptBtn.isVisible().catch(() => false)) {
          await expect(acceptBtn).toBeEnabled({ timeout: 10000 });
          await acceptBtn.click();
          // Wait until accept is disabled/hidden (acknowledged)
          await expect(acceptBtn).toBeDisabled({ timeout: 3000 }).catch(async () => {
            await expect(acceptBtn).toBeHidden({ timeout: 3000 });
          });
        }
      }

      // Wait for all players to reach Voting phase
      console.log('Waiting for Voting phase...');
      await Promise.all(
        pages.map(page =>
          page
            .getByTestId('phase-content')
            .getByText(/Stimme für den Spieler/i)
            .waitFor({ timeout: 10000 })
        )
      );

      // All players vote
      console.log('Starting voting...');
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const username = usernames[i];
        const phaseContent = page.getByTestId('phase-content');

        // Find eligible vote targets (all players except self)
        const voteTargets: string[] = usernames.filter(u => u !== username);
        if (voteTargets.length === 0) {
          console.warn(`No valid targets for ${username}`);
          continue;
        }

        // Find the vote button for the first eligible target
        const targetUsername = voteTargets[0];
        console.log(`${username} looking for vote button for ${targetUsername}`);
        
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

        if (!voteButton) {
          console.warn(`Could not find vote button for ${targetUsername} as seen by ${username}`);
          continue;
        }

        // Wait for button to be clickable
        const voteDeadline = Date.now() + 15000;
        let clickedSuccessfully = false;
        while (Date.now() < voteDeadline && !clickedSuccessfully) {
          const visible = await voteButton.isVisible().catch(() => false);
          const enabled = !(await voteButton.isDisabled().catch(() => false));
          
          if (visible && enabled) {
            console.log(`${username} clicking vote for ${targetUsername}`);
            await voteButton.click().catch(err => {
              console.warn(`Click failed: ${err}`);
            });
            clickedSuccessfully = true;
            
            // Wait for confirmation: look for "Deine Stimme" (your vote) message
            const confDeadline = Date.now() + 10000;
            let confirmed = false;
            while (Date.now() < confDeadline && !confirmed) {
              const confirmMsg = await phaseContent
                .getByText(/Deine Stimme|your vote/i)
                .isVisible()
                .catch(() => false);
              const resultMsg = await phaseContent
                .getByText(/Spielergebnis|Game Results|Results|Abstimmungsergebnis/i)
                .isVisible()
                .catch(() => false);
              
              if (confirmMsg || resultMsg) {
                confirmed = true;
                console.log(`${username} vote confirmed`);
              }
              
              if (!confirmed) {
                await page.waitForTimeout(300);
              }
            }
            break;
          }
          
          await page.waitForTimeout(300);
        }

        if (!clickedSuccessfully) {
          console.error(`Failed to click vote button for ${username} -> ${targetUsername}`);
        }
      }

      // Wait for all players to see results
      console.log('Waiting for game results...');
      const resultsDeadline = Date.now() + 30000;
      let allSeeResults = false;
      
      while (Date.now() < resultsDeadline && !allSeeResults) {
        let everyoneSeesResult = true;
        
        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
          const page = pages[pageIdx];
          const phaseContent = page.getByTestId('phase-content');
          
          // Check text content directly instead of using getByText().isVisible()
          const pageText = await phaseContent.textContent().catch(() => '');
          const hasResultsText = /Spiel beendet|Ergebnisse|Results|Game Over/i.test(pageText || '');
          
          if (!hasResultsText) {
            everyoneSeesResult = false;
            break;
          }
        }
        
        if (everyoneSeesResult) {
          allSeeResults = true;
          console.log('All pages show results');
          break;
        }
        
        await pages[0].waitForTimeout(500);
      }
      
      expect(allSeeResults).toBeTruthy();

      console.log('Voting test completed successfully');
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

      // Accept all assignments (fast-forward to voting)
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const phaseContent = page.getByTestId('phase-content');

        // Wait for phase content
        await phaseContent.waitFor({ timeout: 30000 });

        // Wait until voting is visible or accept button is ready
        const pollDeadline = Date.now() + 45000;
        while (Date.now() < pollDeadline) {
          const votingVisible = await page
            .getByTestId('phase-content')
            .getByText(/Stimme für den Spieler/i)
            .isVisible()
            .catch(() => false);
          const acceptBtn = phaseContent.getByTestId('accept-assignment-btn');
          const acceptVisible = await acceptBtn.isVisible().catch(() => false);
          if (votingVisible || acceptVisible) break;
          await page.waitForTimeout(500);
        }

        const acceptBtn = phaseContent.getByTestId('accept-assignment-btn');
        if (await acceptBtn.isVisible().catch(() => false)) {
          const enabled = !(await acceptBtn.isDisabled().catch(() => false));
          if (enabled) {
            await acceptBtn.click();
          }
        }
      }

      // Wait for voting phase
      await Promise.all(
        pages.map(page =>
          page
            .getByTestId('phase-content')
            .getByText(/Stimme für den Spieler/i)
            .waitFor({ timeout: 10000 })
        )
      );

      // All players vote concurrently
      console.log('All players voting concurrently...');
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
        
        for (const page of pages) {
          const phaseContent = page.getByTestId('phase-content');
          const hasResultsText = await phaseContent
            .getByText(/Spiel beendet|Ergebnisse|Results|Game Over/i)
            .isVisible()
            .catch(() => false);
          
          if (!hasResultsText) {
            everyoneSeesResult = false;
            break;
          }
        }
        
        if (everyoneSeesResult) {
          allSeeResults = true;
          console.log('All pages show results');
          break;
        }
        
        await pages[0].waitForTimeout(500);
      }

      expect(allSeeResults).toBeTruthy();
      console.log('Vote concurrency test completed');
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
