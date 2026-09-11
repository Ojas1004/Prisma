import socket, json, time, subprocess, base64
ff=subprocess.Popen(["firefox","--headless","--no-remote","--profile","/tmp/ff-prisma-profile",
                     "--window-size=1500,950","--marionette","http://localhost:5173/auth"],
                    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(35)
def recv(s):
    b=b""
    while b":" not in b: b+=s.recv(1)
    n=int(b.split(b":")[0]); d=b.split(b":",1)[1]
    while len(d)<n: d+=s.recv(n-len(d))
    return json.loads(d)
def send(s,m,p):
    j=json.dumps([0,1,m,p]); s.sendall(f"{len(j)}:{j}".encode()); return recv(s)
def js(s,sc,a=None): return send(s,"WebDriver:ExecuteScript",{"script":sc,"args":a or []})[3].get("value")
SET = """const set=(el,v)=>{const p=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement:window.HTMLInputElement;
         Object.getOwnPropertyDescriptor(p.prototype,'value').set.call(el,v);
         el.dispatchEvent(new Event('input',{bubbles:true}));};"""
try:
    s=socket.create_connection(("127.0.0.1",2828),timeout=30); recv(s); send(s,"WebDriver:NewSession",{})
    time.sleep(4); send(s,"WebDriver:SetWindowRect",{"width":1500,"height":950}); time.sleep(2)

    # ---- Log in IN THIS SAME instance (no cross-process profile race) ----
    send(s,"WebDriver:Navigate",{"url":"http://localhost:5173/auth"}); time.sleep(6)
    if js(s,"return location.pathname")=="/auth":
        js(s, SET + """
          const em=document.querySelector('input[type=email]');
          const pw=document.querySelector('input[type=password]');
          if(!em||!pw) return 'NOFIELDS';
          set(em, arguments[0]); set(pw, arguments[1]); return 'filled';""",
          ["ojaschaudhary.1004@gmail.com","ojas@12345"])
        time.sleep(1.5)
        js(s,"const f=document.querySelector('form'); if(f){f.requestSubmit(); return 'ok';} return 'no';")
        for _ in range(20):
            time.sleep(3)
            if js(s,"return location.pathname")!="/auth": break
    print("after login, path:", js(s,"return location.pathname"), flush=True)

    send(s,"WebDriver:Navigate",{"url":"http://localhost:5173/transform"}); time.sleep(20)
    print("path:", js(s,"return location.pathname"), flush=True)
    if js(s,"return location.pathname")!="/transform":
        print("ABORT: not authenticated, refusing to poll a login page"); raise SystemExit(1)

    print("source:", js(s,"""
      const bs=[...document.querySelectorAll('input[type=checkbox]')];
      let picked='';
      bs.forEach(b=>{ const row=b.closest('div,li');
        const isAtt = row && /attention/i.test(row.innerText);
        if(isAtt && !b.checked){ b.click(); picked=row.innerText.trim().slice(0,42); }
        else if(isAtt && b.checked){ picked=row.innerText.trim().slice(0,42); }
        else if(!isAtt && b.checked){ b.click(); }
      });
      return picked || ('NOT FOUND ('+bs.length+' boxes)');"""), flush=True)
    time.sleep(2)
    print("outputs:", js(s,"""
      const names=['Video Package','LinkedIn Post','Twitter/X Post','Advisory','Infographic','Executive Summary','Presentation'];
      const cards=[...document.querySelectorAll('button')].filter(b=>names.some(n=>b.innerText.trim().startsWith(n)));
      cards.forEach(c=>{ if(/border-l-2/.test(c.className)) c.click(); });
      ['Executive Summary','LinkedIn Post'].forEach(n=>{
        const c=cards.find(x=>x.innerText.trim().startsWith(n)); if(c) c.click(); });
      return cards.filter(c=>/border-l-2/.test(c.className)).map(c=>c.innerText.trim().slice(0,20)).join(',')||'none';"""), flush=True)
    time.sleep(2)
    t0=time.time()
    print("run:", js(s,"""const r=document.querySelector('button[aria-label="Run transform"]');
                          if(!r) return 'NO BTN'; if(r.disabled) return 'DISABLED'; r.click(); return 'clicked';"""), flush=True)
    for i in range(72):
        time.sleep(5)
        d=json.loads(js(s,"""const t=document.body.innerText;
          return JSON.stringify({failed:/JOB FAILED/i.test(t),
            done:/EXECUTIVE SUMMARY/i.test(t)&&/LINKEDIN POST/i.test(t)&&!/Queued|Generating/i.test(t),
            s:(t.match(/JOB STATUS[\\s\\S]{0,160}/)||[''])[0].replace(/\\s+/g,' ').slice(0,130)});"""))
        print(f"  [{i*5+5:3d}s] failed={d['failed']} done={d['done']} | {d['s'][:100]}", flush=True)
        if d['failed'] or d['done']:
            print(f"WALL CLOCK: {time.time()-t0:.1f}s", flush=True); break
    open("/home/ojas_chaudhary/Desktop/SIH/SIH/.fp_run.png","wb").write(
        base64.b64decode(send(s,"WebDriver:TakeScreenshot",{"full":False})[3]["value"]))
finally: ff.terminate()
