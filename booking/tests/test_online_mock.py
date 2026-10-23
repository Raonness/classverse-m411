import shutil
"""Mock ONLINE browser test; not a real Supabase integration test.
Runs two independent browser contexts against a deterministic Python DB simulation.
"""
import asyncio
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
SEATS = ['A'+str(i) for i in range(1,6)] + ['B'+str(i) for i in range(1,6)] + ['C'+str(i) for i in range(1,6)] + ['D'+str(i) for i in range(1,6)] + ['E'+str(i) for i in range(1,7)] + ['F'+str(i) for i in range(1,7)] + ['G2','G3','G6','H2','H6','I2','J2','J3']

def iso(delta=0):
    return (datetime.now(timezone.utc)+timedelta(seconds=delta)).isoformat()

class FakeDB:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.down = False
        self.holds = {}
        self.booked = {}
        self.open = iso(-10)
    async def rpc(self, user, function, args):
        if self.down:
            raise Exception('offline simulated')
        async with self.lock:
            self.holds={seat: h for seat,h in self.holds.items() if h['until']>datetime.now(timezone.utc)}
            if function=='public_snapshot':
                return {'mode':'test','opens_at':self.open,'server_now':iso(),'catalog':[{'seat_id':s,'enabled':True} for s in SEATS],
                  'booked':list(self.booked),'holds':[{'seat_id':s,'expires_at':v['until'].isoformat(),'mine':v['owner']==user} for s,v in self.holds.items()],
                  'mine_bookings':[dict(b) for b in self.booked.values() if b['owner_id']==user]}
            seat=args.get('p_seat')
            if function=='hold_seat':
                if seat in self.booked or (seat in self.holds and self.holds[seat]['owner']!=user):
                    return {'ok':False,'error':'already taken'}
                self.holds={s:v for s,v in self.holds.items() if v['owner']!=user}
                until=datetime.now(timezone.utc)+timedelta(seconds=120)
                self.holds[seat]={'owner':user,'until':until}
                return {'ok':True,'expires_at':until.isoformat()}
            if function=='confirm_seat':
                hold=self.holds.get(seat)
                if seat in self.booked or not hold or hold['owner']!=user:
                    return {'ok':False,'error':'no hold'}
                self.booked[seat]={'seat_id':seat,'student_name':args['p_name'],'student_number':args.get('p_number',''),'booked_for':'other' if args.get('p_for_other') else 'self','owner_id':user}
                del self.holds[seat]
                return {'ok':True,'seat_id':seat}
            if function=='drop_hold':
                if seat in self.holds and self.holds[seat]['owner']==user:
                    del self.holds[seat]
                    return {'ok':True}
                return {'ok':False}
            raise ValueError(function)

STUB="""
window.supabase={createClient:()=>({
 auth:{getSession:async()=>({data:{session:{user:{id:window.__mockUID,is_anonymous:true}}}}),
 onAuthStateChange:()=>({}),signInAnonymously:async()=>({data:{session:{user:{id:window.__mockUID,is_anonymous:true}}}})},
 channel:()=>({on(){return this},subscribe(){return this}}),
 rpc:async(fn,args)=>{try{return {data:await window.__mockRpc(window.__mockUID,fn,args||{}),error:null}}
 catch(e){return {data:null,error:{message:String(e)}}}}
})};
"""

async def main():
    fake=FakeDB()
    errors=[]
    async with async_playwright() as playwright:
        chrome=shutil.which('chromium') or shutil.which('google-chrome')
        opts={'headless':True,'args':['--no-sandbox']}
        if chrome:opts['executable_path']=chrome
        browser=await playwright.chromium.launch(**opts)
        contexts=[await browser.new_context() for _ in range(2)]
        pages=[]
        for idx,context in enumerate(contexts):
            page=await context.new_page()
            page.on('pageerror',lambda exc:errors.append(str(exc)))
            await page.expose_function('__mockRpc',fake.rpc)
            # set_content does not navigate, so init-script would not fire.
            html=(ROOT/'index.html').read_text()
            html=re.sub(r'<script defer src="[^"]+"></script>','',html)
            html=html.replace('<link rel="stylesheet" href="styles.css">','')
            await page.set_content(html)
            await page.add_style_tag(content=(ROOT/'styles.css').read_text().split('\n',1)[1])
            await page.evaluate('''() => {
               const store=new Map(),ses=new Map();
               Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});
               Object.defineProperty(window,'sessionStorage',{configurable:true,value:{getItem:k=>ses.get(k)||null,setItem:(k,v)=>ses.set(k,String(v))}});
               window.CLASSROOM_CONFIG={supabaseUrl:'https://mock.supabase.co',supabaseAnonKey:'mock-key'};
               document.head.append = (...nodes) => { for(const node of nodes){if(node.tagName==='SCRIPT' && node.src.includes('supabase-js')) queueMicrotask(()=>node.onload()); else document.head.appendChild(node);} };
             }''')
            await page.evaluate('window.__mockUID = '+json.dumps(f'fake-user-{idx}')+';')
            await page.add_script_tag(content=STUB)
            await page.add_script_tag(content=(ROOT/'app.js').read_text())
            await page.locator('#seatGrid .seat').first.wait_for(timeout=20000)
            pages.append(page)
        p1,p2=pages
        assert await p1.locator('#statTotal').inner_text()=='40'
        await p1.locator('.seat',has_text='A1').first.click()
        await p1.wait_for_timeout(200)
        await p2.evaluate("window.dispatchEvent(new Event('online'))")
        await p2.wait_for_timeout(750)
        assert 'กำลังจอง' in await p2.locator('.seat',has_text='A1').first.inner_text(), 'second user does not see locked seat'
        assert await p2.locator('.seat',has_text='A1').first.is_disabled()
        await p1.locator('#studentName').fill('ทดสอบออนไลน์')
        await p1.locator('#studentNo').fill('02')
        await p1.locator('#reserveBtn').click()
        await p1.locator('#acceptConfirm').click()
        await p1.locator('#successOverlay').wait_for(state='visible')
        await p2.evaluate("window.dispatchEvent(new Event('online'))")
        await p2.wait_for_timeout(750)
        assert 'จองแล้ว' in await p2.locator('.seat',has_text='A1').first.inner_text()
        assert await p2.locator('.seat',has_text='A1').first.is_disabled()
        fake.down=True
        await p2.evaluate("window.dispatchEvent(new Event('online'))")
        await p2.wait_for_timeout(750)
        assert 'ขัดข้อง' in await p2.locator('#connection').inner_text()
        assert await p2.locator('.seat',has_text='B1').first.is_disabled(), 'fail-close on network errors'
        fake.down=False
        await p2.evaluate("window.dispatchEvent(new Event('online'))")
        await p2.wait_for_timeout(750)
        assert await p2.locator('.seat',has_text='B1').first.is_enabled()
        assert not errors, errors
        await browser.close()
    print(json.dumps({'status':'PASS','online_mock_two_users':'PASS','hold_prevents_second_selection':'PASS','reservation_prevents_second_selection':'PASS','network_failure_fail_closed':'PASS','network_recovery':'PASS','page_errors':errors},ensure_ascii=False,indent=2))

if __name__=='__main__':asyncio.run(main())
