import shutil
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=re.sub(r'<script defer src="[^"]+"></script>','', (ROOT/'index.html').read_text())
HTML=re.sub(r'<link rel="stylesheet" href="styles.css">','',HTML)
CSS=(ROOT/'styles.css').read_text().split('\n',1)[1]
JS=(ROOT/'app.js').read_text()
OUT=ROOT/'tests'
async def main():
  errors=[]
  async with async_playwright() as p:
    chrome=shutil.which('chromium') or shutil.which('google-chrome')
    opts={'headless':True,'args':['--no-sandbox']}
    if chrome:opts['executable_path']=chrome
    browser=await p.chromium.launch(**opts)
    context=await browser.new_context(viewport={'width':1380,'height':1000},device_scale_factor=1)
    async def fresh(ctx, initial=None):
      page=await ctx.new_page()
      page.on('pageerror',lambda e:errors.append(str(e)))
      await page.set_content(HTML)
      await page.add_style_tag(content=CSS)
      await page.evaluate('''(initial) => {
        const bag=new Map(Object.entries(initial||{}));
        Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>bag.get(k)||null,setItem:(k,v)=>bag.set(k,String(v)),removeItem:k=>bag.delete(k)}});
        const sess=new Map();Object.defineProperty(window,'sessionStorage',{configurable:true,value:{getItem:k=>sess.get(k)||null,setItem:(k,v)=>sess.set(k,String(v))}});
        window.CLASSROOM_CONFIG={supabaseUrl:'',supabaseAnonKey:''};
      }''',initial or {})
      await page.add_script_tag(content=JS)
      await page.locator('#seatGrid .seat').first.wait_for(timeout=15000)
      return page
    page=await fresh(context)
    await page.wait_for_timeout(550)
    assert await page.locator('#statTotal').inner_text()=='40'
    assert await page.locator('#countdownScene').count()==0
    assert await page.locator('#bookSelf').get_attribute('aria-pressed')=='true'
    # Book for self
    await page.locator('.seat',has_text='A1').first.click()
    snap=await page.evaluate('localStorage.getItem("classroomhub_v7_store")')
    second=await fresh(context,{'classroomhub_v7_store':snap})
    assert 'กำลังจอง' in await second.locator('.seat',has_text='A1').first.inner_text()
    assert await second.locator('.seat',has_text='A1').first.is_disabled()
    await page.locator('#studentName').fill('ทดสอบ คนแรก')
    await page.locator('#studentNo').fill('01')
    await page.locator('#reserveBtn').click()
    assert 'จองให้ตัวเอง' in await page.locator('#reviewWho').inner_text()
    await page.locator('#acceptConfirm').click()
    await page.locator('#successOverlay').wait_for(state='visible')
    await page.wait_for_timeout(850)
    await page.screenshot(path=str(OUT/'booking-success.png'))
    assert 'ยินดีด้วย' in await page.locator('#successTitle').inner_text()
    await page.locator('#bookAnother').click()
    assert await page.locator('#bookOther').get_attribute('aria-pressed')=='true'
    assert await page.locator('#bookSelf').is_disabled()
    assert 'รายการที่จองจากบัญชีนี้ (1 โต๊ะ)' in await page.locator('#myBookings').inner_text()
    # Book twice for different recipients, same operator
    await page.locator('.seat',has_text='B1').first.click()
    await page.locator('#studentName').fill('เพื่อน ลองใช้')
    await page.locator('#studentNo').fill('02')
    await page.locator('#reserveBtn').click()
    assert 'จองให้คนอื่น' in await page.locator('#reviewWho').inner_text()
    await page.locator('#acceptConfirm').click()
    await page.locator('#successOverlay').wait_for(state='visible')
    assert 'เพื่อน ลองใช้' in await page.locator('#successText').inner_text()
    await page.locator('#bookAnother').click()
    await page.locator('.seat',has_text='C1').first.click()
    await page.locator('#studentName').fill('เพื่อน อีกคน')
    await page.locator('#studentNo').fill('03')
    await page.locator('#reserveBtn').click()
    await page.locator('#acceptConfirm').click()
    await page.locator('#successOverlay').wait_for(state='visible')
    await page.locator('#successClose').click()
    assert await page.locator('#statBooked').inner_text()=='3'
    assert 'รายการที่จองจากบัญชีนี้ (3 โต๊ะ)' in await page.locator('#myBookings').inner_text()
    records=await page.evaluate('JSON.parse(localStorage.getItem("classroomhub_v7_store")).reservations')
    assert len(records)==3 and sorted(r['booked_for'] for r in records)==['other','other','self']
    # Mirror to second page, verify it cannot book booked seats
    latest=await page.evaluate('localStorage.getItem("classroomhub_v7_store")')
    await second.evaluate('''(v)=>{localStorage.setItem("classroomhub_v7_store",v);window.dispatchEvent(new StorageEvent('storage',{key:'classroomhub_v7_store'}))}''',latest)
    await second.wait_for_timeout(100)
    assert await second.locator('.seat',has_text='B1').first.is_disabled()
    assert 'จองแล้ว' in await second.locator('.seat',has_text='C1').first.inner_text()
    await page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
    # admin secure-demo + date form
    await page.locator('#adminBtn').click()
    await page.locator('#adminPin').fill('280806')
    await page.locator('#adminLoginForm button[type=submit]').click()
    assert await page.locator('#adminBoard').is_visible()
    await page.locator('[data-tab=schedule]').click()
    assert await page.locator('#confirmSchedule').is_disabled()
    await page.locator('#openingDateText').fill('31/02/2027')
    await page.locator('#openingClock').fill('09:30')
    await page.locator('#checkSchedule').click()
    assert 'ไม่ถูกต้อง' in await page.locator('#schedulePreview').inner_text()
    assert await page.locator('#confirmSchedule').is_disabled()
    await page.locator('#openingDay').fill('2026-12-25')
    await page.locator('#openingDay').dispatch_event('change')
    assert await page.locator('#openingDateText').input_value()=='25/12/2026'
    await page.locator('#checkSchedule').click()
    assert await page.locator('#confirmSchedule').is_enabled()
    assert '25' in await page.locator('#schedulePreview').inner_text()
    await page.screenshot(path=str(OUT/'admin-schedule.png'))
    page.once('dialog',lambda d:asyncio.create_task(d.accept()))
    await page.locator('#confirmSchedule').click()
    saved=await page.evaluate('JSON.parse(localStorage.getItem("classroomhub_v7_store")).test_opens_at')
    assert saved.startswith('2026-12-25') or saved.startswith('2026-12-24'), saved
    assert await page.locator('#confirmSchedule').is_disabled()
    # countdown still works, no cinematic overlay
    page.once('dialog',lambda d:asyncio.create_task(d.accept()))
    await page.locator('#previewTen').click()
    assert await page.locator('#adminOverlay').is_hidden()
    assert await page.locator('#countdownScene').count()==0
    assert await page.locator('#day').inner_text()=='00'
    # admin close + restore immediate opening for consistency
    await page.locator('#adminBtn').click()
    await page.locator('[data-tab=schedule]').click()
    page.once('dialog',lambda d:asyncio.create_task(d.accept()))
    await page.locator('#openInstant').click()
    await page.locator('#closeAdmin').click()
    await page.wait_for_timeout(180)
    assert await page.locator('.seat',has_text='D1').first.is_enabled()
    # Mobile check
    phone=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mp=await fresh(phone)
    await mp.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    assert not await mp.evaluate('document.documentElement.scrollWidth>innerWidth+3')
    assert not errors,errors
    await browser.close()
    print(json.dumps({'status':'PASS','seats':40,'self_booking':'PASS','multiple_proxy_bookings':'PASS','locked_other_window':'PASS','unique_seats':'PASS','no_cinematic_countdown':'PASS','typed_date_validation':'PASS','date_confirmation':'PASS','live_countdown':'PASS','mobile':'PASS','page_errors':errors},ensure_ascii=False,indent=2))
if __name__=='__main__':asyncio.run(main())
