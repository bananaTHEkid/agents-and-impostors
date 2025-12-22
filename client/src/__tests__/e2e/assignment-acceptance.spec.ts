import { test, expect } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

test.describe('Operation Assignment Acceptance', () => {
  // Allow ample time for multi-user setup and phase transitions
  test.setTimeout(180000);
  test('All players accepting their operation moves the game to Voting phase', async ({ browser }) => {
    const baseNames = ['HostPlayer', 'Player2', 'Player3', 'Player4', 'Player5'];
    const runSuffix = `w${test.info().workerIndex}_${Date.now().toString(36).slice(-2)}`;
    const usernames = baseNames.map(n => {
      const candidate = `${n}_${runSuffix}`;
      // Ensure <= 20 chars to satisfy validator
      return candidate.length <= 20 ? candidate : candidate.slice(0, 20);
    });
    const contexts = await Promise.all(usernames.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((c) => c.newPage()));

    try {
      const hostPage = pages[0];

      // Host creates the lobby
      const lobbyCode = await LobbyHelpers.createLobby(hostPage, usernames[0]);

      // Other players join sequentially; wait for each to appear before next
      for (let i = 1; i < usernames.length; i++) {
        await LobbyHelpers.joinLobby(pages[i], usernames[i], lobbyCode);
        // Wait until all previously joined pages reflect the expected count
        await LobbyHelpers.waitForPlayerCount(pages.slice(0, i + 1), i + 1, 120000);
      }

      // Start the game as host
      await hostPage.getByTestId('start-game-button').click();
      // Wait for Operation Assignment Phase to be visible for the host
      await hostPage.getByRole('heading', { name: /Operation Assignment Phase/i }).waitFor({ timeout: 30000 });

      // Each player accepts their assignment when it's their turn
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const username = usernames[i];

        // If any page is already in Voting Phase, skip this player and move on
        {
          let anyVoting = false;
          for (const p of pages) {
            const visible = await p.getByRole('heading', { name: /Voting Phase/i }).isVisible().catch(() => false);
            if (visible) { anyVoting = true; break; }
          }
          if (anyVoting) continue;
        }

        // Prefer acting when inputs are actionable; do not depend on the turn banner
        const phaseContent = page.getByTestId('phase-content');
        await phaseContent.waitFor({ timeout: 30000 });
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
          // Text-input operation: textbox + enabled submit button
          const textboxCountInit = await phaseContent.getByRole('textbox').count();
          if (textboxCountInit > 0) {
            // If any submit button is enabled, consider ready
            const submitByTestId = phaseContent.getByTestId('operation-submit');
            const submitCount = await submitByTestId.count().catch(() => 0);
            let submitReady = false;
            if (submitCount > 0) {
              submitReady = !(await submitByTestId.isDisabled().catch(() => false));
            } else {
              const anySubmit = phaseContent.getByRole('button', { name: /send|submit/i }).first();
              const exists = await anySubmit.isVisible().catch(() => false);
              const enabled = exists && !(await anySubmit.isDisabled().catch(() => false));
              submitReady = enabled;
            }
            if (submitReady) break;
          }
          // If page already shows Voting Phase, stop waiting for inputs
          const votingVisible = await page.getByRole('heading', { name: /Voting Phase/i }).isVisible().catch(() => false);
          if (votingVisible) break;
          await page.waitForTimeout(500);
        }

        // Multi-choice: pick any two enabled checkboxes then submit (Danish Intelligence)
        // Scope to phase content to avoid unrelated checkboxes
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
              const ackDeadline = Date.now() + 20000;
              while (Date.now() < ackDeadline) {
                const votingVisible = await page.getByRole('heading', { name: /Voting Phase/i }).isVisible().catch(() => false);
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
              const votingVisible = await page.getByRole('heading', { name: /Voting Phase/i }).isVisible().catch(() => false);
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

        // Text-input operation: fill textbox and submit
        const textboxCount = await phaseContent.getByRole('textbox').count();
        if (textboxCount > 0) {
          const tb = phaseContent.getByRole('textbox').first();
          await tb.fill('ok');
          let submitBtn = phaseContent.getByTestId('operation-submit');
          const submitCount = await submitBtn.count().catch(() => 0);
          if (submitCount === 0) {
            submitBtn = phaseContent.getByRole('button', { name: /send|submit/i }).first();
          }
          await expect(submitBtn).toBeEnabled();
          await submitBtn.click();
          // Wait for acknowledgment: submit disabled/hidden or Voting Phase visible
          {
            const ackDeadline = Date.now() + 20000;
            while (Date.now() < ackDeadline) {
              const votingVisible = await page.getByRole('heading', { name: /Voting Phase/i }).isVisible().catch(() => false);
              if (votingVisible) break;
              const disabled = await submitBtn.isDisabled().catch(() => false);
              const visible = await submitBtn.isVisible().catch(() => false);
              if (disabled || !visible) break;
              await page.waitForTimeout(300);
            }
          }
          // Some flows may still require explicit acceptance; click if present
          const maybeAccept3 = phaseContent.getByTestId('accept-assignment-btn');
          if (await maybeAccept3.isVisible().catch(() => false)) {
            await expect(maybeAccept3).toBeEnabled();
            await maybeAccept3.click();
            await expect(maybeAccept3).toBeDisabled({ timeout: 10000 }).catch(async () => {
              await expect(maybeAccept3).toBeHidden({ timeout: 10000 });
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

      // After everyone accepted, the server should transition to Voting phase
      // Allow extra time for network and socket scheduling.
      await Promise.all(pages.map(page => page.getByRole('heading', { name: /Voting Phase/i }).waitFor({ timeout: 30000 })));

      // Assert that the voting header is present on each page
      for (const page of pages) {
        await expect(page.getByRole('heading', { name: /Voting Phase/i })).toBeVisible({ timeout: 30000 });
      }

    } finally {
      await Promise.all(contexts.map(async (c) => { try { await c.close(); } catch (e) { /* ignore */ } }));
    }
  });
});
