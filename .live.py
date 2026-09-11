import socket, json, time, subprocess, base64
ff=subprocess.Popen(["firefox","--headless","--no-remote","--profile","/tmp/ff-prisma-profile",
                     "--window-size=1500,950","--marionette","http://localhost:5173/transform"],
                    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(20)
def recv(s):
    b=b""
    while b":" not in b: b+=s.recv(1)
    n=int(b.split(b":")[0]); d=b.split(b":",1)[1]
    while len(d)<n: d+=s.recv(n-len(d))
    return json.loads(d)
def send(s,m,p):
    j=json.dumps([0,1,m,p]); s.sendall(f"{len(j)}:{j}".encode()); return recv(s)
def js(s,sc,a=None): return send(s,"WebDriver:ExecuteScript",{"script":sc,"args":a or []})[3].get("value")
try:
    s=socket.create_connection(("127.0.0.1",2828),timeout=30); recv(s); send(s,"WebDriver:NewSession",{})
    time.sleep(4); send(s,"WebDriver:SetWindowRect",{"width":1500,"height":950}); time.sleep(2)
    send(s,"WebDriver:Navigate",{"url":"http://localhost:5173/transform"}); time.sleep(8)
    print("path:", js(s,"return location.pathname"))

    # Check ONLY the Attention paper source
    print("source:", js(s,"""
      const bs=[...document.querySelectorAll('input[type=checkbox]')];
      let picked='';
      bs.forEach(b=>{ const row=b.closest('div,li');
        const isAtt = row && /attention/i.test(row.innerText);
        if(isAtt && !b.checked){ b.click(); picked=row.innerText.trim().slice(0,42); }
        else if(isAtt && b.checked){ picked=row.innerText.trim().slice(0,42); }
        else if(!isAtt && b.checked){ b.click(); }
      });
      return picked || ('NOT FOUND ('+bs.length+' boxes)');"""))
    time.sleep(2)

    # Exactly one output type
    print("outputs:", js(s,"""
      const names=['Video Package','LinkedIn Post','Twitter/X Post','Advisory','Infographic','Executive Summary','Presentation'];
      const cards=[...document.querySelectorAll('button')].filter(b=>names.some(n=>b.innerText.trim().startsWith(n)));
      cards.forEach(c=>{ if(/border-l-2/.test(c.className)) c.click(); });
      ['Executive Summary','LinkedIn Post'].forEach(n=>{
        const c=cards.find(x=>x.innerText.trim().startsWith(n)); if(c) c.click(); });
      return cards.filter(c=>/border-l-2/.test(c.className)).map(c=>c.innerText.trim().slice(0,20)).join(',')||'none';"""))
    time.sleep(2)
    print("run:", js(s,"""const r=document.querySelector('button[aria-label="Run transform"]');
                          if(!r) return 'NO BTN'; if(r.disabled) return 'DISABLED'; r.click(); return 'clicked';"""))
    for i in range(96):
        time.sleep(5)
        d=json.loads(js(s,"""const t=document.body.innerText;
          return JSON.stringify({failed:t.includes('JOB FAILED'),
            done:/Completed|COMPLETE\\b/i.test(t)||/EXECUTIVE SUMMARY/i.test(t)&&!/Queued|Generating/i.test(t),
            s:(t.match(/JOB STATUS[\\s\\S]{0,150}/)||[''])[0].replace(/\\s+/g,' ').slice(0,120)});"""))
        print(f"  [{i*5+5:3d}s] failed={d['failed']} done={d['done']} | {d['s'][:95]}")
        if d['failed'] or d['done']: break
    open("/tmp/multi.png","wb").write(base64.b64decode(send(s,"WebDriver:TakeScreenshot",{"full":False})[3]["value"]))
finally: ff.terminate()
