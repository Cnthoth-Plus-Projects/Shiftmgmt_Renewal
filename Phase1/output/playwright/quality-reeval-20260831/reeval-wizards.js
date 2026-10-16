async (page) => {
  const result = {};
  const axFor = async (selector) => {
    const session = await page.context().newCDPSession(page);
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { nodes } = await session.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    await session.detach();
    const node = nodes[0] || {};
    const properties = Object.fromEntries((node.properties || []).map(p => [p.name, p.value?.value]));
    return {
      role: node.role?.value,
      name: node.name?.value,
      description: node.description?.value,
      ignored: node.ignored,
      properties
    };
  };

  await page.goto('http://127.0.0.1:8765/05-sites-wizard-3.html');
  await page.setViewportSize({ width: 1440, height: 900 });
  result.wizard3 = {};
  result.wizard3.w5NextAX = await axFor('#state-w5 button[aria-describedby="w5-err-desc"]');
  result.wizard3.w6NextAX = await axFor('#state-w6 button[aria-describedby="w6-next-desc"]');

  await page.locator('.btn-team-setting').first().click();
  result.wizard3.teamModalVisible = await page.locator('#team-setting-modal').isVisible();
  result.wizard3.teamInitialFocus = await page.evaluate(() => document.activeElement?.id);
  result.wizard3.teamControls = {
    nameInput: await axFor('#team-name-input'),
    workType: await axFor('#team-worktype-select'),
    useToggle: await axFor('#team-toggle-use'),
    decrement: await axFor('#btn-team-dec'),
    increment: await axFor('#btn-team-inc'),
    capacity: await axFor('#team-capacity-val')
  };
  await page.locator('#btn-close-team-x').click();

  result.wizard3.leaveInitial = {
    visible: await page.locator('#modal-leave-w7').isVisible(),
    focus: await page.evaluate(() => document.activeElement?.id)
  };
  await page.locator('#btn-leave-stay').focus();
  await page.keyboard.press('Shift+Tab');
  result.wizard3.leaveTrapBackward = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press('Escape');
  result.wizard3.leaveEscape = {
    closed: !(await page.locator('#modal-leave-w7').isVisible()),
    focus: await page.evaluate(() => document.activeElement?.id)
  };
  await page.reload();
  await page.locator('#btn-leave-stay').click();
  result.wizard3.leaveStayClick = {
    closed: !(await page.locator('#modal-leave-w7').isVisible()),
    focus: await page.evaluate(() => document.activeElement?.id)
  };

  await page.goto('http://127.0.0.1:8765/05-sites-wizard-4.html');
  await page.setViewportSize({ width: 1440, height: 900 });
  result.wizard4 = {};
  result.wizard4.nextAX = await axFor('#state-w9 button[aria-describedby="w9-perm-desc"]');
  result.wizard4.controlsAX = {
    siteName: await axFor('#w9-site-name'),
    clientName: await axFor('#w9-client-name'),
    siteCode: await axFor('#w9-site-code'),
    startDate: await axFor('#w9-start-date'),
    teamCount: await axFor('#w9-team-count'),
    groupCount: await axFor('#w9-group-count'),
    statusUse: await axFor('#state-w9 input[name="w9-status"]:nth-of-type(1)'),
    poolUse: await axFor('#state-w9 input[name="w9-pool"]:nth-of-type(1)')
  };

  const textInput = page.locator('#w9-site-name');
  const textBefore = await textInput.inputValue();
  await textInput.focus();
  const textFocus = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('변경 시도');
  result.wizard4.readonlyText = {
    focus: textFocus,
    editable: await textInput.isEditable(),
    before: textBefore,
    after: await textInput.inputValue()
  };

  const radios = page.locator('#state-w9 input[type="radio"]');
  const radioState = () => radios.evaluateAll(items => items.map(item => ({
    name: item.name,
    checked: item.checked,
    focused: item === document.activeElement
  })));
  const radioBefore = await radioState();
  const keyResults = [];
  const keys = ['Space', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter'];
  for (let index = 0; index < await radios.count(); index++) {
    const radio = radios.nth(index);
    await radio.focus();
    for (const key of keys) await page.keyboard.press(key);
    keyResults.push({ index, state: await radioState() });
  }
  await radios.evaluateAll(items => items.forEach(item => item.click()));
  result.wizard4.radios = {
    before: radioBefore,
    afterKeys: keyResults,
    afterProgrammaticClick: await radioState()
  };
  return result;
}
