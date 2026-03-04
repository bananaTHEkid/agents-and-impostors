import { test, expect, type Locator } from '@playwright/test';
import { LobbyHelpers } from './LobbyHelpers';

const selectOperationTargets = async (
  phaseContent: Locator,
  currentUsername: string,
  allUsernames: string[],
  requiredTargets = 1,
) => {
  const submitBtn = phaseContent.getByTestId('operation-submit');
  if (!(await submitBtn.count())) return false;

  const targets = allUsernames.filter((u) => u !== currentUsername);
  const targetButtons: { target: string; locator: Locator }[] = [];

  for (const target of targets) {
    const btn = phaseContent.getByRole('button', { name: new RegExp(target, 'i') });
    if (await btn.count()) {
      targetButtons.push({ target, locator: btn });
    }
  }

  if (!targetButtons.length) return false;

  const needed = Math.min(requiredTargets, targetButtons.length);
  let picked = 0;
  for (const { locator } of targetButtons) {
    const visible = await locator.isVisible().catch(() => false);
    const disabled = await locator.isDisabled().catch(() => true);
    if (!visible || disabled) continue;
    await locator.click();
    picked++;
    if (picked >= needed) break;
  }

  if (picked < needed) return false;

  await expect(submitBtn).toBeEnabled({ timeout: 10000 });
  await submitBtn.click();

  const ackDeadline = Date.now() + 20000;
  while (Date.now() < ackDeadline) {
    const votingVisible = await phaseContent.getByText(/Stimme für den Spieler/i).isVisible().catch(() => false);
    if (votingVisible) break;
    const disabled = await submitBtn.isDisabled().catch(() => false);
    const visible = await submitBtn.isVisible().catch(() => false);
    if (disabled || !visible) break;
    await phaseContent.page().waitForTimeout(300);
  }

  const maybeAccept = phaseContent.getByTestId('accept-assignment-btn');
  if (await maybeAccept.isVisible().catch(() => false)) {
    const enabled = !(await maybeAccept.isDisabled().catch(() => false));
    if (enabled) {
      await maybeAccept.click();
      await expect(maybeAccept).toBeDisabled({ timeout: 10000 }).catch(async () => {
        await expect(maybeAccept).toBeHidden({ timeout: 10000 });
      });
    }
  }

  return true;
};

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
    // Ensure a generous viewport height to avoid header clipping in headless
    await Promise.all(pages.map((p) => p.setViewportSize({ width: 1920, height: 1080 })));

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

      // Each player accepts their assignment when it's their turn
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
        // New button-based operation inputs: try multi (2 targets) then single (1 target)
        const didMulti = await selectOperationTargets(phaseContent, username, usernames, 2);
        if (didMulti) continue;

        const didSingle = await selectOperationTargets(phaseContent, username, usernames, 1);
        if (didSingle) continue;

        // No-input operation: accept
        const acceptBtn = phaseContent.getByTestId('accept-assignment-btn');
        if (await acceptBtn.isVisible().catch(() => false)) {
          await expect(acceptBtn).toBeEnabled({ timeout: 10000 });
          await acceptBtn.click();
          await expect(acceptBtn).toBeDisabled({ timeout: 3000 }).catch(async () => {
            await expect(acceptBtn).toBeHidden({ timeout: 3000 });
          });
        }
      }

      // After everyone accepted, the server should transition to Abstimmungsphase
      // Allow extra time for network and socket scheduling.
      await Promise.all(pages.map(page => page.getByTestId('phase-content').getByText(/Stimme für den Spieler/i).waitFor({ timeout: 10000 })));

      // Assert that the voting header is present on each page
      for (const page of pages) {
        await expect(page.getByTestId('phase-content').getByText(/Stimme für den Spieler/i)).toBeVisible({ timeout: 10000 });
      }

    } finally {
      await Promise.all(contexts.map(async (c) => { try { await c.close(); } catch (e) { /* ignore */ } }));
    }
  });
});
