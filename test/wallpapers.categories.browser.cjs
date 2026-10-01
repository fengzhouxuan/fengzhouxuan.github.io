const assert=require('node:assert/strict');
const {chromium}=require(process.env.WALLPAPER_PLAYWRIGHT||'playwright');
const commons=require('../source/wallpapers/commons.js');
const snapshot=require('../source/wallpapers/data/open-images.json');

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1080},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
    await page.clock.install({time:new Date('2026-10-01T12:00:00Z')});
    await page.route('**/wallpapers/data/official-feeds.json',route=>route.fulfill({json:{version:1,records:{}}}));
    await page.route('https://openaccess-api.clevelandart.org/**',route=>route.abort());
    await page.route('https://commons.wikimedia.org/w/api.php**',route=>{
      const cat=new URL(route.request().url()).searchParams.get('gcmtitle').slice(9);requests.push(cat);
      const key=Object.keys(commons.categories).find(key=>commons.categories[key]===cat);
      const pages=Object.fromEntries(snapshot.records[key].map(record=>[record.pageid,record]));
      return route.fulfill({json:{query:{pages}}});
    });
    await page.route(/https:\/\/(thumb|upload)\.wikimedia\.org\//,route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#b5a2c3"/></svg>'}));
    await page.goto('http://localhost:4011/wallpapers/');
    assert.equal(requests.length,0);
    await page.locator('[data-collection="anime"]').click();
    await page.waitForFunction(()=>document.querySelector('#category-status').textContent.includes('已更新'));
    assert.equal(await page.locator('.card').count(),9);assert.equal(await page.locator('.filter-details').isVisible(),false);
    assert.equal(await page.locator('[data-category="anime"]').getAttribute('aria-pressed'),'true');
    await page.locator('.card-open').first().click();
    assert.match(await page.locator('#license-link').textContent(),/CC BY-SA 3.0.*署名/);
    assert.match(await page.locator('#source-link').getAttribute('href'),/^https:\/\/commons.wikimedia.org\/wiki\/File:/);
    assert.match(await page.locator('#art-download').getAttribute('href'),/^https:\/\/upload.wikimedia.org\//);
    assert.equal(await page.locator('#download').isVisible(),false);
    await page.locator('#copy-credit').click();
    const copied=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(copied,/CC BY-SA 3.0/);assert.match(copied,/Kasuga/);assert.match(copied,/creativecommons.org/);
    await page.locator('#favorite').click();await page.keyboard.press('Escape');await page.reload();
    await page.locator('[data-source="favorites"]').click();assert.equal(await page.locator('.card').count(),1);
    await page.locator('.card-open').click();assert.match(await page.locator('#credit-text').textContent(),/CC BY-SA 3.0/);await page.keyboard.press('Escape');
    await page.locator('[data-category="anime"]').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===9);
    assert.equal(requests.filter(cat=>cat==='Anime illustrations').length,1);
    await page.locator('[data-category="illustration"]').click();assert.equal(await page.locator('.card').count(),9);
    await page.locator('[data-category="city"]').click();await page.waitForFunction(()=>document.querySelector('#category-status').textContent.includes('已更新'));
    assert.equal(await page.locator('.card').count(),5);
    await page.locator('[data-category="space"]').click();await page.waitForFunction(()=>document.querySelector('#category-status').textContent.includes('已更新'));
    assert.equal(await page.locator('.card').count(),11);
    await page.locator('[data-category="animals"]').click();await page.waitForFunction(()=>document.querySelector('#category-status').textContent.includes('已更新'));assert.equal(await page.locator('.card').count(),5);
    await page.locator('[data-category="nature"]').click();await page.waitForFunction(()=>document.querySelector('#category-status').textContent.includes('已更新'));assert.equal(await page.locator('.card').count(),11);
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('[data-category="art"]').click();assert.equal(await page.locator('#empty').isVisible(),true);
    await page.locator('#empty-reset').click();assert.equal(await page.locator('[data-category=""]').getAttribute('aria-pressed'),'true');
    await page.route('https://commons.wikimedia.org/w/api.php**',route=>route.abort());
    await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('rabbit-wallpapers-commons')).forEach(key=>localStorage.removeItem(key)));
    await page.reload();await page.locator('[data-category="anime"]').click();
    await page.waitForFunction(()=>document.querySelector('#category-status').textContent.includes('暂时连接不上'));
    assert.equal(await page.locator('.card').count(),9);assert.equal(await page.locator('#retry-commons').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: real category feeds, licensed-only ingestion, attribution copy, favorite restoration, daily cache, illustration alias, photo categories, mobile overflow and offline bundled fallback.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
