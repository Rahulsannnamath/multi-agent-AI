import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const secret = readFileSync('.env.ai-design-studio.credentials', 'utf8'),
  username = secret.match(/Studio username: (.+)/)![1].trim(),
  password = secret.match(/Studio password: (.+)/)![1].trim();
test('native tools draw and style shapes in independently saved tabs', async ({ page }) => {
  const live = JSON.parse(
    readFileSync('test-results/ai-design-studio/all-seven-live.json', 'utf8')
  );
  await page.goto('/ai-design-studio?studio-test=1');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Open design').selectOption(live.document.designId);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByLabel('Open design')).not.toHaveValue(live.document.designId);
  await expect(page.getByLabel('Open design')).not.toHaveValue('');
  const project = await page.getByLabel('Open design').inputValue();
  expect(project).not.toBe(live.document.designId);
  const canvas = page.locator('.ads-canvas');
  await expect(canvas.locator('[data-testid="style.panel"]')).toBeVisible();
  await expect(canvas.locator('.tlui-main-toolbar')).toBeVisible();
  const tabsBox = await page.locator('.ads-diagram-tabs').boundingBox(),
    toolbarBox = await canvas.locator('.tlui-main-toolbar').boundingBox();
  expect(tabsBox && toolbarBox && tabsBox.y + tabsBox.height < toolbarBox.y).toBe(true);
  const tabs = page.getByRole('navigation', { name: 'Diagram tabs' });
  const draw = async (tool: string, x: number, y: number) => {
    const button = canvas.getByTestId('tools.' + tool).first();
    await expect(button).toBeVisible();
    await button.click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 110, y + 80, { steps: 6 });
    await page.mouse.up();
  };
  for (const tool of ['select', 'hand', 'rectangle', 'ellipse', 'arrow', 'line', 'text', 'draw'])
    await expect(canvas.getByTestId('tools.' + tool).first()).toBeVisible();
  await draw('rectangle', 330, 710);
  await draw('ellipse', 520, 710);
  await draw('arrow', 710, 710);
  await draw('line', 870, 710);
  await draw('draw', 1030, 710);
  await page.getByTestId('tools.text').first().click();
  await page.mouse.click(430, 890);
  await page.keyboard.type('Manual label');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const architecture = await page.evaluate(() => {
    const e = (window as any).studioTestEditor;
    return e
      .getCurrentPageShapes()
      .filter((s: any) => !s.type.startsWith('studio-'))
      .map((s: any) => ({ id: s.id, type: s.type, props: s.props }));
  });
  for (const type of ['geo', 'arrow', 'line', 'draw', 'text'])
    expect(
      architecture.some((s: any) => s.type === type),
      type
    ).toBe(true);
  expect(architecture.filter((s: any) => s.type === 'geo').length).toBeGreaterThanOrEqual(2);
  const rectangle = architecture.find((s: any) => s.type === 'geo')!;
  await page.evaluate((id) => {
    (window as any).studioTestEditor.select(id);
  }, rectangle.id);
  await canvas.getByTestId('style.color.red').click();
  expect(
    await page.evaluate(
      (id) => (window as any).studioTestEditor.getShape(id)?.props.color,
      rectangle.id
    )
  ).toBe('red');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.ads-save-status')).toContainText('Saved');
  await tabs.getByRole('button', { name: 'Class', exact: true }).click();
  await draw('rectangle', 440, 790);
  const classRectangles = await page.evaluate(
    () =>
      (window as any).studioTestEditor.getCurrentPageShapes().filter((s: any) => s.type === 'geo')
        .length
  );
  expect(classRectangles).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.ads-save-status')).toContainText('Saved');
  await tabs.getByRole('button', { name: 'Architecture', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).studioTestEditor
          .getCurrentPageShapes()
          .filter((s: any) => !s.type.startsWith('studio-')).length
    )
  ).toBe(architecture.length);
  await page.reload();
  await page.getByLabel('Open design').selectOption(project);
  await page.waitForFunction(() => !!(window as any).studioTestEditor);
  await tabs.getByRole('button', { name: 'Architecture', exact: true }).click();
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(
      () =>
        (window as any).studioTestEditor
          .getCurrentPageShapes()
          .filter((s: any) => !s.type.startsWith('studio-')).length
    )
  ).toBe(architecture.length);
  await tabs.getByRole('button', { name: 'Class', exact: true }).click();
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(
      () =>
        (window as any).studioTestEditor.getCurrentPageShapes().filter((s: any) => s.type === 'geo')
          .length
    )
  ).toBe(classRectangles);
  await page.screenshot({path:'test-results/ai-design-studio/native-tools.png'});
});
