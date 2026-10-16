async (page) => {
  const result = {};
  await page.goto('http://127.0.0.1:8765/08-performance-3.html');
  await page.setViewportSize({ width: 1440, height: 900 });

  const statuses = () => page.locator('#p6-table tbody tr').evaluateAll(rows =>
    rows.map(row => row.querySelector('.status-col, #p6-row2-status, td:nth-child(10)')?.innerText.trim() || '')
  );
  const initial = await statuses();
  result.initialFirst7 = initial.slice(0, 7);
  result.initialRest = initial.slice(7);

  const wrap = page.locator('#p6-table-wrap');
  const rows = page.locator('#p6-table tbody tr');
  result.layout = await page.evaluate(() => {
    const container = document.getElementById('p6-table-wrap');
    const tableRows = Array.from(document.querySelectorAll('#p6-table tbody tr'));
    const cr = container.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      containerClientHeight: container.clientHeight,
      containerClientWidth: container.clientWidth,
      fullyVisibleRows: tableRows.filter(row => {
        const r = row.getBoundingClientRect();
        return r.top >= cr.top && r.bottom <= cr.bottom;
      }).length,
      firstRowHeight: tableRows[0].getBoundingClientRect().height
    };
  });
  await page.getByRole('button', { name: '좁게' }).click();
  result.denseRowHeight = await rows.nth(0).evaluate(row => row.getBoundingClientRect().height);
  await page.getByRole('button', { name: '넓게' }).click();

  const row2 = page.locator('#p6-row-2');
  await row2.focus();
  await page.keyboard.press('ArrowDown');
  result.arrowDownSelected = await page.locator('#p6-table tbody tr[aria-selected="true"]').getAttribute('aria-rowindex');
  await page.keyboard.press('ArrowUp');
  result.arrowUpSelected = await page.locator('#p6-table tbody tr[aria-selected="true"]').getAttribute('aria-rowindex');
  await page.keyboard.press('Enter');
  result.enterDetailVisible = await page.locator('#p6-detail-panel').isVisible();
  await page.keyboard.press('Escape');
  result.escapeDetailClosed = !(await page.locator('#p6-detail-panel').isVisible());
  result.escapeReturnedToRow = await page.evaluate(() => document.activeElement?.id === 'p6-row-2');

  const fileButton = page.locator('#btn-approve-file');
  await fileButton.click();
  result.fileInitialFocus = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press('Shift+Tab');
  result.fileTrapBackward = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press('Escape');
  result.fileEscapeClosed = !(await page.locator('#modal-approve-file').isVisible());
  result.fileEscapeFocus = await page.evaluate(() => document.activeElement?.id);

  await fileButton.click();
  const fileConfirm = page.locator('#btn-file-confirm');
  const fileCancel = page.locator('#btn-file-cancel');
  await fileConfirm.click();
  result.fileProcessing = {
    confirmDisabled: await fileConfirm.isDisabled(),
    cancelDisabled: await fileCancel.isDisabled(),
    confirmText: (await fileConfirm.innerText()).trim()
  };
  await page.waitForTimeout(400);
  result.fileDoneFocus = await page.evaluate(() => document.activeElement?.id);
  result.beforeDoneStatusesUnchanged = JSON.stringify(await statuses()) === JSON.stringify(initial);
  await page.locator('#btn-file-done').click();
  const afterFile = await statuses();
  result.fileAfterFirst7 = afterFile.slice(0, 7);
  result.fileRestUnchanged = JSON.stringify(afterFile.slice(7)) === JSON.stringify(initial.slice(7));
  result.fileCounters = {
    chip: (await page.locator('#p6-chip-pending').innerText()).trim(),
    sidebar: (await page.locator('#p6-sidebar-badge').innerText()).trim(),
    live: (await page.locator('#p6-aria-live').innerText()).trim(),
    focus: await page.evaluate(() => document.activeElement?.id)
  };

  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  const singleButton = page.locator('#btn-approve-single');
  await singleButton.click();
  result.singleInitialFocus = await page.evaluate(() => document.activeElement?.id);
  const singleConfirm = page.locator('#btn-single-confirm');
  const singleCancel = page.locator('#btn-single-cancel');
  await singleConfirm.evaluate(button => {
    button.click();
    button.click();
    button.click();
  });
  result.singleAfterRapidClicks = {
    confirmDisabled: await singleConfirm.isDisabled(),
    cancelDisabled: await singleCancel.isDisabled(),
    modalVisible: await page.locator('#modal-approve-single').isVisible(),
    row2Status: (await page.locator('#p6-row2-status').innerText()).trim(),
    chip: (await page.locator('#p6-chip-pending').innerText()).trim(),
    sidebar: (await page.locator('#p6-sidebar-badge').innerText()).trim(),
    live: (await page.locator('#p6-aria-live').innerText()).trim(),
    selected: await page.locator('#p6-table tbody tr[aria-selected="true"]').getAttribute('id')
  };
  result.singleFocus = await page.evaluate(() => document.activeElement?.id);
  await singleButton.click();
  result.singleReopenReset = {
    confirmDisabled: await singleConfirm.isDisabled(),
    cancelDisabled: await singleCancel.isDisabled(),
    focus: await page.evaluate(() => document.activeElement?.id)
  };
  await page.keyboard.press('Escape');
  result.singleEscapeFocus = await page.evaluate(() => document.activeElement?.id);

  result.consoleErrors = [];
  return result;
}
