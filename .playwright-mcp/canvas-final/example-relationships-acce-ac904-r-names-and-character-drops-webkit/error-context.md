# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: example.spec.ts >> relationships accept typed character names and character drops
- Location: tests/example.spec.ts:870:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: 'Relationships', exact: true }).getByRole('combobox', { name: 'Add a relationship' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - 'generic "Scene: The Opening Scene" [ref=e4]'
  - navigation "Canvas tools" [ref=e7]:
    - button "Campaign menu" [ref=e8] [cursor=pointer]
    - button "Select (V)" [pressed] [ref=e11] [cursor=pointer]
    - button "Pan (H)" [ref=e14] [cursor=pointer]
    - button "Draw (P)" [ref=e17] [cursor=pointer]
    - button "Erase (E)" [ref=e20] [cursor=pointer]
    - button "Shapes (R)" [ref=e23] [cursor=pointer]
    - button "Text (X)" [ref=e26] [cursor=pointer]
    - button "Measure (M)" [ref=e29] [cursor=pointer]
    - button "Ping (G)" [ref=e32] [cursor=pointer]
    - button "Walls (W)" [ref=e35] [cursor=pointer]
    - button "Lights (L)" [ref=e38] [cursor=pointer]
  - complementary "Left sidebar" [ref=e41]:
    - generic [ref=e42]:
      - tablist [ref=e43]:
        - tab "Scenes" [ref=e44] [cursor=pointer]
        - tab "Characters" [selected] [ref=e47] [cursor=pointer]
      - separator "Resize left sidebar" [ref=e50]
    - tabpanel [ref=e51]:
      - generic [ref=e53]:
        - generic [ref=e54]:
          - button "One at a time (widen the panel to see the list and sheet side by side)" [disabled] [ref=e55]
          - heading "Characters" [level=2] [ref=e58]
        - navigation "Characters" [ref=e64]:
          - generic [ref=e65]:
            - button "New" [ref=e66] [cursor=pointer]
            - button "New folder" [ref=e67] [cursor=pointer]
          - generic [ref=e68]:
            - list
            - paragraph [ref=e69]: No characters yet.
  - complementary "Right sidebar" [ref=e70]:
    - generic [ref=e71]:
      - tablist [ref=e72]:
        - tab "Chat" [selected] [ref=e73] [cursor=pointer]
        - tab "Libraries" [ref=e76] [cursor=pointer]
        - tab "Items" [ref=e79] [cursor=pointer]
        - tab "Notes" [ref=e82] [cursor=pointer]
        - tab "Members, 1 online" [ref=e85] [cursor=pointer]: "1"
      - separator "Resize right sidebar" [ref=e88]
    - tabpanel [ref=e89]:
      - generic [ref=e91]:
        - heading "Chat" [level=2] [ref=e93]
        - generic [ref=e96]:
          - log [ref=e97]:
            - generic [ref=e98]: Say hello, or roll some dice.
          - generic [ref=e101]:
            - generic [ref=e102]:
              - button "d4" [ref=e103] [cursor=pointer]
              - button "d6" [ref=e104] [cursor=pointer]
              - button "d8" [ref=e105] [cursor=pointer]
              - button "d10" [ref=e106] [cursor=pointer]
              - button "d12" [ref=e107] [cursor=pointer]
              - button "d20" [ref=e108] [cursor=pointer]
              - button "Public" [ref=e109] [cursor=pointer]
            - generic [ref=e110]:
              - textbox "Message" [ref=e112]:
                - paragraph [ref=e113]: Message, @ to link, or roll 2d6+1
              - button "Send" [disabled] [ref=e114]
  - toolbar "Hotbar" [ref=e115]:
    - button "Ping" [ref=e117]
    - button "Measure" [ref=e122]
    - button "Command palette (Ctrl/Cmd+K)" [ref=e126] [cursor=pointer]
```

# Test source

```ts
  792 |   test(`custom character sheets: ${systemId} PC`, async ({ page }, testInfo) => {
  793 |     await createCampaign(page, `Sheets ${systemId}`, systemId);
  794 |     await openCharacters(page);
  795 |     await page.getByRole('textbox', { name: 'Name' }).fill('Sheet Hero');
  796 |     await page.getByRole('button', { name: 'Create', exact: true }).click();
  797 |     const sheet = page.locator('.character-sheet-drop');
  798 |     await expect(sheet.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  799 | 
  800 |     if (systemId === 'blades-in-the-dark') {
  801 |       await sheet.getByLabel('Hunt rating').fill('2');
  802 |       await sheet.getByLabel('Hunt rating').blur();
  803 |       await sheet.getByLabel('Cold', { exact: true }).check();
  804 |       await sheet.getByLabel('Armor used', { exact: true }).check();
  805 |       await sheet.getByRole('combobox', { name: /^Load/ }).selectOption('3');
  806 |       await expect(sheet.getByRole('region', { name: 'Trauma', exact: true })).toContainText('1/4');
  807 |       await sheet.getByRole('button', { name: 'Roll Hunt', exact: true }).click();
  808 |       const prompt = page.getByRole('dialog', { name: 'Hunt (Sheet Hero)' });
  809 |       await expect(prompt).toBeVisible();
  810 |       await page.keyboard.press('Escape');
  811 |     } else {
  812 |       await sheet.getByRole('button', { name: 'Decrease HP', exact: true }).click();
  813 |       if (systemId === 'dungeon-world-2') {
  814 |         const condition = sheet.getByRole('combobox', { name: /condition$/ }).first();
  815 |         await condition.selectOption('locked');
  816 |         await expect(condition).toHaveValue('locked');
  817 |         await sheet.getByRole('button', { name: 'Increase Armor', exact: true }).click();
  818 |       }
  819 |     }
  820 |     await sheet.getByRole('textbox', { name: 'Name', exact: true }).fill('Saved Hero');
  821 |     await sheet.getByRole('textbox', { name: 'Name', exact: true }).blur();
  822 |     await page.screenshot({ path: testInfo.outputPath('pc-desktop.png') });
  823 |     await page.setViewportSize({ width: 390, height: 844 });
  824 |     await page.getByRole('tab', { name: /^Chat/ }).click();
  825 |     await settled(page);
  826 |     await expect(sheet.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  827 |     expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  828 |     await page.screenshot({ path: testInfo.outputPath('pc-mobile.png') });
  829 |     await page.setViewportSize({ width: 1280, height: 800 });
  830 |     await page.reload();
  831 |     await page.getByRole('tab', { name: 'Characters' }).click();
  832 |     await expect(sheet.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Saved Hero');
  833 |     if (systemId === 'blades-in-the-dark') {
  834 |       await expect(sheet.getByLabel('Hunt rating')).toHaveValue('2');
  835 |       await expect(sheet.getByLabel('Cold', { exact: true })).toBeChecked();
  836 |       await expect(sheet.getByLabel('Armor used', { exact: true })).toBeChecked();
  837 |       await expect(sheet.getByRole('combobox', { name: /^Load/ })).toHaveValue('3');
  838 |     }
  839 |   });
  840 | 
  841 |   test(`custom character sheets: ${systemId} NPC`, async ({ page }, testInfo) => {
  842 |     await createCampaign(page, `NPC Sheets ${systemId}`, systemId);
  843 |     await openCharacters(page);
  844 |     await page.getByRole('radio', { name: 'NPC', exact: true }).click();
  845 |     await page.getByRole('textbox', { name: 'Name' }).fill('Sheet NPC');
  846 |     await page.getByRole('button', { name: 'Create', exact: true }).click();
  847 |     const sheet = page.locator('.character-sheet-drop');
  848 |     await expect(sheet.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Sheet NPC');
  849 |     await expect(sheet.getByRole('heading', { name: heading, exact: true })).toHaveCount(0);
  850 |     if (systemId === 'blades-in-the-dark') {
  851 |       await sheet.getByLabel('Quality', { exact: true }).fill('3');
  852 |       await sheet.getByLabel('Quality', { exact: true }).blur();
  853 |       await expect(sheet.getByLabel('Quality', { exact: true })).toHaveValue('3');
  854 |       await expect(sheet.getByRole('region', { name: 'Trauma', exact: true })).toHaveCount(0);
  855 |     } else {
  856 |       await expect(sheet.getByRole('button', { name: 'Increase HP', exact: true })).toBeVisible();
  857 |       if (systemId === 'dungeon-world-2') {
  858 |         await expect(sheet.getByRole('button', { name: 'Increase Armor', exact: true })).toHaveCount(1);
  859 |       }
  860 |     }
  861 |     await page.screenshot({ path: testInfo.outputPath('npc-desktop.png') });
  862 |     await page.setViewportSize({ width: 390, height: 844 });
  863 |     await page.getByRole('tab', { name: /^Chat/ }).click();
  864 |     await settled(page);
  865 |     expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  866 |     await page.screenshot({ path: testInfo.outputPath('npc-mobile.png') });
  867 |   });
  868 | }
  869 | 
  870 | test('relationships accept typed character names and character drops', async ({ page }, testInfo) => {
  871 |   await createCampaign(page, 'Relationship entry');
  872 |   await page.evaluate(async () => {
  873 |     const modules = performance.getEntriesByType('resource').map((entry) => entry.name).reverse();
  874 |     const campaignPath = modules.find((name) => new URL(name).pathname === '/src/store/campaign.ts')!;
  875 |     const characterPath = modules.find((name) => new URL(name).pathname === '/src/characters/api.ts')!;
  876 |     const { activeCampaign } = await import(campaignPath);
  877 |     const { newCharacter, newNpc, selectCharacter } = await import(characterPath);
  878 |     const campaign = activeCampaign.value;
  879 |     const ayla = newCharacter(campaign, 'Ayla');
  880 |     newNpc(campaign, 'Briar');
  881 |     newNpc(campaign, 'Brom');
  882 |     newNpc(campaign, 'Mira');
  883 |     selectCharacter(campaign, ayla);
  884 |   });
  885 |   const charactersTab = page.getByRole('tab', { name: 'Characters' });
  886 |   if ((await charactersTab.getAttribute('aria-selected')) !== 'true') await charactersTab.click();
  887 |   await expect(charactersTab).toHaveAttribute('aria-selected', 'true');
  888 |   await settled(page);
  889 |   const section = page.getByRole('region', { name: 'Relationships', exact: true });
  890 |   const input = section.getByRole('combobox', { name: 'Add a relationship' });
  891 |   const suggestions = page.getByRole('listbox', { name: 'Character matches' });
> 892 |   await input.click();
      |               ^ Error: locator.click: Test timeout of 30000ms exceeded.
  893 |   await expect(input).toBeFocused();
  894 |   await input.pressSequentially('B');
  895 |   await expect(input).toHaveValue('B');
  896 |   await expect(input).toBeFocused();
  897 |   await expect(suggestions.getByRole('option')).toHaveCount(2);
  898 |   await expect(suggestions.getByRole('option').first()).toContainText('Briar');
  899 |   await input.press('ArrowDown');
  900 |   await input.press('Enter');
  901 |   await expect(section.locator('.relationship-name')).toHaveText(['Brom']);
  902 |   await expect(input).toHaveValue('');
  903 |   const label = section.getByRole('textbox', { name: 'How Ayla sees Brom' });
  904 |   await label.fill('Trusts');
  905 |   await label.blur();
  906 | 
  907 |   await input.fill('Brom');
  908 |   await expect(suggestions.getByRole('option')).toHaveCount(0);
  909 |   await input.press('Enter');
  910 |   await expect(section.locator('.relationship-name')).toHaveCount(1);
  911 |   await expect(label).toHaveValue('Trusts');
  912 |   await input.fill('Ayla');
  913 |   await expect(suggestions.getByRole('option')).toHaveCount(0);
  914 |   await input.fill('Not a character');
  915 |   await expect(suggestions).toContainText('Nothing by that name.');
  916 |   await input.press('Escape');
  917 |   await expect(suggestions).toHaveCount(0);
  918 | 
  919 |   await input.fill('@mir');
  920 |   await suggestions.getByRole('option', { name: 'Mira NPC' }).click();
  921 |   await expect(section.locator('.relationship-name')).toHaveText(['Brom', 'Mira']);
  922 |   await page.getByRole('separator', { name: 'Resize left sidebar' }).press('End');
  923 |   await section.scrollIntoViewIfNeeded();
  924 |   const source = page.locator('.chars-tree .list-pick').filter({ hasText: 'Briar' });
  925 |   const sourceBounds = (await source.boundingBox())!;
  926 |   const targetBounds = (await input.boundingBox())!;
  927 |   await page.mouse.move(sourceBounds.x + sourceBounds.width / 2, sourceBounds.y + sourceBounds.height / 2);
  928 |   await page.mouse.down();
  929 |   await page.mouse.move(targetBounds.x + targetBounds.width / 2, targetBounds.y + targetBounds.height / 2, { steps: 10 });
  930 |   await expect(section).toHaveAttribute('data-dropping', 'true');
  931 |   await page.mouse.up();
  932 |   await expect(section.locator('.relationship-name')).toHaveText(['Brom', 'Mira', 'Briar']);
  933 |   await drag(page, source, targetBounds.x + targetBounds.width / 2, targetBounds.y + targetBounds.height / 2);
  934 |   await expect(section.locator('.relationship-name')).toHaveCount(3);
  935 |   await expect(label).toHaveValue('Trusts');
  936 |   await page.screenshot({ path: testInfo.outputPath('relationships-desktop.png') });
  937 | 
  938 |   await section.getByRole('button', { name: 'Remove', exact: true }).last().click();
  939 |   await page.setViewportSize({ width: 390, height: 844 });
  940 |   await page.getByRole('tab', { name: /^Chat/ }).click();
  941 |   await input.fill('bri');
  942 |   await expect(suggestions.getByRole('option')).toHaveCount(1);
  943 |   const popup = (await suggestions.boundingBox())!;
  944 |   expect(popup.x).toBeGreaterThanOrEqual(0);
  945 |   expect(popup.x + popup.width).toBeLessThanOrEqual(390);
  946 |   await page.screenshot({ path: testInfo.outputPath('relationships-mobile.png') });
  947 |   await input.press('Tab');
  948 |   await expect(section.locator('.relationship-name')).toHaveCount(3);
  949 | 
  950 |   await page.evaluate(async () => {
  951 |     const modules = performance.getEntriesByType('resource').map((entry) => entry.name).reverse();
  952 |     const campaignPath = modules.find((name) => new URL(name).pathname === '/src/store/campaign.ts')!;
  953 |     const devicePath = modules.find((name) => new URL(name).pathname === '/src/store/device.ts')!;
  954 |     const { activeCampaign } = await import(campaignPath);
  955 |     const { device } = await import(devicePath);
  956 |     const campaign = activeCampaign.value;
  957 |     campaign.doc.transact(() => {
  958 |       campaign.members.get(device.value.id).set('role', 'observer');
  959 |       const ayla = [...campaign.characters.values()].find((character: any) => character.get('name') === 'Ayla');
  960 |       ayla.set('owner', 'another-player');
  961 |     });
  962 |   });
  963 |   await expect(input).toHaveCount(0);
  964 |   await expect(section.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  965 |   await expect(section).not.toHaveAttribute('data-entity-drop', 'true');
  966 | });
  967 | 
  968 | test("using a move asks for its stat and posts the result to chat", async ({
  969 |   page,
  970 | }) => {
  971 |   await createCampaign(page, "Move flow", "dungeon-world");
  972 |   await openCharacters(page);
  973 |   await page.getByRole("textbox", { name: "Name" }).fill("Ayla");
  974 |   await pickOption(page, "Class", "Fighter");
  975 |   await page.getByRole("button", { name: "Create", exact: true }).click();
  976 | 
  977 |   await page.getByRole("radio", { name: "Basic" }).click();
  978 |   await page.getByRole("button", { name: "Roll: Defy Danger" }).click();
  979 |   const prompt = page.getByRole("dialog", { name: "Defy Danger (Ayla)" });
  980 |   await prompt
  981 |     .getByRole("radiogroup", { name: "Stat to roll" })
  982 |     .getByRole("button", { name: "STR" })
  983 |     .click();
  984 |   await prompt.getByRole("button", { name: /^Roll / }).click();
  985 | 
  986 |   await expect(
  987 |     page.getByRole("log").getByText(/Defy Danger.*Ayla/),
  988 |   ).toBeVisible();
  989 | });
  990 | 
  991 | test("chat dice can be shaken individually or together and toggled out of the total", async ({ page }) => {
  992 |   await createCampaign(page, "Interactive dice");
```