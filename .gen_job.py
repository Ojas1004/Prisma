import socket, json, time, subprocess, base64
SRC = ("Transformer Architecture Overview. The Transformer is a neural network architecture "
 "that relies entirely on self-attention mechanisms, dispensing with recurrence and convolutions. "
 "Introduced by Vaswani et al. in 2017, it achieves 28.4 BLEU on the WMT 2014 English-to-German "
 "translation task, improving over the previous best results by more than 2 BLEU points. On the "
 "English-to-French task it reaches 41.8 BLEU after training for 3.5 days on eight P100 GPUs, a "
 "small fraction of the training cost of the best models from the literature. The architecture uses "
 "multi-head attention with 8 parallel attention heads, allowing the model to jointly attend to "
 "information from different representation subspaces. Positional encodings using sine and cosine "
 "functions inject sequence order information, since the model contains no recurrence. The encoder "
 "and decoder each consist of 6 identical layers. Because self-attention connects all positions with "
 "a constant number of sequential operations, it parallelizes far better than recurrent layers, which "
 "require O(n) sequential steps. This parallelism is the primary reason for the dramatic reduction in "
 "training time, and the architecture has since become the foundation for large language models.")
ff=subprocess.Popen(["firefox","--headless","--no-remote","--profile","/tmp/ff-prisma-profile",
                     "--window-size=1500,1000","--marionette","http://localhost:5173/auth"],
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
SET="""const set=(el,v)=>{const P=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement:window.HTMLInputElement;
 Object.getOwnPropertyDescriptor(P.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};"""
try:
    s=socket.create_connection(("127.0.0.1",2828),timeout=30); recv(s); send(s,"WebDriver:NewSession",{})
    time.sleep(4); send(s,"WebDriver:SetWindowRect",{"width":1500,"height":1000}); time.sleep(2)
    send(s,"WebDriver:Navigate",{"url":"http://localhost:5173/auth"}); time.sleep(6)
    if js(s,"return location.pathname")=="/auth":
        js(s,SET+"""const em=document.querySelector('input[type=email]');const pw=document.querySelector('input[type=password]');
         if(!em||!pw)return 'no';set(em,arguments[0]);set(pw,arguments[1]);return 'ok';""",
         ["ojaschaudhary.1004@gmail.com","ojas@12345"])
        time.sleep(1.5)
        js(s,"const f=document.querySelector('form');if(f){f.requestSubmit();return 'ok'}return 'no'")
        for _ in range(20):
            time.sleep(3)
            if js(s,"return location.pathname")!="/auth": break
    send(s,"WebDriver:Navigate",{"url":"http://localhost:5173/transform"}); time.sleep(18)
    print("path:", js(s,"return location.pathname"), flush=True)
    # Uncheck saved sources so only the pasted text is used (keeps it short -> no chunking)
    print("cleared sources:", js(s,"""
      let n=0;[...document.querySelectorAll('input[type=checkbox]')].forEach(b=>{if(b.checked){b.click();n++;}});return n;"""), flush=True)
    time.sleep(2)
    print("pasted:", js(s,SET+"""
      const ta=document.querySelector('textarea'); if(!ta) return 'NO TEXTAREA';
      set(ta, arguments[0]); return ta.value.length + ' chars';""",[SRC]), flush=True)
    time.sleep(2)
    print("outputs:", js(s,"""
      const names=['Video Package','LinkedIn Post','Twitter/X Post','Advisory','Infographic','Executive Summary','Presentation'];
      const cards=[...document.querySelectorAll('button')].filter(b=>names.some(n=>b.innerText.trim().startsWith(n)));
      cards.forEach(c=>{ if(/border-l-2/.test(c.className)) c.click(); });
      ['LinkedIn Post','Executive Summary'].forEach(n=>{const c=cards.find(x=>x.innerText.trim().startsWith(n)); if(c) c.click();});
      return cards.filter(c=>/border-l-2/.test(c.className)).map(c=>c.innerText.trim().slice(0,18)).join(',')||'none';"""), flush=True)
    time.sleep(2)
    t0=time.time()
    print("run:", js(s,"""const r=document.querySelector('button[aria-label="Run transform"]');
      if(!r) return 'NO BTN'; if(r.disabled) return 'DISABLED'; r.click(); return 'clicked';"""), flush=True)
    for i in range(60):
        time.sleep(5)
        d=json.loads(js(s,"""const t=document.body.innerText;
          return JSON.stringify({failed:/JOB FAILED/i.test(t),
            share:(document.querySelectorAll('button')?[...document.querySelectorAll('button')].filter(b=>/Share on LinkedIn/.test(b.innerText)).length:0),
            s:(t.match(/JOB STATUS[\\s\\S]{0,140}/)||[''])[0].replace(/\\s+/g,' ').slice(0,110)});"""))
        print(f"  [{i*5+5:3d}s] failed={d['failed']} shareBtns={d['share']} | {d['s'][:85]}", flush=True)
        if d['failed'] or d['share']>0: break
    print(f"WALL: {time.time()-t0:.1f}s", flush=True)
    # Dump the real rendered share hrefs + body lengths for verification.
    print("ARTIFACTS:", js(s,"""
      const out=[];
      document.querySelectorAll('section.console-card').forEach(sec=>{
        const eyebrow=(sec.querySelector('.eyebrow')||{}).innerText||'';
        const body=(sec.querySelector('.artifact-body')||{}).innerText||'';
        const x=[...sec.querySelectorAll('a')].find(a=>/Share on X/.test(a.innerText));
        let txt='';
        if(x){ try{ txt=new URL(x.getAttribute('href')).searchParams.get('text')||''; }catch(e){} }
        if(x) out.push({type:eyebrow.trim(), bodyLen:body.length, xTextLen:txt.length,
                        trimmed: txt.endsWith('\\u2026'), hashEncoded:(x.getAttribute('href')||'').includes('%23'),
                        rawHash:(x.getAttribute('href')||'').includes('#'), tail:txt.slice(-50)});
      });
      return JSON.stringify(out,null,1);"""), flush=True)
    open("/home/ojas_chaudhary/Desktop/SIH/SIH/.share_card.png","wb").write(
        base64.b64decode(send(s,"WebDriver:TakeScreenshot",{"full":False})[3]["value"]))
finally: ff.terminate()
