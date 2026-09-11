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
    print("stuck at:", js(s,"return Math.round(window.scrollY)"))
    print(js(s,"""
      // Is a scroll listener/observer pinning us? Inspect scrollingElement + any
      // element with a transform that creates a containing block.
      const se = document.scrollingElement;
      return JSON.stringify({
        scrollingElement: se ? se.tagName : null,
        seScrollTop: se ? Math.round(se.scrollTop) : null,
        seScrollHeight: se ? se.scrollHeight : null,
        seClientHeight: se ? se.clientHeight : null,
        docElScrollTop: Math.round(document.documentElement.scrollTop),
        bodyScrollTop: Math.round(document.body.scrollTop),
        // find elements that are position:fixed and full-size (could trap scroll)
        fixedFull: [...document.querySelectorAll('*')].filter(e=>{
          const c=getComputedStyle(e);
          return c.position==='fixed' && e.getBoundingClientRect().height>=window.innerHeight*0.9;
        }).map(e=>e.className?String(e.className).slice(0,60):e.tagName)
      });"""))
    # Does removing ScrollTrigger free it?
    print("kill ScrollTriggers ->", js(s,"""
      try {
        const st = window.ScrollTrigger || (window.gsap && window.gsap.core && null);
        return 'no global ScrollTrigger handle';
      } catch(e){ return 'err '+e.message; }"""))
    # try scrolling the documentElement directly
    js(s,"document.documentElement.scrollTop = 3000"); time.sleep(1)
    print("after docEl.scrollTop=3000:", js(s,"return Math.round(window.scrollY)"))
finally: ff.terminate()
