import socket, json, time, subprocess, base64
ff=subprocess.Popen(["firefox","--headless","--no-remote","--profile","/tmp/ff-prisma-profile",
                     "--window-size=1500,950","--marionette","http://localhost:5173/auth"],
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
SET = """const set=(el,v)=>{const p=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement:window.HTMLInputElement;
         Object.getOwnPropertyDescriptor(p.prototype,'value').set.call(el,v);
         el.dispatchEvent(new Event('input',{bubbles:true}));};"""
try:
    s=socket.create_connection(("127.0.0.1",2828),timeout=30); recv(s); send(s,"WebDriver:NewSession",{})
    time.sleep(5); send(s,"WebDriver:SetWindowRect",{"width":1500,"height":950}); time.sleep(3)
    # Firefox restored a stale tab; navigate explicitly.
    send(s,"WebDriver:Navigate",{"url":"http://localhost:5173/auth"})
    time.sleep(6)
    print("on:", js(s,"return location.pathname"))
    print("fill:", js(s, SET + """
      const em=document.querySelector('input[type=email]')||document.querySelector('input[name=email]');
      const pw=document.querySelector('input[type=password]');
      if(!em||!pw) return 'FIELDS NOT FOUND';
      set(em, arguments[0]); set(pw, arguments[1]);
      return 'filled';""", ["ojaschaudhary.1004@gmail.com", "ojas@12345"]))
    time.sleep(1.5)
    print("submit:", js(s,"""
      const f=document.querySelector('form');
      if(f){ f.requestSubmit(); return 'form submitted'; }
      const b=[...document.querySelectorAll('button')].find(x=>/^Sign in$/i.test(x.innerText.trim()));
      if(b){ b.click(); return 'clicked Sign in'; } return 'NO SUBMIT';"""))
    for i in range(20):
        time.sleep(3)
        loc = js(s,"return location.pathname")
        err = js(s,"const e=document.querySelector('.error-note,[role=alert]'); return e?e.innerText.trim().slice(0,90):''")
        print(f"  [{i*3+3:2d}s] path={loc} err={err!r}")
        if loc != "/auth": break
    print("FINAL PATH:", js(s,"return location.pathname"))
    print("session?", js(s,"return Object.keys(localStorage).filter(k=>/supabase|sb-/.test(k)).length>0"))
finally: ff.terminate()
