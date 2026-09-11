import socket, json, time, subprocess
ff=subprocess.Popen(["firefox","--headless","--no-remote","--profile","/tmp/ff-prisma-profile",
                     "--window-size=1440,900","--marionette","http://localhost:5173/"],
                    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(16)
def recv(s):
    b=b""
    while b":" not in b: b+=s.recv(1)
    n=int(b.split(b":")[0]); d=b.split(b":",1)[1]
    while len(d)<n: d+=s.recv(n-len(d))
    return json.loads(d)
def send(s,m,p):
    j=json.dumps([0,1,m,p]); s.sendall(f"{len(j)}:{j}".encode()); return recv(s)
def js(s,script): return send(s,"WebDriver:ExecuteScript",{"script":script,"args":[]})[3].get("value")
try:
    s=socket.create_connection(("127.0.0.1",2828),timeout=25); recv(s); send(s,"WebDriver:NewSession",{})
    time.sleep(3); send(s,"WebDriver:SetWindowRect",{"width":1440,"height":900}); time.sleep(2)
    js(s,"document.querySelector('header a[href=\"#formats\"]').click()"); time.sleep(2.5)

    # Watch scrollY over time right after forcing a scroll — is it snapping back?
    print(js(s,"""
      window.__trace=[];
      const rec=()=>window.__trace.push(Math.round(window.scrollY));
      rec(); window.scrollTo(0,3200); rec();
      return JSON.stringify(window.__trace);"""))
    time.sleep(0.1)
    print("t+100ms:", js(s,"return Math.round(window.scrollY)"))
    time.sleep(0.5)
    print("t+600ms:", js(s,"return Math.round(window.scrollY)"))

    # Is html/body height collapsed? maxScroll said 4059 but html height was 814px
    print(js(s,"""return JSON.stringify({
      htmlClientHeight: document.documentElement.clientHeight,
      htmlScrollHeight: document.documentElement.scrollHeight,
      htmlOffsetHeight: document.documentElement.offsetHeight,
      bodyScrollHeight: document.body.scrollHeight,
      mainHeight: Math.round(document.querySelector('main').getBoundingClientRect().height),
      mainTransform: getComputedStyle(document.querySelector('main')).transform,
      // any ancestor with transform creates a containing block for fixed children
      transformedAncestors: [...document.querySelectorAll('body *')].filter(e=>{
        const t=getComputedStyle(e).transform; return t && t!=='none';
      }).slice(0,8).map(e=>({cls:String(e.className).slice(0,50), t:getComputedStyle(e).transform.slice(0,40)}))
    });"""))
finally: ff.terminate()
